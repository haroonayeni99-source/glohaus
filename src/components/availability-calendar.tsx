"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { AvailabilityEditor } from "./availability-editor";
import { TimeOffEditor } from "./time-off-editor";
import { blocksOnDate, calendarDays } from "@/modules/availability/calendar";
import {
  clockTime,
  type Rule,
  type TimeOff,
} from "@/modules/availability/domain";
export function AvailabilityCalendar({
  rules,
  blocks,
  today,
}: {
  rules: Rule[];
  blocks: TimeOff[];
  today: string;
}) {
  const [tab, setTab] = useState<"calendar" | "hours">("calendar");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const grid = calendarDays(month);
  const rule = rules.find(
    (item) => item.weekday === new Date(`${selected}T12:00:00Z`).getUTCDay(),
  );
  const selectedBlocks = blocksOnDate(selected, blocks);
  function move(delta: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const next = date.toISOString().slice(0, 7);
    setMonth(next);
    setSelected(`${next}-01`);
  }
  return (
    <>
      <nav className="management-tabs" aria-label="Availability views">
        <button
          aria-pressed={tab === "calendar"}
          onClick={() => setTab("calendar")}
        >
          Calendar view
        </button>
        <button aria-pressed={tab === "hours"} onClick={() => setTab("hours")}>
          Weekly hours
        </button>
      </nav>
      {tab === "calendar" ? (
        <section className="availability-calendar">
          <header>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <h2>
              {new Intl.DateTimeFormat("en-GB", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${month}-01T12:00:00Z`))}
            </h2>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => move(1)}
            >
              <ChevronRight size={20} />
            </button>
          </header>
          <div className="calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span className="calendar-weekday" key={day}>
                {day}
              </span>
            ))}
            {Array.from({ length: grid.offset }, (_, i) => (
              <span key={`space-${i}`} />
            ))}
            {grid.dates.map((date) => {
              const off = blocksOnDate(date, blocks).length > 0;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelected(date)}
                  aria-pressed={selected === date}
                  aria-label={`${date}${off ? ", time off scheduled" : ""}`}
                  aria-current={date === today ? "date" : undefined}
                >
                  {Number(date.slice(-2))}
                  {off && <span className="calendar-dot" />}
                </button>
              );
            })}
          </div>
          <p className="calendar-key">
            <span className="calendar-dot" /> Time off scheduled · Europe/London
          </p>
          <div className="calendar-day-detail">
            <CalendarDays size={20} aria-hidden />
            <div>
              <h3>
                {new Intl.DateTimeFormat("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(`${selected}T12:00:00Z`))}
              </h3>
              <p>
                {rule
                  ? `Usual hours: ${clockTime(rule.startMinute)}–${clockTime(rule.endMinute)}`
                  : "Closed in your weekly schedule"}
              </p>
              {selectedBlocks.map((block) => (
                <p key={block.id}>Time off: {block.label}</p>
              ))}
              <button className="text-link" onClick={() => setTab("hours")}>
                Edit weekly hours →
              </button>
            </div>
          </div>
          <p className="calendar-key">
            This calendar shows your saved working pattern and time off.
            Customers see available slots after existing bookings are excluded.
          </p>
        </section>
      ) : (
        <AvailabilityEditor initial={rules} />
      )}
      <TimeOffEditor initial={blocks} />
    </>
  );
}
