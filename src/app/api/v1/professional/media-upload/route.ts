import { randomUUID } from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { withAccount } from "@/lib/api-account";
import { withIdentity } from "@/lib/db";
import { AccessError } from "@/modules/accounts/domain";

const allowed = ["video/mp4", "video/webm", "video/quicktime"] as const;

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return Response.json({ error: "UNAVAILABLE" }, { status: 503 });

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload || "{}") as {
          altText?: string;
        };
        const altText = String(payload.altText || "").trim();
        if (altText.length < 3 || altText.length > 200)
          throw new Error("Describe the video before uploading.");
        if (!/^portfolio\/video-[A-Za-z0-9._-]+$/.test(pathname))
          throw new Error("Invalid upload path.");

        const owner = await withAccount("professional", async (db, account) => {
          const count = (
            await db.query<{ count: number }>(
              "SELECT count(*)::integer AS count FROM beauty.portfolio_assets WHERE professional_id=$1",
              [account.professionalId],
            )
          ).rows[0].count;
          if (count >= 100) throw new AccessError("INVALID_REQUEST", 400);
          return {
            authId: account.authId,
            professionalId: account.professionalId!,
          };
        });

        return {
          allowedContentTypes: [...allowed],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            ...owner,
            altText,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as {
          authId: string;
          professionalId: string;
          altText: string;
        };
        if (!payload.authId || !payload.professionalId || !payload.altText)
          throw new Error("Invalid upload token.");
        if (!allowed.includes(blob.contentType as (typeof allowed)[number]))
          throw new Error("Unsupported video type.");

        await withIdentity(payload.authId, async (db) => {
          const id = randomUUID();
          await db.query(
            `INSERT INTO beauty.portfolio_assets
              (id,professional_id,blob_path,alt_text,media_type,mime_type)
             VALUES($1,$2,$3,$4,'video',$5)`,
            [
              id,
              payload.professionalId,
              blob.pathname,
              payload.altText,
              blob.contentType,
            ],
          );
        });
      },
    });
    return Response.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Professional video upload failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "UPLOAD_FAILED" }, { status: 400 });
  }
}
