import { expect, it } from "vitest";
import {
  londonBoroughs,
  londonBorough,
} from "@/modules/professionals/london-boroughs";
import { boroughPolygon } from "@/modules/professionals/london-borough-boundaries";
it("offers every London borough once and preserves ordinary neighbourhood searches", () => {
  expect(londonBoroughs).toHaveLength(32);
  expect(new Set(londonBoroughs).size).toBe(32);
  expect(londonBoroughs).not.toContain("City of London");
  expect(londonBorough("  SOUTHWARK ")).toBe("Southwark");
  expect(boroughPolygon("Peckham")).toBeNull();
  expect(boroughPolygon("City of London")).toBeNull();
  for (const borough of londonBoroughs)
    expect(boroughPolygon(borough)).toMatch(/^\(\(-?[\d.]+,[\d.]+\)/);
});
