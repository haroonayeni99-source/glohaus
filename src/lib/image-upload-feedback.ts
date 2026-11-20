// Safe, actionable feedback for authenticated profile-picture uploads.
// Do not display raw server messages or provider details to clients.
export function imageUploadError(status: number, code?: string): string {
  if (status === 401 || code === "UNAUTHENTICATED")
    return "Your session expired. Sign in again and retry your photo.";
  if (status === 403 || code === "FORBIDDEN")
    return "You cannot update this photo from this account. Check which account is signed in.";
  if (status === 413)
    return "This photo is too large to upload. Choose a smaller image and try again.";
  if (status === 415)
    return "The image format was not accepted. Try JPEG, PNG or WebP.";
  if (status === 400)
    return "This photo could not be processed. Try a different JPEG, PNG or WebP.";
  if (status === 503 || code === "UNAVAILABLE")
    return "Photo uploads are temporarily unavailable. Keep this page open and retry shortly.";
  return "Could not save your photo. Your preview is still here so you can try again.";
}

export const PROFILE_PHOTO_UPLOAD_TIMEOUT_MS = 45_000;

export function imageUploadFailure(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? error.name : null;
  if (name === "TimeoutError" || name === "AbortError")
    return "This photo update took too long to confirm. Check your profile before retrying; your preview is still here.";
  if (name === "TypeError")
    return "Could not reach GLOHAUS. Check your connection and retry your photo.";
  return error instanceof Error ? error.message : "Could not save your photo. Please try again.";
}
