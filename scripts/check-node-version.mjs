import { pathToFileURL } from "node:url";
import { isSupportedNodeVersion } from "../src/lib/node-runtime-policy.ts";
export { isSupportedNodeVersion };

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!isSupportedNodeVersion(process.version)) {
    console.error(
      `Unsupported Node.js ${process.version}. Use Node.js 24.22.1 or a newer stable 24.x release.`,
    );
    process.exitCode = 1;
  } else {
    console.info(`Node.js security floor verified: ${process.version}`);
  }
}
