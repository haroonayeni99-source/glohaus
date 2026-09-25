"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import type {
  ConversationDetails,
  ConversationMessage,
  ConversationSummary,
} from "@/modules/messages/domain";

function displayTime(value: Date | string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return new Intl.DateTimeFormat("en-GB", {
    ...(sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short" }),
    timeZone: "Europe/London",
  }).format(date);
}

function otherName(conversation: ConversationDetails | ConversationSummary) {
  return conversation.participant_role === "customer"
    ? conversation.professional_name
    : conversation.customer_name;
}

export function MessageCentre({
  initialConversations,
  activeConversation,
  initialMessages,
  initialCursor,
  bookingId,
  professionalId,
  draftRecipientName,
}: {
  initialConversations: ConversationSummary[];
  activeConversation: ConversationDetails | null;
  initialMessages: ConversationMessage[];
  initialCursor: string | null;
  bookingId: string | null;
  professionalId: string | null;
  draftRecipientName: string | null;
}) {
  const router = useRouter();
  const conversations = initialConversations;
  const [messages, setMessages] = useState(initialMessages);
  const [cursor, setCursor] = useState(initialCursor);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const activeId = activeConversation?.id || null;
  const role = activeConversation?.participant_role || null;

  const title = useMemo(() => {
    if (activeConversation) return otherName(activeConversation);
    if (bookingId) return draftRecipientName || "Booking conversation";
    if (professionalId) return draftRecipientName || "New conversation";
    return "Messages";
  }, [activeConversation, bookingId, professionalId, draftRecipientName]);

  const markRead = useCallback(async () => {
    if (!activeId) return;
    try {
      await fetch(`/api/v1/messages/${activeId}/read`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {}
  }, [activeId]);

  const refreshNew = useCallback(async () => {
    if (!activeId || !cursor) return;
    try {
      const response = await fetch(
        `/api/v1/messages/${activeId}?after=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        messages: ConversationMessage[];
        next: string | null;
      };
      if (data.messages.length) {
        setMessages((current) => {
          const known = new Set(current.map((message) => message.id));
          return [
            ...current,
            ...data.messages.filter((message) => !known.has(message.id)),
          ];
        });
        if (
          role &&
          data.messages.some((message) => message.sender_role !== role)
        ) {
          void markRead();
        }
      }
      if (data.next) setCursor(data.next);
    } catch {}
  }, [activeId, cursor, markRead, role]);

  useEffect(() => {
    if (!activeId) return;
    void markRead();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshNew();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeId, markRead, refreshNew]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeId]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = body.trim();
    if (!clean || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const target = activeId
        ? `/api/v1/messages/${activeId}`
        : "/api/v1/messages";
      const payload = activeId
        ? { body: clean, bookingId: bookingId || undefined }
        : bookingId
          ? { bookingId, body: clean }
          : professionalId
            ? { professionalId, body: clean }
            : null;
      if (!payload) return;

      const response = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.code === "FORBIDDEN"
            ? "This conversation is not available to this account."
            : "Your message could not be sent. Please try again.",
        );

      setBody("");
      if (!activeId) {
        router.push(`/messages?thread=${encodeURIComponent(data.conversationId)}`);
        router.refresh();
        return;
      }
      await refreshNew();
      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Your message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="message-centre" aria-label="GLOHAUS messages">
      <aside
        className={
          activeConversation || bookingId || professionalId
            ? "message-inbox message-inbox-with-thread"
            : "message-inbox"
        }
      >
        <div className="message-inbox-heading">
          <div>
            <p className="eyebrow">PRIVATE CONVERSATIONS</p>
            <h1>Messages</h1>
          </div>
          <span>{conversations.length}</span>
        </div>
        {conversations.length ? (
          <nav aria-label="Conversations">
            {conversations.map((conversation) => {
              const name = otherName(conversation);
              return (
                <Link
                  key={conversation.id}
                  href={`/messages?thread=${conversation.id}`}
                  aria-current={
                    conversation.id === activeId ? "page" : undefined
                  }
                >
                  <span className="message-avatar" aria-hidden>
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="message-inbox-copy">
                    <strong>{name}</strong>
                    <small>
                      {conversation.last_message_body || "Conversation started"}
                    </small>
                  </span>
                  <span className="message-inbox-meta">
                    <small>{displayTime(conversation.last_message_at)}</small>
                    {conversation.unread_count > 0 && (
                      <b aria-label={`${conversation.unread_count} unread messages`}>
                        {conversation.unread_count > 9
                          ? "9+"
                          : conversation.unread_count}
                      </b>
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>
        ) : (
          <div className="message-empty">
            <MessageCircle size={28} aria-hidden />
            <h2>No conversations yet.</h2>
            <p>
              Start from a professional profile or an existing booking when you
              have a question.
            </p>
            <Link href="/explore">Explore professionals</Link>
          </div>
        )}
      </aside>

      <div
        className={
          activeConversation || bookingId || professionalId
            ? "message-thread is-open"
            : "message-thread"
        }
      >
        {activeConversation || bookingId || professionalId ? (
          <>
            <header className="message-thread-header">
              <Link href="/messages" aria-label="Back to messages">
                <ArrowLeft size={20} aria-hidden />
              </Link>
              <span className="message-avatar" aria-hidden>
                {title.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{title}</strong>
                <small>
                  {bookingId
                    ? "Booking conversation"
                    : activeConversation
                      ? "Private GLOHAUS conversation"
                      : "New conversation"}
                </small>
              </div>
            </header>

            <div className="message-thread-body" aria-live="polite">
              {!activeConversation && (
                <div className="message-start-note">
                  <MessageCircle size={22} aria-hidden />
                  <strong>Start your conversation.</strong>
                  <p>
                    Your message will create a private conversation visible only
                    to the customer and professional involved.
                  </p>
                </div>
              )}
              {messages.map((message) => {
                const mine =
                  activeConversation &&
                  message.sender_role === activeConversation.participant_role;
                return (
                  <article
                    key={message.id}
                    className={mine ? "message-bubble mine" : "message-bubble"}
                  >
                    {message.booking_id && <small>Booking message</small>}
                    <p>{message.body}</p>
                    <time dateTime={new Date(message.created_at).toISOString()}>
                      {displayTime(message.created_at)}
                    </time>
                  </article>
                );
              })}
              <div ref={endRef} />
            </div>

            <form className="message-composer" onSubmit={send}>
              <label className="sr-only" htmlFor="message-body">
                Message
              </label>
              <textarea
                id="message-body"
                value={body}
                maxLength={2000}
                rows={1}
                placeholder="Write a message…"
                onChange={(event) => setBody(event.target.value)}
              />
              <button
                type="submit"
                disabled={busy || !body.trim()}
                aria-label="Send message"
              >
                <Send size={18} aria-hidden />
              </button>
              {notice && (
                <p className="message-notice" role="status">
                  {notice}
                </p>
              )}
            </form>
          </>
        ) : (
          <div className="message-thread-placeholder">
            <MessageCircle size={34} aria-hidden />
            <h2>Your conversations stay together.</h2>
            <p>Select a conversation to read or reply.</p>
          </div>
        )}
      </div>
    </section>
  );
}
