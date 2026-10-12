import React from "react";
import { createRoot } from "react-dom/client";
import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { MobileCustomerHome } from "@/components/mobile-customer-home";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
const signedIn = params.get("guest") !== "1";
createRoot(document.getElementById("root")!).render(<>
  <DesktopCustomerHome signedIn={signedIn} displayName="Alex Morgan" />
  <MobileCustomerHome signedIn={signedIn} />
</>);
