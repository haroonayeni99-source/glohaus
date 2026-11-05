import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revokeDisconnectedTikTok } from "@/modules/business-tools/disconnect";
import { seal } from "@/modules/business-tools/secrets";
const transport = vi.fn();
const tokens = {accessToken:"fixture-token", expiresAt:1};
beforeEach(() => {
  vi.stubEnv("BUSINESS_TOOLS_ENCRYPTION_KEY", "ab".repeat(32));
  vi.stubEnv("TIKTOK_CLIENT_ID", "fixture-key");
  vi.stubEnv("TIKTOK_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("TIKTOK_ENABLED", "false");
  vi.stubGlobal("fetch",transport);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); transport.mockReset(); });
describe("TikTok disconnect access revocation", () => {
  it.each(["", "{}"])("accepts the documented success body %j even when new connections are disabled", async body => {
    transport.mockResolvedValue(new Response(body));
    expect(await revokeDisconnectedTikTok("pro",seal(tokens,"pro:tiktok"))).toBe(true);
    const [url,init]=transport.mock.calls[0];
    expect(url).toBe("https://open.tiktokapis.com/v2/oauth/revoke/");
    expect(init.redirect).toBe("error");
    expect(init.method).toBe("POST");
    expect(init.body.get("token")).toBe(tokens.accessToken);
    expect(init.body.get("client_key")).toBe("fixture-key");
    expect(init.body.get("client_secret")).toBe("fixture-secret");
  });
  it.each([new Response('{"error":"invalid_request"}'),new Response('bad gateway',{status:502}),new Response('invalid json')])("does not claim provider removal on failure %#", async response => {
    transport.mockResolvedValue(response);
    expect(await revokeDisconnectedTikTok("pro",seal(tokens,"pro:tiktok"))).toBe(false);
  });
  it("does not transmit another professional's credentials",async () => {
    expect(await revokeDisconnectedTikTok("other",seal(tokens,"pro:tiktok"))).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
  it("handles network failure without undoing local disconnect",async () => {
    transport.mockRejectedValue(new Error("fixture network failure"));
    expect(await revokeDisconnectedTikTok("pro",seal(tokens,"pro:tiktok"))).toBe(false);
  });
  it("does not transmit tokens without app credentials",async () => {
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "");
    expect(await revokeDisconnectedTikTok("pro",seal(tokens,"pro:tiktok"))).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
});
