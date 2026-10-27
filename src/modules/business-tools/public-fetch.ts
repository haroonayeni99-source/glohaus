import "server-only";
import https from "node:https";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP } from "node:net";
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 || b === 0 || (b === 88 && c === 99) || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(address) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(address) &&
      !/^2001:(?:db8|0|10|20):/i.test(address) &&
      !/^2002:/i.test(address)
    );
  return false;
}

// Shared, bounded transport for authorised calendar feeds and provider thumbnails.
export async function fetchPublicBytes(url: URL, callerSignal?: AbortSignal) {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname.replace(/^\[|\]$/g, ""))
  )
    throw Error("FEED_UNSUPPORTED");
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, AbortSignal.timeout(8000)])
    : AbortSignal.timeout(8000);
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const aborted = () => reject(Error("SYNC_FAILED"));
    signal.addEventListener("abort", aborted, { once: true });
    lookup(url.hostname, { all: true }).then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
    if (signal.aborted) aborted();
  });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("FEED_UNSUPPORTED");
  const address = addresses[0];
  return new Promise<Buffer>((resolve, reject) => {
    const agent = new https.Agent({ keepAlive: false });
    let settled = false;
    const finish = (error?: Error, body?: Buffer) => {
      if (settled) return;
      settled = true;
      agent.destroy();
      if (error) reject(error);
      else resolve(body!);
    };
    try {
      const request = https.get(
        url,
        {
          family: address.family,
          agent,
          lookup: (_host, _options, callback) =>
            callback(null, address.address, address.family),
          signal,
          headers: { Accept: "text/calendar,image/jpeg,image/png,image/webp" },
        },
        (response) => {
          response.on("error", () => finish(Error("SYNC_FAILED")));
          response.on("aborted", () => finish(Error("SYNC_FAILED")));
          if (response.statusCode !== 200) {
            response.resume();
            finish(Error("SYNC_FAILED"));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 2 * 1024 * 1024) {
              finish(Error("FEED_UNSUPPORTED"));
              response.destroy(Error("FEED_UNSUPPORTED"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => finish(undefined, Buffer.concat(chunks)));
        },
      );
      request.on("error", () => finish(Error("SYNC_FAILED")));
    } catch {
      finish(Error("SYNC_FAILED"));
    }
  });
}
