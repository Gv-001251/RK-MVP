import mysql from 'mysql2/promise';

/**
 * MySQL connection pool.
 * Reused across requests in the same Next.js process.
 */
const pool = mysql.createPool({
  host:            process.env.MYSQL_HOST     || 'localhost',
  port:            parseInt(process.env.MYSQL_PORT || '3306'),
  database:        process.env.MYSQL_DATABASE || 'rk_clinic',
  user:            process.env.MYSQL_USER     || 'root',
  password:        process.env.MYSQL_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit:      0,
  timezone:        '+00:00',
});

/**
 * Execute a parameterised SQL query.
 * Returns { rows, fields } on success, throws on error.
 *
 * @param {string} sql - Parameterised SQL (use ? placeholders)
 * @param {Array}  params - Values to bind
 * @returns {Promise<Array>} rows
 */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export default pool;
