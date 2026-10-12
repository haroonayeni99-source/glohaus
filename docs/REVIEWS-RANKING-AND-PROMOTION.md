# Reviews, discovery ranking and future promotion

## Implemented in this release

- Only the appointment's customer can publish a review, after a completed appointment has ended. The database enforces this, including direct requests.
- One review per booking. Repeat bookings can have separate reviews; this is not one review per customer or professional.
- Stars must be whole numbers from 1 to 5. Hidden reviews are excluded from public stars, review counts and recommendation ranking. Professionals cannot remove an unfavourable review themselves.
- Duplicate submissions return a clear conflict and preserve the existing review; ineligible submissions return forbidden instead of an outage message.
- Normal discovery applies the customer's search/filters, then orders matching published, active profiles using review confidence. The score is `(sum of visible stars + 40) / (visible review count + 10)`, followed by business name and ID for stable ties. This is a starting product rule, not a learned recommendation model.
- The confidence score is used only for ordering. Displayed stars remain the actual review average and profiles without reviews still say New / No reviews yet.
- Example: 4.8 from 20 reviews has more evidence than 5.0 from one review and ranks above it. More reviews alone cannot rescue a consistently poor rating.
- Nearby discovery puts confirmed-pin distance first, then review confidence for equal distances. Distances remain straight-line estimates; profiles without confirmed public pins cannot enter nearby results.
- Pagination uses the ranking score as well as name/ID, so changing away from alphabetic order does not skip result groups. Old alphabetic cursors reset to the first page.

## Future organic ranking improvements — proposed, not implemented

- Keep customer-selected service, area, radius, price and availability filters ahead of ranking.
- Offer explicit Recommended, Closest and Highest rated sorting. Avoid describing recommendation order as the raw highest-star order.
- Add a small, capped activity signal based on recent completed appointments and distinct clients, rather than sign-ins, clicks, followers or revenue. This prevents larger accounts from winning simply by logging in more often or charging more.
- Consider availability, professional cancellation/no-show history and verified status as distinct signals once reliable data exists. Clearly explain each signal and never present identity verification as proof of service quality.
- Keep room for new professionals; test whether the initial confidence prior is fair before tuning it. Repeated legitimate reviews are currently permitted, so a future abuse review should consider correlated accounts and unusually repetitive activity without discarding legitimate repeat customers.

## Paid placement — proposal only; no purchases or paid ranking added

- A small Sponsored / Ad block above the normal results, with at most two placements per service category and local area.
- Sell clearly stated 7-day or 30-day campaigns. Show start/end time, placement scope and remaining capacity before payment. No automatic renewal by default.
- Only show a promotion when it matches the customer's filters. Nearby placements require a confirmed public pin within the customer's radius. Payment must not bypass account restrictions, booking limits, missing services or unavailability filters.
- Keep the normal organic list below the sponsored block; avoid duplicate cards for the same professional in the same view.
- Rotate equally among eligible advertisers if the inventory offers shared impressions; describe that clearly instead of promising a permanent number-one position.
- Require a published, active, complete profile with bookable services. Verified advertisers are the suggested initial launch group, subject to the Owner's decision.
- Buying placement never changes stars, review counts, verification badges or organic confidence scores. Owner controls can pause inappropriate campaigns with an audit trail.
- Show advertisers impressions, profile clicks and attributable booking enquiries/confirmed bookings, with clear definitions. Do not guarantee clients or earnings.
- Set prices after measuring local traffic and capacity. Define a separate promotion refund/credit policy for failed delivery or a platform outage; existing booking commission and refund rules are not changed by this proposal.

The public website's current OFF setting is preserved. Local and CI checks use fictional accounts; no production reviews, bookings, coordinates or campaign purchases are created or changed.
