import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { professionalPresentationSchema } from "@/modules/professionals/domain";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = professionalPresentationSchema.safeParse(
      await smallJson(request, 8192),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    await withAccount("professional", (db, account) =>
      db.query(
        `INSERT INTO beauty.professional_profile_presentation(
           professional_id,profile_style,portfolio_layout,service_style,updated_at
         ) VALUES($1,$2,$3,$4,now())
         ON CONFLICT(professional_id) DO UPDATE SET
           profile_style=excluded.profile_style,
           portfolio_layout=excluded.portfolio_layout,
           service_style=excluded.service_style,
           updated_at=now()`,
        [
          account.professionalId,
          parsed.data.profileStyle,
          parsed.data.portfolioLayout,
          parsed.data.serviceStyle,
        ],
      ),
    );

    return json({ saved: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42501"
    )
      return json({ error: { code: "PLAN_REQUIRED" } }, 403);
    return apiError(error);
  }
}
