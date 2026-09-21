import "server-only";
import { z } from "zod";
import { smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { sanitizeImage } from "./image";
const uploadSchema = z
  .object({
    base64: z.string().max(4194304),
    altText: z.string().trim().min(3).max(200),
  })
  .strict();
export async function readImageUpload(request: Request) {
  const parsed = uploadSchema.safeParse(await smallJson(request, 4250000));
  if (!parsed.success || !/^[A-Za-z0-9+/]*={0,2}$/.test(parsed.data.base64))
    throw new AccessError("INVALID_REQUEST", 400);
  try {
    return {
      image: await sanitizeImage(Buffer.from(parsed.data.base64, "base64")),
      altText: parsed.data.altText,
    };
  } catch {
    throw new AccessError("INVALID_REQUEST", 400);
  }
}
