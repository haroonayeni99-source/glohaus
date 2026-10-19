import type { ProfilePresentation } from "@/components/professional-profile";
import type { ProfileDetails, PublicProfessional, Service } from "./domain";
import type { Rule } from "@/modules/availability/domain";

type Style = ProfilePresentation["presentation"];
type MenuItem = [
  name: string,
  price: number,
  minutes: number,
  description: string,
  speciality?: number,
];
type ExampleSeed = {
  slug: string;
  name: string;
  category: string;
  area: string;
  initials: string;
  colours: [string, string];
  bio: string;
  about: string;
  specialities: string[];
  style: Style;
  days: number[];
  opens: number;
  closes: number;
  mobile?: boolean;
  photo?: string;
  menu: MenuItem[];
  policies: [string, string][];
};

// Fictional presentation data only. These IDs are deliberately not account UUIDs.
// No Auth users, bookable services, followers, ratings or verification are created.
export const profileExampleSeeds: ExampleSeed[] = [
  {
    slug: "root-and-ritual",
    name: "Root & Ritual",
    category: "Hair",
    area: "Peckham",
    initials: "R&R",
    colours: ["#28483c", "#f3e6d4"],
    bio: "Natural texture, considered care and protective styling. A calm studio experience built around your hair goals.",
    about:
      "Your appointment begins with a conversation about your routine, preferred finish and the time you have for maintenance. This example combines natural hair care with braiding, a detailed service menu and a friendly introduction. Professionals can use this space to explain their approach, preparation instructions and what makes their business personal.",
    specialities: ["Natural Hair", "Braiding", "Locs"],
    photo: "hair-v2.webp",
    style: {
      profile_style: "signature",
      portfolio_layout: "grid",
      service_style: "cards",
    },
    days: [2, 3, 4, 5, 6],
    opens: 600,
    closes: 1140,
    menu: [
      [
        "Wash, care & twist finish",
        5500,
        90,
        "A wash, conditioning step and twist finish. Add your texture and preferred result to your appointment notes.",
      ],
      [
        "Knotless braids",
        12000,
        240,
        "A protective-style example with size and length options. Preparation and hair requirements belong in the service description.",
        1,
      ],
      [
        "Loc care consultation",
        1500,
        30,
        "Time to discuss your loc-care routine and plan a future maintenance appointment.",
        2,
      ],
    ],
    policies: [
      [
        "Before your visit",
        "Read the selected service preparation notes and share your styling preferences.",
      ],
      [
        "Changes",
        "Contact the professional at least 24 hours before your appointment to request a change.",
      ],
      [
        "Arrival",
        "A 10-minute grace period is shown in this example. Contact your professional if delayed.",
      ],
    ],
  },
  {
    slug: "crown-canvas",
    name: "Crown Canvas",
    category: "Hair",
    area: "Stratford",
    initials: "CC",
    colours: ["#352346", "#f1dbbe"],
    bio: "Wigs and extensions with a polished, personal finish. Explore an editorial profile with a clear service menu.",
    about:
      "From discussing your preferred parting to planning how you will care for your style, thoughtful details make a profile useful. This fictional business uses a longer introduction, grouped specialities and a clean menu to explain the experience before a customer selects a service. Upload your own logo and portfolio to make the page recognisably yours.",
    specialities: ["Wigs", "Extensions"],
    photo: "hair-v2.webp",
    mobile: true,
    style: {
      profile_style: "editorial",
      portfolio_layout: "feature",
      service_style: "clean",
    },
    days: [1, 3, 4, 5, 6],
    opens: 660,
    closes: 1200,
    menu: [
      [
        "Wig fitting & styling",
        8500,
        120,
        "A fitting and finish example. Explain any unit preparation or drop-off requirements here.",
      ],
      [
        "Wig refresh",
        4500,
        75,
        "A refresh and styling example for an existing unit.",
      ],
      [
        "Extension consultation",
        2000,
        30,
        "Discuss your desired finish, maintenance and appointment requirements.",
        1,
      ],
    ],
    policies: [
      [
        "Preparation",
        "Agree any unit drop-off and preparation requirements before the appointment.",
      ],
      [
        "Mobile visits",
        "Travel area and any applicable travel cost must be agreed before booking.",
      ],
      [
        "Changes",
        "This example asks for 48 hours’ notice when requesting an appointment change.",
      ],
    ],
  },
  {
    slug: "still-cuts",
    name: "Still Cuts",
    category: "Hair",
    area: "Brixton",
    initials: "SC",
    colours: ["#3f3028", "#e9d5ae"],
    bio: "Considered cuts, clean finishing and an unhurried chair. A straightforward menu for your next barber visit.",
    about:
      "A good cut starts with a conversation about shape, routine and the finish you want. Choose a haircut, reserve time for a beard tidy or combine both in one visit. This fictional barber profile uses a minimal layout and a simple menu to make those choices easy to find.",
    specialities: ["Barbering"],
    photo: "barber-v2.webp",
    style: {
      profile_style: "minimal",
      portfolio_layout: "feature",
      service_style: "clean",
    },
    days: [2, 3, 5, 6, 0],
    opens: 540,
    closes: 1080,
    menu: [
      [
        "Haircut & finish",
        3000,
        45,
        "A haircut appointment with time to discuss your preferred shape and finish.",
      ],
      ["Beard tidy", 1500, 30, "A focused beard-shaping appointment example."],
      [
        "Haircut & beard tidy",
        4000,
        60,
        "Combine a haircut and beard tidy in one appointment.",
      ],
    ],
    policies: [
      [
        "Consultation",
        "Discuss your preferred length and finish before the appointment begins.",
      ],
      [
        "Appointment notes",
        "Share your current routine and any styling preferences before the visit.",
      ],
      [
        "Arrival",
        "Contact the professional if you expect to arrive more than 10 minutes late.",
      ],
    ],
  },
  {
    slug: "gloss-house",
    name: "Gloss House",
    category: "Nails",
    area: "Dalston",
    initials: "GH",
    colours: ["#623b4c", "#f7e1e8"],
    bio: "Clean finishes, expressive detail and a menu that makes nail-art choices easy to understand.",
    about:
      "Show the difference between a simple finish and a more detailed set. This example combines gel services with nail art, a featured portfolio layout and separate add-on ideas. Your profile can explain design preparation, removal requirements and how customers should choose the right amount of appointment time.",
    specialities: ["Gel Nails", "Nail Art"],
    photo: "nails-v2.webp",
    style: {
      profile_style: "editorial",
      portfolio_layout: "feature",
      service_style: "cards",
    },
    days: [2, 3, 4, 5, 6],
    opens: 600,
    closes: 1140,
    menu: [
      [
        "Gel manicure",
        3500,
        60,
        "A single-colour gel manicure example. Removal requirements should be made clear before booking.",
      ],
      [
        "Gel manicure & nail art",
        5000,
        90,
        "A design appointment example with extra time for detail. Share your inspiration in advance.",
        1,
      ],
      [
        "Gel removal",
        1500,
        30,
        "A separate removal service example to help customers reserve enough time.",
      ],
    ],
    policies: [
      [
        "Design preparation",
        "Send any design reference before the appointment so the correct time can be reserved.",
      ],
      [
        "Removal",
        "Select a removal service when required; do not assume it is included.",
      ],
      [
        "Changes",
        "Request changes at least 24 hours before the visit in this example.",
      ],
    ],
  },
  {
    slug: "muse-makeup-room",
    name: "Muse Makeup Room",
    category: "Makeup",
    area: "Croydon",
    initials: "MM",
    colours: ["#774b37", "#fae9d7"],
    bio: "Soft occasion looks and thoughtfully planned bridal appointments, with room for your own style.",
    about:
      "A makeup profile can introduce your approach, describe what a trial is for and explain how group appointments are arranged. This example uses a signature profile and a balanced portfolio grid. Professionals can add their own images, service-specific preparation notes and clear descriptions of what each appointment includes.",
    specialities: ["Occasion Makeup", "Bridal Makeup"],
    mobile: true,
    style: {
      profile_style: "signature",
      portfolio_layout: "grid",
      service_style: "clean",
    },
    days: [4, 5, 6, 0],
    opens: 480,
    closes: 1080,
    menu: [
      [
        "Occasion makeup",
        6500,
        75,
        "Discuss the occasion, your preferred finish and your preparation needs.",
      ],
      [
        "Bridal trial",
        9500,
        120,
        "A trial appointment example with time to discuss and refine a proposed look.",
        1,
      ],
      [
        "Bridal consultation",
        2500,
        45,
        "Plan timing, location and any additional people before selecting a bridal service.",
        1,
      ],
    ],
    policies: [
      [
        "Preparation",
        "Share the occasion, timing and any product sensitivities before the visit.",
      ],
      [
        "Group bookings",
        "Agree the number of people and required timings before booking.",
      ],
      [
        "Mobile visits",
        "Confirm the location and any travel arrangements in advance.",
      ],
    ],
  },
  {
    slug: "lift-lash-studio",
    name: "Lift Lash Studio",
    category: "Lashes",
    area: "Lewisham",
    initials: "LL",
    colours: ["#303e57", "#e7eaf4"],
    bio: "A focused lash menu, careful consultation and a relaxed studio setting. Simple choices, clearly explained.",
    about:
      "This minimal profile keeps the introduction concise while explaining the difference between a new set, maintenance and a lift appointment. Service descriptions are a useful place to set out consultation and preparation requirements. Any patch-test or suitability requirements must be set by the real professional for their actual service.",
    specialities: ["Lash Extensions", "Lash Lift"],
    style: {
      profile_style: "minimal",
      portfolio_layout: "grid",
      service_style: "cards",
    },
    days: [1, 2, 4, 5, 6],
    opens: 600,
    closes: 1080,
    menu: [
      [
        "Classic lash set",
        6000,
        120,
        "A classic set example with time reserved for a discussion about your preferred finish.",
      ],
      [
        "Lash maintenance",
        3500,
        60,
        "A maintenance example. Explain eligibility and timing requirements in your actual service.",
      ],
      [
        "Lash lift consultation",
        1500,
        30,
        "Discuss preparation, suitability and any required preliminary checks.",
        1,
      ],
    ],
    policies: [
      [
        "Consultation",
        "Follow the professional’s actual consultation and patch-test instructions before treatment.",
      ],
      [
        "Maintenance",
        "Check maintenance eligibility before choosing a shorter appointment.",
      ],
      [
        "Arrival",
        "Arrive with preparation completed as described by the professional.",
      ],
    ],
  },
  {
    slug: "frame-brow-room",
    name: "Frame Brow Room",
    category: "Brows",
    area: "Greenwich",
    initials: "FB",
    colours: ["#4d4532", "#efe8d5"],
    bio: "Personal brow appointments with an approachable service menu and clear preparation notes.",
    about:
      "Use your profile to explain how you discuss shape and finish with a customer. This example separates shaping from a lamination consultation, adds straightforward opening hours and uses a card-based service menu. Your own photographs and business description can give customers a clearer sense of your working style.",
    specialities: ["Brow Shaping", "Brow Lamination"],
    style: {
      profile_style: "signature",
      portfolio_layout: "feature",
      service_style: "cards",
    },
    days: [2, 3, 4, 6],
    opens: 570,
    closes: 1050,
    menu: [
      [
        "Brow shape consultation & tidy",
        2000,
        30,
        "Discuss your preferred shape before a tidy-up appointment.",
      ],
      [
        "Brow styling appointment",
        3000,
        45,
        "A longer shaping and styling example with additional consultation time.",
      ],
      [
        "Lamination consultation",
        1500,
        30,
        "Discuss the service and any required checks with the professional.",
        1,
      ],
    ],
    policies: [
      [
        "Preparation",
        "Follow any service-specific preparation instructions from the professional.",
      ],
      [
        "Consultation",
        "Agree the intended finish before the appointment begins.",
      ],
      [
        "Changes",
        "This example requests 24 hours’ notice for appointment changes.",
      ],
    ],
  },
  {
    slug: "soft-skin-studio",
    name: "Soft Skin Studio",
    category: "Skin",
    area: "Islington",
    initials: "SS",
    colours: ["#346064", "#e1eeea"],
    bio: "Unhurried facial appointments, a clear consultation process and a calm introduction to the studio.",
    about:
      "This editorial example gives the business story room to breathe and makes consultation services easy to find. A real professional can explain their approach, appointment preparation and aftercare information here. Avoid promising outcomes: clear descriptions of the experience and the service are more helpful than generic results claims.",
    specialities: ["Facials", "Skin Consultation"],
    style: {
      profile_style: "editorial",
      portfolio_layout: "grid",
      service_style: "clean",
    },
    days: [1, 2, 3, 5, 6],
    opens: 600,
    closes: 1110,
    menu: [
      [
        "Studio facial",
        6500,
        60,
        "A facial appointment example with time for an introductory discussion.",
      ],
      [
        "Extended facial appointment",
        9000,
        90,
        "A longer appointment example. The actual service steps should be listed by your professional.",
      ],
      [
        "Skin consultation",
        2500,
        45,
        "Discuss your routine, preferences and the services the professional offers.",
        1,
      ],
    ],
    policies: [
      [
        "Consultation",
        "Share relevant sensitivities and follow the professional’s preparation instructions.",
      ],
      [
        "New customers",
        "Choose a consultation if you are unsure which service to select.",
      ],
      [
        "Arrival",
        "This example allows time for an introductory conversation at the start of the appointment.",
      ],
    ],
  },
  {
    slug: "smooth-ritual",
    name: "Smooth Ritual",
    category: "Hair Removal",
    area: "Clapham",
    initials: "SR",
    colours: ["#814f4a", "#f4dfd8"],
    bio: "A simple waxing and sugaring menu with a private, respectful appointment experience.",
    about:
      "A clear service menu helps customers select the correct appointment length. This fictional profile groups waxing and sugaring separately, keeps the page minimal and sets out how to ask preparation questions. Real professionals can use their descriptions to explain the areas covered by each service and any service-specific requirements.",
    specialities: ["Waxing", "Sugaring"],
    photo: "waxing-v2.webp",
    style: {
      profile_style: "minimal",
      portfolio_layout: "grid",
      service_style: "clean",
    },
    days: [2, 3, 4, 5, 6],
    opens: 630,
    closes: 1170,
    menu: [
      [
        "Half-leg waxing",
        2500,
        30,
        "A half-leg appointment example. Clearly describe the area covered in your own menu.",
      ],
      [
        "Full-leg waxing",
        4000,
        45,
        "A longer appointment example with preparation instructions supplied by the professional.",
      ],
      [
        "Sugaring consultation",
        1500,
        30,
        "Discuss the area, preparation and available service choices.",
        1,
      ],
    ],
    policies: [
      [
        "Preparation",
        "Read the professional’s actual preparation instructions for your selected service.",
      ],
      [
        "Questions",
        "Ask any preparation or suitability questions before the appointment.",
      ],
      ["Privacy", "This example describes a one-to-one appointment space."],
    ],
  },
  {
    slug: "contour-consult",
    name: "Contour Consult",
    category: "Aesthetics",
    area: "Marylebone",
    initials: "CC",
    colours: ["#4d5366", "#e9e6df"],
    bio: "A consultation-led example showing how to present an aesthetics profile with clear service information.",
    about:
      "This example focuses on consultations and information appointments. It makes no qualification, verification or treatment-result claims. Real professionals must describe their own credentials accurately and publish only services they are eligible to offer. The profile layout gives space for a business introduction, consultation menu, preparation notes and customer policies.",
    specialities: ["Aesthetic Consultations"],
    style: {
      profile_style: "editorial",
      portfolio_layout: "feature",
      service_style: "cards",
    },
    days: [2, 4, 5, 6],
    opens: 600,
    closes: 1080,
    menu: [
      [
        "Initial consultation",
        3500,
        45,
        "An information appointment example to discuss the professional’s services and consultation process.",
      ],
      [
        "Follow-up discussion",
        2000,
        30,
        "A follow-up conversation example. This listing does not offer or recommend a treatment.",
      ],
      [
        "Extended consultation",
        5000,
        60,
        "A longer information appointment example with additional time for questions.",
      ],
    ],
    policies: [
      [
        "Consultation first",
        "This example offers information appointments only, with no treatment or outcome claims.",
      ],
      [
        "Credentials",
        "Real professionals should describe their own qualifications and scope accurately.",
      ],
      [
        "Changes",
        "This example requests 48 hours’ notice for appointment changes.",
      ],
    ],
  },
];

export type ProfileExample = ReturnType<typeof makeExample>;
function makeExample(seed: ExampleSeed) {
  const id = `example-${seed.slug}`;
  const specialities = seed.specialities.map((name, i) => ({
    speciality_id: `${id}-speciality-${i}`,
    name,
    category_name: seed.category,
    is_primary: i === 0,
  }));
  const mediaSources: Record<string, string> = {
    [`${id}-brand`]: `/images/profile-examples/${seed.slug}-brand.svg`,
    [`${id}-portfolio`]: `/images/profile-examples/${seed.slug}-portfolio.svg`,
    [`${id}-detail`]: `/images/profile-examples/${seed.slug}-brand.svg`,
    ...(seed.photo
      ? { [`${id}-inspiration`]: `/images/categories/${seed.photo}` }
      : {}),
  };
  const services: Service[] = seed.menu.map(
    ([name, price, minutes, description, speciality = 0], i) => ({
      id: `${id}-service-${i}`,
      professional_id: id,
      name,
      description,
      price_pence: price,
      deposit_pence:
        i === 2
          ? 0
          : Math.round(price * (seed.category === "Hair" ? 0.3 : 0.2)),
      duration_minutes: minutes,
      speciality_id: specialities[speciality].speciality_id,
      speciality_name: specialities[speciality].name,
      category_name: seed.category,
      asset_id: `${id}-detail`,
      image_alt: `${seed.name} illustrative service card`,
      options:
        i === 0
          ? [
              {
                id: `${id}-extra`,
                service_id: `${id}-service-${i}`,
                kind: "extra",
                name: "Additional consultation time",
                pricePence: 1000,
                durationMinutes: 15,
                active: true,
                sortOrder: 0,
                attributes: {},
              },
            ]
          : [],
    }),
  );
  const professional: PublicProfessional = {
    id,
    slug: seed.slug,
    business_name: seed.name,
    bio: seed.bio,
    city: seed.area,
    category: seed.category,
    travels_to_you: seed.mobile ?? false,
  };
  const details: ProfileDetails = {
    id,
    business_description: seed.about,
    location_details: seed.mobile
      ? "Mobile visits by arrangement · Illustrative service area"
      : "Illustrative area only · No studio address",
    travels_to_you: seed.mobile ?? false,
    contact_preference: "booking",
    contact_email: "",
    contact_phone: "",
    instagram_url: "",
    tiktok_url: "",
    website_url: "",
    photo_id: `${id}-brand`,
    photo_alt: `${seed.name} fictional business logo`,
  };
  const hours: Rule[] = seed.days.map((weekday) => ({
    weekday,
    startMinute: seed.opens,
    endMinute: seed.closes,
  }));
  const assets = [
    `${id}-portfolio`,
    ...(seed.photo ? [`${id}-inspiration`] : []),
    `${id}-detail`,
  ].map((assetId) => ({
    id: assetId,
    alt_text: `${seed.name} illustrative portfolio · Not actual client work`,
    media_type: "image" as const,
    speciality_ids: specialities.map((s) => s.speciality_id),
  }));
  return {
    ...seed,
    professional,
    details,
    services,
    specialities,
    hours,
    assets,
    mediaSources,
    path: `/profile-examples/${seed.slug}`,
  };
}
export const profileExamples = profileExampleSeeds.map(makeExample);
export function findProfileExample(slug: string) {
  return profileExamples.find((p) => p.slug === slug);
}
