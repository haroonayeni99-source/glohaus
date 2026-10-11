"use client";

import { useMemo, useState } from "react";
import type { OwnerAuthAccount } from "@/modules/admin/repository";

function when(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London" });
}

export function OwnerAuthAccounts({ accounts }: { accounts: OwnerAuthAccount[] }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visibleAccounts = useMemo(() => {
    if (!query) return accounts;
    return accounts.filter((account) =>
      [
        account.email,
        account.appStatus,
        account.appUserId,
        ...account.roles,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [accounts, query]);

  return (
    <>
      <label className="admin-account-search">
        <span>Search sign-ups</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Email, role or account status"
          autoComplete="off"
        />
        <small>{visibleAccounts.length} of {accounts.length} sign-ups shown</small>
      </label>
      <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Email confirmation</th>
            <th>GLOHAUS account</th>
            <th>Roles</th>
            <th>Last sign in</th>
          </tr>
        </thead>
        <tbody>
          {visibleAccounts.map((account) => (
            <tr key={account.authId}>
              <td>{account.email}</td>
              <td>
                <span className={`admin-status ${account.emailConfirmedAt ? "admin-status-active" : "admin-status-suspended"}`}>
                  {account.emailConfirmedAt ? "EMAIL CONFIRMED" : "AWAITING CONFIRMATION"}
                </span>
              </td>
              <td>
                <span className={`admin-status ${account.appUserId ? "admin-status-active" : "admin-status-suspended"}`}>
                  {account.appUserId ? account.appStatus || "linked" : "SETUP NOT FINISHED"}
                </span>
              </td>
              <td>{account.roles.length ? account.roles.join(", ") : "None yet"}</td>
              <td>{when(account.lastSignInAt)}</td>
            </tr>
          ))}
          {!visibleAccounts.length && (
            <tr><td colSpan={5}>{query ? "No sign-ups match. Try another email or clear your search." : "No sign-ups yet. New accounts will appear here when someone signs up."}</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}
