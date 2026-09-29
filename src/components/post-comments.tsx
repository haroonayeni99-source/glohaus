"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X, Trash2 } from "lucide-react";

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
  mine: boolean;
};

export function PostComments({
  postId,
  title,
  signedIn,
  returnTo,
  onNotice,
}: {
  postId: string;
  title: string;
  signedIn: boolean;
  returnTo: string;
  onNotice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function loadComments() {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/posts/${postId}/comments`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setComments(data.comments || []);
    } catch {
      onNotice("Comments are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadComments();
  }, [open]);

  async function submit() {
    const clean = body.trim();
    if (!clean || submitting) return;
    if (!signedIn) {
      window.location.assign(
        `/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: clean }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "You’ve posted several comments recently. Try again later."
            : "Your comment could not be posted.",
        );
      setComments((current) => [...current, data.comment]);
      setBody("");
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "Your comment could not be posted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(commentId: string) {
    try {
      const response = await fetch(
        `/api/v1/posts/${postId}/comments/${commentId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      setComments((current) => current.filter((item) => item.id !== commentId));
    } catch {
      onNotice("That comment could not be removed.");
    }
  }

  return (
    <>
      <button
        aria-label={`Comments for ${title}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MessageCircle />
        <span>Comment</span>
      </button>

      {open && (
        <div className="post-comments-backdrop" onClick={() => setOpen(false)}>
          <section
            className="post-comments-panel"
            aria-label={`Comments for ${title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong>Comments</strong>
                <span>{comments.length} shown</span>
              </div>
              <button
                className="post-comments-close"
                aria-label="Close comments"
                onClick={() => setOpen(false)}
              >
                <X size={19} />
              </button>
            </header>

            <div className="post-comments-list">
              {loading ? (
                <p>Loading comments…</p>
              ) : comments.length ? (
                comments.map((comment) => (
                  <article key={comment.id}>
                    <div className="post-comment-avatar" aria-hidden>
                      {comment.author_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <strong>{comment.author_name}</strong>
                      <p>{comment.body}</p>
                      <small>
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(comment.created_at))}
                      </small>
                    </div>
                    {comment.mine && (
                      <button
                        className="post-comment-delete"
                        aria-label="Delete your comment"
                        onClick={() => void remove(comment.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <div className="post-comments-empty">
                  <MessageCircle size={28} />
                  <strong>Start the conversation.</strong>
                  <p>Ask about the look, service or professional.</p>
                </div>
              )}
            </div>

            <div className="post-comment-compose">
              <textarea
                value={body}
                maxLength={500}
                placeholder={
                  signedIn ? "Add a comment…" : "Sign in to comment…"
                }
                onChange={(event) => setBody(event.target.value)}
              />
              <button
                className="button"
                disabled={submitting || !body.trim()}
                onClick={() => void submit()}
              >
                {signedIn ? (submitting ? "Posting…" : "Post") : "Sign in"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
