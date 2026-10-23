// Shared by build commands and hosted function startup: a patched build does
// not prove that Vercel selected a patched function runtime.
export function isSupportedNodeVersion(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major === 24 && (minor > 22 || (minor === 22 && patch >= 1));
}

export function assertSupportedNodeVersion(version: string): void {
  if (!isSupportedNodeVersion(version)) {
    throw new Error(
      "GLOHAUS requires Node.js 24.22.1 or a newer stable 24.x function runtime. Deployment blocked.",
    );
  }
}
