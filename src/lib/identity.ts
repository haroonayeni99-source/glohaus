import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { AccessError, type Identity } from "@/modules/accounts/domain";
import { authConfigured } from "./config";

export async function getIdentity(): Promise<Identity> {
  if (!authConfigured()) throw new AccessError("UNAVAILABLE", 503);
  const session = await auth({ acceptsToken: "session_token" });
  if (!session.userId || !session.sessionId)
    throw new AccessError("UNAUTHENTICATED", 401);
  const client = await clerkClient();
  // Live checks close the gap between session-token expiry and provider revocation.
  const [liveSession, user] = await Promise.all([
    client.sessions.getSession(session.sessionId),
    client.users.getUser(session.userId),
  ]);
  if (
    liveSession.status !== "active" ||
    liveSession.userId !== session.userId ||
    user.banned ||
    user.locked
  ) {
    throw new AccessError("UNAUTHENTICATED", 401);
  }
  const email = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  if (!email || email.verification?.status !== "verified")
    throw new AccessError("FORBIDDEN", 403);
  const fva = session.sessionClaims?.fva;
  return {
    authId: session.userId,
    email: email.emailAddress,
    displayName: (user.firstName?.trim() || "Your account").slice(0, 120),
    secondFactorAge:
      Array.isArray(fva) && typeof fva[1] === "number" ? fva[1] : null,
  };
}
