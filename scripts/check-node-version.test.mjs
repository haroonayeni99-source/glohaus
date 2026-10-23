import assert from "node:assert/strict";
import { test } from "node:test";
import { isSupportedNodeVersion } from "./check-node-version.mjs";

test("rejects vulnerable, unsupported and prerelease runtimes", () => {
  for (const version of [
    "20.19.0",
    "22.14.0",
    "22.23.3",
    "22.23.4",
    "24.19.0",
    "24.22.0",
    "24.22.1-rc.1",
    "26.12.1",
    "24.x",
    "invalid",
  ]) {
    assert.equal(isSupportedNodeVersion(version), false, version);
  }
});

test("accepts the patched baseline and later stable Node 24 releases", () => {
  for (const version of ["v24.22.1", "24.22.1", "24.22.2", "24.23.0"]) {
    assert.equal(isSupportedNodeVersion(version), true, version);
  }
});
