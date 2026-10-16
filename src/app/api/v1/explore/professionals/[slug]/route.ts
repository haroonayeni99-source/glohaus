import { withIdentity } from "@/lib/db";
import { apiError, json } from "@/lib/http";
import { publicProfile } from "@/modules/professionals/repository";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug))
      return json({ error: { code: "NOT_FOUND" } }, 404);
    const result = await withIdentity("", async (db) => {
      const profile = await publicProfile(db, slug);
      if (!profile) return null;
      const assets = (
        await db.query<{
          id: string;
          alt_text: string;
          media_type: "image" | "video";
        }>(
          "SELECT id,alt_text,media_type FROM beauty.public_media_assets WHERE professional_id=$1 ORDER BY created_at DESC LIMIT 8",
          [profile.professional.id],
        )
      ).rows;
      // Only the public presentation and catalogue; never contact preferences,
      // addresses, customer data, private notes or payment/account records.
      return {
        professional: profile.professional,
        services: profile.services.map((s) => ({
          id: s.id,
          name: s.name,
          price_pence: s.from_price_pence ?? s.price_pence,
          duration_minutes: s.duration_minutes,
          speciality_id: s.speciality_id,
        })),
        assets,
      };
    });
    return result ? json(result) : json({ error: { code: "NOT_FOUND" } }, 404);
  } catch (error) {
    return apiError(error);
  }
}
