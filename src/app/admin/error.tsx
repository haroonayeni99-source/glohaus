"use client";
import Link from "next/link";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main" className="standalone-message">
    <h1>The control centre could not be loaded</h1>
    <p>Please try again. Your accounts and settings are unchanged.</p>
    <button className="button" type="button" onClick={reset}>Try again</button>
    <Link href="/">Return to GLOHAUS</Link>
  </main>;
}
