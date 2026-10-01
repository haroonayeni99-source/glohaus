export const dynamic = "force-dynamic";

import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { PostEditor } from "@/components/post-editor";
import { StoryEditor } from "@/components/story-editor";
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
      await db.query<{ id: string; alt_text: string; media_type: "image" | "video" }>(
        "SELECT id,alt_text,media_type FROM beauty.portfolio_assets WHERE professional_id=$1 AND publication_status='published' ORDER BY created_at DESC",
        [account.professionalId],
      )
    ).rows,
    posts: (
      await db.query<OwnPost>(
        "SELECT id,title,body,kind,publication_status,service_id,asset_id FROM beauty.posts WHERE professional_id=$1 ORDER BY created_at DESC",
        [account.professionalId],
      )
    ).rows,
    stories: (
      await db.query<{ id: string; asset_id: string; caption: string; expires_at: string; media_type: "image" | "video" }>(
        `SELECT story.id,story.asset_id,story.caption,story.expires_at,asset.media_type
         FROM beauty.professional_stories story
         JOIN beauty.portfolio_assets asset ON asset.id=story.asset_id
         WHERE story.professional_id=$1
           AND story.publication_status='published'
           AND story.expires_at>now()
         ORDER BY story.created_at DESC`,
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
        <section className="pro-editor-surface"><StoryEditor stories={data.stories} assets={data.assets} services={data.services} /></section>
      </main>
    </div>
  );
}
