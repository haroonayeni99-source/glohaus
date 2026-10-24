import { withAdmin } from "@/modules/admin/repository";
import { apiError, json } from "@/lib/http";
import { isSupportedNodeVersion } from "@/lib/node-runtime-policy";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (process.env.VERCEL_ENV === "production")
      await withAdmin(async () => true);
    return json({
      node: process.version,
      patched: isSupportedNodeVersion(process.version),
    });
  } catch (error) {
    return apiError(error);
  }
}
