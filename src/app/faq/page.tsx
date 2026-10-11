import { publicMetadata, publicPages } from "@/lib/public-seo";
import { FaqContent } from "@/components/faq-content";

export default function FaqPage() {
  return <FaqContent />;
}

export const metadata = publicMetadata("/faq", ...publicPages["/faq"]);
