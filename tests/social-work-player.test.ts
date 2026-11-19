// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SocialWorkPlayer } from "@/components/social-work-player";
import type { PublicSocialPost } from "@/modules/business-tools/domain";
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => { void unoptimized; return React.createElement("img", props); } }));
let clean = async () => {};
afterEach(async () => { await clean(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const fixture = (platform: "tiktok" | "instagram"): PublicSocialPost => ({
  id: platform, platform, original_url: platform === "tiktok" ? "https://www.tiktok.com/@fixture/video/1234567890123456789?tracking=strip" : "https://www.instagram.com/reel/EXAMPLE/?tracking=strip",
  caption: "Authorised public example", publication_status: "published", source_available: true,
  source_created_at: null, service_id: null, sort_order: 0, media_type: "video", has_thumbnail: true,
  professional_id: "fixture", slug: "fixture", business_name: "Fixture studio", service_name: null, price_pence: null,
});
async function render(post: PublicSocialPost, autoplay = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  clean = async () => { await act(async () => root.unmount()); host.remove(); };
  await act(async () => root.render(React.createElement(SocialWorkPlayer, { post, autoplay })));
  return host;
}
async function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll("button")].find(button => button.textContent === text);
  expect(button).toBeTruthy(); await act(async () => button!.click());
}
it.each(["tiktok", "instagram"] as const)("gates %s behind consent and unloads the only selected frame", async platform => {
  const host = await render(fixture(platform));
  const name = platform === "tiktok" ? "TikTok" : "Instagram";
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.querySelector("img")?.getAttribute("src")).toBe(`/api/v1/social-thumbnails/${platform}`);
  expect(host.textContent).toContain("cookies");
  await click(host, `Load ${name} video`);
  const frame = host.querySelector("iframe")!;
  expect(host.querySelectorAll("iframe")).toHaveLength(1);
  expect(frame.src).toBe(platform === "tiktok" ? "https://www.tiktok.com/player/v1/1234567890123456789?autoplay=0&controls=1" : "https://www.instagram.com/reel/EXAMPLE/embed/");
  expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
  expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector("a")?.target).toBe("_blank");
  expect(host.querySelector("a")?.href).not.toContain("tracking");
  await click(host, `Unload ${name} player`);
  expect(host.querySelector("iframe")).toBeNull();
});
it.each(["tiktok", "instagram"] as const)("keeps %s failures on site with a safe external option and retry", async platform => {
  const host = await render(fixture(platform)); const name = platform === "tiktok" ? "TikTok" : "Instagram";
  await click(host, `Load ${name} video`);
  await act(async () => { host.querySelector("iframe")!.dispatchEvent(new Event("error")); });
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.querySelector("img")).toBeTruthy();
  expect(host.textContent).toContain("private, deleted or restricted");
  expect(host.querySelector("a")?.textContent).toContain(`View on ${name}`);
  await click(host, `Retry ${name} player`);
  expect(host.querySelector("iframe")).toBeTruthy();
});
it("does not mistake an Instagram iframe load for video playback", async () => {
  const host = await render(fixture("instagram"));
  await click(host, "Load Instagram video");
  await act(async () => { host.querySelector("iframe")!.dispatchEvent(new Event("load")); });
  expect(host.textContent).toContain("Instagram frame opened");
  expect(host.textContent).not.toContain("Playing here");
});
it("trusts TikTok state only from the exact selected provider frame", async () => {
  const host = await render(fixture("tiktok")); await click(host, "Load TikTok video");
  const frame = host.querySelector("iframe")!;
  const send = async (origin: string, source: Window | null, type: string, value?: unknown) => act(async () => {
    window.dispatchEvent(new MessageEvent("message", { origin, source, data: { "x-tiktok-player": true, type, value } }));
  });
  await send("https://evil.test", frame.contentWindow, "onStateChange", 1);
  await send("https://www.tiktok.com", window, "onStateChange", 1);
  expect(host.textContent).not.toContain("Playing here");
  await send("https://www.tiktok.com", frame.contentWindow, "onPlayerReady");
  expect(host.textContent).toContain("player ready");
  await send("https://www.tiktok.com", frame.contentWindow, "onStateChange", 1);
  expect(host.textContent).toContain("Playing here on GLOHAUS");
  await send("https://www.tiktok.com", frame.contentWindow, "onPlayerError", { errorType: "PRIVATE_DETAIL" });
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.textContent).not.toContain("PRIVATE_DETAIL");
});
it("offers a bounded retry without claiming playback or redirecting", async () => {
  vi.useFakeTimers(); const host = await render(fixture("tiktok")); await click(host, "Load TikTok video");
  await act(async () => { vi.advanceTimersByTime(15000); });
  expect(host.textContent).toContain("has not confirmed");
  const oldFrame = host.querySelector("iframe");
  await click(host, "Retry TikTok player");
  expect(host.querySelector("iframe")).not.toBe(oldFrame);
  expect(host.textContent).toContain("Opening");
});
it.each([
  { original_url: "https://instagram.com.evil.test/reel/EXAMPLE/" },
  { original_url: "https://user:password@www.instagram.com/reel/EXAMPLE/" },
  { original_url: "https://www.tiktok.com/@fixture/video/1234567890123456789" },
])("rejects unsafe or platform-mismatched source links: %o", async patch => {
  const host = await render({ ...fixture("instagram"), ...patch });
  expect(host.querySelector("iframe")).toBeNull(); expect(host.querySelector("a")).toBeNull(); expect(host.querySelector("button")).toBeNull();
});
it.each([{ source_available: false }, { publication_status: "hidden" }])("does not embed unavailable or unpublished work: %o", async patch => {
  const host = await render({ ...fixture("tiktok"), ...patch });
  expect(host.querySelector("iframe")).toBeNull(); expect(host.querySelector("button")).toBeNull();
});

it("attempts consented muted TikTok autoplay and retains Play after provider autoplay rejection",async()=>{
 const host=await render(fixture('tiktok'),true);expect(host.querySelector('iframe')).toBeNull();await click(host,'Load TikTok video');
 const frame=host.querySelector('iframe')!;expect(frame.src).toContain('autoplay=1&controls=1&muted=1');expect(frame.getAttribute("allow")).toContain('autoplay');
 await act(async()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://www.tiktok.com',source:frame.contentWindow,data:{'x-tiktok-player':true,type:'onPlayerError',value:{errorCode:3002}}})));
 expect(host.querySelector('iframe')).toBe(frame);expect(host.textContent).toContain('Automatic playback was blocked');
 const message=vi.spyOn(frame.contentWindow!,'postMessage');await click(host,'Play TikTok video');expect(message).toHaveBeenCalledWith({'x-tiktok-player':true,type:'play'},'https://www.tiktok.com');
});
it("does not request provider autoplay when reduced motion is preferred",async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));const host=await render(fixture('tiktok'),true);await click(host,'Load TikTok video');expect(host.querySelector('iframe')!.src).toContain('autoplay=0');
});
