import { pathToFileURL } from "node:url";

// Vercel selects a major version; this separately enforces the security floor.
export function isSupportedNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major === 24 && (minor > 22 || (minor === 22 && patch >= 1));
}

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
