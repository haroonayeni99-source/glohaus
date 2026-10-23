// Record the actual function runtime after an approved deployment. Never log
// environment contents, request data, credentials or provider responses here.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.info("GLOHAUS Node.js runtime", { node: process.version });
  }
}
