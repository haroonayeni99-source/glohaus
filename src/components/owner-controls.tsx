"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminOverview, OwnerControls } from "@/modules/admin/repository";

const permissions = [
  ["users.read", "View users"],
  ["users.manage", "Manage users"],
  ["professionals.read", "View professionals"],
  ["professionals.manage", "Manage professionals"],
  ["bookings.read", "View bookings"],
  ["reports.manage", "Manage reports"],
  ["content.moderate", "Moderate content"],
  ["reviews.moderate", "Moderate reviews"],
  ["verification.manage", "Manage verification"],
  ["analytics.read", "View analytics"],
  ["notifications.read", "View notifications"],
] as const;

export function OwnerControls({
  data,
  users,
}: {
  data: OwnerControls;
  users: AdminOverview["users"];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<OwnerControls["staff"][number] | null>(null);
  const [delegation, setDelegation] = useState<{
    id: string;
    name: string;
    role: "staff" | "admin";
    enabled: boolean;
  } | null>(null);

  async function submit(body: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("The owner change was not saved.");
      setNotice("Saved and recorded in the owner audit log.");
      setSelected(null);
      setDelegation(null);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {delegation && (
        <form
          className="editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void submit({
              type: "role",
              userId: delegation.id,
              role: delegation.role,
              enabled: delegation.enabled,
              reason: form.get("reason"),
            });
          }}
        >
          <h3>{delegation.enabled ? "Grant" : "Remove"} {delegation.role} access</h3>
          <p className="lead">{delegation.name}. Owner access cannot be granted, changed or removed from this console.</p>
          <label>
            Reason
            <textarea name="reason" required minLength={5} maxLength={500} />
          </label>
          <div className="editor-actions">
            <button className="button" disabled={busy}>Confirm change</button>
            <button type="button" onClick={() => setDelegation(null)}>Cancel</button>
          </div>
        </form>
      )}
      {selected && (
        <form
          className="editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const activePermissions = permissions
              .filter(([permission]) => form.get(permission) === "on")
              .map(([permission]) => permission);
            void submit({
              type: "permissions",
              userId: selected.id,
              permissions: activePermissions,
              reason: form.get("reason"),
            });
          }}
        >
          <h3>Permissions for {selected.display_name}</h3>
          <p className="lead">Permissions are only available to staff accounts. Every change is audited.</p>
          <fieldset className="permission-checklist">
            <legend>Allowed areas</legend>
            {permissions.map(([permission, label]) => (
              <label key={permission}>
                <input
                  name={permission}
                  type="checkbox"
                  defaultChecked={selected.permissions.includes(permission)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label>
            Reason
            <textarea name="reason" required minLength={5} maxLength={500} />
          </label>
          <div className="editor-actions">
            <button className="button" disabled={busy}>Save permissions</button>
            <button type="button" onClick={() => setSelected(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="service-edit-list">
        {data.staff.map((member) => (
          <article className="service-edit-row" key={member.id}>
            <div>
              <h3>{member.display_name}</h3>
              <p>{member.email} · {member.roles.join(", ")}</p>
              <small>{member.permissions.length ? member.permissions.join(", ") : "No delegated staff permissions"}</small>
            </div>
            {member.roles.includes("staff") && (
              <button onClick={() => setSelected(member)}>Permissions</button>
            )}
            {member.roles.includes("staff") && (
              <button onClick={() => setDelegation({ id: member.id, name: member.display_name, role: "staff", enabled: false })}>Remove staff</button>
            )}
            {member.roles.includes("admin") && (
              <button onClick={() => setDelegation({ id: member.id, name: member.display_name, role: "admin", enabled: false })}>Remove admin</button>
            )}
          </article>
        ))}
        {!data.staff.length && <p className="lead">No staff or administrators have been granted access.</p>}
      </div>
      <h3 className="admin-section-title">Delegate platform access</h3>
      <div className="service-edit-list">
        {users.filter((user) => !user.roles.includes("owner")).map((user) => (
          <article className="service-edit-row" key={user.id}>
            <div>
              <h3>{user.display_name}</h3>
              <p>{user.email} · {user.status}</p>
              <small>{user.roles.join(", ") || "No application role"}</small>
            </div>
            {!user.roles.includes("staff") && (
              <button onClick={() => setDelegation({ id: user.id, name: user.display_name, role: "staff", enabled: true })}>Grant staff</button>
            )}
            {!user.roles.includes("admin") && (
              <button onClick={() => setDelegation({ id: user.id, name: user.display_name, role: "admin", enabled: true })}>Grant admin</button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
