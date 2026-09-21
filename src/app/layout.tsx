import { PlatformLabelsProvider } from "@/components/platform-labels";
import { publicLabels } from "@/modules/platform/repository";
import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "glohaus — A home for your craft",
    template: "%s · glohaus",
  },
  description:
    "A personal space for independent beauty professionals and their customers.",
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
    <html lang="en">
      <body>
        <ThemeToggle />
        {content}
      </body>
    </html>
  );
}
