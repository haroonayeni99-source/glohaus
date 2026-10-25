# Owner/Admin workspace clarity

The existing Owner/Admin page now groups all 37 tools by the task they serve: Start here, People & access, Bookings & money, Support & safety, Website & content, Growth & offers, and System & delivery. Desktop groups expand individually; the grouped section picker and task search remain available on phones. Compact navigation retains every permitted tool.

Each area explains its purpose in plain language, including the difference between inactive source-pricing drafts and live commission, reversible programme closure and permanent retirement, support and payment disputes, and setup readiness versus actual notification delivery. Common task cards on Overview include short descriptions. Section headings match menu names.

Founding programme controls now have their own existing navigation destination. Pricing proposals remain in Commission & Pricing. Both reuse the same existing component, API, Owner/MFA checks, confirmations and audit mechanism. There are no new endpoints, migrations, database calls or persisted settings. All current controls and stable section IDs remain available. Switching sections retains mounted forms and unsaved inputs.

Release validation uses the existing isolated Owner/Admin browser fixture for both roles, light/night themes and four widths (320, 390, 820 and 1440). It checks all section destinations, record search, task search, no results, quick tasks, unsaved fields, group expansion, support history and financial/moderation confirmation cancellation. No production mutation or payment journey is needed.

Rollback: re-promote production deployment `dpl_Be6gBxJJzjfgydB8PydaPvMVFx47` (commit `d25df2e075bcd39e55f04235083a858d408a5362`). No database rollback is needed. Live fees, Stripe, payout rules, current programme state, earned benefits and inactive proposal status are unchanged.
