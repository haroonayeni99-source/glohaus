export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowUpRight,
  CircleAlert,
  MessageSquare,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { money } from "@/modules/professionals/domain";

type DisputeRow = {
  id: string;
  booking_id: string;
  service_name: string;
  customer_name: string;
  starts_at: Date;
  amount_pence: number;
  status: string;
  reason: string | null;
  evidence_due_at: Date | null;
};

type SafetyRow = {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: Date;
};

export const metadata = { title: "Protection centre · GLOHAUS PRO" };

export default async function ProfessionalProtectionPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const data = await withIdentity(result.account.authId, async (db) => {
    const disputes = (
      await db.query<DisputeRow>(
        `SELECT d.id,d.booking_id,b.service_name,b.customer_name,b.starts_at,
                d.amount_pence,d.status,d.reason,d.evidence_due_at
         FROM beauty.booking_disputes d
         JOIN beauty.bookings b ON b.id=d.booking_id
         WHERE b.professional_id=$1
         ORDER BY d.updated_at DESC
         LIMIT 50`,
        [result.account!.professionalId],
      )
    ).rows;

    const reports = (
      await db.query<SafetyRow>(
        `SELECT id,category,description,status,created_at
         FROM beauty.safety_reports
         WHERE reporter_user_id=$1
         ORDER BY created_at DESC
         LIMIT 50`,
        [result.account!.id],
      )
    ).rows;

    return { disputes, reports };
  });

  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={result.account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <Link className="pro-back-link" href="/professional/tools">← Business tools</Link>
        <p className="pro-kicker">PROTECTION & EVIDENCE</p>
        <h1>Your protection centre</h1>
        <p className="pro-page-lead">
          Keep disputes, safety reports and the records that support a case in one place.
          Booking times, payment status, messages and permitted journey-location records
          stay attached to the underlying booking rather than being copied into chat.
        </p>

        <section className="pro-protection-grid">
          <article className="pro-panel">
            <CircleAlert size={24} aria-hidden />
            <h2>Dispute evidence</h2>
            <p>
              Open the connected booking to review appointment details, payment records,
              messages and other available evidence before a response deadline.
            </p>
            <Link href="/professional/wallet">
              Open wallet & disputes <ArrowUpRight size={16} aria-hidden />
            </Link>
          </article>
          <article className="pro-panel">
            <MessageSquare size={24} aria-hidden />
            <h2>Safety reporting</h2>
            <p>
              Reports are kept separate from public reviews so serious behaviour can be
              reviewed privately by GLOHAUS.
            </p>
            <Link href="/professional/bookings">
              Review bookings <ArrowUpRight size={16} aria-hidden />
            </Link>
          </article>
          <article className="pro-panel">
            <ShieldCheck size={24} aria-hidden />
            <h2>Safer future bookings</h2>
            <p>
              Customer blocking, private incident notes and refuse-future-booking controls
              are the next protection tools being connected to this centre.
            </p>
          </article>
        </section>

        <section className="pro-panel pro-protection-section">
          <div className="pro-panel-title">
            <div>
              <p className="pro-kicker">PAYMENT CASES</p>
              <h2>Booking disputes</h2>
            </div>
            <span className="pro-status pro-status-confirmed">{data.disputes.length} cases</span>
          </div>
          {data.disputes.length ? (
            <div className="pro-protection-list">
              {data.disputes.map((dispute) => (
                <article key={dispute.id}>
                  <div>
                    <strong>{dispute.service_name}</strong>
                    <span>{dispute.customer_name}</span>
                    <small>
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Europe/London",
                      }).format(new Date(dispute.starts_at))}
                    </small>
                  </div>
                  <div>
                    <strong>{money(dispute.amount_pence)}</strong>
                    <span>{dispute.status.replaceAll("_", " ")}</span>
                  </div>
                  {dispute.reason && <p>{dispute.reason.replaceAll("_", " ")}</p>}
                  {dispute.evidence_due_at && (
                    <small>
                      Evidence due{" "}
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Europe/London",
                      }).format(new Date(dispute.evidence_due_at))}
                    </small>
                  )}
                  <Link href={`/professional/bookings/${dispute.booking_id}`}>
                    Open booking evidence <ArrowUpRight size={15} aria-hidden />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="pro-empty-state">
              <WalletCards size={28} aria-hidden />
              <h3>No booking disputes</h3>
              <p>Payment disputes connected to your bookings will appear here automatically.</p>
            </div>
          )}
        </section>

        <section className="pro-panel pro-protection-section">
          <div className="pro-panel-title">
            <div>
              <p className="pro-kicker">PRIVATE SAFETY RECORD</p>
              <h2>Your submitted reports</h2>
            </div>
            <span className="pro-status pro-status-confirmed">{data.reports.length} reports</span>
          </div>
          {data.reports.length ? (
            <div className="pro-protection-list">
              {data.reports.map((report) => (
                <article key={report.id}>
                  <div>
                    <strong>{report.category.replaceAll("_", " ")}</strong>
                    <small>
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeZone: "Europe/London",
                      }).format(new Date(report.created_at))}
                    </small>
                  </div>
                  <div><span>{report.status.replaceAll("_", " ")}</span></div>
                  <p>{report.description}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="pro-empty-state">
              <ShieldCheck size={28} aria-hidden />
              <h3>No safety reports submitted</h3>
              <p>Private reports you submit through GLOHAUS will be tracked here.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
