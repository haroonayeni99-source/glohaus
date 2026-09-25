# GloHaus Later / Ideas Backlog

This file keeps product ideas that are intentionally **not** being inserted into the active roadmap stage.

## Trip progress / live location for bookings

Goal: give customers a voluntary way to share journey progress before an appointment so the professional can see whether they are on the way, likely to be late, nearby, or arrived.

### Intended customer flow
- Available only for an active upcoming booking.
- Customer explicitly taps **Share trip progress**.
- Browser/app requests location permission at that moment.
- Customer can stop sharing at any time.
- Sharing automatically expires around the appointment window.
- A non-location fallback such as **I'm running late** remains available.

### Professional view
- Current ETA.
- On the way / nearby / arrived state.
- Optional temporary map while sharing is active.
- No access after the sharing window closes.

### Dispute/refund evidence
Location must be supporting evidence, never an automatic refund/no-show decision.

Keep only the minimum useful audit evidence, for example:
- consent/share start timestamp and policy version;
- share stop/expiry timestamp;
- limited ETA snapshots;
- venue-area arrival timestamp;
- accuracy/coarse last-known location where necessary;
- relevant booking/message timestamps.

Avoid retaining a permanent minute-by-minute route history unless a later legal/privacy review establishes a clear need.

### Privacy work required before implementation
- explicit customer consent and easy withdrawal;
- privacy notice update;
- short retention period;
- DPIA/privacy review;
- access controls and audit logs;
- clear handling of location accuracy/failure;
- never penalise a customer merely for refusing location sharing.

Status: **Backlog — implement after core booking, messaging and dispute workflows are stable.**
