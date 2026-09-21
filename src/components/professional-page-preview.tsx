import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Heart,
  MapPin,
  Star,
} from "lucide-react";

const work = [
  {
    image:
      "https://images.unsplash.com/photo-1621095271433-2e4ec715c704?auto=format&fit=crop&w=1000&q=85",
    alt: "Editorial example of textured hair styling",
  },
  {
    image:
      "https://images.unsplash.com/photo-1571290274554-6a2eaa771e5f?auto=format&fit=crop&w=1000&q=85",
    alt: "Editorial example of a detailed manicure",
  },
  {
    image:
      "https://images.unsplash.com/photo-1643166224998-aeea3c5172f2?auto=format&fit=crop&w=1000&q=85",
    alt: "Editorial example of natural hair texture",
  },
];

const services = [
  ["Signature silk press", "90 minutes", "£65"],
  ["Knotless braids", "180 minutes", "£95"],
  ["Natural curl treatment", "75 minutes", "£55"],
] as const;

export function ProfessionalPagePreview() {
  return (
    <main id="main" className="professional-preview">
      <section className="professional-preview-hero">
        <div>
          <p className="eyebrow">GLOHAUS PRO · PAGE PREVIEW</p>
          <h1>
            A professional page that feels <em>like their own.</em>
          </h1>
          <p>
            This is an example storefront. Professionals choose their own
            business details, work, services, hours and public booking rules.
          </p>
          <div className="professional-preview-actions">
            <Link className="button" href="/sign-up?intent=professional">
              Create a GLOHAUS PRO account <ArrowUpRight size={18} />
            </Link>
            <Link className="text-link" href="/">
              Explore GLOHAUS
            </Link>
          </div>
        </div>
        <aside className="professional-preview-checklist">
          <span className="eyebrow">WHAT THEY CONTROL</span>
          {[
            "Business profile and public contact choices",
            "Portfolio, posts and social links",
            "Services, prices, deposits and availability",
            "Whether the page is published or hidden",
          ].map((item) => (
            <p key={item}>
              <Check size={16} aria-hidden /> {item}
            </p>
          ))}
        </aside>
      </section>

      <section className="professional-preview-stage" aria-label="Example professional page">
        <div className="professional-preview-banner">
          <span>EXAMPLE ONLY · NOT A LIVE OR BOOKABLE PROFESSIONAL</span>
          <span>GLOHAUS PRO</span>
        </div>
        <header className="professional-preview-profile">
          <div className="professional-preview-avatar">A</div>
          <div>
            <p className="eyebrow">HAIR · INDEPENDENT PROFESSIONAL</p>
            <h2>Amina Studio</h2>
            <p className="professional-preview-meta">
              <MapPin size={16} aria-hidden /> South London, England
              <span /> <Star size={16} fill="currentColor" aria-hidden /> 4.9
              <small>· 128 verified reviews</small>
            </p>
            <p className="professional-preview-bio">
              Healthy hair, soft finishes and appointments that feel like time
              for you. Specialising in textured hair care and protective
              styling.
            </p>
          </div>
          <a className="button professional-preview-book" href="#example-booking">
            <CalendarDays size={18} aria-hidden /> Book an appointment
          </a>
        </header>

        <nav className="professional-preview-nav" aria-label="Example profile sections">
          <a href="#example-work">Portfolio</a>
          <a href="#example-services">Services</a>
          <a href="#example-reviews">Reviews</a>
          <a href="#example-booking">Availability</a>
        </nav>

        <div className="professional-preview-grid">
          <div className="professional-preview-main">
            <section id="example-work" className="professional-preview-section">
              <div className="professional-preview-section-title">
                <div>
                  <p className="eyebrow">THE WORK SPEAKS</p>
                  <h2>Portfolio, front and centre.</h2>
                </div>
                <span className="professional-preview-chip">
                  <Heart size={15} aria-hidden /> 2.4k saves
                </span>
              </div>
              <div className="professional-preview-gallery">
                {work.map((item) => (
                  <Image
                    key={item.image}
                    src={item.image}
                    alt={item.alt}
                    width={640}
                    height={760}
                    unoptimized
                  />
                ))}
              </div>
            </section>

            <section id="example-services" className="professional-preview-section">
              <p className="eyebrow">SERVICES & PRICES</p>
              <h2>A clear menu for clients.</h2>
              <div className="professional-preview-services">
                {services.map(([name, duration, price]) => (
                  <article key={name}>
                    <div>
                      <h3>{name}</h3>
                      <p>
                        <Clock3 size={15} aria-hidden /> {duration}
                      </p>
                    </div>
                    <strong>{price}</strong>
                    <a href="#example-booking" aria-label={`Check availability for ${name}`}>
                      <ArrowUpRight size={18} aria-hidden />
                    </a>
                  </article>
                ))}
              </div>
            </section>

            <section id="example-reviews" className="professional-preview-section professional-preview-review">
              <p className="eyebrow">VERIFIED REVIEWS</p>
              <h2>Kind words from real appointments.</h2>
              <blockquote>
                “My appointment felt calm from start to finish. I left loving
                my hair and knowing exactly how to care for it at home.”
                <footer>— GLOHAUS customer · Verified appointment</footer>
              </blockquote>
            </section>
          </div>

          <aside id="example-booking" className="professional-preview-booking">
            <p className="eyebrow">AVAILABILITY</p>
            <h2>Simple to browse. Easy to book.</h2>
            <p>
              A client selects a service, chooses an available time, then
              continues securely when bookings are active.
            </p>
            <div className="professional-preview-date-row">
              <span>Mon<br /><b>22</b></span>
              <span className="selected">Tue<br /><b>23</b></span>
              <span>Wed<br /><b>24</b></span>
              <span>Thu<br /><b>25</b></span>
            </div>
            <div className="professional-preview-time-grid">
              <span>10:00</span><span className="selected">11:30</span><span>14:00</span><span>16:30</span>
            </div>
            <button disabled className="button full-width">
              Example booking flow
            </button>
            <small>This preview cannot create an appointment.</small>
          </aside>
        </div>
      </section>
    </main>
  );
}
