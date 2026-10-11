import Image from "next/image";
import Link from "next/link";
import { CalendarDays, UserRoundCheck } from "lucide-react";
import { ProfessionalNavigation } from "./professional-navigation";
import { ClientBlockControl } from "./client-block-control";
import type { ProfessionalClient } from "@/modules/dashboard/repository";
function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/London",
  }).format(new Date(value));
}
export function ProfessionalClientDirectory({
  clients,
  options,
  displayName,
}: {
  clients: ProfessionalClient[];
  options: { q?: string; view?: string };
  displayName: string;
}) {
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="clients" displayName={displayName} />
      <main id="main" className="pro-main pro-list-page pro-clients-page">
        <p className="pro-kicker">YOUR CLIENTS</p>
        <h1>Clients who have booked with you.</h1>
        <p className="pro-page-lead">
          See your clients’ names and any photos they have added. Blocking a
          client prevents new bookings with you. Existing appointments, messages
          and payments stay unchanged.
        </p>
        <form className="editor-form client-search" method="get">
          <label>
            Find a client
            <input
              name="q"
              defaultValue={options.q ?? ""}
              placeholder="Search by name"
              maxLength={120}
            />
          </label>
          <label>
            Show
            <select
              name="view"
              defaultValue={options.view === "blocked" ? "blocked" : "all"}
            >
              <option value="all">All clients</option>
              <option value="blocked">Blocked clients</option>
            </select>
          </label>
          <button className="button">Search clients</button>
        </form>
        {clients.length === 100 && (
          <p className="form-notice">
            Showing up to 100 matching clients. Search by name to narrow the
            list.
          </p>
        )}
        {clients.length ? (
          <section className="pro-client-list" aria-label="Clients">
            {clients.map((client) => (
              <article key={client.customer_id}>
                <span className="pro-client-avatar" aria-hidden>
                  {client.has_photo ? (
                    <Image
                      src={`/api/v1/customer-photos/${client.customer_id}`}
                      width={40}
                      height={40}
                      alt=""
                      unoptimized
                    />
                  ) : (
                    client.customer_name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <div>
                  <h2>{client.customer_name}</h2>
                  <p>
                    {client.appointment_count}{" "}
                    {client.appointment_count === 1
                      ? "appointment"
                      : "appointments"}{" "}
                    · Latest appointment {date(client.last_appointment_at)}
                  </p>
                </div>
                <span className="pro-client-next">
                  {client.next_appointment_at
                    ? `Next: ${date(client.next_appointment_at)}`
                    : "No appointment booked"}
                </span>
                <ClientBlockControl
                  id={client.customer_id}
                  name={client.customer_name}
                  blocked={client.blocked}
                />
              </article>
            ))}
          </section>
        ) : (
          <section className="pro-empty-state pro-large-empty">
            <UserRoundCheck size={34} aria-hidden />
            <h2>
              {options.q || options.view === "blocked"
                ? "No clients match this search."
                : "Your clients will appear here."}
            </h2>
            <p>
              {options.q || options.view === "blocked"
                ? "Try another name or show all clients."
                : "Clients appear after a confirmed appointment. Only people who have booked with you are shown."}
            </p>
            {(options.q || options.view === "blocked") && (
              <Link href="/professional/clients">Show all clients</Link>
            )}
            <Link href="/professional/profile">Edit your booking page</Link>
            <Link href="/professional/bookings">
              View appointments <CalendarDays size={15} aria-hidden />
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
