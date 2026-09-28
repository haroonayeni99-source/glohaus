import { redirect } from "next/navigation";
import { authConfigured } from "@/lib/config";
import { productionAuthUrl } from "@/lib/preview-auth";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Forgot password" };

export default function Page() {
  const previewTarget = productionAuthUrl("/forgot-password");
  if (previewTarget) redirect(previewTarget);
  return (
    <AuthFrame>
      {authConfigured() ? <ForgotPasswordForm /> : <AccessMessage />}
    </AuthFrame>
  );
}
