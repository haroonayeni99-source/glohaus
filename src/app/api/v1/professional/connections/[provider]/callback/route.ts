import { cookies } from "next/headers";
import { withAccount } from "@/lib/api-account";
import { providerSchema } from "@/modules/business-tools/domain";
import {
  configuration,
  exchangeCode,
  validateOAuthState,
} from "@/modules/business-tools/oauth";
import {
  storeConnection,
  syncProfessional,
} from "@/modules/business-tools/repository";
export const maxDuration = 60;
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const parsed = providerSchema.safeParse((await context.params).provider);
  if (!parsed.success || parsed.data === "ics")
    return new Response("Unknown provider", { status: 404 });
  const provider = parsed.data,
    cookieJar = await cookies(),
    name = `glohaus_connection_${provider}`;
  const config = configuration(provider),
    origin = new URL(config.redirectUri).origin;
  let result = "error";
  let phase = "account";
  let sandboxDiagnostic = false;
  let diagnostic = "";
  try {
    const query = new URL(request.url).searchParams;
    const account = await withAccount("professional", async (_db, a) => a);
    sandboxDiagnostic = provider === "tiktok" && configuration(provider, account.professionalId!).sandbox;
    phase = "state";
    const state = validateOAuthState(
      cookieJar.get(name)?.value || "",
      query.get("state") || "",
      provider,
      account.authId,
    );
    if (state.professionalId !== account.professionalId || query.has("error"))
      throw Error("INVALID_STATE");
    const code = query.get("code");
    if (!code || code.length > 4096) throw Error("INVALID_CODE");
    phase = "exchange";
    const tokens = await exchangeCode(state, code);
    phase = "store";
    const connection = await withAccount("professional", (db) =>
      storeConnection(
        db,
        state.professionalId,
        provider,
        provider === "google"
          ? "Google Calendar (primary)"
          : provider === "outlook"
            ? "Outlook Calendar (default)"
            : provider === "instagram"
              ? "Instagram"
              : "TikTok",
        tokens,
        state.writeCalendar,
      ),
    );
    phase = "sync";
    const synced = await syncProfessional(
      account.authId,
      state.professionalId,
      connection.id,
    );
    result = synced.failed ? "sync_error" : "connected";
  } catch (error) {
    // Only fixed categories are logged: never provider payloads, URLs, codes,
    // ciphertext, tokens, account identifiers or arbitrary exception messages.
    const safe = new Set(["INVALID_STATE", "INVALID_CODE", "RECONNECT_REQUIRED", "NOT_CONFIGURED", "TOO_MANY_CONNECTIONS", "INVALID_SECRET"]);
    const code = error instanceof Error && safe.has(error.message) ? error.message : "CONNECTION_FAILED";
    console.warn("Business connection callback failed", {provider,phase,code});
    if (sandboxDiagnostic) diagnostic = `&diagnostic=${phase}_${code}`;
  }
  cookieJar.delete({ name, path: "/api/v1/professional/connections" });
  return Response.redirect(
    `${origin}/professional/connections?connection=${result}${diagnostic}`,
    303,
  );
}
