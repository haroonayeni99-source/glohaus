import { z } from "zod";

export const supportTopics = [
  "Account & sign-in",
  "Booking",
  "Shop order",
  "Professional account",
  "Other",
] as const;
export const supportInputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    topic: z.enum(supportTopics),
    reference: z.string().trim().max(120).default(""),
    message: z.string().trim().min(20).max(4000),
    website: z.string().max(200).default(""),
  })
  .strict();
export type SupportInput = z.infer<typeof supportInputSchema>;
export type SupportRequest = {
  id: string;
  name: string;
  email: string;
  topic: string;
  reference: string;
  message: string;
  status:
    | "open"
    | "under_review"
    | "awaiting_customer"
    | "escalated"
    | "resolved"
    | "appealed";
  response_due_at?: string;
  first_response_at?: string | null;
  created_at: string;
};
