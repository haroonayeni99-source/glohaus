import { PublicHeader } from "@/components/public-header";
import { ProfessionalPagePreview } from "@/components/professional-page-preview";

export const metadata = { title: "GLOHAUS PRO page preview" };

export default function ProfessionalPreviewPage() {
  return (
    <>
      <PublicHeader />
      <ProfessionalPagePreview />
    </>
  );
}
