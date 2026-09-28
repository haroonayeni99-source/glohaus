import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { MobileCustomerHome } from "@/components/mobile-customer-home";
import { withIdentity } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";
import { discoveryPage } from "@/modules/professionals/repository";
import type { PublicProfessional } from "@/modules/professionals/domain";
import {
  customerHomeSummary,
  type CustomerHomeSummary,
} from "@/modules/home/repository";
import { redirect } from "next/navigation";
import { RecoveryRedirect } from "@/components/recovery-redirect";

export const dynamic = "force-dynamic";

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

  let viewer: {
    signedIn: boolean;
    displayName: string;
    summary: CustomerHomeSummary | null;
  } = { signedIn: false, displayName: "", summary: null };
  let professionals: PublicProfessional[] = [];

  if (process.env.DATABASE_URL) {
    let authId = "";
    try {
      authId = (await getIdentity()).authId;
    } catch {}

    try {
      viewer = await withIdentity(authId, async (db) => {
        const account = authId ? await findAccount(db, authId) : null;
        const signedIn = account?.status === "active";
        let summary: CustomerHomeSummary | null = null;

        if (account?.status === "active" && account.roles.includes("customer")) {
          try {
            summary = await customerHomeSummary(db, account.id);
          } catch {
            console.error("Customer Home summary unavailable");
          }
        }

        return {
          signedIn,
          displayName: account?.displayName || "",
          summary,
        };
      });
    } catch {
      console.error("Customer account state unavailable");
    }

    try {
      professionals = (
        await withIdentity("", (db) => discoveryPage(db, ""))
      ).professionals;
    } catch {
      console.error("Professional recommendations unavailable");
    }
  }

  return (
    <>
      <RecoveryRedirect />
      <DesktopCustomerHome
        professionals={professionals}
        signedIn={viewer.signedIn}
        displayName={viewer.displayName}
        summary={viewer.summary}
      />
      <MobileCustomerHome signedIn={viewer.signedIn} />
    </>
  );
}
