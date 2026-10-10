"use client";

export function AdminSectionUnavailable({ label }: { label: string }) {
  return <div className="admin-section-unavailable" role="status">
    <h3>{label} could not be loaded</h3>
    <p>Refresh this section’s data to try again. Your saved settings have not changed.</p>
    <button type="button" onClick={() => window.location.reload()}>Retry loading</button>
  </div>;
}
