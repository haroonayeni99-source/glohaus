// Record the actual function runtime after an approved deployment. Never log
// environment contents, request data, credentials or provider responses here.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.info("GLOHAUS Node.js runtime", { node: process.version });
    // Fail before serving application requests on an unpatched managed runtime.
    // Never promote a deployment until the preview passes this startup guard.
    assertSupportedNodeVersion(process.version);
  }
}
import { assertSupportedNodeVersion } from "@/lib/node-runtime-policy";
