import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { QualityControlWorkspace } from "@/components/quality-control-workspace";
import { OwnerQualityDiagnostics } from "@/components/owner-quality-diagnostics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quality Control | GLOHAUS", robots: { index: false, follow: false } };

export default async function QualityControlPage() {
  const access = await pageAccount("admin", "/admin/quality-control");
  if (!access.account) return <AuthFrame><AccessMessage code={access.error ?? undefined} /></AuthFrame>;
  if (!access.account.roles.includes("owner")) return <main style={{ padding: 32 }}><h1>Owner access required</h1><p>Quality Control is private to the GLOHAUS Owner.</p><Link href="/admin">Back to dashboard</Link></main>;
  return <main id="main" style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px, 3vw, 42px)" }}>
    <Link href="/admin" style={{ display: "inline-block", marginBottom: 18 }}>← Owner Control Centre</Link>
    <OwnerQualityDiagnostics />
    <QualityControlWorkspace />
  </main>;
}
