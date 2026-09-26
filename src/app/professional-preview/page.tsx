import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { ProfessionalPagePreview } from "@/components/professional-page-preview";

export const metadata = { title: "GLOHAUS PRO page preview" };

export default function ProfessionalPreviewPage() {
  return (
    <>
      <PublicHeader professional />
      <div className="pro-preview-auth-bar">
        <div>
          <strong>GLOHAUS PRO</strong>
          <span>Preview the professional experience, then enter your own workspace.</span>
        </div>
        <nav aria-label="Professional account actions">
          <Link href="/sign-in?intent=professional&returnTo=/professional">
            Professional sign in
          </Link>
          <Link className="button" href="/sign-up?intent=professional&returnTo=/professional/setup">
            Create PRO account
          </Link>
        </nav>
      </div>
      <ProfessionalPagePreview />
    </>
  );
}
