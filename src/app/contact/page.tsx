import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { ContactForm } from "@/components/contact-form";
import { publicViewerSignedIn } from "@/lib/public-viewer";
import { publicMetadata, publicPages } from "@/lib/public-seo";
import { supportTopics } from "@/modules/support/domain";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("/contact", ...publicPages["/contact"]);
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; topic?: string }>;
}) {
  const params = await searchParams;
  const reference = params.reference?.slice(0, 120) ?? "";
  const topic =
    supportTopics.find((topic) => topic === params.topic) ?? supportTopics[0];
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
        <p>
          Email: <a href="mailto:support@glohaus.shop">support@glohaus.shop</a>.
          We aim to respond within two weekdays (Monday–Friday), subject to
          public-holiday delays; this is a target, not a guarantee.
        </p>
        <p>
          If you cannot reach our support address, email{" "}
          <a href="mailto:glohausuk@gmail.com">glohausuk@gmail.com</a> instead.
        </p>
        <p>
          For a copy, correction or eligible deletion of your information,
          choose “Privacy &amp; data request”. Choose “Privacy complaint” to
          raise a data-protection concern. Use “Complaint / appeal” for other
          complaints; include the original ticket reference where possible. You
          can also contact us by email.
        </p>
        <ContactForm defaultReference={reference} defaultTopic={topic} />
      </main>
    </>
  );
}
