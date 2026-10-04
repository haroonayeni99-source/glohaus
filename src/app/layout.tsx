import { PlatformLabelsProvider } from "@/components/platform-labels";
import { publicLabels } from "@/modules/platform/repository";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";
import "./ui-upgrades.css";
import "./theme-compat.css";
import "./customer-polish.css";

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
  title: {
    default: "GLOHAUS — Beauty, community and bookings",
    template: "%s · GLOHAUS",
  },
  description:
    "Discover, book and get inspired by independent beauty professionals near you.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const labels = await publicLabels();
  const content = (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PlatformLabelsProvider labels={labels}>
        {children}
      </PlatformLabelsProvider>
    </>
  );
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="glohaus-theme-bootstrap"
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
        />
      </head>
      <body>
        {content}
        <SiteFooter />
        <ThemeToggle />
      </body>
    </html>
  );
}
