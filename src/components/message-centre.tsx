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
  initialPrevious,
  initialHasMore = false,
  bookingId,
  professionalId,
  draftRecipientName,
  professionalMessaging = false,
  view = "customer",
}: {
  initialConversations: ConversationSummary[];
  activeConversation: ConversationDetails | null;
  initialMessages: ConversationMessage[];
  initialCursor: string | null;
  initialPrevious: string | null;
  initialHasMore?: boolean;
  bookingId: string | null;
  professionalId: string | null;
  draftRecipientName: string | null;
  professionalMessaging?: boolean;
  view?: "customer" | "professional";
}) {
  const router = useRouter();
  const conversations = initialConversations;
  const [messages, setMessages] = useState(initialMessages);
  const [cursor, setCursor] = useState(initialCursor);
  const [olderCursor, setOlderCursor] = useState(initialPrevious);
  const [hasOlder, setHasOlder] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);
  const stayAtEnd = useRef(true);

  const activeId = activeConversation?.id || null;
  const role = activeConversation?.participant_role || null;
  const viewSuffix = view === "professional" ? "&view=professional" : "";
  const messagesHref = view === "professional" ? "/messages?view=professional" : "/messages";
  const professionalPrompts = [
    "Hi! Thanks for your message. How can I help with your booking?",
    "Thanks for booking with me. Is there anything I should know before your appointment?",
    "Hi! I’m just confirming your appointment details. Please let me know if you have any questions.",
    "I’m running slightly behind. I’ll keep you updated here.",
    "Thanks for your appointment today. I hope you loved the result!",
  ];

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
    if (!activeId) return;
    try {
      const response = await fetch(
        `/api/v1/messages/${activeId}${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        messages: ConversationMessage[];
        next: string | null;
        previous?: string | null;
        hasMore?: boolean;
      };
      if (!cursor && data.previous) {
        setOlderCursor(data.previous);
        setHasOlder(Boolean(data.hasMore));
      }
      if (data.messages.length) {
        setMessages((current) => {
          const known = new Set(current.map((message) => message.id));
          return [
            ...current,
            ...data.messages.filter((message) => !known.has(message.id)),
          ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id));
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

  const latestMessageId = messages.at(-1)?.id ?? null;

  useEffect(() => {
    const thread = threadRef.current;
    if (thread && stayAtEnd.current) thread.scrollTop = thread.scrollHeight;
  }, [latestMessageId, activeId]);

  async function loadOlder(full = false) {
    if (!activeId || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    setNotice("");
    try {
      const thread = threadRef.current;
      const previousHeight = thread?.scrollHeight ?? 0;
      const previousTop = thread?.scrollTop ?? 0;
      let before: string | null = olderCursor;
      const earlier: ConversationMessage[] = [];
      let more = hasOlder;
      do {
      const response = await fetch(
        `/api/v1/messages/${activeId}?before=${encodeURIComponent(before!)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as {
        messages: ConversationMessage[];
        previous?: string | null;
        hasMore: boolean;
      };
      earlier.unshift(...data.messages);
      more = data.hasMore;
      if (more && (!data.previous || data.previous === before)) throw new Error();
      before = data.previous ?? null;
      } while (full && more);
      stayAtEnd.current = false;
      setMessages(current => {
        const known = new Set(current.map(message => message.id));
        return [...earlier.filter(message => !known.has(message.id)), ...current];
      });
      setOlderCursor(before);
      setHasOlder(more);
      requestAnimationFrame(() => {
        if (thread) thread.scrollTop = previousTop + thread.scrollHeight - previousHeight;
      });
    } catch {
      setNotice("Earlier messages could not be loaded.");
    } finally {
      setLoadingOlder(false);
    }
  }

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
            : data.error?.code === "TOO_MANY_ATTEMPTS"
              ? "You’ve sent several messages recently. Try again later."
              : "Your message could not be sent. Please try again.",
        );

      setBody("");
      stayAtEnd.current = true;
      if (!activeId) {
        router.push(`/messages?thread=${encodeURIComponent(data.conversationId)}${viewSuffix}`);
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
                  href={`/messages?thread=${conversation.id}${viewSuffix}`}
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
            <Link href={view === "professional" ? "/professional" : "/explore"}>
              {view === "professional" ? "Back to dashboard" : "Explore professionals"}
            </Link>
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
              <Link href={messagesHref} aria-label="Back to messages">
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

            <div className="message-thread-body" ref={threadRef} aria-live="polite"
              onScroll={event => {
                const thread = event.currentTarget;
                stayAtEnd.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
              }}>
              {activeConversation && hasOlder && (
                <div className="message-load-older">
                  <button
                    type="button"
                    disabled={loadingOlder}
                    onClick={() => void loadOlder()}
                  >
                    {loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}
                  </button>
                  <button type="button" disabled={loadingOlder} onClick={() => void loadOlder(true)}>
                    View full conversation
                  </button>
                </div>
              )}
              {activeConversation && !hasOlder && <p className="message-history-start">Start of conversation</p>}
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
                    <strong className="message-sender">{mine ? "You" : message.sender_role === "professional" ? activeConversation?.professional_name : activeConversation?.customer_name}</strong>
                    {message.booking_id && <small>Booking message</small>}
                    <p>{message.body}</p>
                    <time title={new Date(message.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })} dateTime={new Date(message.created_at).toISOString()}>
                      {displayTime(message.created_at)}
                    </time>
                  </article>
                );
              })}

            </div>

            <form className="message-composer" onSubmit={send}>
              {professionalMessaging && (
                <div className="message-prompts" aria-label="Suggested replies">
                  {professionalPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setBody(prompt)}
                      disabled={busy}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
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
