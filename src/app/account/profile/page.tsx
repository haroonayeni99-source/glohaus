import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { CustomerProfileEditor } from "@/components/customer-profile-editor";
import { customerProfile } from "@/modules/accounts/customer-profile";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your customer profile" };
export default async function Page() {
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <main id="main">
        <AccessMessage code={result.error} />
      </main>
    );
  const account = result.account;
  const profile = await withIdentity(account.authId, (db) =>
    customerProfile(db, account.id),
  );
  return (
    <>
      <PublicHeader signedIn />
      <main id="main" className="customer-account-page">
        <Link className="text-link" href="/account">
          ← Your account
        </Link>
        <p className="eyebrow">YOUR PROFILE</p>
        <h1>Help your professional recognise you.</h1>
        <CustomerProfileEditor
          userId={account.id}
          profile={
            profile ?? { first_name: "", last_name: "", has_photo: false }
          }
        />
      </main>
      <BottomNavigation signedIn active="profile" />
    </>
  );
}
