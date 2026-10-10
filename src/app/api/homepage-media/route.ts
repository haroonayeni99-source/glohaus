import { get } from "@vercel/blob";
import { publicHomepageMedia } from "@/modules/platform/repository";
import { withOwner } from "@/modules/admin/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("image");
  if (!path || !/^homepage\/[0-9a-f-]{36}(?:-[A-Za-z0-9]+)?\.webp$/.test(path)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const media = await publicHomepageMedia();
    const published = [media.desktopHero, media.mobileHero].some(value => {
      if (!value) return false;
      try {
        const url = new URL(value);
        return url.origin === new URL(request.url).origin && url.pathname === "/api/homepage-media" && url.searchParams.get("image") === path;
      } catch { return false; }
    });
    // Unpublished uploads can be previewed only by an authenticated Owner.
    if (!published) {
      try { await withOwner(async () => undefined); }
      catch { return new Response("Not found", { status: 404 }); }
    }
    const result = await get(path, { access: "private", abortSignal: AbortSignal.timeout(10000) });
    if (result?.statusCode !== 200) return new Response("Not found", { status: 404 });
    return new Response(result.stream, { headers: {
      "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response("Unavailable", { status: 503 }); }
}
