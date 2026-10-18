import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { publicViewerSignedIn } from "@/lib/public-viewer";
import { InstallButton } from "@/components/pwa-shell";
export const metadata = {
  title: "Install GLOHAUS",
  description:
    "Add GLOHAUS to your iPhone or Android Home Screen using the same account and bookings.",
};
export default async function InstallPage() {
  return (
    <>
      <PublicHeader signedIn={await publicViewerSignedIn()} />
      <main id="main" className="pwa-install-page">
        <p className="eyebrow">YOUR GLOHAUS, CLOSE AT HAND</p>
        <h1>GLOHAUS on your Home Screen.</h1>
        <p>
          Your existing account, bookings and professional tools in an app-like
          window. No App Store download or new account is needed.
        </p>
        <InstallButton />
        <section aria-labelledby="iphone-install">
          <h2 id="iphone-install">iPhone and iPad</h2>
          <ol>
            <li>
              Open <a href="https://www.glohaus.shop/install">glohaus.shop</a>{" "}
              in Safari.
            </li>
            <li>
              Tap <strong>Share</strong> in Safari’s toolbar or menu.
            </li>
            <li>
              Select <strong>Add to Home Screen</strong>. You may need to scroll
              through the actions.
            </li>
            <li>
              Enable <strong>Open as Web App</strong> where this option is
              available.
            </li>
            <li>
              Tap <strong>Add</strong>, then open GLOHAUS from your Home Screen.
            </li>
          </ol>
          <p>
            iPhone installation is a manual Safari action. GLOHAUS cannot show
            an automatic iOS install prompt. If you opened a link inside another
            app, open it in Safari first.
          </p>
        </section>
        <section aria-labelledby="android-install">
          <h2 id="android-install">Android</h2>
          <p>
            In a compatible browser such as Chrome, use the Install GLOHAUS
            button above when offered, or open the browser menu and choose{" "}
            <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            Confirm, then open the new icon. Menu wording depends on your
            browser.
          </p>
          <p>
            If installation is unavailable, update your browser or continue
            using the website. On desktop, look for your browser’s install icon
            or install option in its menu.
          </p>
        </section>
        <section aria-labelledby="app-notifications">
          <h2 id="app-notifications">Notifications are your choice</h2>
          <p>
            Open the installed app, sign in and enable this device in
            Notification settings. Permission is requested only when you press
            Enable. You can send a test and disable a device there.
          </p>
          <p>
            iPhone Home Screen web push needs iOS/iPadOS 16.4 or later and
            browser support. A queued test or push-provider acceptance does not
            prove your phone displayed it. Check the actual notification and tap
            it to verify.
          </p>
          <nav aria-label="Notification settings">
            <Link href="/account/notifications">
              Customer notification settings
            </Link>
            <Link href="/professional/settings/notifications">
              Professional notification settings
            </Link>
          </nav>
        </section>
        <section aria-labelledby="app-connection">
          <h2 id="app-connection">Connected to your existing GLOHAUS</h2>
          <p>
            Sign in inside the app if needed. Safari, other browsers and Home
            Screen apps can keep separate sessions; you may need to sign in
            again after an external payment or authentication step. Return using
            the same GLOHAUS account and check the booking’s current status
            before trying another payment.
          </p>
          <p>
            Bookings, checkout, messages, maps, uploads and journey updates need
            the internet. The offline screen does not contain private account
            data or live booking status. Updates wait until you close all app
            windows or choose to reload after saving your work.
          </p>
          <p>
            Installing GLOHAUS does not enable reliable background GPS. Smart
            Arrival needs the app open with permission; use the manual arrival
            option when tracking is unavailable. Native background geofencing is
            future development.
          </p>
        </section>
        <nav aria-label="Open GLOHAUS">
          <Link href="/">Home</Link>
          <Link href="/account">Customer account</Link>
          <Link href="/professional">Professional dashboard</Link>
          <Link href="/contact">Get help</Link>
        </nav>
      </main>
    </>
  );
}
