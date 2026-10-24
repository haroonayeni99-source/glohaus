"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supportInputSchema, supportTopics } from "@/modules/support/domain";

export function ContactForm({defaultReference=""}:{defaultReference?:string}) {
  const confirmation = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticketLink,setTicketLink]=useState("");
  const [reference, setReference] = useState("");
  useEffect(() => {
    confirmation.current?.focus();
  }, [reference]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    if (!supportInputSchema.safeParse(input).success) {
      setError(
        "Check your email and include at least 20 characters describing what you need help with.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "You’ve sent several requests recently. Please wait an hour before trying again."
            : "Your request could not be sent. Your message is still here—please try again.",
        );
      setTicketLink(`/contact/tickets/${data.id}#token=${data.token}`);
      setReference(data.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Your request could not be sent. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (reference)
    return (
      <section className="editor-form" role="status">
        <h2 ref={confirmation} tabIndex={-1}>
          Your request has been received.
        </h2>
        <p>We aim to respond within two weekdays (Monday–Friday), subject to public-holiday delays; this is a target, not a guarantee. Check your private ticket for replies and appeals.</p>
        <p><Link href={ticketLink} className="button">Open your private support ticket</Link></p>
        <p>Save this private ticket link. Anyone with it can view your case and evidence. Do not share it publicly.</p>
        <p>
          Keep this reference: <strong>{reference}</strong>
        </p>
        <Link className="button" href="/faq">
          Browse help & FAQs
        </Link>
      </section>
    );
  return (
    <form
      className="editor-form"
      onSubmit={submit}
      aria-label="Contact GLOHAUS support"
      aria-busy={busy}
    >
      <label htmlFor="contact-name">
        Your name
        <input
          id="contact-name"
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={100}
        />
      </label>
      <label htmlFor="contact-email">
        Email address
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </label>
      <label htmlFor="contact-topic">
        What do you need help with?
        <select id="contact-topic" name="topic">
          {supportTopics.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </label>
      <label htmlFor="contact-reference">
        Booking or order reference (optional)
        <input id="contact-reference" name="reference" maxLength={120} defaultValue={defaultReference} />
      </label>
      <label htmlFor="contact-message">
        Your message
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={20}
          maxLength={4000}
          rows={7}
          aria-describedby="contact-privacy"
        />
      </label>
      <div hidden aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <p id="contact-privacy">
        Include what happened and any error message. Please leave out passwords,
        card details, identity documents and health information. Your request is
        private to authorised GLOHAUS staff.{" "}
        <Link href="/privacy">Privacy policy</Link>
      </p>
      {error && (
        <p role="alert" className="form-notice">
          {error}
        </p>
      )}
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
