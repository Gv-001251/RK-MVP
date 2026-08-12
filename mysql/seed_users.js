#!/usr/bin/env node
/**
 * Seed default staff users into MySQL.
 * Usage: node mysql/seed_users.js
 * Requires MYSQL_* env vars to be set (or edit connection below).
 */

require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_PASSWORD = '123456';

const users = [
  { full_name: 'Administrator',     role: 'admin',          email: 'admin@rkclinic.com',    password: 'admin@123',     cabin: 'Administration Block', department: 'Management' },
  { full_name: 'Dr. R. Kumar',      role: 'doctor',         email: 'doc@rkclinic.com',      password: 'doc@123',       cabin: 'Cabin A',              department: 'General Medicine' },
  { full_name: 'Nurse & Pharmacy',  role: 'nurse_pharmacy', email: 'medic@rkclinic.com',    password: 'medic@123',     cabin: 'Nursing Station',       department: 'Nursing' },
  { full_name: 'Lab Technician',    role: 'technician',     email: 'lab@rkclinic.com',      password: 'lab@123',       cabin: 'Pathology Lab',         department: 'Laboratory' },
  { full_name: 'Receptionist',      role: 'receptionist',   email: 'reception@rkclinic.com', password: 'reception@123',  cabin: 'Front Desk',         department: 'Reception' },
  { full_name: 'Senior Technician', role: 'senior_technician', email: 'senior@rkclinic.com', password: 'senior@123',   cabin: 'Pathology Lab',      department: 'Laboratory' },
  { full_name: 'Dr. Pathologist',   role: 'pathologist',    email: 'path@rkclinic.com',     password: 'path@123',      cabin: 'Pathology',          department: 'Pathology' },
];

async function seed() {
  const conn = await mysql.createConnection({
    host:     process.env.MYSQL_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQL_PORT || '3306'),
    database: process.env.MYSQL_DATABASE || 'rk_clinic',
    user:     process.env.MYSQL_USER     || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  });

  console.log('Connected to MySQL. Seeding users...\n');

  for (const u of users) {
    const id = uuidv4();
    const userPassword = u.password || DEFAULT_PASSWORD;
    const hash = await bcrypt.hash(userPassword, 12);
    try {
      await conn.execute(
        `INSERT INTO user_profiles (id, full_name, role, email, password_hash, cabin, department, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)`,
        [id, u.full_name, u.role, u.email, hash, u.cabin, u.department]
      );
      console.log(`✓ ${u.role.padEnd(16)} | ${u.email} | password: ${userPassword}`);
    } catch (err) {
      console.error(`✗ ${u.email}: ${err.message}`);
    }
  }

  console.log(`\nAll done. Default password: ${DEFAULT_PASSWORD}`);
  await conn.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
