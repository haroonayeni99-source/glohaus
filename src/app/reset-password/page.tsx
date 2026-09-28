import { cookies } from "next/headers";
import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Reset password" };

export default async function Page() {
  const recoveryAllowed =
    (await cookies()).get("glohaus_password_recovery")?.value === "1";

  return (
    <AuthFrame>
      {authConfigured() ? (
        <ResetPasswordForm recoveryAllowed={recoveryAllowed} />
      ) : (
        <AccessMessage />
      )}
    </AuthFrame>
  );
}
