import { afterEach, expect, it, vi } from "vitest";
import { resolvePostcodeLocation } from "@/modules/professionals/postcode-search";
afterEach(() => vi.unstubAllGlobals());
it("normalises full postcodes and outcodes without sending arbitrary location text to the provider", async () => {
  const fetcher = vi.fn(async (url: string) => {
    void url;
    return {
      ok: true,
      json: async () => ({ result: { latitude: 51.5, longitude: -0.1 } }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await resolvePostcodeLocation(" sw1a 1aa ")).toEqual({
    latitude: 51.5,
    longitude: -0.1,
  });
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://api.postcodes.io/postcodes/SW1A1AA",
  );
  await resolvePostcodeLocation("SE15");
  expect(fetcher.mock.calls[1][0]).toBe(
    "https://api.postcodes.io/outcodes/SE15",
  );
  await resolvePostcodeLocation("Peckham");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("rejects invalid provider coordinates rather than breaking map positioning", async () => {
  for (const point of [
    { latitude: 999, longitude: 0 },
    { latitude: 51, longitude: -999 },
    { latitude: NaN, longitude: 0 },
    { latitude: "51", longitude: 0 },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ result: point }) })),
    );
    expect(await resolvePostcodeLocation("SE15")).toBeNull();
  }
});
it("falls back safely if geocoding is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Timeout");
    }),
  );
  expect(await resolvePostcodeLocation("SE15")).toBeNull();
});
