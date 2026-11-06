"use client";

import { useSignedIn } from "./auth-session";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useEffect, useRef } from "react";
import { ThemeToggle } from "./theme-toggle";
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
  ["Business Hub", "/professional/performance"],
  ["Services & portfolio", "/professional/services"],
  ["Notifications & Communications", "/professional/settings/notifications"],
  ["Rules & Policies", "/professional/policies"],
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
  signedIn: initialSignedIn = false,
  professionalWorkspace = false,
  canAccessAdmin = false,
}: {
  signedIn?: boolean;
  professionalWorkspace?: boolean;
  canAccessAdmin?: boolean;
}) {
  const signedIn = useSignedIn(initialSignedIn);
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
          if ((event.target as HTMLElement).closest("a") && ref.current)
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
          {professionalWorkspace && <div className="professional-menu-groups">{[
            {title:"Business overview", routes:["/professional", "/professional/performance", "/professional/tools"]},
            {title:"Appointments & clients", routes:["/professional/bookings", "/professional/clients", "/professional/policies", "/messages?view=professional"]},
            {title:"Services & selling", routes:["/professional/services", "/professional/products", "/professional/orders", "/professional/posts"]},
            {title:"Finance & settings", routes:["/professional/wallet", "/professional/profile#verification", "/professional/settings/notifications", "/notifications?view=professional", "/security", "/account"]},
          ].map(group=><details key={group.title} open={group.title==="Business overview"}><summary>{group.title}</summary>{professionalLinks.filter(([,href])=>group.routes.includes(href)).map(([label,href])=><Link key={href} href={href}>{label}</Link>)}</details>)}</div>}
          {(!professionalWorkspace ? publicLinks.filter(([,href]) => !["/how-it-works","/professional-preview","/about","/faq"].includes(href)) : []).map(
            ([label, href]) => (
              <Link key={href} href={href} className={!professionalWorkspace && ["/", "/discover"].includes(href) ? "menu-primary-duplicate" : undefined}>
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
              <Link key={href} href={protectedHref(href)} className={["/account/bookings", "/messages", "/account"].includes(href) ? "menu-primary-duplicate" : undefined}>
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
        <details className="mobile-menu-help"><summary>Help & GLOHAUS</summary><nav aria-label="Help and information">
          <Link href="/how-it-works">How it works</Link><Link href="/professional-preview">For professionals</Link><Link href="/about">About</Link><Link href="/faq">FAQ</Link><Link href="/contact">Contact support</Link>
        </nav></details>
        <ThemeToggle inline />
        {signedIn && canAccessAdmin && (
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
