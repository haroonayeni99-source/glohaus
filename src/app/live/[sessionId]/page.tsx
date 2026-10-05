import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { pageAccount } from "@/lib/page-access";
import { AccessMessage } from "@/components/access-message";
import { LiveBroadcast } from "@/components/live-broadcast";
import { liveKitReady } from "@/modules/live/livekit";
export const dynamic = "force-dynamic";
export const metadata = { title: "Watch LIVE · GLOHAUS" };
export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  const result = await pageAccount();
  if (!result.account) return <div className="standalone-message"><AccessMessage code={result.error} /></div>;
  return <main id="main" className="pro-main pro-management-page"><Link href="/explore">← Explore GLOHAUS</Link><p className="pro-kicker">GLOHAUS LIVE</p><h1>Beauty, in the moment.</h1><LiveBroadcast sessionId={sessionId} enabled={liveKitReady()} /></main>;
}
