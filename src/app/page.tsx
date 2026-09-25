import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { MobileCustomerHome } from "@/components/mobile-customer-home";
import { withIdentity } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";
import { discoveryPage } from "@/modules/professionals/repository";
import type { PublicProfessional } from "@/modules/professionals/domain";
import { redirect } from "next/navigation";

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

  let viewer = { signedIn: false, displayName: "" };
  let professionals: PublicProfessional[] = [];

  if (process.env.DATABASE_URL) {
    let authId = "";
    try {
      authId = (await getIdentity()).authId;
    } catch {}

    try {
      viewer = await withIdentity(authId, async (db) => {
        const account = authId ? await findAccount(db, authId) : null;
        return {
          signedIn: account?.status === "active",
          displayName: account?.displayName || "",
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
      <DesktopCustomerHome
        professionals={professionals}
        signedIn={viewer.signedIn}
        displayName={viewer.displayName}
      />
      <MobileCustomerHome />
    </>
  );
}
