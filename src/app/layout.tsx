import { PlatformLabelsProvider } from "@/components/platform-labels";
import { publicLabels } from "@/modules/platform/repository";
import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";
import "./ui-upgrades.css";

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
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var k='glohaus-theme';var s=localStorage.getItem(k);var t=s==='night'||(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'night':'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();",
          }}
        />
      </head>
      <body>
        <ThemeToggle />
        {content}
      </body>
    </html>
  );
}
