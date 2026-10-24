import Link from "next/link";
import { notFound } from "next/navigation";
import { withIdentity } from "@/lib/db";
import { acceptInvitation } from "./actions";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Professional invitation | GLOHAUS",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ via?: string; result?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const invite = await withIdentity(
    "",
    async (db) =>
      (
        await db.query<{ data: { slug: string; name: string } | null }>(
          "SELECT beauty.public_acquisition_invitation($1) AS data",
          [token],
        )
      ).rows[0]?.data,
  ).catch(() => null);
  if (!invite) notFound();
  return (
    <main id="main" className="public-info-page">
      <h1>An invitation to {invite.name}</h1>
      <p>
        You can browse this professional without tracking. If you choose to
        record this invitation, GLOHAUS stores that choice after you sign in as
        a customer. A link or QR scan alone does not establish who introduced
        you.
      </p>
      <p>
        <Link className="button" href={`/p/${invite.slug}`}>
          Browse without recording
        </Link>
      </p>
      <p>
        <Link
          href={`/sign-in?returnTo=${encodeURIComponent(`/i/${token}${query.via === "qr" ? "?via=qr" : ""}`)}`}
        >
          Sign in to record the invitation
        </Link>
      </p>
      <form action={acceptInvitation} className="editor-form">
        <input type="hidden" name="token" value={token} />
        <input
          type="hidden"
          name="medium"
          value={query.via === "qr" ? "qr" : "link"}
        />
        <label>
          <input type="checkbox" name="consent" value="yes" required /> Record
          this invitation to help explain how I found the professional.
        </label>
        <button className="button">Record invitation and continue</button>
      </form>
      {query.result === "unavailable" && (
        <p role="alert">
          Invitation could not be recorded. Sign in as a customer or browse
          without recording.
        </p>
      )}
    </main>
  );
}
