import { apiError, json } from "@/lib/http";

const messages: Record<string, string> = {
  ACTIVITY_CHANGED:
    "This professional has returned or their status has changed. Refresh the list before deciding.",
  WARNING_REQUIRED:
    "A 60-day inactivity warning must be at least seven days old before hiding this profile.",
  BOOST_UNAVAILABLE:
    "This boost is unavailable, expired or already used. A published, unrestricted profile with an active service is required.",
};
export function activityError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return messages[message]
    ? json({ error: { code: message, message: messages[message] } }, 409)
    : apiError(error);
}
