// Keep routine navigation feedback local; branding is reserved for document entry.
export default function Loading() {
  return (
    <main id="main" className="glohaus-page-pending" data-glohaus-route-pending>
      <p role="status">Loading this page…</p>
    </main>
  );
}
