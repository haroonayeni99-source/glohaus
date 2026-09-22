export const dynamic = "force-dynamic";

import Link from "next/link";
import { CalendarDays, UserRoundCheck } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { professionalClients } from "@/modules/dashboard/repository";

function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export const metadata = { title: "Your clients | GLOHAUS PRO" };

export default async function ProfessionalClientsPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const clients = await withIdentity(result.account.authId, (db) =>
    professionalClients(db, result.account.professionalId!),
  );
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="clients" displayName={result.account.displayName} />
      <main id="main" className="pro-main pro-list-page">
        <p className="pro-kicker">YOUR CLIENTS</p>
        <h1>Clients who have booked with you.</h1>
        <p className="pro-page-lead">
          This list is built from confirmed and completed appointments only. It
          never exposes the wider GLOHAUS customer directory.
        </p>
        {clients.length ? (
          <section className="pro-client-list" aria-label="Clients">
            {clients.map((client) => (
              <article key={client.customer_id}>
                <span className="pro-client-avatar" aria-hidden>
                  {client.customer_name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h2>{client.customer_name}</h2>
                  <p>
                    {client.appointment_count} {client.appointment_count === 1 ? "appointment" : "appointments"} · Last visit {date(client.last_appointment_at)}
                  </p>
                </div>
                <span className="pro-client-next">
                  {client.next_appointment_at ? `Next: ${date(client.next_appointment_at)}` : "No appointment booked"}
                </span>
              </article>
            ))}
          </section>
        ) : (
          <section className="pro-empty-state pro-large-empty">
            <UserRoundCheck size={34} aria-hidden />
            <h2>Your clients will build here.</h2>
            <p>Confirmed or completed appointments create an authorised client relationship.</p>
            <Link href="/professional/profile">Edit your booking page</Link>
            <Link href="/professional/bookings">View appointments <CalendarDays size={15} aria-hidden /></Link>
          </section>
        )}
      </main>
    </div>
  );
}
