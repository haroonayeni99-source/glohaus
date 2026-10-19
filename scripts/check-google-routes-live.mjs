// Explicit one-off server/build diagnostic. Not part of the default build or
// recurring worker. Reserve three requests in the deployment runbook first.
// Public London station coordinates only; no customer or booking data is used.
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const vr = createRequire(require.resolve("vitest/package.json"));
const vite = createRequire(vr.resolve("vite"));
const { build } = await import(vite.resolve("esbuild"));

if (process.env.GLOHAUS_LIVE_ROUTES_PROBE !== "1") {
  console.error("Live route diagnostic requires explicit server-side opt-in.");
  process.exit(1);
}
const compiled = await build({
  stdin: {
    contents:
      'export { estimateRoute } from "./src/modules/journey-routing/google.ts"; export { routingConfigured } from "./src/modules/journey-routing/crypto.ts";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  alias: { "server-only": resolve("tests/server-only.ts") },
  logLevel: "silent",
});
const { estimateRoute, routingConfigured } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`
);
if (!routingConfigured()) {
  console.error(
    "Live route diagnostic: server credentials are not configured.",
  );
  process.exit(1);
}
let calls = 0,
  httpStatus = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  if (++calls > 3) throw new Error("DIAGNOSTIC_BUDGET_EXHAUSTED");
  const response = await originalFetch(...args);
  httpStatus = response.status;
  return response;
};
const appointment = new Date(Date.now() + 86400000);
appointment.setUTCHours(13, 0, 0, 0);
const context = {
  bookingId: "00000000-0000-4000-8000-000000000000",
  token: "public-diagnostic-only",
  startsAt: appointment.toISOString(),
  latitude: 51.5054,
  longitude: -0.0235,
  departureAt: null,
  durationMinutes: 35,
  bufferMinutes: 10,
  mode: null,
};
try {
  for (const mode of ["driving", "walking", "transit"]) {
    try {
      httpStatus = null;
      const result = await estimateRoute(
        { latitude: 51.5033, longitude: -0.1147 },
        context,
        mode,
        10,
      );
      if (
        result.travelMinutes < 1 ||
        result.travelMinutes > 240 ||
        result.trafficAware !== (mode === "driving") ||
        result.transitSchedule !== (mode === "transit")
      )
        throw new Error("INVALID_ROUTE_RESULT");
      console.log(
        JSON.stringify({
          check: "google-routes-live",
          mode,
          passed: true,
          httpStatus,
          travelMinutes: result.travelMinutes,
          durationMinutes: result.durationMinutes,
          trafficAware: result.trafficAware,
          transitSchedule: result.transitSchedule,
          recommendedDeparture: new Date(
            appointment.getTime() - (10 + result.durationMinutes) * 60000,
          ).toISOString(),
        }),
      );
    } catch (error) {
      const allowed = [
        "ROUTING_NOT_CONFIGURED",
        "ROUTE_PROVIDER_UNAVAILABLE",
        "ROUTE_PROVIDER_LIMIT",
        "ROUTE_NOT_FOUND",
      ];
      console.error(
        JSON.stringify({
          check: "google-routes-live",
          mode,
          passed: false,
          httpStatus,
          code: allowed.includes(error?.code)
            ? error.code
            : "ROUTE_DIAGNOSTIC_FAILED",
        }),
      );
      process.exitCode = 1;
      break;
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
