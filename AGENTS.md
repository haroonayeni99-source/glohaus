# GLOHAUS change protection rules

These rules apply to all future code and design changes in this repository.

## Preserve approved work

- Treat the current production design and working behaviour as approved unless the user explicitly asks for that specific area to change.
- Do not redesign, restyle, replace, revert, or "clean up" an existing page/component merely because another implementation seems preferable.
- Do not restore an older version of a page, component, layout, policy, navigation pattern, or interaction unless the user explicitly asks for a rollback.
- If a task only concerns one feature, make the smallest targeted change required and leave unrelated UI, copy, routes, business rules, and behaviour untouched.
- Preserve approved mobile and desktop behaviour independently. A mobile fix must not silently redesign desktop, and vice versa.
- Preserve light/dark theme behaviour unless theme changes are explicitly requested.

## Before changing shared files

When editing a shared component, stylesheet, layout, navigation, policy component, auth helper, or backend function:

1. Identify every area the shared code affects.
2. Prefer a scoped change over a global change.
3. Do not change unrelated approved visuals or behaviour.
4. Keep existing copy and policy decisions unless the request explicitly supersedes them.

## GLOHAUS design decisions to protect

- Website and mobile web are the current focus. Native-app/TikTok-style redesign work is deferred unless explicitly requested.
- FAQ should keep the clean About-page visual language and avoid emoji-heavy categories/titles.
- GLOHAUS motto: "Look good, feel good, stand out."
- Professional cards should retain the approved richer information hierarchy.
- Owner/Admin navigation and controls should not be removed or replaced when unrelated work is being done.
- Existing customer, professional, Owner/Admin, marketplace, booking, wallet, dispute, verification, LIVE, and shop flows should remain connected when making local changes.

## Business-rule protection

Do not silently alter pricing, fees, commissions, deposit rules, eligibility, verification, payout timing, dispute handling, refund behaviour, account restrictions, or role permissions. These require an explicit user instruction.

## If there is uncertainty

If an older version conflicts with the current approved version, preserve the current approved version. Do not guess that an older commit is preferred.

The core rule is: **change only what was requested; preserve everything else the user has approved.**
