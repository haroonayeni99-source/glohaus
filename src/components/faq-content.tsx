"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PublicHeader } from "@/components/public-header";

type FaqItem = {
  category: string;
  question: string;
  answer: React.ReactNode;
};

const categories = [
  "All",
  "General",
  "Accounts",
  "Professionals",
  "Professional Verification",
  "Bookings",
  "Messages & Notifications",
  "Payments & Wallet",
  "Fees & Commission",
  "Withdrawals",
  "Shop & Products",
  "Cancellations & Refunds",
  "Reviews & Trust",
  "Safety & Security",
  "Support",
];

const items: FaqItem[] = [
  {
    category: "General",
    question: "What is GLOHAUS?",
    answer: (
      <>
        GLOHAUS is a beauty marketplace that connects customers with beauty
        professionals in one place. Customers can discover professionals, view
        their work, book services, communicate with professionals, leave
        reviews, and shop for beauty-related products. Professionals can create
        their own profile, advertise services, manage bookings, showcase their
        portfolio, sell products, communicate with customers, and manage their
        earnings.
      </>
    ),
  },
  {
    category: "General",
    question: "What types of professionals can use GLOHAUS?",
    answer: (
      <>
        GLOHAUS is designed for hair stylists, braiders, barbers, nail
        technicians, lash technicians, makeup artists, waxing professionals,
        brow specialists, beauty therapists, aesthetic professionals and other
        approved beauty and personal-care providers. Additional categories may
        be added as GLOHAUS grows.
      </>
    ),
  },
  {
    category: "General",
    question: "Is GLOHAUS free to use?",
    answer: (
      <>
        Customers can create and use a GLOHAUS account for free. Professionals
        can also create a free professional account and begin building their
        presence on GLOHAUS. Certain advanced professional features,
        verification benefits, promotional tools or future subscription
        features may have additional requirements or charges.
      </>
    ),
  },
  {
    category: "General",
    question: "Does GLOHAUS provide the beauty services itself?",
    answer: (
      <>
        No. GLOHAUS is a marketplace that connects independent customers and
        professionals. The professional is responsible for providing the
        service they advertise and for ensuring that the information, prices,
        qualifications and availability shown on their profile are accurate.
      </>
    ),
  },
  {
    category: "Accounts",
    question: "Can I create a customer account or professional account?",
    answer: (
      <>
        Yes. When signing up, you can choose to join GLOHAUS as a{" "}
        <strong>Customer</strong> for discovering professionals, booking
        services and purchasing products, or as a{" "}
        <strong>Professional</strong> for advertising services, accepting
        bookings, showcasing your work, selling products and managing your
        business.
      </>
    ),
  },
  {
    category: "Accounts",
    question: "Can I have both a customer and professional profile?",
    answer: (
      <>
        GLOHAUS may allow users to access customer features alongside their
        professional account where appropriate. Professional-only features
        remain subject to professional account requirements and permissions.
      </>
    ),
  },
  {
    category: "Accounts",
    question: "How old do I need to be to become a professional?",
    answer: (
      <>
        Professional accounts are restricted to users aged{" "}
        <strong>18 or over</strong>. Age and identity verification may be
        required before certain professional features can be accessed.
      </>
    ),
  },
  {
    category: "Accounts",
    question: "What happens after I sign up?",
    answer: (
      <>
        Customers are taken to the customer experience where they can discover
        professionals, browse services and manage bookings. Professionals are
        taken through professional setup where they can create their profile,
        add services, prices, availability, portfolio content and other
        business information.
      </>
    ),
  },
  {
    category: "Professionals",
    question: "Do I need to be verified to use GLOHAUS as a professional?",
    answer: (
      <>
        Not immediately. Eligible professionals can start on Starter access
        before completing full verification. Starter access allows a public
        professional profile, services priced up to £200 with no online deposit,
        and up to five marketplace bookings per calendar month. Verification is
        required to unlock deposits, higher-value services, product selling,
        withdrawals and wider marketplace features.
      </>
    ),
  },
  {
    category: "Professionals",
    question: "What can an unverified professional do?",
    answer: (
      <>
        Before verification, an eligible professional can create and publish a
        professional profile, add services priced up to £200, manage availability,
        upload portfolio content, communicate with customers and accept up to
        five Trial bookings per calendar month. Trial Pro uses a 10% service commission rate. Online deposits and the wider verified feature
        set remain unavailable until verification is complete.
      </>
    ),
  },
  {
    category: "Professionals",
    question: "What restrictions can apply to unverified professionals?",
    answer: (
      <>
        Unverified professionals are limited to services priced at £200 or less,
        cannot require a professional-selected online deposit, and can accept
        up to five Trial bookings per calendar month. Product selling,
        withdrawals, LIVE access, higher-value services and other verified
        features remain unavailable until verification is completed.
      </>
    ),
  },
  {
    category: "Professionals",
    question: "What are professionals responsible for?",
    answer: (
      <>
        Professionals are responsible for providing services as advertised,
        keeping prices and availability accurate, attending confirmed
        appointments, maintaining appropriate professional standards,
        complying with applicable laws and regulations, maintaining any
        licences, qualifications or insurance required for their work, handling
        their own tax obligations, shipping products they sell, providing
        accurate product descriptions, and communicating appropriately with
        customers.
      </>
    ),
  },
  {
    category: "Professional Verification",
    question: "What is professional verification?",
    answer: (
      <>
        Professional verification is GLOHAUS&apos;s marketplace identity and
        business-check process. It is designed to confirm key account
        information without using an employment-style application or skills
        interview. Professionals can begin with limited Starter access before
        completing verification.
      </>
    ),
  },
  {
    category: "Professional Verification",
    question: "What may be required for verification?",
    answer: (
      <>
        Verification may include confirming that you are 18 or over, phone or
        contact information, personal or business information, and identity
        checks. Stripe may ask for a government-issued ID, selfie or additional
        information where required. Certain regulated or higher-risk beauty
        services may also require relevant licences, qualifications,
        registrations or insurance.
      </>
    ),
  },
  {
    category: "Professional Verification",
    question: "What do verified professionals receive?",
    answer: (
      <>
        Once verification is complete, Starter limits are removed for eligible
        professionals. They can use approved deposits, higher-value services,
        product selling, withdrawals and broader marketplace features subject to
        their plan and account standing. A verified status may also be displayed
        on the profile.
      </>
    ),
  },
  {
    category: "Professional Verification",
    question: "Does being verified mean GLOHAUS guarantees a professional?",
    answer: (
      <>
        No. Verification means that required identity or business information
        has been checked for marketplace access. It is not a guarantee of skill,
        quality or future conduct. Customers should still review service
        information, portfolios, reviews, policies and professional details
        before booking.
      </>
    ),
  },
  {
    category: "Bookings",
    question: "How do I book a professional?",
    answer: (
      <>
        Find a professional, view their profile, choose a service, select an
        available date and time, review the total price, then confirm and pay
        for the booking. The booking will then appear in your account.
      </>
    ),
  },
  {
    category: "Bookings",
    question: "Can professionals control their own availability?",
    answer: (
      <>
        Yes. Professionals can manage their availability, working hours,
        appointment slots and time off through their professional account.
      </>
    ),
  },
  {
    category: "Bookings",
    question: "Can professionals set their own prices?",
    answer: (
      <>
        Yes. Professionals choose the price of the services they provide. The
        customer will be shown the price they are expected to pay before
        confirming the booking.
      </>
    ),
  },
  {
    category: "Bookings",
    question: "Can a professional require a deposit?",
    answer: (
      <>
        Yes, where deposits are enabled. A professional&apos;s booking deposit
        cannot be more than <strong>40% of the service price</strong>. The
        remaining amount will be handled according to the booking and payment
        rules shown to the customer. GLOHAUS may require a minimum online
        booking payment toward the service so the platform commission due on
        the full listed service price is secured before the appointment.
      </>
    ),
  },
  {
    category: "Bookings",
    question: "What happens if I am late to a booking?",
    answer: (
      <>
        Late-arrival rules can depend on the professional&apos;s stated booking
        policy. Customers should contact the professional as soon as possible
        if they expect to be late. Depending on the circumstances, significant
        lateness may result in the appointment being shortened, cancelled or
        treated as a no-show.
      </>
    ),
  },
  {
    category: "Bookings",
    question: "Does GLOHAUS track my location when travelling to a booking?",
    answer: (
      <>
        GLOHAUS may offer optional, consent-based location sharing for a
        confirmed booking journey to assist with arrival information, lateness
        disputes and safety. Customers can control sharing, and applicable
        privacy rules are explained in the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </>
    ),
  },
  {
    category: "Messages & Notifications",
    question: "Can customers and professionals message each other?",
    answer: (
      <>
        Yes. Customers and professionals can communicate through GLOHAUS
        regarding bookings, services, appointments, products and other relevant
        enquiries.
      </>
    ),
  },
  {
    category: "Messages & Notifications",
    question: "Should I keep booking conversations on GLOHAUS?",
    answer: (
      <>
        Yes. Customers and professionals are strongly encouraged to keep
        booking-related messages, price changes, appointment arrangements and
        payment discussions inside GLOHAUS. If a conversation moves to another
        app or a payment is made outside GLOHAUS, the platform may have less
        evidence available to investigate a dispute or scam and may be unable
        to help recover money paid outside the platform.
      </>
    ),
  },
  {
    category: "Messages & Notifications",
    question: "What notifications will I receive?",
    answer: (
      <>
        Notifications may include booking confirmations and changes,
        appointment reminders, new messages, cancellation updates, payment and
        payout updates, product order updates, review notifications, and
        account or security alerts.
      </>
    ),
  },
  {
    category: "Messages & Notifications",
    question: "Will GLOHAUS send emails as well?",
    answer: (
      <>
        GLOHAUS may send transactional emails for important account activity
        such as password resets, booking confirmations, payment information,
        security alerts and important service notifications.
      </>
    ),
  },
  {
    category: "Payments & Wallet",
    question: "How do payments work?",
    answer: (
      <>
        Customers can pay eligible booking amounts through GLOHAUS. Where a
        professional offers cash for the remaining service balance, customers
        may choose cash, but cash and other off-platform payments are at the
        customer&apos;s own risk. GLOHAUS may have limited or no ability to
        trace, reverse or recover money paid outside its payment system.
        Payments processed on GLOHAUS use approved payment providers, and
        GLOHAUS does not directly store customers&apos; full payment card
        details.
      </>
    ),
  },
  {
    category: "Payments & Wallet",
    question: "Do professionals have a wallet?",
    answer: (
      <>
        Yes. Professional earnings can be displayed through the GLOHAUS wallet
        system, including available balance, pending balance, completed
        payments, fees, commission, withdrawals and transaction history.
      </>
    ),
  },
  {
    category: "Payments & Wallet",
    question: "When does a professional receive booking earnings?",
    answer: (
      <>
        Booking earnings may remain pending until the service has been
        completed. Subject to security checks, dispute status and payment
        processing requirements, funds can then become available for
        withdrawal.
      </>
    ),
  },
  {
    category: "Payments & Wallet",
    question: "When does money from a product sale become available?",
    answer: (
      <>
        Product-sale funds may remain pending while the order is being
        processed. GLOHAUS can delay professional access to funds until
        approximately <strong>2 days after confirmed shipping or fulfilment
        information</strong>, subject to fraud, dispute and security checks.
      </>
    ),
  },
  {
    category: "Payments & Wallet",
    question: "Can my GLOHAUS wallet go into a negative balance?",
    answer: (
      <>
        GLOHAUS is designed to prevent professionals from freely spending or
        withdrawing money that is not available to them. Where refunds,
        disputes, chargebacks or other adjustments affect an account, future
        earnings or available balances may be adjusted according to GLOHAUS
        payment rules.
      </>
    ),
  },
  {
    category: "Fees & Commission",
    question: "Does GLOHAUS charge customers a booking fee?",
    answer: (
      <>
        Yes. GLOHAUS currently plans to charge customers a{" "}
        customer booking fee on applicable service bookings. The current fee
        is shown before the customer commits to a booking and may be updated by
        GLOHAUS over time. Any change applies to new bookings rather than
        changing an amount already agreed for a paid booking.
      </>
    ),
  },
  {
    category: "Fees & Commission",
    question: "Will the booking fee suddenly appear at checkout?",
    answer: (
      <>
        No. The total payable price should be visible before final checkout.
        No. The service price, online booking payment and current GLOHAUS
        booking fee should be shown before the customer commits. The customer
        should not discover a platform fee for the first time after confirming
        the booking.
      </>
    ),
  },
  {
    category: "Fees & Commission",
    question: "Does GLOHAUS charge professionals commission?",
    answer: (
      <>
        Yes. GLOHAUS may take a percentage commission from eligible
        professional transactions. Professionals will be shown applicable
        GLOHAUS commission and fees within their professional account and
        transaction information.
      </>
    ),
  },
  {
    category: "Fees & Commission",
    question: "What commission does a Trial Pro pay?",
    answer: (
      <>
        Trial Pro is £0 per month with a <strong>10%</strong> GLOHAUS service
        commission. Eligible Trial Pros can accept up to five
        marketplace bookings per calendar month while Trial restrictions
        remain in place.
      </>
    ),
  },
  {
    category: "Fees & Commission",
    question: "Can a professional list a low price and ask for the rest in cash?",
    answer: (
      <>
        No. The price shown on GLOHAUS must reflect the genuine price the
        customer is expected to pay for the booked service. A professional must
        not deliberately list an artificially low price and then require an
        undisclosed mandatory cash or off-platform top-up to avoid GLOHAUS
        commission. Optional extras requested after booking should be agreed
        clearly. Deliberate or repeated fee circumvention can result in
        restrictions.
      </>
    ),
  },
  {
    category: "Fees & Commission",
    question: "Can customers see how much commission GLOHAUS charges professionals?",
    answer: (
      <>
        No. Professional commission is an agreement between GLOHAUS and the
        professional. Customers only need to see charges that affect the amount
        they personally pay, including the applicable booking fee. Customers
        will not be shown the professional commission percentage, professional
        payout amount, professional subscription costs or GLOHAUS&apos;s share
        of the professional&apos;s earnings.
      </>
    ),
  },
  {
    category: "Fees & Commission",
    question: "Are GLOHAUS commissions refundable to professionals?",
    answer: (
      <>
        GLOHAUS platform commissions and applicable platform fees are generally
        treated separately from the professional&apos;s service earnings. Where
        a customer refund is issued because a professional failed to provide
        an eligible service or fulfil a product order, GLOHAUS&apos;s own
        applicable platform charges may remain non-refundable except where
        GLOHAUS determines otherwise or where required by law.
      </>
    ),
  },
  {
    category: "Withdrawals",
    question: "How can professionals withdraw money?",
    answer: (
      <>
        Eligible professionals can request withdrawals from their available
        GLOHAUS balance. Withdrawal availability may depend on account
        verification, available balance, pending bookings, open disputes,
        refunds, chargebacks, and fraud or security checks.
      </>
    ),
  },
  {
    category: "Withdrawals",
    question: "How long do standard withdrawals take?",
    answer: (
      <>
        Standard withdrawals are planned to be free and may take approximately{" "}
        <strong>3–5 business days</strong>, depending on the payment provider
        and banking system.
      </>
    ),
  },
  {
    category: "Withdrawals",
    question: "Is there an instant withdrawal option?",
    answer: (
      <>
        GLOHAUS plans to offer eligible professionals an optional faster
        withdrawal method. The planned instant withdrawal fee is{" "}
        <strong>4% of the withdrawn amount</strong>. Exact availability and
        processing speed will depend on the payment provider and account
        eligibility.
      </>
    ),
  },
  {
    category: "Shop & Products",
    question: "Can professionals sell products on GLOHAUS?",
    answer: (
      <>
        Yes. Approved professionals may be able to list beauty-related products
        through their GLOHAUS profile or marketplace shop.
      </>
    ),
  },
  {
    category: "Shop & Products",
    question: "What are sellers responsible for?",
    answer: (
      <>
        Sellers are responsible for accurate product descriptions and pricing,
        product quality, stock availability, shipping, delivery information,
        following applicable consumer laws, responding to order issues, and
        fulfilling purchases within the required timeframe.
      </>
    ),
  },
  {
    category: "Shop & Products",
    question: "What happens if a professional doesn't ship my product?",
    answer: (
      <>
        Customers can report an unfulfilled order. Where GLOHAUS confirms that
        the seller failed to fulfil the purchase, the customer may be eligible
        for a refund according to the{" "}
        <Link href="/refunds">GLOHAUS refund policy</Link>.
      </>
    ),
  },
  {
    category: "Shop & Products",
    question: "Can professionals track their product earnings?",
    answer: (
      <>
        Yes. Eligible product sales, pending balances, platform charges and
        available earnings can be shown within the professional wallet and
        order management system.
      </>
    ),
  },
  {
    category: "Cancellations & Refunds",
    question: "Can I cancel a booking?",
    answer: (
      <>
        Cancellation eligibility depends on the timing of the cancellation and
        the applicable professional or GLOHAUS cancellation policy. The
        customer should be shown the applicable cancellation terms before
        confirming a booking.
      </>
    ),
  },
  {
    category: "Cancellations & Refunds",
    question: "What happens if a professional cancels?",
    answer: (
      <>
        If the professional cannot fulfil the booking, the customer may be
        entitled to a refund or other resolution according to GLOHAUS policy.
      </>
    ),
  },
  {
    category: "Cancellations & Refunds",
    question: "What happens if the professional doesn't turn up?",
    answer: (
      <>
        Customers can report the booking through GLOHAUS. The platform can
        review available information including booking records, messages and
        evidence before deciding the appropriate resolution.
      </>
    ),
  },
  {
    category: "Cancellations & Refunds",
    question: "What happens if a customer doesn't turn up?",
    answer: (
      <>
        A customer&apos;s eligibility for a refund may be reduced or removed
        where they fail to attend a confirmed appointment without cancelling
        within the permitted timeframe. The exact outcome depends on the
        applicable booking and cancellation policy.
      </>
    ),
  },
  {
    category: "Cancellations & Refunds",
    question: "Are all refunds full refunds?",
    answer: (
      <>
        Not necessarily. Depending on the situation, GLOHAUS may issue a full
        refund, partial refund or no refund. The decision can depend on what
        occurred, the booking policy, evidence provided, payments already
        earned and applicable consumer law.
      </>
    ),
  },
  {
    category: "Cancellations & Refunds",
    question: "Does GLOHAUS refund its own commission when a professional has a problem?",
    answer: (
      <>
        Professional service earnings and GLOHAUS platform charges are treated
        separately. GLOHAUS commissions and platform charges are generally
        non-refundable to professionals except where required by law or where
        GLOHAUS specifically decides otherwise.
      </>
    ),
  },
  {
    category: "Reviews & Trust",
    question: "Can customers leave reviews?",
    answer: (
      <>
        Yes. Customers can leave reviews after eligible completed bookings or
        purchases. Reviews help other customers understand the quality and
        reliability of professionals using GLOHAUS.
      </>
    ),
  },
  {
    category: "Reviews & Trust",
    question: "Can anyone leave a review?",
    answer: (
      <>
        GLOHAUS may restrict reviews to customers who have had a genuine
        transaction, booking or qualifying experience with the professional.
        This helps reduce fake or misleading reviews.
      </>
    ),
  },
  {
    category: "Reviews & Trust",
    question: "Can professionals delete negative reviews?",
    answer: (
      <>
        Professionals should not be able to remove a review simply because it
        is negative. Reviews that breach GLOHAUS rules can be reported for
        moderation.
      </>
    ),
  },
  {
    category: "Reviews & Trust",
    question: "Can a professional respond to a review?",
    answer: (
      <>
        GLOHAUS may allow professionals to respond publicly to customer reviews
        while following community and professional conduct rules.
      </>
    ),
  },
  {
    category: "Reviews & Trust",
    question: "What happens if a review is fake or abusive?",
    answer: (
      <>
        Users can report reviews they believe are fake, abusive,
        discriminatory, threatening, spam, unrelated to the transaction, or
        otherwise against GLOHAUS rules. GLOHAUS can review reported content
        and take appropriate action.
      </>
    ),
  },
  {
    category: "Safety & Security",
    question: "Is my payment information secure?",
    answer: (
      <>
        Payments are processed through trusted payment providers. GLOHAUS does
        not need to directly store complete card information in order to
        process normal platform payments.
      </>
    ),
  },
  {
    category: "Safety & Security",
    question: "How does GLOHAUS protect accounts?",
    answer: (
      <>
        GLOHAUS may use security measures including secure authentication,
        email verification, identity and age checks, login security, account
        permissions, fraud monitoring, payment-provider security, and reporting
        and moderation systems.
      </>
    ),
  },
  {
    category: "Safety & Security",
    question: "Can I report another user?",
    answer: (
      <>
        Yes. Customers and professionals can report inappropriate behaviour,
        suspicious activity, fraudulent listings, abusive messages, unsafe
        behaviour or other violations of GLOHAUS rules.
      </>
    ),
  },
  {
    category: "Safety & Security",
    question: "Can GLOHAUS suspend an account?",
    answer: (
      <>
        Yes. Accounts may be restricted, suspended or removed where there is
        evidence of serious or repeated violations of GLOHAUS policies. This
        can include fraud, harassment, unsafe behaviour, deliberate
        non-fulfilment, payment abuse or other prohibited activity.
      </>
    ),
  },
  {
    category: "Safety & Security",
    question: "Does GLOHAUS guarantee that every service is safe?",
    answer: (
      <>
        No marketplace can completely eliminate risk. GLOHAUS uses
        verification, reviews, reporting, payment records and moderation tools
        to help create a safer marketplace. Customers should still review a
        professional&apos;s information carefully, and professionals must
        comply with applicable laws, safety standards and GLOHAUS policies.
      </>
    ),
  },
  {
    category: "Support",
    question: "How do I contact GLOHAUS?",
    answer: (
      <>
        Use the GLOHAUS support or Contact Us option for account problems,
        bookings, payments, withdrawals, refunds, product orders, verification,
        reports, reviews, safety issues and technical problems.
      </>
    ),
  },
  {
    category: "Support",
    question: "How quickly will GLOHAUS respond?",
    answer: (
      <>
        GLOHAUS aims to respond to support requests as quickly as possible.
        Urgent account, payment, booking and safety issues may be prioritised.
        Specific response-time guarantees will only be displayed once GLOHAUS
        has established the support capacity to meet them consistently.
      </>
    ),
  },
  {
    category: "Support",
    question: "What information should I provide when reporting a problem?",
    answer: (
      <>
        Relevant information may include a booking or order reference,
        screenshots, messages, payment information, photos, relevant dates and
        times, and a description of what happened. Do not send sensitive
        financial information such as your full card number through ordinary
        support messages.
      </>
    ),
  },
];

export function FaqContent() {
  const [selected, setSelected] = useState("All");
  const visibleItems = useMemo(
    () => (selected === "All" ? items : items.filter((item) => item.category === selected)),
    [selected],
  );

  return (
    <div className="public-shell">
      <PublicHeader />
      <main id="main" className="public-info-page faq-page">
        <header className="public-info-hero faq-hero">
          <p className="eyebrow">GLOHAUS HELP</p>
          <h1>Frequently asked questions.</h1>
          <p>
            Clear answers for customers and professionals using GLOHAUS — from accounts and bookings to payments, verification and support.
          </p>
        </header>

        <nav className="faq-categories" aria-label="FAQ categories">
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              className={selected === category ? "is-active" : ""}
              aria-pressed={selected === category}
              onClick={() => setSelected(category)}
            >
              {category}
            </button>
          ))}
        </nav>

        <div className="faq-content">
          {categories
            .filter((category) => category !== "All")
            .filter((category) => selected === "All" || selected === category)
            .map((category) => {
              const categoryItems = visibleItems.filter(
                (item) => item.category === category,
              );
              if (!categoryItems.length) return null;

              return (
                <section className="faq-section" key={category}>
                  <h2>{category}</h2>
                  <div className="faq-list">
                    {categoryItems.map((item) => (
                      <details className="faq-item" key={item.question}>
                        <summary>
                          <span>{item.question}</span>
                          <ChevronDown size={20} aria-hidden />
                        </summary>
                        <div className="faq-answer">{item.answer}</div>
                      </details>
                    ))}
                  </div>
                </section>
              );
            })}
        </div>

        <footer className="faq-footer">
          <div className="faq-wordmark">
            <strong>GLOHAUS</strong>
            <span>Beauty. Bookings. Business. One place.</span>
          </div>
          <nav aria-label="GLOHAUS information">
            <Link href="/faq">FAQ</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/professional-terms">Professional Policy</Link>
            <Link href="/refunds">Cancellation & Refund Policy</Link>
          </nav>
          <p>
            GLOHAUS is a marketplace connecting customers with independent
            beauty and personal-care professionals. Professionals are
            responsible for their own services, business obligations and
            applicable taxes.
          </p>
          <p>© 2026 GLOHAUS. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
