import Link from "next/link";
import { LockKeyhole, ArrowUpRight } from "lucide-react";
import type { AccessError } from "@/modules/accounts/domain";

const messages: Record<
  AccessError["code"],
  { title: string; text: string; href: string; label: string }
> = {
  UNAVAILABLE: {
    title: "Your GLOHAUS account is nearly ready.",
    text: "You can keep exploring today. Secure sign-in will be available here as soon as account access is connected.",
    href: "/",
    label: "Keep discovering",
  },
  UNAUTHENTICATED: {
    title: "Your space is just a sign-in away.",
    text: "Sign in to securely access your account.",
    href: "/sign-in",
    label: "Sign in",
  },
  FORBIDDEN: {
    title: "Choose the right GLOHAUS space.",
    text: "You’re signed in, but this account does not have the role required for this workspace. Use My workspace to continue with the account you created.",
    href: "/workspace",
    label: "My workspace",
  },
  ACCOUNT_INACTIVE: {
    title: "Your account is unavailable.",
    text: "Access to this account has been restricted. Your existing records remain protected.",
    href: "/",
    label: "Back to GLOHAUS",
  },
  MFA_REQUIRED: {
    title: "One more layer of security.",
    text: "Admin access requires a second-factor check within the last 15 minutes. Enable two-step verification in account security, then sign out and sign in again to verify.",
    href: "/security",
    label: "Account security",
  },
  ONBOARDING_REQUIRED: {
    title: "Let’s make this your space.",
    text: "Choose how you’ll use GLOHAUS to finish creating your account.",
    href: "/onboarding",
    label: "Set up my account",
  },
  BOOKING_CONFLICT: {
    title: "An appointment needs your attention.",
    text: "These dates overlap an existing appointment or active checkout. Manage your bookings before blocking time off.",
    href: "/professional/bookings",
    label: "View appointments",
  },
  INVALID_REQUEST: {
    title: "That didn’t go through.",
    text: "Please return to your account and try again.",
    href: "/workspace",
    label: "My workspace",
  },
};

export function AccessMessage({
  code = "UNAVAILABLE",
}: {
  code?: AccessError["code"];
}) {
  const message = messages[code];
  return (
    <section className="access-card" aria-labelledby="access-title">
      <span className="icon-tile">
        <LockKeyhole size={23} aria-hidden />
      </span>
      <p className="eyebrow">ACCOUNT ACCESS</p>
      <h1 id="access-title">{message.title}</h1>
      <p>{message.text}</p>
      <Link className="button" href={message.href}>
        {message.label}
        <ArrowUpRight size={18} aria-hidden />
      </Link>
    </section>
  );
}
