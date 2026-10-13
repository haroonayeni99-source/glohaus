import { apiError, json } from "@/lib/http";
import { cartErrorMessage } from "./cart-feedback";

export function cartApiError(
  error: unknown,
  operation: "cart.read" | "cart.add" | "cart.update" | "cart.clear",
): Response {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  if (
    code === "22023" &&
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    cartErrorMessage(error.message)
  ) {
    return json({ error: { code: error.message } }, 409);
  }

  // Log only bounded machine codes, never SQL, provider messages or request data.
  const safeCode =
    typeof code === "string" &&
    (/^[0-9A-Z]{5}$/.test(code) ||
      [
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "EPIPE",
        "ENOTFOUND",
      ].includes(code))
      ? code
      : "UNKNOWN";
  return apiError(error, { operation, code: safeCode });
}
