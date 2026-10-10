"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useEffect, useRef } from "react";
import { AccountControls } from "./account-controls";

const publicLinks = [
  ["Home", "/"],
  ["Find a Professional", "/explore"],
  ["Discover", "/discover"],
  ["Share", "/share"],
  ["Shop", "/shop"],
  ["How It Works", "/how-it-works"],
  ["For Professionals", "/professional-preview"],
  ["About", "/about"],
  ["FAQ", "/faq"],
] as const;
const accountLinks = [
  ["My account", "/account"],
  ["Bookings", "/account/bookings"],
  ["Messages", "/messages"],
  ["Wallet & payments", "/wallet"],
  ["Cart", "/cart"],
  ["Notifications", "/notifications"],
  ["Account & security", "/security"],
] as const;
const professionalLinks = [
  ["Dashboard", "/professional"],
  ["Bookings", "/professional/bookings"],
  ["Clients", "/professional/clients"],
  ["Wallet", "/professional/wallet"],
  ["Business tools", "/professional/tools"],
  ["Products", "/professional/products"],
  ["Orders", "/professional/orders"],
  ["Verification", "/professional/profile#verification"],
  ["Messages", "/messages?view=professional"],
  ["Notifications", "/notifications?view=professional"],
  ["Create post", "/professional/posts"],
  ["Customer view", "/account"],
  ["Account & security", "/security"],
] as const;

export function MobileSiteMenu({
  signedIn = false,
  professionalWorkspace = false,
  canAccessAdmin = false,
}: {
  signedIn?: boolean;
  professionalWorkspace?: boolean;
  canAccessAdmin?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (ref.current?.open && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const protectedHref = (href: string) =>
    signedIn ? href : `/sign-in?returnTo=${encodeURIComponent(href)}`;
  return (
    <details
      ref={ref}
      className={`mobile-site-menu${professionalWorkspace ? " professional-mobile-menu" : ""}`}
    >
      <summary
        aria-label={
          professionalWorkspace ? "Professional menu" : "Website menu"
        }
      >
        <Menu size={20} aria-hidden />
        <span>Menu</span>
      </summary>
      <div
        className="mobile-site-menu-panel"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a,button") && ref.current)
            ref.current.open = false;
        }}
      >
        <nav
          aria-label={
            professionalWorkspace
              ? "Professional menu links"
              : "Website menu links"
          }
        >
          {(professionalWorkspace ? professionalLinks : publicLinks).map(
            ([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ),
          )}
        </nav>
        {!professionalWorkspace && (
          <nav
            className="mobile-menu-account"
            aria-label="Mobile account links"
          >
            {accountLinks.map(([label, href]) => (
              <Link key={href} href={protectedHref(href)}>
                {label}
              </Link>
            ))}
            {!signedIn && (
              <>
                <Link href="/sign-in">Sign in</Link>
                <Link href="/sign-up">Sign up</Link>
              </>
            )}
          </nav>
        )}
        {canAccessAdmin && (
          <Link className="mobile-menu-owner" href="/admin">
            Owner/Admin
          </Link>
        )}
        {signedIn && (
          <div className="mobile-menu-signout">
            <AccountControls />
          </div>
        )}
      </div>
    </details>
  );
}
