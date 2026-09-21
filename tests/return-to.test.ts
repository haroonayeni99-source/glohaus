import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/return-to";

describe("safeReturnTo", () => {
  it("keeps an internal booking continuation URL", () =>
    expect(safeReturnTo("/p/studio?bookDate=2030-01-01", "/workspace")).toBe(
      "/p/studio?bookDate=2030-01-01",
    ));
  it("rejects external and malformed redirect targets", () => {
    expect(safeReturnTo("https://attacker.example", "/workspace")).toBe(
      "/workspace",
    );
    expect(safeReturnTo("//attacker.example", "/workspace")).toBe("/workspace");
    expect(safeReturnTo("/\\attacker.example", "/workspace")).toBe(
      "/workspace",
    );
  });
});
