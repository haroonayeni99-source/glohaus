import { DiscoveryFeed } from "@/components/discovery-feed";
import { withIdentity } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";
import { publicPostPage } from "@/modules/posts/repository";
import { savedPosts, viewerEngagement } from "@/modules/engagement/repository";
import type { PublicPost } from "@/modules/posts/domain";
import type { EngagementMap } from "@/modules/engagement/domain";
import { z } from "zod";

export const dynamic = "force-dynamic";

type FeedData = {
  posts: PublicPost[];
  initialEngagement: EngagementMap;
  accountMode: boolean;
  hasMore: boolean;
  viewer: string;
  next: string | null;
};

const emptyFeedData: FeedData = {
  posts: [],
  initialEngagement: {},
  accountMode: false,
  hasMore: false,
  viewer: "",
  next: null,
};

export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string; post?: string }>;
}) {
  const query = await searchParams;
  const savedView = query.view === "saved";
  const page = Math.floor(Math.min(250, Math.max(1, Number(query.page) || 1)));
  const postId = z.uuid().safeParse(query.post);

  let data = emptyFeedData;

  if (process.env.DATABASE_URL) {
    let authId = "";
    try {
      authId = (await getIdentity()).authId;
    } catch {}

    try {
      data = await withIdentity(authId, async (db) => {
        const account = authId ? await findAccount(db, authId) : null;
        const accountMode = account?.status === "active";
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
                posts.map((post) => post.id),
              )
            : {},
          accountMode,
          hasMore: savedView && rows.length > 40,
          viewer: account?.id || "",
          next: pageData?.next || null,
        } satisfies FeedData;
      });
    } catch {
      console.error("Discover feed unavailable");
    }
  }

  return (
    <DiscoveryFeed
      key={`${data.posts[0]?.id || ""}:${data.next || ""}:${data.viewer}:${savedView}:${page}:${postId.success ? postId.data : ""}:/discover`}
      publishedPosts={data.posts}
      initialNext={data.next}
      initialEngagement={data.initialEngagement}
      accountMode={data.accountMode}
      savedView={savedView}
      savedPage={page}
      hasMoreSaved={data.hasMore}
      hideEditorial={postId.success}
      routeBase="/discover"
    />
  );
}
