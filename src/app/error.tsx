"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="standalone-message">
      <p className="eyebrow">LET’S TRY THAT AGAIN</p>
      <h1>Something interrupted your visit.</h1>
      <p>
        GLOHAUS could not finish loading this page. Your account information remains protected.
        Retry the page, or return to your workspace if the problem continues.
      </p>
      <div className="error-actions">
        <button className="button" onClick={reset}>
          Try again
        </button>
        <Link className="text-link" href="/workspace">My workspace</Link>
      </div>
    </main>
  );
}
