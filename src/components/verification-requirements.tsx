"use client";
import { useState } from "react";
type Requirements = {
  started: boolean;
  due: string[];
  overdue: string[];
  pending: string[];
  deadline: number | null;
};
export function VerificationRequirements() {
  const [data, setData] = useState<Requirements | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="verification-requirements">
      <button
        type="button"
        disabled={busy}
        className="button small secondary"
        onClick={async () => {
          setBusy(true);
          setNotice("");
          try {
            const response = await fetch("/api/v1/professional/connect", {
              cache: "no-store",
            });
            if (!response.ok)
              throw new Error(
                "We couldn’t check your requirements. Try again, or continue the secure Stripe verification below.",
              );
            setData(await response.json());
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Could not check requirements.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking requirements…" : "Check remaining requirements"}
      </button>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      {data && (
        <div role="status">
          <h3>
            {data.started
              ? "Your remaining verification steps"
              : "Start your secure verification"}
          </h3>
          {!data.started ? (
            <p>
              Confirm the age and terms declarations below, then continue to
              Stripe. Stripe will tell you which documents and business details
              are required for your account.
            </p>
          ) : (
            <>
              {data.due.length + data.overdue.length > 0 ? (
                <>
                  <p>
                    Provide these details through Stripe’s secure verification
                    form:
                  </p>
                  <ul>
                    {Array.from(new Set([...data.overdue, ...data.due])).map(
                      (item) => (
                        <li key={item}>{item}</li>
                      ),
                    )}
                  </ul>
                </>
              ) : (
                <p>
                  No information is currently requested. Stripe may still be
                  reviewing your account or request additional details later.
                </p>
              )}
              {data.pending.length > 0 && (
                <>
                  <p>Under review:</p>
                  <ul>
                    {data.pending.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
              {data.deadline && (
                <p>
                  Requested by:{" "}
                  {new Date(data.deadline * 1000).toLocaleDateString("en-GB", {
                    timeZone: "Europe/London",
                  })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
