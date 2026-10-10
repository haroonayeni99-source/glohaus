import type { Account } from "@/modules/accounts/domain";
import type { ProfessionalDashboard } from "@/modules/dashboard/repository";
import type { BookingRecord } from "@/modules/bookings/repository";
import type {
  PublicProfessional,
  ProfileDetails,
  Service,
  ProfileInput,
} from "@/modules/professionals/domain";
import type { CustomerHomeSummary } from "@/modules/home/repository";
import type {
  CartOverview,
  ProfessionalProduct,
  ProductOrder,
} from "@/modules/shop/domain";
const id = "11111111-1111-4111-8111-111111111111";
const date = new Date("2026-10-12T12:00:00Z");
export const account: Account = {
  id,
  authId: "fictional-mobile",
  displayName: "Maya Professional with a long business name",
  email: "mobile@example.test",
  status: "active",
  roles: ["customer", "professional"],
  professionalId: id,
};
export const professional: PublicProfessional = {
  id,
  slug: "fictional-studio",
  business_name: "Maya Professional Beauty Studio with a long name",
  bio: "Thoughtful beauty services and a calm space for you.",
  city: "London",
  category: "Nails",
  verification_status: "verified",
  rating: 4.9,
  review_count: 24,
  from_price_pence: 4500,
  available_today: true,
  popular_services: ["Signature manicure", "Gel nail extensions"],
};
export const services: Service[] = [
  {
    id,
    professional_id: id,
    name: "Signature manicure with detailed nail art and extensions",
    description: "Preparation, shaping and your choice of colour.",
    duration_minutes: 60,
    price_pence: 4500,
    deposit_pence: 0,
    active: true,
    category: "Nails",
  },
];
export const details: ProfileDetails = {
  id,
  business_description: "A quiet space for nail artistry and detailed designs.",
  location_details: "Peckham, London",
  contact_preference: "email",
  contact_email: "fictional-studio@example.test",
  contact_phone: "",
  instagram_url: "https://example.test/studio",
  tiktok_url: "",
  website_url: "https://example.test/studio",
  photo_id: null,
  photo_alt: null,
};
export const profile: ProfileInput = {
  slug: professional.slug,
  businessName: professional.business_name,
  bio: professional.bio,
  city: "London",
  category: "Nails",
  publicationStatus: "published",
  businessDescription: details.business_description,
  locationDetails: details.location_details,
  contactPreference: "email",
  contactEmail: details.contact_email,
  contactPhone: "",
  instagramUrl: details.instagram_url,
  tiktokUrl: "",
  websiteUrl: details.website_url,
};
export const booking: BookingRecord = {
  id,
  service_name: services[0].name,
  customer_name: "Alex Customer with a long name",
  professional_name: professional.business_name,
  starts_at: date,
  ends_at: new Date("2026-10-12T13:00:00Z"),
  price_pence: 4500,
  deposit_pence: 0,
  status: "confirmed",
  cancellation_reason: null,
  captured_pence: 4500,
  refunded_pence: 0,
  payment_status: "captured",
  completed_at: null,
  has_ended: false,
  cancellable: true,
  location_window_open: false,
};
export const summary: CustomerHomeSummary = {
  nextBooking: {
    id,
    serviceName: booking.service_name,
    professionalName: professional.business_name,
    startsAt: date,
    status: "confirmed",
  },
  messages: {
    conversationCount: 1,
    unreadCount: 3,
    latestProfessionalName: professional.business_name,
    latestMessageBody: "Thanks for booking. See you soon!",
  },
  payments: { capturedPence: 4500, refundedPence: 0, pendingRefundPence: 0 },
};
export const dashboard: ProfessionalDashboard = {
  profile: {
    businessName: professional.business_name,
    publicationStatus: "published",
    slug: professional.slug,
  },
  stats: {
    newBookings: 1,
    upcomingAppointments: 1,
    activeServices: 1,
    reviewCount: 24,
    rating: 4.9,
    followerCount: 25,
    completedBookings: 8,
    unreadMessages: 3,
    openOrders: 1,
  },
  upcoming: [booking],
  wallet: null,
  live: null,
  access: null,
  referral: {
    code: "GLO-ABCDEFGHIJKLMN",
    totalReferrals: 5,
    qualifiedReferrals: 2,
    lastReferralAt: null,
  },
  plan: "starter",
  insights: {
    completedServiceValuePence: 45000,
    completedBookings: 10,
    repeatClients: 2,
    averageServiceValuePence: 4500,
    cancellationRate: 0,
    busiestWeekday: "Saturday",
    quietestWeekday: "Monday",
  },
};
export const products: ProfessionalProduct[] = [
  {
    id,
    professional_id: id,
    image_asset_id: null,
    name: "Professional nail care kit with detailed accessories",
    description: "A useful care kit for salon-quality nails.",
    sku: "LONG-SKU-12345678901234567890",
    price_pence: 1800,
    stock_quantity: 10,
    publication_status: "published",
    created_at: date,
    updated_at: date,
  },
];
export const cart: CartOverview = {
  items: [
    {
      productId: id,
      professionalId: id,
      professionalName: professional.business_name,
      professionalSlug: professional.slug,
      imageAssetId: null,
      name: products[0].name,
      pricePence: 1800,
      quantity: 1,
      available: true,
      inStockForQuantity: true,
    },
  ],
  totalPence: 1800,
  itemCount: 1,
};
export const orders: ProductOrder[] = [
  {
    id,
    professionalId: id,
    professionalName: professional.business_name,
    status: "paid",
    subtotalPence: 1800,
    deliveryPence: 0,
    totalPence: 1800,
    recipientName: "Alex Fictional Customer",
    addressLine1: "10 Fictional Street",
    addressLine2: null,
    city: "London",
    postcode: "SE15 1AA",
    countryCode: "GB",
    trackingCarrier: null,
    trackingNumber: null,
    shippedAt: null,
    deliveredAt: null,
    createdAt: date,
    items: [
      {
        id,
        productId: id,
        productName: products[0].name,
        imageAssetId: null,
        unitPricePence: 1800,
        quantity: 1,
        lineTotalPence: 1800,
      },
    ],
  },
];
