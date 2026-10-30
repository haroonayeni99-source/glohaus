import { publicMetadata, publicPages } from "@/lib/public-seo";
import { FaqContent } from "@/components/faq-content";
import { publicBookingFees } from "@/modules/bookings/public-fees";

export default async function FaqPage() {
  return <FaqContent bookingFees={await publicBookingFees()} />;
}

export const metadata = publicMetadata("/faq", ...publicPages["/faq"]);
