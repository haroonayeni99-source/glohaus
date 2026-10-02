import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { publicSupabaseKey } from "@/lib/config";
import { confirmationPlan } from "@/lib/auth-flow";
import { withIdentity } from "@/lib/db";
import { ensureCustomerAccount } from "@/modules/accounts/repository";
import { workspacePath, type Identity } from "@/modules/accounts/domain";

function noStoreRedirect(origin: string, path: string) {
  const response = NextResponse.redirect(new URL(path, origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const response = noStoreRedirect(url.origin, "/account");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publicSupabaseKey()!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) =>
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    },
  );

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const allowedTypes = new Set<EmailOtpType>([
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
    "email",
  ]);

  let data;
  let error;

  if (code) {
    ({ data, error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (
    tokenHash &&
    rawType &&
    allowedTypes.has(rawType as EmailOtpType)
  ) {
    ({ data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    }));
  } else {
    return noStoreRedirect(url.origin, "/sign-in?authError=missing_code");
  }

  if (error)
    return noStoreRedirect(
      url.origin,
      "/sign-in?authError=confirmation_failed",
    );

  const next = url.searchParams.get("next");
  if (next === "/reset-password") {
    response.cookies.set("glohaus_password_recovery", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/reset-password",
      maxAge: 15 * 60,
    });
    response.headers.set(
      "Location",
      new URL("/reset-password", url.origin).toString(),
    );
    return response;
  }

  const user = data.user ?? data.session?.user;
  const plan = confirmationPlan(next, user?.user_metadata);
  response.headers.set(
    "Location",
    new URL(plan.redirectTo, url.origin).toString(),
  );

  if (!user?.id || !user.email) {
    response.headers.set(
      "Location",
      new URL("/sign-in?authError=confirmation_failed", url.origin).toString(),
    );
    return response;
  }

  const identity: Identity = {
    authId: user.id,
    email: user.email,
    displayName: user.email.split("@")[0]?.slice(0, 120) || "Your account",
    secondFactorAge: null,
  };

  try {
    // Every confirmed Supabase identity gets a baseline GLOHAUS account so it
    // is visible to Owner/Admin immediately. Professional privileges are still
    // granted only through the separate 18+ / Professional Terms onboarding.
    const account = await withIdentity(identity.authId, (db) =>
      ensureCustomerAccount(db, identity),
    );
    if (plan.audience === "customer" && !account.roles.includes("customer")) {
      response.headers.set(
        "Location",
        new URL(workspacePath(account), url.origin).toString(),
      );
    }
  } catch {
    response.headers.set(
      "Location",
      new URL(
        `/onboarding?returnTo=${encodeURIComponent(plan.redirectTo)}`,
        url.origin,
      ).toString(),
    );
  }

  return response;
}
