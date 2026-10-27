import "server-only";
import { socialPostLink, socialThumbnailUrl, type Provider } from "./domain";
import { providerJson, type Tokens } from "./oauth";
export type ImportedPost = {
  platform: "instagram" | "tiktok";
  externalId: string;
  url: string;
  caption: string;
  createdAt: string;
  mediaType: "image" | "carousel" | "video";
  thumbnailUrl: string;
};
export async function socialPosts(
  provider: Provider,
  tokens: Tokens,
): Promise<ImportedPost[]> {
  const results: ImportedPost[] = [];
  if (provider === "instagram") {
    const version = process.env.INSTAGRAM_API_VERSION || "";
    if (!/^v\d+\.\d+$/.test(version)) throw Error("NOT_CONFIGURED");
    const url = new URL(`https://graph.instagram.com/${version}/me/media`);
    url.search = new URLSearchParams({
      fields:
        "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}",
      limit: "100",
    }).toString();
    for (let i = 0; i < 10; i++) {
      const data = await providerJson(url.toString(), {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!Array.isArray(data.data)) throw Error("SYNC_FAILED");
      for (const post of data.data) {
        if (!post.permalink || !post.timestamp) continue;
        const link = socialPostLink(post.permalink);
        if (link.platform !== "instagram") throw Error("SYNC_FAILED");
        results.push({
          ...link,
          caption: String(post.caption || "").slice(0, 1800),
          createdAt: new Date(post.timestamp).toISOString(),
          mediaType:
            post.media_type === "CAROUSEL_ALBUM"
              ? "carousel"
              : post.media_type === "VIDEO"
                ? "video"
                : "image",
          thumbnailUrl: socialThumbnailUrl(
            post.media_type === "VIDEO"
              ? post.thumbnail_url
              : post.media_type === "CAROUSEL_ALBUM"
                ? post.children?.data?.[0]?.thumbnail_url ||
                  post.children?.data?.[0]?.media_url ||
                  post.media_url
                : post.media_url,
            "instagram",
          ),
        });
      }
      if (!data.paging?.next) return results;
      const after = data.paging?.cursors?.after;
      if (!after) throw Error("SYNC_FAILED");
      url.searchParams.set("after", after);
    }
  } else if (provider === "tiktok") {
    let cursor: number | undefined;
    for (let i = 0; i < 10; i++) {
      const data = await providerJson(
        "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,share_url,create_time,cover_image_url",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            max_count: 20,
            ...(cursor ? { cursor } : {}),
          }),
        },
      );
      if (data.error?.code !== "ok" || !Array.isArray(data.data?.videos))
        throw Error("SYNC_FAILED");
      for (const post of data.data.videos) {
        const link = socialPostLink(post.share_url);
        if (link.platform !== "tiktok") throw Error("SYNC_FAILED");
        results.push({
          ...link,
          caption: String(post.video_description || post.title || "").slice(
            0,
            1800,
          ),
          createdAt: new Date(Number(post.create_time) * 1000).toISOString(),
          mediaType: "video",
          thumbnailUrl: socialThumbnailUrl(post.cover_image_url, "tiktok"),
        });
      }
      if (!data.data.has_more) return results;
      cursor = data.data.cursor;
      if (!cursor) throw Error("SYNC_FAILED");
    }
  }
  throw Error("SYNC_FAILED");
}
