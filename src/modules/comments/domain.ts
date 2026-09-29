import { z } from "zod";

export const commentSchema = z
  .object({
    body: z.string().trim().min(1).max(500),
  })
  .strict();

export type PostComment = {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: Date;
  mine: boolean;
};
