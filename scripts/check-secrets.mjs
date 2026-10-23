import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const pattern =
  /\b(?:[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})\b/;
let failed = false;
for (const path of paths) {
  if (pattern.test(path)) {
    console.error(
      "Possible Stripe credential in a tracked filename [redacted].",
    );
    failed = true;
    continue;
  }
  const content = await readFile(path);
  if (pattern.test(content.toString("utf8"))) {
    // Report the location only. Never emit the matching credential or line.
    console.error(`Possible Stripe credential in tracked file: ${path}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else
  console.info(
    "Tracked files contain no conventional Stripe secret-key patterns.",
  );
