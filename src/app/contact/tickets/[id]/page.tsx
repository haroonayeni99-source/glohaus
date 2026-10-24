import { notFound } from "next/navigation";
import { z } from "zod";
import { SupportTicket } from "@/components/support-ticket";
export const metadata = {
  title: "Private support ticket | GLOHAUS",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <main id="main" className="public-info-page">
      <h1>Your support ticket</h1>
      <SupportTicket id={id} />
    </main>
  );
}
