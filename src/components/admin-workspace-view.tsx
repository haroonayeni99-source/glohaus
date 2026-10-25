"use client";

import { AdminToolHelp } from "@/components/admin-tool-guide";
import { useEffect, useRef, useState } from "react";

export function openAdminSection(id: string) {
  window.dispatchEvent(
    new CustomEvent("glohaus:admin-section", {
      detail:
        document
          .getElementById(id)
          ?.closest<HTMLElement>(".admin-workspace-section, #overview")?.id ||
        id,
    }),
  );
}

const consequential = new Set([
  "website-status",
  "booking-fee",
  "shop-fees",
  "professional-commission",
  "staff",
  "live-access",
]);

/** A focused view keeps every control mounted, including unsaved form drafts. */
export function AdminWorkspaceView({
  children,
}: {
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    const workspace = root.current;
    if (!workspace) return;
    let current = location.hash.slice(1) || "overview";
    function reveal(id: string) {
      const target = document.getElementById(id);
      const section = target?.closest<HTMLElement>(
        ".admin-workspace-section, #overview",
      );
      current = section?.id || "overview";
      workspace!
        .querySelectorAll<HTMLElement>(".admin-workspace-section, #overview")
        .forEach((item) => {
          item.hidden = !all && item.id !== current;
        });
    }
    reveal(current);
    const select = (event: Event) =>
      reveal((event as CustomEvent<string>).detail);
    const hash = () => reveal(location.hash.slice(1));
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        'a[href^="#"]',
      );
      if (link) reveal(link.hash.slice(1));
    };
    window.addEventListener("glohaus:admin-section", select);
    window.addEventListener("hashchange", hash);
    workspace.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("glohaus:admin-section", select);
      window.removeEventListener("hashchange", hash);
      workspace.removeEventListener("click", click, true);
      workspace.querySelectorAll<HTMLElement>("[hidden]").forEach((item) => {
        if (item.matches(".admin-workspace-section, #overview"))
          item.hidden = false;
      });
    };
  }, [all]);
  return (
    <div
      className="admin-workspace-content"
      ref={root}
      onSubmitCapture={(event) => {
        const form = event.target as HTMLFormElement;
        // This scoped Centre owns its reviewed financial confirmation dialog;
        // its read-only simulator must never be treated as a live rate change.
        if (form.closest(".commission-centre, .professional-policies")) return;
        const section = form.closest<HTMLElement>(".admin-workspace-section");
        const decision = form.hasAttribute("data-admin-decision");
        if (!decision && !consequential.has(section?.id || "")) return;
        const title =
          form.querySelector("h2")?.textContent ||
          section?.querySelector("h2")?.textContent ||
          "administration change";
        const status = new FormData(form).get("status");
        const message = `Confirm ${title}${status ? ` → ${String(status).replaceAll("_", " ")}` : ""}?\n\n${form.dataset.adminRefund ? "Approving this appeal authorises a refund. Review the percentage and reason carefully." : section?.id === "website-status" ? "This changes public access to the website." : section && ["booking-fee", "shop-fees", "professional-commission"].includes(section.id) ? "This changes the rule for future transactions. Review the values carefully." : "This may change account access or a moderation decision."}\nGLOHAUS checks your permission before saving and records the decision in the audit log.`;
        if (!window.confirm(message)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="admin-view-toolbar">
        <span>
          Choose a section. Switching sections keeps your unsaved entries. Save
          before leaving this page.
        </span>
        <button
          type="button"
          aria-pressed={all}
          onClick={() => setAll((value) => !value)}
        >
          {all ? "Focus one section" : "Show all sections"}
        </button>
      </div>
      {children}
    </div>
  );
}

export function AdminSection({
  id,
  title,
  children,
  search = true,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  search?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const countRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const clear = () => setQuery("");
    window.addEventListener("glohaus:admin-search-reveal", clear);
    return () =>
      window.removeEventListener("glohaus:admin-search-reveal", clear);
  }, []);
  useEffect(() => {
    const rows = Array.from(
      root.current?.querySelectorAll<HTMLElement>(
        ".service-edit-row, tbody tr",
      ) || [],
    );
    let count = 0;
    rows.forEach((row) => {
      row.hidden =
        !!query.trim() &&
        !row.textContent?.toLowerCase().includes(query.trim().toLowerCase());
      if (!row.hidden) count++;
    });
    if (countRef.current)
      countRef.current.textContent = query.trim()
        ? count
          ? `${count} matching records`
          : "No matching records. Try another search or clear the filter."
        : "";
  }, [query, children]);
  return (
    <section
      id={id}
      className="admin-workspace-section admin-detail-card"
      ref={root}
    >
      <h2 className="admin-section-title">{title}</h2>
      <AdminToolHelp id={id} />
      {["live-access", "refund-appeals"].includes(id) && (
        <p className="admin-action-warning">
          {id === "refund-appeals"
            ? "Financial decision: approving an appeal authorises a refund. Review the amount and reason before confirming."
            : "Access decision: changes can affect verification and LIVE access. Review the account and provide an audit reason."}
        </p>
      )}
      {search && (
        <label className="admin-section-search">
          Search {title.toLowerCase()}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search names, details or status"
          />
          <small>
            <span role="status" ref={countRef} />
          </small>
        </label>
      )}
      {children}
    </section>
  );
}
