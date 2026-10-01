import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { storyInputSchema } from "@/modules/stories/domain";
import { createStory } from "@/modules/stories/repository";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = storyInputSchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const story = await withAccount("professional", (db, account) =>
      createStory(db, account.professionalId!, parsed.data),
    );
    return json({ story }, 201);
  } catch (error) {
    return apiError(error);
  }
}
