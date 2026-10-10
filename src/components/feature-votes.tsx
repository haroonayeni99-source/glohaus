"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { voteDeadline, type FeatureVoteItem } from "@/lib/feature-voting";

export function FeatureVotes({ initial }: { initial: FeatureVoteItem[] }) {
  const [items, setItems] = useState(initial);
  const [source, setSource] = useState(initial);
  if (source !== initial) { setSource(initial); setItems(initial); }
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  // Close controls while the page stays open, as well as enforcing expiry in SQL.
  useEffect(() => {
    function closeExpired() {
      setItems(current => current.some(item => item.voting_open && Date.parse(item.closes_at) <= Date.now())
        ? current.map(item => item.voting_open && Date.parse(item.closes_at) <= Date.now() ? { ...item, voting_open: false } : item)
        : current);
    }
    closeExpired();
    const timer = setInterval(closeExpired, 1000);
    return () => clearInterval(timer);
  }, []);

  async function choose(item: FeatureVoteItem, choice: "like" | "dislike") {
    setBusy(item.id); setNotice("");
    try {
      const response = await fetch("/api/v1/features/vote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureId: item.id, choice: item.my_choice === choice ? "none" : choice }),
      });
      const data = await response.json() as { result?: FeatureVoteItem; error?: { code?: string } };
      if (!response.ok) {
        if (data.error?.code === "VOTING_CLOSED") {
          setItems(current => current.map(value => value.id === item.id ? { ...value, voting_open: false } : value));
          throw new Error("This vote has ended. You can still view the results.");
        }
        if (data.error?.code === "UNAUTHENTICATED") throw new Error("Sign in again to update your vote.");
        throw new Error("Your vote could not be updated. Please try again.");
      }
      if (!data.result) throw new Error("Your vote could not be updated. Please try again.");
      setItems(current => current.map(value => value.id === item.id ? data.result! : value));
      setNotice(data.result.my_choice ? `Your ${data.result.my_choice} was saved.` : "Your vote was removed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your vote could not be updated. Please try again.");
    } finally { setBusy(null); }
  }

  return (
    <section className="feature-vote-list" aria-label="Feature votes">
      {items.map(item => (
        <article className="feature-vote-card" key={item.id} aria-label={item.title}>
          <div className="feature-vote-description">
            <span className="eyebrow">{item.voting_open ? item.status.replaceAll("_", " ") : "Voting closed"}</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <p className="feature-vote-deadline">{item.voting_open ? "Ends" : "Ended"} <time dateTime={item.closes_at}>{voteDeadline(item.closes_at)} UK time</time></p>
          </div>
          <div className="feature-vote-results">
            <div className="feature-vote-choices" role="group" aria-label={`Vote on ${item.title}`}>
              {(["like", "dislike"] as const).map(choice => (
                <button key={choice} type="button"
                  className={`feature-vote-button${item.my_choice === choice ? " is-voted" : ""}`}
                  aria-pressed={item.my_choice === choice}
                  disabled={Boolean(busy) || !item.voting_open}
                  onClick={() => void choose(item, choice)}>
                  {choice === "like" ? <ThumbsUp size={17} aria-hidden /> : <ThumbsDown size={17} aria-hidden />}
                  {choice === "like" ? "Like" : "Dislike"} · {choice === "like" ? item.vote_count : item.dislike_count}
                </button>
              ))}
            </div>
            <p className="feature-vote-total" aria-live="polite">{item.total_count} total {item.total_count === 1 ? "vote" : "votes"} · {item.total_count ? Math.round(item.vote_count / item.total_count * 100) : 0}% liked</p>
            {item.my_choice && <small>Your choice: {item.my_choice === "like" ? "Like" : "Dislike"}</small>}
          </div>
        </article>
      ))}
      {!items.length && <p className="lead">There are no GLOHAUS feature votes for your account type yet.</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </section>
  );
}
