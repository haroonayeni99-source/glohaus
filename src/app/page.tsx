import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { MobileCustomerHome } from "@/components/mobile-customer-home";
import { withIdentity } from "@/lib/db";
import { discoveryPage } from "@/modules/professionals/repository";
import type { PublicProfessional } from "@/modules/professionals/domain";
import type { CustomerHomeSummary } from "@/modules/home/repository";
import { redirect } from "next/navigation";
import { RecoveryRedirect } from "@/components/recovery-redirect";

export const dynamic = "force-dynamic";
// Deployment refresh: production runtime credentials are now configured.

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string; post?: string }>;
}) {
  const query = await searchParams;

  // Preserve old feed links/bookmarks now that Discover has its own route.
  if (query.view || query.page || query.post) {
    const params = new URLSearchParams();
    if (query.view) params.set("view", query.view);
    if (query.page) params.set("page", query.page);
    if (query.post) params.set("post", query.post);
    redirect(`/discover?${params.toString()}`);
  }

  // The homepage is a public storefront. Existing Supabase sessions stay intact,
  // but the homepage itself always presents signed-out/public navigation.
  const viewer: {
    signedIn: boolean;
    displayName: string;
    canAccessAdmin: boolean;
    summary: CustomerHomeSummary | null;
  } = { signedIn: false, displayName: "", canAccessAdmin: false, summary: null };

  let professionals: PublicProfessional[] = [];

  if (process.env.DATABASE_URL) {
    try {
      professionals = (
        await withIdentity("", (db) => discoveryPage(db, ""))
      ).professionals;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      const details =
        typeof error === "object" && error !== null
          ? (error as {
              table?: unknown;
              schema?: unknown;
              routine?: unknown;
              message?: unknown;
            })
          : {};
      console.error("Professional recommendations unavailable", {
        type: error instanceof Error ? error.name : "UnknownError",
        code,
        table: String(details.table ?? ""),
        schema: String(details.schema ?? ""),
        routine: String(details.routine ?? ""),
        message: String(details.message ?? "").slice(0, 180),
      });
    }
  }

  return (
    <>
      <RecoveryRedirect />
      <DesktopCustomerHome
        professionals={professionals}
        signedIn={viewer.signedIn}
        displayName={viewer.displayName}
        canAccessAdmin={viewer.canAccessAdmin}
        summary={viewer.summary}
      />
      <MobileCustomerHome
        signedIn={viewer.signedIn}
        canAccessAdmin={viewer.canAccessAdmin}
      />
    </>
  );
}
