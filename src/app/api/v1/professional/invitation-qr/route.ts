import QRCode from "qrcode";
import { withAccount } from "@/lib/api-account";
import { apiError } from "@/lib/http";
import { requestOrigin } from "@/lib/request-origin";
export async function GET(request: Request) {
  try {
    const token = await withAccount(
      "professional",
      async (db) =>
        (
          await db.query<{ data: { token: string } }>(
            "SELECT beauty.my_acquisition_invitation() AS data",
          )
        ).rows[0].data.token,
    );
    const image = await QRCode.toBuffer(
      new URL(`/i/${token}?via=qr`, requestOrigin(request)).href,
      { width: 640, margin: 4, errorCorrectionLevel: "M" },
    );
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition":
          'attachment; filename="glohaus-invitation-qr.png"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
