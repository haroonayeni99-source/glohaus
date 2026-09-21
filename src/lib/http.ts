import { AccessError } from "@/modules/accounts/domain";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function apiError(error: unknown): Response {
  if (error instanceof AccessError)
    return json({ error: { code: error.code } }, error.status);
  // Never log raw provider/database errors: they may contain customer data or credentials.
  console.error("Account request failed", {
    type: error instanceof Error ? error.name : "UnknownError",
  });
  return json({ error: { code: "UNAVAILABLE" } }, 503);
}

export function assertSameOrigin(request: Request): void {
  const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (
    !allowedOrigin ||
    request.headers.get("origin") !== new URL(allowedOrigin).origin
  ) {
    throw new AccessError("FORBIDDEN", 403);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new AccessError("INVALID_REQUEST", 415);
  }
}

export async function smallJson(
  request: Request,
  limit = 1024,
): Promise<unknown> {
  if (!request.body) throw new AccessError("INVALID_REQUEST", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AccessError("INVALID_REQUEST", 413);
      }
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(data));
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError("INVALID_REQUEST", 400);
  } finally {
    reader.releaseLock();
  }
}
