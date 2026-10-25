"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function OwnerDeviceCheck() {
  const [device, setDevice] = useState<{
    kind: string;
    display: string;
    push: string;
  } | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setDevice({
          kind: /iPhone|iPad/.test(navigator.userAgent)
            ? "iPhone / iPad"
            : /Android/.test(navigator.userAgent)
              ? "Android"
              : "Other / desktop",
          display:
            window.matchMedia("(display-mode: standalone)").matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone
              ? "Installed app"
              : "Browser tab",
          push: !("Notification" in window)
            ? "Not available in this browser"
            : Notification.permission,
        }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <>
      <h1>Phone and account release checks</h1>
      <p>
        Use this page on the actual iPhone and Android phone you want to check.
        Browser emulation, push-provider acceptance and automated tests do not
        prove a notification appeared on that phone.
      </p>
      <p>
        {device
          ? `This device reports: ${device.kind} · ${device.display} · Notification permission: ${device.push}.`
          : "Reading this device’s browser capabilities…"}{" "}
        These details stay in this page and are not sent to GLOHAUS.
      </p>
      <ol>
        <li>
          <strong>Scrolling and categories:</strong> open{" "}
          <Link href="/explore">Explore</Link> and{" "}
          <Link href="/shop">Shop</Link>. Swipe categories both ways, scroll the
          page, open cards and return. Confirm labels stay separate and buttons
          respond in light and night mode.
        </li>
        <li>
          <strong>Installed app:</strong> follow{" "}
          <Link href="/install">Install GLOHAUS</Link>, launch from the home
          screen, and check the bottom area, keyboard, navigation and return
          from another app on both operating systems.
        </li>
        <li>
          <strong>Uploads:</strong> use{" "}
          <Link href="/admin#homepage-media">Homepage Images</Link> to choose a
          permitted photo and preview it. A local preview alone does not prove
          an upload succeeded. Complete a real authorised upload when
          appropriate; record the result without publishing unwanted homepage
          changes.
        </li>
        <li>
          <strong>Push notifications:</strong> open the existing{" "}
          <Link href="/account/notifications">customer phone settings</Link> or{" "}
          <Link href="/professional/settings/notifications">
            professional notification settings
          </Link>
          , enable this device if desired and use “Send test”. Confirm the
          notification actually appears and opens the right page. A
          queued/accepted status is not device-delivery proof.
        </li>
        <li>
          <strong>Fresh customer registration:</strong> use{" "}
          <Link href="/sign-up?intent=customer">Customer sign-up</Link> with an
          inbox you control. Complete the terms yourself, confirm the newest
          verification email, check the account opens and verify
          sign-out/sign-in and persistence. Record email arrival separately from
          clicking its verification link.
        </li>
        <li>
          <strong>Fresh professional registration:</strong> use{" "}
          <Link href="/sign-up?intent=professional">Professional sign-up</Link>,
          complete the account and verification email, and check onboarding and
          the existing unverified restrictions. Do not create fake public
          profiles or submit false verification information.
        </li>
        <li>
          <strong>Password recovery:</strong> use{" "}
          <Link href="/forgot-password">Forgot password</Link> for the account
          you control. Confirm email arrival and that the newest link opens the
          reset screen. Enter and confirm any new password yourself, then verify
          sign-in. Never share passwords or recovery links in a support case.
        </li>
      </ol>
      <p>
        Record the phone model, OS, browser, installed-app status, time and
        observed result in a{" "}
        <Link href="/contact?reference=OWNER-RELEASE-VERIFICATION">
          private verification support case
        </Link>
        . Add screenshots with personal information removed. Separate “passed on
        this phone” from “automated test passed”; no item here is automatically
        marked verified.
      </p>
    </>
  );
}
