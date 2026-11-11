import { instagramLifecycle } from "@/modules/business-tools/instagram-lifecycle";
export const runtime = "nodejs";
export async function POST(request: Request) { return instagramLifecycle(request, "deauthorize"); }
