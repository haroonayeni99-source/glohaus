import "@/components/seller-tools.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Seller Hub · GLOHAUS PRO" };
import Link from "next/link";
import {
  PackageCheck,
  ShoppingBag,
  WalletCards,
  MessageSquare,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { SellerAwaySettings } from "@/components/seller-away-settings";
import {
  sellerOverview,
  sellerProductInsights,
  sellerSettings,
} from "@/modules/shop/seller-repository";
import { money } from "@/modules/professionals/domain";
const links = [
  [
    "Listings & stock",
    "Create products, review stock and prepare descriptions",
    "/professional/products",
    ShoppingBag,
  ],
  [
    "Orders & tracking",
    "Dispatch paid orders and share parcel tracking",
    "/professional/orders",
    PackageCheck,
  ],
  [
    "Sales & promotions",
    "Manage selling prices and genuine previous-price offers",
    "/professional/products",
    Tag,
  ],
  [
    "Buyer messages",
    "Keep customer conversations in one place",
    "/messages?view=professional",
    MessageSquare,
  ],
  [
    "Wallet & payouts",
    "Review your earnings, holds and withdrawals",
    "/professional/wallet",
    WalletCards,
  ],
  [
    "Order support",
    "Ask GLOHAUS to review an order or return issue",
    "/contact",
    ShieldCheck,
  ],
] as const;
export default async function SellerHubPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const data = await withIdentity(account.authId, async (db) => ({
    settings: await sellerSettings(db, account.professionalId!),
    overview: await sellerOverview(db, account.professionalId!),
    products: await sellerProductInsights(db, account.professionalId!),
  }));
  const stats = [
    [money(data.overview.sales30DaysPence), "Product sales · 30 days"],
    [data.overview.paidOrders30Days, "Paid orders · 30 days"],
    [data.overview.openOrders, "Orders to fulfil"],
    [data.overview.lowStockProducts, "Published listings with 5 or fewer left"],
  ];
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-management-page seller-hub">
        <p className="pro-kicker">YOUR PRODUCT BUSINESS</p>
        <h1>Seller Hub</h1>
        <p className="pro-page-lead">
          Your products, orders and selling tools, together. Make decisions
          using your shop’s actual activity.
        </p>
        <div className="seller-stats" aria-label="Shop performance">
          {stats.map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <p className="seller-muted">
          Product sales are gross item sales before fees, costs or
          partial-refund adjustments. Cancelled orders and orders marked refund
          pending or refunded are excluded. Use your wallet for net proceeds.{" "}
          {data.overview.refundOrders30Days} order(s) from the last 30 days are
          marked refund pending or refunded.
        </p>
        <nav className="tools-grid" aria-label="Seller tools">
          {links.map(([label, description, href, Icon]) => (
            <Link key={label} href={href} className="tool-card">
              <Icon size={23} aria-hidden />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </Link>
          ))}
        </nav>
        <SellerAwaySettings initialSettings={data.settings} />
        <section className="seller-panel" aria-labelledby="insights-heading">
          <h2 id="insights-heading">Your product insights</h2>
          <p>
            Units and gross item sales over the last 30 days. These figures
            describe your shop, rather than marketplace-wide demand.
          </p>
          {data.products.length ? (
            <div className="seller-table-scroll">
              <table>
                <caption>Top 10 products by units sold</caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Units</th>
                    <th scope="col">Item sales</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((product) => (
                    <tr key={product.productId}>
                      <th scope="row">{product.name}</th>
                      <td>{product.units}</td>
                      <td>{money(product.salesPence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              No products yet.{" "}
              <Link href="/professional/products">
                Create your first listing
              </Link>{" "}
              to start building your shop.
            </p>
          )}
        </section>
        <section className="seller-panel" aria-labelledby="selling-heading">
          <h2 id="selling-heading">Sell with clear expectations</h2>
          <ul>
            <li>
              Use accurate photos, quantities, ingredients and descriptions.
              Only show a previous price that you actually charged.
            </li>
            <li>
              Add carrier tracking when you dispatch. Printing a label alone
              does not mean the parcel has shipped.
            </li>
            <li>
              Keep dispatch receipts, tracking updates and buyer conversations
              for an order review. Contact GLOHAUS support for return or
              disputed-order issues.
            </li>
            <li>
              Check your wallet for the current payout position. Time Away does
              not cancel orders or change refunds, commission or payout timing.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
