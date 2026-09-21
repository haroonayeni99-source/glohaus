"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="standalone-message">
      <p className="eyebrow">LET’S TRY THAT AGAIN</p>
      <h1>Something interrupted your visit.</h1>
      <p>
        Your account information remains protected. Please try again in a
        moment.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
