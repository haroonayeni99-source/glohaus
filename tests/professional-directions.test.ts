import { describe, expect, it } from "vitest";
import { googleMapsDirections } from "@/modules/professionals/directions";
const studio = {
  business_name: "Studio",
  public_location_confirmed_at: "2026-10-16",
  public_latitude: 51.462,
  public_longitude: -0.115,
};
describe("Google Maps public directions", () => {
  it("uses the confirmed destination and lets Google Maps choose origin and travel mode", () => {
    const url = new URL(googleMapsDirections(studio)!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api: "1",
      destination: "51.462,-0.115",
      dir_action: "navigate",
    });
  });
  it("does not create a route for unconfirmed or area-only locations", () => {
    expect(
      googleMapsDirections({ ...studio, public_location_confirmed_at: null }),
    ).toBeNull();
    expect(googleMapsDirections({ business_name: "Area only" })).toBeNull();
  });
  it.each([null, NaN, Infinity, 100])(
    "rejects invalid destination latitude %s",
    (latitude) => {
      expect(
        googleMapsDirections({ ...studio, public_latitude: latitude }),
      ).toBeNull();
    },
  );
});
