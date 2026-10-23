import "@/components/professional-notifications.css";
import "@/components/taxonomy.css";
import "@/components/professional-activity.css";
import "@/components/commission-control-centre.css";
import { AuthSessionProvider } from "@/components/auth-session";
import { publicViewerSignedIn } from "@/lib/public-viewer";
import { jsonLd, publicOrigin } from "@/lib/public-seo";
import { PlatformLabelsProvider } from "@/components/platform-labels";
import { publicLabels } from "@/modules/platform/repository";
import type { Metadata, Viewport } from "next";
import { PwaShell } from "@/components/pwa-shell";
import "@/components/pwa.css";
import { SiteFooter } from "@/components/site-footer";
import { RouteTransitionSplash } from "@/components/route-transition-splash";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";
import "./glohaus-splash.css";
import "./ui-upgrades.css";
import "./theme-compat.css";
import "./customer-polish.css";
import "./site-improvements.css";
import "./design-system.css";
import "./location.css";
import "../components/professional-profile.css";
import "../components/viewport-video.css";
import "../components/professional-policies.css";

export const dynamic = "force-dynamic";

const themeBootstrap = `(() => {
  try {
    const saved = window.localStorage.getItem("glohaus-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme =
      saved === "night" || (saved !== "light" && prefersDark) ? "night" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();`;

export const metadata: Metadata = {
  metadataBase: new URL("https://www.glohaus.shop"),
  title: {
    default: "GLOHAUS — Beauty, community and bookings",
    template: "%s · GLOHAUS",
  },
  description:
    "Discover, book and get inspired by independent beauty professionals near you.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "GLOHAUS", statusBarStyle: "default" },
  icons: { apple: [{ url: "/icons/glohaus-home-apple-180-v2.png", sizes: "180x180", type: "image/png" }] },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e95f96" },
    { media: "(prefers-color-scheme: dark)", color: "#231d1f" },
  ],
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [labels, signedIn] = await Promise.all([publicLabels(), publicViewerSignedIn()]);
  const content = (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AuthSessionProvider initialSignedIn={signedIn}>
      <PlatformLabelsProvider labels={labels}>
        {children}
      </PlatformLabelsProvider>
      </AuthSessionProvider>
    </>
  );
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          id="glohaus-theme-bootstrap"
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "GLOHAUS",
              url: publicOrigin,
              description:
                "Find and book independent beauty professionals near you.",
            }),
          }}
        />
        {content}
        <RouteTransitionSplash />
        <PwaShell />
        <SiteFooter />
        <ThemeToggle />
      </body>
    </html>
  );
}
