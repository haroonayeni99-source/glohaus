import Link from "next/link";
import { withIdentity } from "@/lib/db";
export async function FoundingProgrammeOffer() {
  const open = await withIdentity(
    "",
    async (db) =>
      (
        await db.query<{ open: boolean }>(
          "SELECT beauty.public_founding_programme_open() AS open",
        )
      ).rows[0]?.open === true,
  ).catch(() => false);
  if (!open) return null;
  return (
    <aside className="form-notice">
      <h2>Founding Professionals Programme</h2>
      <p>
        Our temporary launch programme offers accepted founding professionals 14
        days at 0% GLOHAUS service commission, plus another 30 days for
        qualifying participation and the feedback questionnaire. Positive and
        critical feedback are equally welcome. Processing and customer booking
        fees remain separate. Registering does not automatically enrol you.
      </p>
      <Link href="/contact">Ask about founding eligibility</Link>
    </aside>
  );
}
