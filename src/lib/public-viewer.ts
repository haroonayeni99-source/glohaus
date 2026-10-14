import "server-only";
import { getIdentity } from "@/lib/identity";

// Session state is independent of account/database availability. Account status,
// roles and MFA continue to be checked by protected pages and API handlers.
export async function publicViewerSignedIn(): Promise<boolean> {
  try {
    return Boolean((await getIdentity()).authId);
  } catch {
    return false;
  }
}
