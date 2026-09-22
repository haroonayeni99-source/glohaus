export const dynamic = "force-dynamic";

import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { PostEditor } from "@/components/post-editor";
import type { OwnPost } from "@/modules/posts/domain";
import type { Service } from "@/modules/professionals/domain";
export default async function Posts() {
  const result = await pageAccount("professional");
  if (result.error)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account!;
  const data = await withIdentity(account.authId, async (db) => ({
    assets: (
      await db.query<{ id: string; alt_text: string }>(
        "SELECT id,alt_text FROM beauty.portfolio_assets WHERE professional_id=$1 ORDER BY created_at DESC",
        [account.professionalId],
      )
    ).rows,
    posts: (
      await db.query<OwnPost>(
        "SELECT id,title,body,kind,publication_status,service_id,asset_id FROM beauty.posts WHERE professional_id=$1 ORDER BY created_at DESC",
        [account.professionalId],
      )
    ).rows,
    services: (
      await db.query<Service>(
        "SELECT * FROM beauty.services WHERE professional_id=$1 ORDER BY name",
        [account.professionalId],
      )
    ).rows,
  }));
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <Link className="pro-back-link" href="/professional">← Dashboard</Link>
        <p className="pro-kicker">YOUR VOICE. YOUR CRAFT.</p>
        <h1>Let your work be discovered.</h1>
        <section className="pro-editor-surface"><PostEditor {...data} /></section>
      </main>
    </div>
  );
}
