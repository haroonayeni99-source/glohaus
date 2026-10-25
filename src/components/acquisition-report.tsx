import { money } from "@/modules/professionals/domain";
import {
  sourceLabels,
  type AcquisitionOverview,
} from "@/modules/admin/acquisition";
export function AcquisitionReport({
  data,
}: {
  data: AcquisitionOverview | null;
}) {
  if (!data)
    return (
      <section
        className="admin-detail-card"
        style={{ padding: 24, marginTop: 20 }}
      >
        <h2>Customer acquisition</h2>
        <p role="alert">
          Acquisition reporting is unavailable. No figures have been estimated.
        </p>
      </section>
    );
  const total = data.rows.reduce(
    (a, r) => ({
      bookings: a.bookings + r.bookings,
      returning: a.returning + r.returning_bookings,
      value: a.value + Number(r.service_value_pence),
      commission: a.commission + Number(r.commission_pence),
    }),
    { bookings: 0, returning: 0, value: 0, commission: 0 },
  );
  return (
    <section
      className="admin-detail-card"
      style={{ padding: 24, marginTop: 20 }}
    >
      <h2>Customer Acquisition & Growth</h2>
      <p>
        {total.bookings} completed paid bookings · {data.uniqueCustomers} unique
        customers · {total.returning} returning bookings · {money(total.value)}{" "}
        service value · {money(total.commission)} recorded professional
        commission.
      </p>
      <p>
        Sources come from customer confirmations, supported where available by
        consented profile history, invitations and referral records. An
        invitation or QR code alone never establishes a source. Unconfirmed
        sources stay unknown; conflicting evidence requires review. These
        reports do not alter fees or imply ownership of a customer.
      </p>
      <p>
        Returning means an earlier completed paid appointment with that
        professional, including appointments before the reporting period.
        Refunded-in-full, cancelled, incomplete and disputed bookings are
        excluded. Service value is the booked price; net captured includes
        deposits and customer fees after refunds, so it is not the
        professional’s earnings. Commission is read from recorded financial
        quotes with a payment ledger entry.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Professional</th>
              <th>Original source</th>
              <th>Completed</th>
              <th>Customers</th>
              <th>First bookings</th>
              <th>Returning bookings</th>
              <th>Returning customers</th>
              <th>Supported / reviewed</th>
              <th>Service value</th>
              <th>Net captured</th>
              <th>Commission</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.professional_id + row.origin}>
                <td>{row.business_name}</td>
                <td>{sourceLabels[row.origin] ?? "Unknown"}</td>
                <td>{row.bookings}</td>
                <td>{row.customers}</td>
                <td>{row.first_bookings}</td>
                <td>{row.returning_bookings}</td>
                <td>{row.returning_customers}</td>
                <td>{row.supported_bookings}</td>
                <td>{money(Number(row.service_value_pence))}</td>
                <td>{money(Number(row.net_captured_pence))}</td>
                <td>{money(Number(row.commission_pence))}</td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr>
                <td colSpan={11}>No qualifying bookings in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p>
        Unique customers above are deduplicated across professionals.
        Per-professional customer counts should not be added together.
      </p>
    </section>
  );
}
