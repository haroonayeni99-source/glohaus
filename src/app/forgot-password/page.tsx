import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
export const metadata={title:"Forgot password"};
export default function Page(){return <AuthFrame>{authConfigured()?<ForgotPasswordForm/>:<AccessMessage/>}</AuthFrame>;}
