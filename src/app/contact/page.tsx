import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { ContactForm } from "@/components/contact-form";
import { publicViewerSignedIn } from "@/lib/public-viewer";
import { publicMetadata, publicPages } from "@/lib/public-seo";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("/contact", ...publicPages["/contact"]);
export default async function ContactPage() {
  const signedIn = await publicViewerSignedIn();
  return (
    <>
      <PublicHeader signedIn={signedIn} />
      <main id="main" className="public-info-page">
        <section className="public-info-hero">
          <p className="eyebrow">GLOHAUS SUPPORT</p>
          <h1>Contact Us</h1>
          <p>
            Need help with your account, a booking or a Shop order? Send the
            GLOHAUS team a message. You don’t need to sign in.
          </p>
          <Link href="/faq">Find answers in our help & FAQs</Link>
        </section>
        <ContactForm />
      </main>
    </>
  );
}
