import type { OwnerProfessionalReferral } from "@/modules/admin/repository";

export function OwnerReferralOverview({ rows }: { rows: OwnerProfessionalReferral[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Professional</th>
            <th>Code</th>
            <th>Total</th>
            <th>Customers</th>
            <th>Professionals</th>
            <th>Last referral</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.professionalId}>
              <td>
                <strong>{row.businessName}</strong>
                <small>{row.email}</small>
              </td>
              <td>{row.code}</td>
              <td>{row.totalReferrals}</td>
              <td>{row.customerReferrals}</td>
              <td>{row.professionalReferrals}</td>
              <td>{row.lastReferralAt ? new Date(row.lastReferralAt).toLocaleString("en-GB", { timeZone: "Europe/London" }) : "—"}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6}>No professional referral codes are available yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
