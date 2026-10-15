import { taxonomyCatalog } from "@/modules/taxonomy/repository";
import { emptyTaxonomy,type TaxonomyCatalog } from "@/modules/taxonomy/domain";
import { publicMetadata, publicPages } from "@/lib/public-seo";
import { DiscoveryFeed } from "@/components/discovery-feed";
import { withIdentity } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";
import {
  followedPostPage,
  publicPost,
  publicPostPage,
} from "@/modules/posts/repository";
import { savedPosts, viewerEngagement } from "@/modules/engagement/repository";
import {
  followStates,
  type FollowStateMap,
} from "@/modules/follows/repository";
import type { PublicPost } from "@/modules/posts/domain";
import type { EngagementMap } from "@/modules/engagement/domain";
import type { PublicStory } from "@/modules/stories/domain";
import type { LastMinuteSlot } from "@/modules/last-minute/domain";
import { z } from "zod";

export const dynamic = "force-dynamic";

type FeedData = {
  catalog:TaxonomyCatalog;
  posts: PublicPost[];
  initialEngagement: EngagementMap;
  initialFollows: FollowStateMap;
  accountMode: boolean;
  viewerSignedIn: boolean;
  canFollow: boolean;
  canPublish: boolean;
  hasMore: boolean;
  viewer: string;
  next: string | null;
  stories: PublicStory[];
  lastMinute: LastMinuteSlot[];
};

const emptyFeedData: FeedData = {
  catalog:emptyTaxonomy,
  posts: [],
  initialEngagement: {},
  initialFollows: {},
  accountMode: false,
  viewerSignedIn: false,
  canFollow: false,
  canPublish: false,
  hasMore: false,
  viewer: "",
  next: null,
  stories: [],
  lastMinute: [],
};

export async function FeedPage({
  searchParams,
  mode = "discover",
}: {
  mode?: "discover" | "share";
  searchParams: Promise<{
    categoryId?:string;specialityId?:string;templateId?:string;
    view?: string;
    feed?: string;
    page?: string;
    post?: string;
  }>;
}) {
  const query = await searchParams;
  const taxonomy:{categoryId?:string;specialityId?:string;templateId?:string}={};
  for(const key of ["categoryId","specialityId","templateId"] as const)if(z.uuid().safeParse(query[key]).success)taxonomy[key]=query[key];
  const filtered=Object.keys(taxonomy).length>0;
  const savedView = query.view === "saved";
  const followingView = query.feed === "following";
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
        const customerId =
          accountMode && account?.roles.includes("customer")
            ? account.id
            : null;

        const pageData =
          !postId.success && !savedView && !followingView
            ? await publicPostPage(db,undefined,taxonomy)
            : followingView && customerId
              ? await followedPostPage(db, customerId,undefined,taxonomy)
              : null;

        const rows = postId.success
          ? [await publicPost(db, postId.data)].filter(
              (post): post is PublicPost => Boolean(post),
            )
          : savedView && accountMode
            ? await savedPosts(db, page)
            : pageData?.posts || [];
        const posts = rows.filter(p=>(!taxonomy.categoryId||p.category_id===taxonomy.categoryId)&&(!taxonomy.specialityId||p.speciality_id===taxonomy.specialityId)).slice(0, 40);
        const stories = (
          await db.query<PublicStory>(
            "SELECT * FROM beauty.public_stories ORDER BY created_at DESC LIMIT 30",
          )
        ).rows;
        const lastMinute =
          mode === "share"
            ? (
                await db.query<LastMinuteSlot>(
                  "SELECT * FROM beauty.public_last_minute_slots ORDER BY starts_at ASC LIMIT 20",
                )
              ).rows
            : [];

        return {
          catalog:await taxonomyCatalog(db),
          posts,
          initialEngagement: accountMode
            ? await viewerEngagement(
                db,
                posts.map((post) => post.id),
              )
            : {},
          initialFollows: await followStates(
            db,
            customerId,
            posts.map((post) => post.professional_id),
          ),
          accountMode,
          viewerSignedIn: Boolean(accountMode),
          canFollow: Boolean(customerId),
          canPublish: Boolean(
            accountMode &&
            account?.roles.includes("professional") &&
            account.professionalId,
          ),
          hasMore:
            (savedView && rows.length > 40) ||
            Boolean(
              (followingView || (!savedView && !postId.success)) &&
              pageData?.next,
            ),
          viewer: account?.id || "",
          next: pageData?.next || null,
          stories,
          lastMinute,
        } satisfies FeedData;
      });
    } catch {
      console.error("Discover feed unavailable");
    }
  }

  return (
    <DiscoveryFeed
      taxonomy={data.catalog} taxonomySelection={taxonomy}
      key={`${JSON.stringify(taxonomy)}:${data.posts[0]?.id || ""}:${data.next || ""}:${data.viewer}:${savedView}:${followingView}:${page}:${postId.success ? postId.data : ""}:${mode}`}
      publishedPosts={data.posts}
      initialNext={data.next}
      initialEngagement={data.initialEngagement}
      initialFollows={data.initialFollows}
      accountMode={data.accountMode}
      viewerSignedIn={data.viewerSignedIn}
      canFollow={data.canFollow}
      canPublish={data.canPublish}
      savedView={savedView}
      followingView={followingView}
      savedPage={page}
      hasMoreSaved={savedView && data.hasMore}
      hideEditorial={filtered || mode === "share" || postId.success}
      routeBase={mode === "share" ? "/share" : "/discover"}
      stories={filtered?[]:data.stories}
      lastMinute={filtered?[]:data.lastMinute}
    />
  );
}

export default async function DiscoverPage(props: {
  searchParams: Promise<{
    categoryId?:string;specialityId?:string;templateId?:string;
    view?: string;
    feed?: string;
    page?: string;
    post?: string;
  }>;
}) {
  return FeedPage({ ...props, mode: "discover" });
}

export const metadata = publicMetadata(
  "/discover",
  ...publicPages["/discover"],
);
