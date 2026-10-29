/** Presentation only. IDs remain the existing dashboard/deep-link targets. */
export const adminToolGuide: Record<
  string,
  { purpose: string; note?: string; keywords?: string }
> = {
  overview: {
    purpose:
      "Check activity, see what needs attention and choose your next task.",
  },
  settings: {
    purpose:
      "Change the professional title and wording customers see across GLOHAUS.",
    keywords: "website wording labels names text",
  },
  categories: {
    purpose:
      "Manage beauty service categories, specialities and the services listed under them.",
    keywords: "hair nails taxonomy",
  },
  "product-categories": {
    purpose: "Organise shop products into categories customers can browse.",
  },
  users: {
    purpose:
      "Find customer and professional accounts, review their status and manage restrictions.",
    note: "Account visibility, suspension and deletion are different actions. Read each confirmation before saving.",
    keywords: "customer account ban hide delete block",
  },
  professionals: {
    purpose: "Find professional profiles and review their account details.",
  },
  "professional-policies": {
    purpose:
      "Read each professional’s cancellation, no-show and booking policies.",
    note: "These are the professional’s terms; this view is for review, not rewriting their policies.",
  },
  "professional-activity": {
    purpose:
      "See which professionals have stopped using GLOHAUS and review inactivity reminders.",
    keywords: "inactive engagement reminder",
  },
  "live-access": {
    purpose:
      "Review professional verification, account standing and permission to broadcast LIVE.",
    note: "Verification and access decisions affect what a professional can do. Review the evidence and record a reason.",
    keywords: "identity business documents approve kyc",
  },
  bookings: {
    purpose: "Look up appointments, their status, customers and professionals.",
  },
  orders: {
    purpose:
      "Look up shop orders and check fulfilment, shipping and overdue actions.",
    keywords: "products delivery dispatch",
  },
  reviews: {
    purpose:
      "Review customer feedback and professional responses, and moderate reported content.",
  },
  reports: {
    purpose:
      "Review reported profiles, posts and safety concerns, then record a moderation decision.",
    keywords: "incident misleading abuse block",
  },
  support: {
    purpose:
      "Handle customer and professional enquiries, evidence, replies, appeals and escalations.",
    note: "Reply on the private ticket to retain the case history. Gmail replies are not synchronised here.",
    keywords: "customer complaint help contact dispute",
  },
  content: {
    purpose:
      "Review community posts and stories, and manage inappropriate content.",
    keywords: "share discover moderation",
  },
  "payment-disputes": {
    purpose:
      "Review disputed payments and the protection holds associated with them.",
    note: "Review payment evidence and payout holds before making a decision.",
    keywords: "chargeback freeze dispute",
  },
  "refund-appeals": {
    purpose: "Review requests to reconsider a refund decision.",
    note: "Approving an appeal authorises a refund. Check the percentage and reason before confirming.",
    keywords: "money back complaint",
  },
  payments: {
    purpose:
      "Check payment records, professional balances, payout progress and financial history.",
    keywords: "wallet withdrawal earnings transaction deposit balance",
  },
  analytics: {
    purpose: "Review revenue, booking and marketplace figures.",
    note: "For customer sources, referrals and professional leaderboards, use Customer Acquisition & Growth.",
  },
  "arrival-management": {
    purpose:
      "Review arrival tools, journey settings and customer communications.",
    keywords: "travel routes reminder late messages",
  },
  "push-delivery-health": {
    purpose:
      "Check whether device push notifications are queued, accepted or failing.",
    note: "Provider acceptance does not prove a notification appeared on someone’s phone.",
    keywords: "notifications phone android iphone",
  },
  "website-status": {
    purpose: "Turn public access to GLOHAUS on or off.",
    note: "This affects visitors immediately. Review the confirmation before changing access.",
    keywords: "maintenance launch open close website",
  },
  marketing: {
    purpose: "Manage optional campaigns, feedback requests and feature votes.",
    note: "Marketing preferences apply. Essential booking and security messages are handled separately.",
    keywords: "promotion questionnaire email survey vote",
  },
  "homepage-media": {
    purpose:
      "Change homepage photos and category thumbnails for desktop and mobile.",
    keywords: "upload homepage photo image banner",
  },
  "profile-examples": {
    purpose:
      "Show or hide fictional example profiles used to demonstrate GLOHAUS.",
    note: "Example profiles are demonstrations, not real bookable professionals.",
  },
  "booking-fee": {
    purpose: "Set the customer booking fee for future bookings.",
    note: "This is a live pricing control. Review the amount and confirmation before saving.",
    keywords: "change price fee customer pound",
  },
  "shop-fees": {
    purpose: "Set GLOHAUS commission on future shop product sales.",
    note: "This is a live pricing control for products, separate from service commission.",
    keywords: "change prices percentage product fees",
  },
  "auth-accounts": {
    purpose:
      "Check registrations, email confirmation and previous sign-ins when someone cannot access their account.",
    keywords: "login sign up authentication reset",
  },
  "founding-programme": {
    purpose:
      "Open or close founding enrolment, or permanently retire the launch offer.",
    note: "Closing can be reversed. Retirement cannot be undone through the dashboard. Existing earned benefits continue until expiry.",
    keywords: "trial launch offer zero commission 14 days legacy benefits",
  },
  "professional-commission": {
    purpose:
      "Manage service commission, professional overrides and future customer-source pricing proposals.",
    note: "Customer-source proposals are inactive drafts. The separate live commission controls require their existing confirmations.",
    keywords: "change prices percentages rates 2 8 draft fees",
  },
  referrals: {
    purpose:
      "See who brings customers to GLOHAUS, compare professional performance and review disputed attribution.",
    note: "Open Growth & Performance for the full reports. An invitation alone does not prove customer ownership.",
    keywords:
      "acquisition new returning clients referral leaderboard growth fraud",
  },
  staff: {
    purpose: "Review staff accounts and manage Admin access.",
    note: "Access changes affect who can manage GLOHAUS. Owner permissions and MFA still apply.",
    keywords: "team permission role",
  },
  "backend-health": {
    purpose:
      "Check failed background jobs, support alerts and other operational problems.",
    keywords: "platform health errors monitoring cron broken",
  },
  "payment-readiness": {
    purpose:
      "Check payment and payout setup before investigating payment problems.",
    note: "Setup checks do not prove a complete payment journey succeeded.",
    keywords: "stripe configuration diagnostic",
  },
  "email-readiness": {
    purpose:
      "Check email configuration for booking messages and sign-in security.",
    note: "Configuration readiness is separate from actual email delivery.",
    keywords: "resend domain setup",
  },
  "email-delivery-health": {
    purpose:
      "Review recorded email outcomes and investigate failed or suppressed messages.",
    note: "Delivery status does not mean the recipient read the message or that Gmail replies are synchronised.",
    keywords: "resend bounce spam sent delivered",
  },
  audit: {
    purpose: "See who changed what, when it happened and the recorded reason.",
    keywords: "history decisions log",
  },
};

export const adminTaskGroups = [
  { label: "Start here", ids: ["overview"] },
  {
    label: "People & access",
    ids: [
      "users",
      "professionals",
      "live-access",
      "professional-policies",
      "professional-activity",
      "auth-accounts",
      "staff",
    ],
  },
  {
    label: "Bookings & money",
    ids: [
      "bookings",
      "orders",
      "payments",
      "booking-fee",
      "shop-fees",
      "professional-commission",
      "analytics",
    ],
  },
  {
    label: "Support & safety",
    ids: [
      "support",
      "payment-disputes",
      "refund-appeals",
      "reviews",
      "reports",
    ],
  },
  {
    label: "Website & content",
    ids: [
      "homepage-media",
      "categories",
      "product-categories",
      "settings",
      "content",
      "profile-examples",
      "website-status",
    ],
  },
  {
    label: "Growth & offers",
    ids: ["referrals", "founding-programme", "marketing"],
  },
  {
    label: "System & delivery",
    ids: [
      "backend-health",
      "arrival-management",
      "push-delivery-health",
      "payment-readiness",
      "email-readiness",
      "email-delivery-health",
      "audit",
    ],
  },
];

export function matchesAdminTool(id: string, label: string, query: string) {
  const guide = adminToolGuide[id];
  const text =
    `${label} ${guide?.purpose ?? ""} ${guide?.keywords ?? ""}`.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

export function AdminToolHelp({ id }: { id: string }) {
  const guide = adminToolGuide[id];
  if (!guide) return null;
  return (
    <div className="admin-tool-help" aria-label="What this section is for">
      <p>
        <strong>Use this for:</strong> {guide.purpose}
      </p>
      {guide.note && <p className="admin-tool-note">{guide.note}</p>}
    </div>
  );
}
