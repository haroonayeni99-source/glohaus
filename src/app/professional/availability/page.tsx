export const dynamic = "force-dynamic";

import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { PublicHeader } from "@/components/public-header";
import { AccessMessage } from "@/components/access-message";
import { AvailabilityEditor } from "@/components/availability-editor";
import { TimeOffEditor } from "@/components/time-off-editor";
import type { TimeOff, Rule } from "@/modules/availability/domain";
export default async function Availability() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const rules = await withIdentity(
    account.authId,
    async (db) =>
      (
        await db.query<Rule>(
          'SELECT weekday,start_minute AS "startMinute",end_minute AS "endMinute" FROM beauty.availability_rules WHERE professional_id=$1 ORDER BY weekday',
          [account.professionalId],
        )
      ).rows,
  );
  const blocks = await withIdentity(
    account.authId,
    async (db) =>
      (
        await db.query<TimeOff>(
          'SELECT id,starts_at AS "startsAt",ends_at AS "endsAt",label FROM beauty.availability_blocks WHERE professional_id=$1 AND ends_at>now() ORDER BY starts_at LIMIT 100',
          [account.professionalId],
        )
      ).rows,
  );
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <Link href="/professional" className="back-link">
          ← Your workspace
        </Link>
        <p className="eyebrow">MAKE SPACE FOR YOUR CLIENTS</p>
        <h1>
          Your week, <em>your way.</em>
        </h1>
        <AvailabilityEditor initial={rules} />
        <TimeOffEditor
          initial={blocks.map((block) => ({
            ...block,
            startsAt: new Date(block.startsAt).toISOString(),
            endsAt: new Date(block.endsAt).toISOString(),
          }))}
        />
      </main>
    </>
  );
}
