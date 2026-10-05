import { afterEach, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { createLiveKitJoinToken, liveKitReady, liveKitServerUrl } from "@/modules/live/livekit";

afterEach(() => vi.unstubAllEnvs());
function configure() {
  vi.stubEnv("LIVEKIT_URL", "wss://glohaus-test.livekit.cloud");
  vi.stubEnv("LIVEKIT_API_KEY", "test-api-key");
  vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-for-unit-tests-only-not-a-real-credential");
}
it("issues verifiable room-scoped viewer tokens without publishing permissions", async () => {
  configure();
  const token = createLiveKitJoinToken({ identity: "viewer_123", room: "room_123", canPublish: false });
  const claims = await new TokenVerifier(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!).verify(token);
  expect(claims.sub).toBe("viewer_123");
  expect(claims.video).toMatchObject({ room: "room_123", roomJoin: true, canPublish: false, canPublishData: false, canSubscribe: true });
  expect(claims.exp! - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(600);
});
it("limits broadcaster publication to the camera and microphone", async () => {
  configure();
  const claims = await new TokenVerifier(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!).verify(createLiveKitJoinToken({ identity: "pro_123", room: "room_123", canPublish: true }));
  expect(claims.video).toMatchObject({ canPublish: true, canPublishSources: ["camera", "microphone"] });
});
it("fails closed when configuration is missing or the URL is insecure", () => {
  configure();
  expect(liveKitReady()).toBe(true);
  vi.stubEnv("LIVEKIT_URL", "ws://example.test");
  expect(liveKitReady()).toBe(false);
  expect(() => liveKitServerUrl()).toThrow("LIVEKIT_INVALID_URL");
  vi.stubEnv("LIVEKIT_URL", "wss://example.test");
  vi.stubEnv("LIVEKIT_API_SECRET", "");
  expect(liveKitReady()).toBe(false);
});
