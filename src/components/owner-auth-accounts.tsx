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
        <span>Search authentication accounts</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Email, role or account status"
          autoComplete="off"
        />
        <small>{visibleAccounts.length} of {accounts.length} auth accounts shown</small>
      </label>
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
          {visibleAccounts.map((account) => (
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
          {!visibleAccounts.length && (
            <tr><td colSpan={5}>{query ? "No authentication accounts match your search." : "No Supabase Auth users found."}</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}
