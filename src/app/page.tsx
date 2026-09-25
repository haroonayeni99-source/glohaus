import { DiscoveryFeed } from "@/components/discovery-feed";
import { withIdentity } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";
import { publicPostPage } from "@/modules/posts/repository";
import { savedPosts, viewerEngagement } from "@/modules/engagement/repository";
import type { PublicPost } from "@/modules/posts/domain";
import type { EngagementMap } from "@/modules/engagement/domain";
import { z } from "zod";
import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { discoveryPage } from "@/modules/professionals/repository";
import type { PublicProfessional } from "@/modules/professionals/domain";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string; post?: string }>;
}) {
  const query = await searchParams;
  const savedView = query.view === "saved";
  const page = Math.floor(Math.min(250, Math.max(1, Number(query.page) || 1)));
  const postId = z.uuid().safeParse(query.post);
  const defaultData: {
    posts: PublicPost[];
    initialEngagement: EngagementMap;
    accountMode: boolean;
    hasMore: boolean;
    viewer: string;
    next: string | null;
  } = {
    posts: [],
    initialEngagement: {},
    accountMode: false,
    hasMore: false,
    viewer: "",
    next: null,
  };
  let desktopProfessionals: PublicProfessional[] = [];
  const defaultDesktopViewer = { signedIn: false, displayName: "" };\n  let data = defaultData;\n  let desktopViewer = defaultDesktopViewer;
  if (process.env.DATABASE_URL) {
    let authId = "";
    try {
      authId = (await getIdentity()).authId;
    } catch {}
    try {
      const homeResult = await withIdentity(authId, async (db) => {
        const account = authId ? await findAccount(db, authId) : null;
        const accountMode = account?.status === "active";
        const viewer = { signedIn: Boolean(accountMode), displayName: account?.displayName || "" };
        const pageData =
          !postId.success && !savedView ? await publicPostPage(db) : null;
        const rows = postId.success
          ? (
              await db.query<PublicPost>(
                "SELECT * FROM beauty.public_posts WHERE id=$1",
                [postId.data],
              )
            ).rows
          : savedView && accountMode
            ? await savedPosts(db, page)
            : pageData?.posts || [];
        const posts = rows.slice(0, 40);
        return {
          posts,
          initialEngagement: accountMode
            ? await viewerEngagement(
                db,
                posts.map((p) => p.id),
              )
            : {},
          accountMode,
          hasMore: savedView && rows.length > 40,
          viewer: account?.id || "",
          next: pageData?.next || null,
        };
      });
    } catch {
      console.error("Public feed unavailable");
    }
  }
  if (process.env.DATABASE_URL) {
    try { desktopProfessionals = (await withIdentity("", (db) => discoveryPage(db, ""))).professionals; } catch {}
  }
  return (
    <>
    <DesktopCustomerHome professionals={desktopProfessionals} signedIn={desktopViewer.signedIn} displayName={desktopViewer.displayName} />
    <div className="mobile-existing-home">
    <DiscoveryFeed
      key={`${data.posts[0]?.id || ""}:${data.next || ""}:${data.viewer}:${savedView}:${page}:${postId.success ? postId.data : ""}:${JSON.stringify(data.initialEngagement)}`}
      publishedPosts={data.posts}
      initialNext={data.next}
      initialEngagement={data.initialEngagement}
      accountMode={data.accountMode}
      savedView={savedView}
      savedPage={page}
      hasMoreSaved={data.hasMore}
      hideEditorial={postId.success}
    />
    </div>
    </>
  );
}
