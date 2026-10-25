# Support email operations

Support receives at `support@glohaus.shop` using the existing Resend inbox and verified MX. Incoming transport forwards only to `glohausuk@gmail.com`. No inbox or DNS duplication is required.

## Gmail reply settings

The Owner has already verified Gmail Send mail as and tested Resend SMTP. Preserve that configuration. In Gmail → Settings → See all settings → Accounts and Import → Send mail as → **Edit info** for support@glohaus.shop, ensure **Reply-to is support@glohaus.shop**. Save it. When replying to a forwarded support message, confirm **From: support@glohaus.shop** and **To: the original customer**. Gmail may otherwise choose its default Gmail From address because the forwarded message is addressed to Gmail. Make the support identity the default only if wanted for all new mail in this Gmail account. Do not enable Gmail automatic forwarding back to support.

Existing SMTP settings, if repair is needed: smtp.resend.com, username resend, port 465 SSL/TLS (or 587 STARTTLS), password a securely entered domain-scoped Resend sending API key. Never publish the key or replace the website's server key with a sending-only key: receiving needs read access.

## What is preserved

The forward contains a readable text preview, original sender and subject, and a complete `original-message.eml` attachment. This original MIME file contains the full original formatting, message and all attachments. It is not a link granting access to the Owner dashboard. The envelope From uses the authenticated support address; Reply-To uses the verified original sender, not the forwarding service or an unverified alternate Reply-To supplied in an email.

## Ticket association and privacy

A unique ticket UUID in the subject is matched only when the verified sender (or outgoing recipient) also equals the email address on the existing support ticket. Subsequent inbox threads can inherit that association only with the same email check. Keep the ticket reference in the reply subject. Unmatched messages still forward safely, but are not attached to an arbitrary customer. Association is transport metadata only: email does not grant account access, publish a website reply, prove identity, close a case or perform data requests. Gmail message bodies are not synchronised into the dashboard.

Owner → Support → Support email to Gmail shows private queue, acceptance, delivery and review status on demand. Owner MFA is required. Admins and customers cannot access transport metadata. Existing website ticket replies remain separate and retain their public/private controls.

## Reliability and review

A separate signed Resend webhook handles receiving and support delivery events; the existing notification webhook is unchanged. Raw signatures and timestamps are verified before any database work. Provider email IDs and original-message fingerprints deduplicate events. Stable provider idempotency keys, short leases, bounded retries, sender-volume checks and loop markers protect forwarding. The existing notification worker retries durable jobs; no new polling of the receiving inbox is added.

Authentication failures, unknown authentication, unsafe/missing originals, oversized originals and excessive sender volume remain in Resend for human review. These are not silently deleted. Provider acceptance is separate from confirmed delivery. A bounce/delay/failure is displayed in Owner status. Never automatically retry an uncertain message after the 24-hour provider idempotency window; automatic processing stops earlier for manual review. Resend and Gmail delivery limits still apply. This transport stores no message bodies or attachment copies in Supabase.

## Final hands-on checks

1. From an external account, send support a non-sensitive message with a small attachment and an existing ticket reference (only use a ticket belonging to that sender).
2. Check Gmail receives one forward and that original-message.eml contains the complete message and attachment.
3. Reply in Gmail with From support@glohaus.shop and To the external sender. Confirm the recipient sees the support identity and Reply-To support@glohaus.shop.
4. Reply again from the external account, preserving the subject reference. Confirm one incoming follow-up and correct private ticket metadata.
5. Check Owner status for accepted versus delivered. Delivery failures are covered in isolated tests; do not deliberately bounce mail to real customers.

## Deployment and rollback

Apply the additive, checked-in support-mail migration before enabling production forwarding. Configure production-only SUPPORT_EMAIL_WEBHOOK_SECRET from the new webhook's signing secret and SUPPORT_EMAIL_FORWARDING_ENABLED=true. Reuse RESEND_API_KEY with receiving access. Preserve all existing webhook secrets and SMTP credentials. Preview forwarding stays disabled.

Rollback the app to commit 3078b3202e3ab54e149def0b7a674a37ab585c07 / deployment dpl_EP4fYdec8PmohiPWtv8qTDdmMzAd if needed, disable only the new support webhook/forwarding flag, and retain the inbox, DNS and durable metadata. Never drop email history or modify payments during rollback.
