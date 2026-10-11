import { customerNameSchema } from "@/modules/accounts/customer-profile-domain";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import {
  customerProfile,
  saveCustomerName,
} from "@/modules/accounts/customer-profile";
export async function GET() {
  try {
    return json(
      await withAccount("customer", (db, account) =>
        customerProfile(db, account.id),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = customerNameSchema.safeParse(await smallJson(request));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("customer", (db, account) =>
      saveCustomerName(db, account.id, parsed.data),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
