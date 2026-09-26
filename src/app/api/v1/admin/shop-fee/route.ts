import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z
  .object({
    percentage: z.number().min(0).max(100),
    fixedFeePence: z.number().int().min(0).max(100_000),
    minimumFeePence: z.number().int().min(0).max(100_000),
    maximumFeePence: z.number().int().min(0).max(100_000).nullable(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.maximumFeePence !== null &&
      value.maximumFeePence < value.minimumFeePence
    )
      context.addIssue({
        code: "custom",
        path: ["maximumFeePence"],
        message: "Maximum fee must be at least the minimum fee.",
      });
  });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const percentageBasisPoints = Math.round(parsed.data.percentage * 100);

    const result = await withOwner((db) =>
      db.query<{ id: string }>(
        `SELECT beauty.set_financial_fee_rule(
          'product',
          NULL,
          'professional',
          $1,
          $2,
          $3,
          $4,
          1,
          'platform',
          $5
        ) AS id`,
        [
          percentageBasisPoints,
          parsed.data.fixedFeePence,
          parsed.data.minimumFeePence,
          parsed.data.maximumFeePence,
          parsed.data.reason,
        ],
      ),
    );

    return json({ saved: true, id: result.rows[0]?.id });
  } catch (error) {
    return apiError(error);
  }
}
