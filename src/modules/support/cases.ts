import { createHash } from "node:crypto";
import { AccessError } from "@/modules/accounts/domain";
export function supportTokenHash(request: Request) {
  const token = request.headers.get("x-support-token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AccessError("FORBIDDEN", 403);
  return createHash("sha256").update(token).digest("hex");
}
export type SupportCase = {
  id: string;
  topic: string;
  message: string;
  status: string;
  created_at: string;
  response_due_at: string;
  first_response_at: string | null;
  events: {
    id: string;
    status: string;
    body: string;
    public: boolean;
    fromStaff: boolean;
    created_at: string;
  }[];
  evidence: { id: string; caption: string; created_at: string }[];
};
