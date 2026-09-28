import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { ResetPasswordForm } from "@/components/reset-password-form";
export const metadata={title:"Reset password"};
export default function Page(){return <AuthFrame>{authConfigured()?<ResetPasswordForm/>:<AccessMessage/>}</AuthFrame>;}
