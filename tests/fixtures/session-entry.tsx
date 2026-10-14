import React from "react";
import { createRoot } from "react-dom/client";
import { AuthSessionProvider } from "@/components/auth-session";
import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { MobileCustomerHome } from "@/components/mobile-customer-home";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { FaqContent } from "@/components/faq-content";
import { PolicyPage } from "@/components/policy-page";
import { changeSession, sessionUser } from "./session-auth-client";
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme =
  query.get("theme") || localStorage.getItem("fixture-theme") || "light";
localStorage.setItem("fixture-theme", document.documentElement.dataset.theme);
const signedIn = Boolean(sessionUser());
const content =
  location.pathname === "/" ? (
    <>
      <DesktopCustomerHome signedIn={signedIn} />
      <MobileCustomerHome signedIn={signedIn} />
    </>
  ) : location.pathname === "/faq" ? (
    <FaqContent />
  ) : location.pathname === "/terms" ? (
    <PolicyPage title="Terms" summary="Fixture policy page.">
      <p>Policy content</p>
    </PolicyPage>
  ) : (
    <>
      <PublicHeader
        professional={location.pathname === "/professional-preview"}
        signedIn={location.pathname === "/wallet"}
      />
      <main id="main">
        <h1>{location.pathname}</h1>
      </main>
      <BottomNavigation signedIn={location.pathname === "/wallet"} />
    </>
  );
createRoot(document.getElementById("root")!).render(
  <AuthSessionProvider initialSignedIn={signedIn}>
    {content}
    <button
      data-testid="fixture-login"
      onClick={() => changeSession("fixture-user")}
    >
      Fixture sign in
    </button>
  </AuthSessionProvider>,
);
