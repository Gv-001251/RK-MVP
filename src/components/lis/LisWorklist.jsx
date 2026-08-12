"use client";

/**
 * Persistent worklist column inside the dark side dock.
 *
 * Two parts: a month calendar for picking the working day, and the specimen
 * list for the selected day. Whatever screen the user is on, the specimens
 * waiting on them stay in view — the lab equivalent of the reference design's
 * schedule column.
 *
 * Data comes straight from `/api/lab/orders`, matching how the other LIS
 * panels fetch (plain `fetch` in an effect, local loading/error state).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Check } from 'lucide-react';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Statuses that mean the specimen has left the bench. */
const SETTLED = new Set(['Verified', 'Released', 'Reported', 'Delivered', 'Completed']);

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const isoDay = (d) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

/**
 * Six weeks of Monday-first cells covering `viewDate`'s month, so the grid
 * height never jumps between months.
 */
function buildCalendar(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  // getDay() is Sunday-first; shift so Monday === 0.
  const lead = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - lead);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

function initials(name) {
  if (!name) return '??';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function timeLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function LisWorklist({ onOpenWorklist }) {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // The spinner is switched on by whatever changes the day (see the calendar
  // handler), so this effect only fetches and reports back — no state is set
  // before the first await, which would cascade an extra render.
  useEffect(() => {
    let cancelled = false;

    async function fetchDay() {
      try {
        const from = `${isoDay(selectedDate)} 00:00:00`;
        const to = `${isoDay(selectedDate)} 23:59:59`;
        const params = new URLSearchParams({ from, to, limit: '40' });
        const res = await fetch(`/api/lab/orders?${params.toString()}`);
        if (!res.ok) throw new Error('Unable to load the worklist');
        const data = await res.json();
        if (cancelled) return;
        setOrders(Array.isArray(data.labOrders) ? data.labOrders : []);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Unable to load the worklist');
        setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDay();
    return () => { cancelled = true; };
  }, [selectedDate]);

  const selectDay = (date, inMonth) => {
    setLoading(true);
    setSelectedDate(date);
    if (!inMonth) setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const cells = useMemo(() => buildCalendar(viewDate), [viewDate]);
  const monthLabel = viewDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const shiftMonth = (delta) => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const isToday = sameDay(selectedDate, today);
  const dayNoun = isToday
    ? 'today'
    : selectedDate.toLocaleDateString([], { day: 'numeric', month: 'short' });

  return (
    <div className="lis-worklist">
      <section className="lis-calendar" aria-label="Worklist calendar">
        <header className="lis-calendar-head">
          <h2 className="lis-calendar-title">Worklist</h2>
          <div className="lis-calendar-nav">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label={`Previous month, ${new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })}`}
            >
              <ChevronLeft aria-hidden="true" size={15} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label={`Next month, ${new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })}`}
            >
              <ChevronRight aria-hidden="true" size={15} strokeWidth={2.4} />
            </button>
          </div>
        </header>

        <p className="lis-calendar-month" aria-live="polite">{monthLabel}</p>

        {/* Each day button carries its own full date as an accessible name, so
            the grid needs no row/gridcell scaffolding to be understood. */}
        <div className="lis-calendar-grid" aria-label={monthLabel}>
          {WEEKDAYS.map((day) => (
            <span key={day} className="lis-calendar-weekday" aria-hidden="true">
              {day.slice(0, 3)}
            </span>
          ))}

          {cells.map(({ date, inMonth }) => {
            const selected = sameDay(date, selectedDate);
            const marker = sameDay(date, today);
            const classes = [
              'lis-calendar-day',
              inMonth ? '' : 'is-outside',
              selected ? 'is-selected' : '',
              marker && !selected ? 'is-today' : '',
            ].filter(Boolean).join(' ');

            return (
              <button
                key={date.toISOString()}
                type="button"
                className={classes}
                aria-current={selected ? 'date' : undefined}
                aria-label={date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                onClick={() => selectDay(date, inMonth)}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        className="lis-worklist-summary"
        onClick={() => onOpenWorklist?.()}
      >
        <span className="lis-worklist-count">{loading ? '—' : orders.length}</span>
        <span className="lis-worklist-caption">
          {orders.length === 1 ? 'specimen' : 'specimens'} {dayNoun}
        </span>
        <span className="lis-worklist-go" aria-hidden="true">
          <ArrowUpRight size={15} strokeWidth={2.4} />
        </span>
        <span className="sr-only">Open specimen tracking</span>
      </button>

      <div className="lis-worklist-list" aria-busy={loading}>
        {error && <p className="lis-worklist-empty">{error}</p>}

        {!error && loading && <p className="lis-worklist-empty">Loading specimens…</p>}

        {!error && !loading && orders.length === 0 && (
          <p className="lis-worklist-empty">No specimens registered for this day.</p>
        )}

        {!error && !loading && orders.map((order) => {
          const tests = order.lab_order_tests || [];
          const summary = tests.length
            ? (tests.length === 1 ? tests[0].test_name : `${tests[0].test_name} +${tests.length - 1}`)
            : (order.department || 'Laboratory');
          const settled = SETTLED.has(order.status);
          const urgent = order.priority === 'STAT' || order.priority === 'Urgent';

          return (
            <article key={order.id} className="lis-worklist-item">
              <span className={`lis-worklist-avatar${urgent ? ' is-urgent' : ''}`} aria-hidden="true">
                {initials(order.patient_name)}
              </span>
              <span className="lis-worklist-meta">
                <span className="lis-worklist-name">{order.patient_name || order.patient_id}</span>
                <span className="lis-worklist-test">{summary}</span>
              </span>
              {settled ? (
                <span className="lis-worklist-done" title={order.status}>
                  <Check aria-hidden="true" size={12} strokeWidth={3} />
                  <span className="sr-only">{order.status}</span>
                </span>
              ) : (
                <span className="lis-worklist-time">
                  {timeLabel(order.order_time || order.created_at)}
                </span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
