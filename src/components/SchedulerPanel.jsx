"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function SchedulerPanel() {
  const {
    appointments,
    patients,
    doctorName
  } = useClinic();

  const [selectedDate, setSelectedDate] = useState('2026-06-08');
  const [calendarMonth, setCalendarMonth] = useState(5); // June
  const [calendarYear, setCalendarYear] = useState(2026);

  // Modal schedule state
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [newBooking, setNewBooking] = useState({
    patientId: patients[0]?.id || '',
    time: '10:00 AM',
    date: '2026-06-08',
    type: 'appointment',
    title: 'General checkup',
    hospital: 'RK Specialty Clinic'
  });

  const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
  const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const formattedMonthStr = (calendarMonth + 1).toString().padStart(2, '0');
  const dailyBookings = appointments.filter(app => {
    return app.date === `${calendarYear}-${formattedMonthStr}-${selectedDate.split('-')[2]}`;
  });

  const handleBookingSubmit = (e) => {
    e.preventDefault();
    alert("Appointment booked successfully in schedule database!");
    setShowAddBooking(false);
  };

  return (
    <div className="content-panel active">
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Consultation Scheduler</h1>
          <p>Book future clinic appointments, allocate patient time blocks, and set attending locations.</p>
        </div>
        <div className="action-buttons-group">
          <button className="btn btn-primary" onClick={() => setShowAddBooking(true)}>
            Book New Appointment
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* CALENDAR BLOCK */}
        <div className="panel-card col-8">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Schedule Calendar Overview</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="hims-calendar-nav-btn" onClick={() => setCalendarMonth(prev => prev === 0 ? 11 : prev - 1)}>
                <svg viewBox="0 0 24 24" style={{ width: '12px', height: '12px' }}><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontSize: '14px', fontWeight: '700' }}>{monthNames[calendarMonth]} {calendarYear}</span>
              <button className="hims-calendar-nav-btn" onClick={() => setCalendarMonth(prev => prev === 11 ? 0 : prev + 1)}>
                <svg viewBox="0 0 24 24" style={{ width: '12px', height: '12px' }}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const formattedDay = day.toString().padStart(2, '0');
              const matchDate = `${calendarYear}-${formattedMonthStr}-${formattedDay}`;
              const isSelected = selectedDate.split('-')[2] === formattedDay;

              const dayEvents = appointments.filter(app => app.date === matchDate);
              const hasApp = dayEvents.some(e => e.type === 'appointment');
              const hasMeet = dayEvents.some(e => e.type === 'meeting');
              const hasProc = dayEvents.some(e => e.type === 'procedure');

              return (
                <div 
                  key={day}
                  className={`hims-calendar-day ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedDate(matchDate)}
                  style={{ aspectRatio: '1', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', position: 'relative' }}
                >
                  <span style={{ fontSize: '12px' }}>{day}</span>
                  <div style={{ display: 'flex', gap: '2px', position: 'absolute', bottom: '3px', left: '50%', transform: 'translateX(-50%)', justifyContent: 'center' }}>
                    {hasApp && <span className="hims-calendar-day-dot appointment" />}
                    {hasMeet && <span className="hims-calendar-day-dot meeting" />}
                    {hasProc && <span className="hims-calendar-day-dot procedure" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BOOKINGS LIST BLOCK */}
        <div className="panel-card col-4">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Bookings for {selectedDate}</h3>
          </div>
          <div className="queue-list">
            {dailyBookings.length > 0 ? (
              dailyBookings.map((app, index) => {
                const pat = patients.find(p => p.id === app.patientId);
                return (
                  <div key={index} className="queue-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span className="badge badge-sky" style={{ fontSize: '9px' }}>{app.time}</span>
                      <span className={`badge ${app.type === 'procedure' ? 'badge-amber' : app.type === 'meeting' ? 'badge-teal' : 'badge-sky'}`}>
                        {app.type}
                      </span>
                    </div>
                    <div>
                      <div className="queue-info-name" style={{ fontSize: '13px' }}>{app.title}</div>
                      <div className="queue-info-meta">Patient: {pat ? pat.name : 'Unknown'} ({app.patientId})</div>
                      <div className="queue-info-meta">Location: {app.hospital}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>
                No appointments booked on this date.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOOK APPOINTMENT MODAL SIMULATOR */}
      {showAddBooking && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel-card" style={{ width: '400px', backgroundColor: 'var(--bg-surface)' }}>
            <div className="modal-header" style={{ padding: 0, paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 className="modal-title">Book Consultation</h3>
              <button className="modal-close-btn" onClick={() => setShowAddBooking(false)}>
                <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleBookingSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Select Patient *</label>
                  <select 
                    className="form-control"
                    value={newBooking.patientId}
                    onChange={(e) => setNewBooking({ ...newBooking, patientId: e.target.value })}
                  >
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Title / Appointment Reason *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    value={newBooking.title} 
                    onChange={(e) => setNewBooking({ ...newBooking, title: e.target.value })}
                  />
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 0 }}>
                  <div className="form-group">
                    <label className="form-label">Time *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      required 
                      value={newBooking.time} 
                      onChange={(e) => setNewBooking({ ...newBooking, time: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date *</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      required 
                      value={newBooking.date} 
                      onChange={(e) => setNewBooking({ ...newBooking, date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Hospital Location</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={newBooking.hospital} 
                    onChange={(e) => setNewBooking({ ...newBooking, hospital: e.target.value })}
                  />
                </div>
                <div className="modal-footer" style={{ padding: '12px 0 0 0', backgroundColor: 'transparent', borderTop: 'none' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddBooking(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Book slot</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
