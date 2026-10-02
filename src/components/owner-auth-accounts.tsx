"use client";

import type { OwnerAuthAccount } from "@/modules/admin/repository";

function when(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London" });
}

export function OwnerAuthAccounts({ accounts }: { accounts: OwnerAuthAccount[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Supabase</th>
            <th>GLOHAUS account</th>
            <th>Roles</th>
            <th>Last sign in</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.authId}>
              <td>{account.email}</td>
              <td>
                <span className={`admin-status ${account.emailConfirmedAt ? "admin-status-active" : "admin-status-suspended"}`}>
                  {account.emailConfirmedAt ? "EMAIL CONFIRMED" : "AWAITING EMAIL"}
                </span>
              </td>
              <td>
                <span className={`admin-status ${account.appUserId ? "admin-status-active" : "admin-status-suspended"}`}>
                  {account.appUserId ? account.appStatus || "linked" : "NOT PROVISIONED"}
                </span>
              </td>
              <td>{account.roles.length ? account.roles.join(", ") : "None yet"}</td>
              <td>{when(account.lastSignInAt)}</td>
            </tr>
          ))}
          {!accounts.length && (
            <tr><td colSpan={5}>No Supabase Auth users found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
