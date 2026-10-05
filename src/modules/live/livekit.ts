import "server-only";
import { createHmac } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";

type LiveKitGrant = {
  roomJoin: true;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  canPublishSources?: string[];
};

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function liveKitReady() {
  try {
    return Boolean(liveKitServerUrl() && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  } catch { return false; }
}

export function liveKitServerUrl() {
  const value = process.env.LIVEKIT_URL;
  if (!value) throw new Error("LIVEKIT_NOT_CONFIGURED");
  const url = new URL(value);
  if (url.protocol !== "wss:" || url.username || url.password)
    throw new Error("LIVEKIT_INVALID_URL");
  return url.toString();
}

export async function closeLiveKitRoom(room: string) {
  const url = new URL(liveKitServerUrl());
  url.protocol = "https:";
  const client = new RoomServiceClient(url.toString(), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  try {
    await client.deleteRoom(room);
  } catch (error) {
    // An already-empty room may have been removed by LiveKit automatically.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "not_found") return;
    throw error;
  }
}

export function createLiveKitJoinToken({
  identity,
  room,
  canPublish,
}: {
  identity: string;
  room: string;
  canPublish: boolean;
}) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("LIVEKIT_NOT_CONFIGURED");

  const now = Math.floor(Date.now() / 1000);
  const grant: LiveKitGrant = {
    roomJoin: true,
    room,
    canPublish,
    canSubscribe: true,
    canPublishData: canPublish,
    ...(canPublish
      ? { canPublishSources: ["camera", "microphone"] }
      : {}),
  };

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: apiKey,
      sub: identity,
      nbf: now - 5,
      exp: now + 10 * 60,
      video: grant,
      metadata: "",
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", apiSecret)
    .update(unsigned)
    .digest("base64url");

  return `${unsigned}.${signature}`;
}
