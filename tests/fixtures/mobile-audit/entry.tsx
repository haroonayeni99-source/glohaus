import { VerificationRequirements } from "@/components/verification-requirements";
import { BookingPicker } from "@/components/booking-picker";
import { PortfolioEditor } from "@/components/portfolio-editor";
import { ReviewForm } from "@/components/review-form";
import { discoveryOptions } from "@/modules/professionals/discovery";
import React from "react";
import { createRoot } from "react-dom/client";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProfessionalDashboard } from "@/components/professional-dashboard";
import { MobileCustomerHome } from "@/components/mobile-customer-home";
import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { ProfessionalEditor } from "@/components/professional-editor";
import { ProfessionalProfile } from "@/components/professional-profile";
import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { ProfessionalProductsManager } from "@/components/professional-products-manager";
import { ProductOrderList } from "@/components/product-order-list";
import { BookingList } from "@/components/booking-list";
import { BottomNavigation } from "@/components/bottom-navigation";
import { CartManager } from "@/components/cart-manager";
import { ExploreMapExperience } from "@/components/explore-map-experience";
import AccountPage from "@/app/account/page";
import ToolsPage from "@/app/professional/tools/page";
import AdminPage from "@/app/admin/page";
import {
  account,
  professional,
  summary,
  dashboard,
  booking,
  services,
  profile,
  products,
  orders,
  cart,
  details,
} from "./data";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
localStorage.setItem("glohaus-theme", document.documentElement.dataset.theme);
// These fixtures never contact production APIs or move money.
window.fetch = async (url, init) => {
  sessionStorage.setItem(
    "mobile-requests",
    JSON.stringify([
      ...JSON.parse(sessionStorage.getItem("mobile-requests") || "[]"),
      { url: String(url), method: init?.method ?? "GET", body: init?.body },
    ]),
  );
  if (params.get("journey") === "1") {
    if (String(url).includes("/availability?")) {
      const date = new URL(String(url), location.origin).searchParams.get(
        "date",
      );
      return Response.json({
        slots: [`${date}T12:00:00Z`, `${date}T14:00:00Z`],
      });
    }
    if (String(url) === "/api/v1/professional/connect")
      return Response.json({
        started: true,
        due: ["individual verification document"],
        overdue: [],
        pending: [],
        deadline: null,
      });
    if (String(url) === "/api/v1/bookings")
      return Response.json(
        {
          url: `/account/bookings/${booking.id}?journey=1`,
          bookingId: booking.id,
        },
        { status: 201 },
      );
    return Response.json({ saved: true, id: professional.id }, { status: 201 });
  }
  return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
};
async function start() {
  let content: React.ReactNode;
  const path = location.pathname;
  if (path === "/")
    content = (
      <>
        <DesktopCustomerHome
          signedIn
          displayName={account.displayName}
          professionals={[professional]}
          summary={summary}
        />
        <MobileCustomerHome
          signedIn
          professionals={[professional]}
          summary={summary}
        />
      </>
    );
  else if (path === "/admin") content = await AdminPage();
  else if (path === "/account") content = await AccountPage();
  else if (path === "/professional/tools") content = await ToolsPage();
  else if (path === "/professional")
    content = (
      <ProfessionalDashboard
        account={account}
        data={dashboard}
        setup={{
          profile: true,
          services: true,
          availability: false,
          portfolio: false,
          published: true,
        }}
      />
    );
  else if (path === "/cart")
    content = (
      <>
        <PublicHeader signedIn />
        <main id="main" className="catalog-page cart-page">
          <CartManager initialCart={cart} />
        </main>
        <BottomNavigation signedIn active="shop" />
      </>
    );
  else if (path === "/p/fictional-studio")
    content = (
      <>
        <PublicHeader signedIn />
        <ProfessionalProfile
          professional={professional}
          details={details}
          services={services}
          assets={[]}
          reviews={[
            {
              id: "review",
              rating: 5,
              body: "A fictional review to check the layout.",
              public_name: "Alex",
            },
          ]}
          hours={[{ weekday: 1, startMinute: 540, endMinute: 1020 }]}
          rating={4.9}
          reviewCount={24}
          follow={{ following: false, followerCount: 24, signedIn: true }}
          messageHref="/messages"
          bookingFeePence={100}
          presentation={{
            profile_style: "signature",
            portfolio_layout: "grid",
            service_style: "cards",
          }}
          booking={
            <BookingPicker
              services={services}
              ready
              returnPath="/p/fictional-studio"
              professionalName={professional.business_name}
              bookingFeePence={100}
              verificationStatus="verified"
            />
          }
        />
      </>
    );
  else if (path === "/explore")
    content = (
      <>
        <PublicHeader signedIn />
        <main id="main">
          <ExploreMapExperience
            professionals={[professional]}
            query={params.get("q") || ""}
            filters={discoveryOptions(Object.fromEntries(params)).filters}
          />
        </main>
        <BottomNavigation signedIn active="search" />
      </>
    );
  else if (path === "/customer/review")
    content = (
      <main id="main" className="customer-account-page">
        <ReviewForm bookingId={booking.id} />
      </main>
    );
  else {
    const body = path.endsWith("/portfolio") ? (
      <PortfolioEditor
        assets={[
          {
            id: professional.id,
            alt_text: "Signature manicure",
            publication_status: "draft",
            media_type: "image",
            mime_type: "image/png",
          },
        ]}
      />
    ) : path.endsWith("/availability") ? (
      <AvailabilityCalendar
        rules={[{ weekday: 1, startMinute: 540, endMinute: 1020 }]}
        blocks={[]}
        today="2026-10-12"
      />
    ) : path.endsWith("/profile") ? (
      <>
        <ProfilePhotoEditor photo={null} published />
        <VerificationRequirements />
        <ProfessionalEditor
          initial={profile}
          services={services}
          marketplaceCategories={[{ name: "Nails", slug: "nails" }]}
          section="profile"
        />
      </>
    ) : path.endsWith("/services") ? (
      <ProfessionalEditor
        initial={profile}
        services={services}
        marketplaceCategories={[{ name: "Nails", slug: "nails" }]}
        section="services"
        verificationStatus="verified"
      />
    ) : path.endsWith("/products") ? (
      <ProfessionalProductsManager
        initialProducts={products}
        assets={[]}
        accessStatus="verified"
      />
    ) : path.endsWith("/orders") ? (
      <ProductOrderList initialOrders={orders} mode="professional" />
    ) : (
      <BookingList bookings={[booking]} professional />
    );
    content = (
      <div className="pro-app">
        <ProfessionalNavigation
          active="more"
          displayName={account.displayName}
        />
        <main id="main" className="pro-main pro-management-page">
          <h1>{path.split("/").at(-1)}</h1>
          {body}
        </main>
      </div>
    );
  }
  createRoot(document.getElementById("root")!).render(
    <>
      {content}
      <SiteFooter />
      <ThemeToggle />
    </>,
  );
}
void start();
