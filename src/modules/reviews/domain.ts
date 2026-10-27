import { z } from "zod";

export const reviewQuestions = [
  ["quality", "How satisfied were you with the quality of the service?"],
  ["welcome", "How professional and welcoming was your professional?"],
  ["timing", "Was your appointment on time?"],
  ["expectations", "Did the service meet your expectations?"],
  ["result", "Were you happy with the final result?"],
  ["recommend", "Would you recommend this professional?"],
] as const;
export const reviewAnswersSchema = z
  .object({
    quality: z
      .enum([
        "very_satisfied",
        "satisfied",
        "neutral",
        "dissatisfied",
        "very_dissatisfied",
      ])
      .optional(),
    welcome: z
      .enum(["excellent", "good", "neutral", "poor", "very_poor"])
      .optional(),
    timing: z
      .enum(["on_time", "slightly_late", "very_late", "not_applicable"])
      .optional(),
    expectations: z
      .enum(["exceeded", "met", "partly_met", "not_met"])
      .optional(),
    result: z
      .enum(["very_happy", "happy", "neutral", "unhappy", "very_unhappy"])
      .optional(),
    recommend: z.enum(["yes", "unsure", "no"]).optional(),
  })
  .strict();
export type ReviewAnswers = z.infer<typeof reviewAnswersSchema>;
export const answerOptions = {
  quality: [
    "very_satisfied",
    "satisfied",
    "neutral",
    "dissatisfied",
    "very_dissatisfied",
  ],
  welcome: ["excellent", "good", "neutral", "poor", "very_poor"],
  timing: ["on_time", "slightly_late", "very_late", "not_applicable"],
  expectations: ["exceeded", "met", "partly_met", "not_met"],
  result: ["very_happy", "happy", "neutral", "unhappy", "very_unhappy"],
  recommend: ["yes", "unsure", "no"],
} satisfies Record<keyof ReviewAnswers, string[]>;
export function answerLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}
export const reviewSchema = z
  .object({
    bookingId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    body: z.string().trim().max(2000).default(""),
    publicName: z.string().trim().min(1).max(80),
    answers: reviewAnswersSchema.default({}),
    privateSuggestion: z.string().trim().max(1000).default(""),
    photo: z
      .object({
        base64: z
          .string()
          .max(4194304)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        altText: z.string().trim().min(3).max(200),
        consent: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict();
