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
              Confirm your age and accept the terms below. Stripe will then show the documents and business details your account needs.
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
                  No details are needed now. Stripe may still be reviewing your account or ask for more later.
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
