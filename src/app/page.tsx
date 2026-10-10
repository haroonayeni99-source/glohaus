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
import { publicHomepageMedia } from "@/modules/platform/repository";

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

  let viewer: {
    signedIn: boolean;
    displayName: string;
    canAccessAdmin: boolean;
    summary: CustomerHomeSummary | null;
  } = {
    signedIn: false,
    displayName: "",
    canAccessAdmin: false,
    summary: null,
  };
  let professionals: PublicProfessional[] = [];
  const homepageMedia = await publicHomepageMedia();

  let authId = "";
  try {
    const identity = await getIdentity();
    authId = identity.authId;
    // Authentication state comes from Supabase, so the home UI must not
    // show "Sign in" merely because the application database is unavailable.
    viewer = {
      signedIn: true,
      displayName: identity.displayName,
      canAccessAdmin: false,
      summary: null,
    };
  } catch {}

  if (process.env.DATABASE_URL) {
    try {
      viewer = await withIdentity(authId, async (db) => {
        const account = authId ? await findAccount(db, authId) : null;
        let summary: CustomerHomeSummary | null = null;

        if (
          account?.status === "active" &&
          account.roles.includes("customer")
        ) {
          try {
            summary = await customerHomeSummary(db, account.id);
          } catch {
            console.error("Customer Home summary unavailable");
          }
        }

        return {
          signedIn: Boolean(authId),
          displayName: account?.displayName || viewer.displayName,
          canAccessAdmin: Boolean(
            account?.roles.includes("owner") ||
            account?.roles.includes("admin"),
          ),
          summary,
        };
      });
    } catch {
      console.error("Customer account state unavailable");
    }

    try {
      professionals = (await withIdentity("", (db) => discoveryPage(db, "")))
        .professionals;
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
        homepageMedia={homepageMedia}
      />
      <MobileCustomerHome
        professionals={professionals}
        summary={viewer.summary}
        signedIn={viewer.signedIn}
        canAccessAdmin={viewer.canAccessAdmin}
        homepageMedia={homepageMedia}
      />
    </>
  );
}
