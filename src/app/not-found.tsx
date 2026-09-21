import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="standalone-message">
      <p className="eyebrow">404 / A LITTLE LOST</p>
      <h1>This page isn’t here.</h1>
      <p>Let’s take you back to somewhere familiar.</p>
      <Link className="button" href="/">
        Back to glohaus
      </Link>
    </main>
  );
}
