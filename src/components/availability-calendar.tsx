"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Clock3, UserRound } from "lucide-react";
import { AvailabilityEditor } from "./availability-editor";
import { TimeOffEditor } from "./time-off-editor";
import { blocksOnDate, calendarDate, calendarDays } from "@/modules/availability/calendar";
import { clockTime, type Rule, type TimeOff } from "@/modules/availability/domain";

type CalendarBooking = {
  id: string;
  service_name: string;
  customer_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

function dateLabel(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${date}T12:00:00Z`));
}

function startOfWeek(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value;
}

function weekDates(date: string) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(start.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

function bookingDate(booking: CalendarBooking) {
  return calendarDate(booking.starts_at);
}

function bookingTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export function AvailabilityCalendar({
  rules,
  blocks,
  bookings,
  today,
}: {
  rules: Rule[];
  blocks: TimeOff[];
  bookings: CalendarBooking[];
  today: string;
}) {
  const [tab, setTab] = useState<"month" | "week" | "day" | "hours">("month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const grid = calendarDays(month);
  const week = useMemo(() => weekDates(selected), [selected]);
  const selectedRule = rules.find(
    (item) => item.weekday === new Date(`${selected}T12:00:00Z`).getUTCDay(),
  );
  const selectedBlocks = blocksOnDate(selected, blocks);
  const selectedBookings = bookings.filter((booking) => bookingDate(booking) === selected);

  function moveMonth(delta: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const next = date.toISOString().slice(0, 7);
    setMonth(next);
    setSelected(`${next}-01`);
  }

  function moveDays(delta: number) {
    const date = new Date(`${selected}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    const next = date.toISOString().slice(0, 10);
    setSelected(next);
    setMonth(next.slice(0, 7));
  }

  const daySummary = (date: string) => {
    const dayBookings = bookings.filter((booking) => bookingDate(booking) === date);
    const off = blocksOnDate(date, blocks);
    return { bookings: dayBookings, off };
  };

  return (
    <>
      <nav className="management-tabs availability-view-tabs" aria-label="Availability views">
        {([
          ["month", "Month"],
          ["week", "Week"],
          ["day", "Day"],
          ["hours", "Weekly hours"],
        ] as const).map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "month" && (
        <section className="availability-calendar availability-month-view">
          <header>
            <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>
              <ChevronLeft size={20} />
            </button>
            <h2>{dateLabel(`${month}-01`, { month: "long", year: "numeric" })}</h2>
            <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>
              <ChevronRight size={20} />
            </button>
          </header>
          <div className="calendar-grid">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
            {Array.from({ length: grid.offset }, (_, i) => <span key={`space-${i}`} />)}
            {grid.dates.map((date) => {
              const summary = daySummary(date);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => { setSelected(date); setTab("day"); }}
                  aria-current={date === today ? "date" : undefined}
                  aria-label={`${date}, ${summary.bookings.length} bookings`}
                >
                  <span>{Number(date.slice(-2))}</span>
                  <small>{summary.bookings.length ? `${summary.bookings.length} booking${summary.bookings.length === 1 ? "" : "s"}` : "Available"}</small>
                  <span className="calendar-indicators">
                    {summary.bookings.length > 0 && <i className="calendar-booking-dot" />}
                    {summary.off.length > 0 && <i className="calendar-dot" />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="calendar-key">
            <span className="calendar-booking-dot" /> Appointment
            <span className="calendar-dot" /> Blocked/time off · Europe/London
          </p>
        </section>
      )}

      {tab === "week" && (
        <section className="availability-calendar availability-week-view">
          <header>
            <button type="button" aria-label="Previous week" onClick={() => moveDays(-7)}><ChevronLeft size={20}/></button>
            <h2>{dateLabel(week[0], { day:"numeric", month:"short" })} – {dateLabel(week[6], { day:"numeric", month:"short", year:"numeric" })}</h2>
            <button type="button" aria-label="Next week" onClick={() => moveDays(7)}><ChevronRight size={20}/></button>
          </header>
          <div className="availability-week-grid">
            {week.map((date) => {
              const summary=daySummary(date);
              const rule=rules.find((item)=>item.weekday===new Date(`${date}T12:00:00Z`).getUTCDay());
              return (
                <article key={date} className={date===today ? "is-today" : undefined}>
                  <button type="button" onClick={() => { setSelected(date); setTab("day"); }}>
                    <strong>{dateLabel(date,{weekday:"short"})}</strong>
                    <span>{dateLabel(date,{day:"numeric",month:"short"})}</span>
                  </button>
                  <small>{rule ? `${clockTime(rule.startMinute)}–${clockTime(rule.endMinute)}` : "Closed"}</small>
                  <div className="availability-week-events">
                    {summary.off.map((block)=><span className="calendar-event is-blocked" key={block.id}>{block.label}</span>)}
                    {summary.bookings.slice(0,4).map((booking)=><Link className="calendar-event" href="/professional/bookings" key={booking.id}><b>{bookingTime(booking.starts_at)}</b>{booking.service_name}</Link>)}
                    {summary.bookings.length>4 && <span className="calendar-more">+{summary.bookings.length-4} more</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === "day" && (
        <section className="availability-calendar availability-day-view">
          <header>
            <button type="button" aria-label="Previous day" onClick={() => moveDays(-1)}><ChevronLeft size={20}/></button>
            <h2>{dateLabel(selected,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</h2>
            <button type="button" aria-label="Next day" onClick={() => moveDays(1)}><ChevronRight size={20}/></button>
          </header>
          <div className="calendar-day-status">
            <Clock3 size={18} />
            <span>{selectedRule ? `Working hours ${clockTime(selectedRule.startMinute)}–${clockTime(selectedRule.endMinute)}` : "Closed in weekly schedule"}</span>
          </div>
          {selectedBlocks.map((block)=><div className="calendar-block-banner" key={block.id}>Blocked · {block.label}</div>)}
          <div className="calendar-appointment-list">
            {selectedBookings.map((booking)=>(
              <article key={booking.id}>
                <time>{bookingTime(booking.starts_at)}</time>
                <span className="calendar-appointment-icon"><UserRound size={17}/></span>
                <div><strong>{booking.service_name}</strong><span>{booking.customer_name}</span></div>
                <span className={`calendar-status status-${booking.status}`}>{booking.status.replaceAll("_"," ")}</span>
                <Link href="/professional/bookings">Manage</Link>
              </article>
            ))}
            {!selectedBookings.length && (
              <div className="calendar-empty-day">
                <CalendarDays size={24}/>
                <strong>No appointments scheduled.</strong>
                <span>Available time is calculated from your hours, blocks and existing bookings.</span>
              </div>
            )}
          </div>
          <div className="calendar-day-actions">
            <button className="text-link" onClick={() => setTab("hours")}>Edit weekly hours →</button>
            <Link className="text-link" href="/professional/bookings">Manage all appointments →</Link>
          </div>
        </section>
      )}

      {tab === "hours" && <AvailabilityEditor initial={rules} />}

      <TimeOffEditor initial={blocks} />
    </>
  );
}
