import { AccessError } from "@/modules/accounts/domain";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function apiError(
  error: unknown,
  diagnostics?: { operation: string; code: string },
): Response {
  if (error instanceof AccessError)
    return json({ error: { code: error.code } }, error.status);
  // Translate only known database decisions; keep SQL text and unknown failures private.
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  ) {
    if (error.code === "22023" && error.message === "INVALID_PRODUCT_CATEGORY")
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    if (error.code === "42501" && error.message === "FORBIDDEN")
      return json({ error: { code: "FORBIDDEN" } }, 403);
    if (
      ["22023", "23514", "23503", "23505"].includes(String(error.code)) &&
      /INVALID_TAXONOMY|INACTIVE_TAXONOMY|INVALID_TEMPLATE|INVALID_OPTIONS|UNAVAILABLE_SERVICE|ALIAS_ALREADY_USED|INVALID_REQUEST|NOT_FOUND|taxonomy|specialit|template|service_options/.test(
        String(error.message),
      )
    )
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    if (error.code === "42501" && error.message === "VERIFICATION_REQUIRED")
      return json({ error: { code: "VERIFICATION_REQUIRED" } }, 403);
    if (error.code === "22023" && error.message === "INVALID_TRANSITION")
      return json({ error: { code: "INVALID_REQUEST" } }, 409);
  }
  // Never log raw provider/database errors: they may contain customer data or credentials.
  console.error("Account request failed", {
    type: error instanceof Error ? error.name : "UnknownError",
    ...diagnostics,
  });
  return json({ error: { code: "UNAVAILABLE" } }, 503);
}

export function assertSameOrigin(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
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
