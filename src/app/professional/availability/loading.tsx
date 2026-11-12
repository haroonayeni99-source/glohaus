import Link from "next/link";

export default function Loading() {
  return (
    <div className="pro-app">
      <main id="main" className="pro-main pro-management-page" data-glohaus-route-pending aria-busy="true">
        <Link href="/professional" className="pro-back-link">← Dashboard</Link>
        <p role="status">Loading availability…</p>
      </main>
    </div>
  );
}
