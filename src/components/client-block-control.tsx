"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ClientBlockControl({
  id,
  name,
  blocked: initial,
}: {
  id: string;
  name: string;
  blocked: boolean;
}) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <div className="client-block-control">
      <span className="status-pill">
        {blocked ? "New bookings blocked" : "Can book with you"}
      </span>
      {!confirming ? (
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setNotice("");
            setConfirming(true);
          }}
        >
          {blocked ? "Unblock client" : "Block client"}
        </button>
      ) : (
        <div className="client-block-confirmation">
          <p>
            {blocked
              ? `Allow ${name} to book your services again?`
              : `Block ${name} from making new bookings with you?`}{" "}
            Existing appointments and payments stay unchanged.
          </p>
          <div className="editor-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setNotice("");
                try {
                  const response = await fetch(
                    `/api/v1/professional/clients/${id}`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ blocked: !blocked }),
                    },
                  );
                  if (!response.ok)
                    throw new Error(
                      "Could not save this change. Please try again.",
                    );
                  const result = await response.json();
                  setBlocked(result.blocked);
                  setConfirming(false);
                  setNotice(
                    result.blocked
                      ? "Client blocked from new bookings."
                      : "Client can book with you again.",
                  );
                  router.refresh();
                } catch (error) {
                  setNotice(
                    error instanceof Error ? error.message : "Could not save.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : blocked ? "Yes, unblock" : "Yes, block"}
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
