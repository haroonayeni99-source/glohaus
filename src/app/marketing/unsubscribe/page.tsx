import { MarketingUnsubscribe } from "@/components/marketing-unsubscribe";

export const metadata = { title: "Marketing preferences" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main id="main" className="standalone-message">
      <p className="eyebrow">GLOHAUS EMAIL</p>
      <h1>Optional marketing preferences</h1>
      <p>
        Booking, order, security, verification and payout emails are separate from optional marketing.
      </p>
      <MarketingUnsubscribe token={token} />
    </main>
  );
}
