import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ProfileExamplesReset } from "@/components/profile-examples-reset";
import { publicViewerSignedIn } from "@/lib/public-viewer";
import { publicExampleVisibility } from "@/modules/professionals/example-visibility-repository";
import { visibleProfileExamples } from "@/modules/professionals/example-visibility";
import "@/components/profile-examples.css";

export const metadata: Metadata = {
  title: "Professional profile examples",
  description:
    "Explore ten fictional GLOHAUS profiles and the existing profile customisation options.",
  robots: { index: false, follow: false },
};

export default async function ProfileExamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; style?: string }>;
}) {
  const params = await searchParams;
  const signedIn = await publicViewerSignedIn();
  const profileExamples = visibleProfileExamples(await publicExampleVisibility());
  const categories = [...new Set(profileExamples.map((p) => p.category))];
  const category = categories.includes(params.category ?? "")
    ? params.category
    : undefined;
  const style = ["signature", "minimal", "editorial"].includes(
    params.style ?? "",
  )
    ? params.style
    : undefined;
  const examples = profileExamples.filter(
    (p) =>
      (!category || p.category === category) &&
      (!style || p.style.profile_style === style),
  );
  return (
    <>
      <PublicHeader signedIn={signedIn} />
      <main id="main" className="profile-examples-page">
        <header className="profile-examples-intro">
          <p className="eyebrow">YOUR BUSINESS. YOUR GLOHAUS.</p>
          <h1>Ten profiles. Plenty of possibilities.</h1>
          <p>
            Explore example storefronts across eight beauty categories. See how
            a logo, introduction, specialities, portfolio, service menu, hours
            and booking policies can work together.
          </p>
          <p className="profile-examples-notice">
            <strong>Fictional example businesses.</strong> Prices, hours and
            policies are illustrative. Images are brand illustrations and
            category inspiration, not these businesses’ client work. Examples
            cannot take bookings, messages or payments.
          </p>
          <p>
            Starter includes the standard storefront. Extra profile styles,
            portfolio layouts and service-menu presentation require an active
            Pro or Premium plan.
          </p>
          <Link href="/professional/plans">
            Compare profile options and plans →
          </Link>
        </header>
        <form
          key={`${category ?? "all"}:${style ?? "all"}`}
          className="profile-examples-filters"
          action="/profile-examples"
        >
          <label>
            Category
            <select
              aria-label="Category"
              name="category"
              defaultValue={category ?? ""}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profile style
            <select
              aria-label="Profile style"
              name="style"
              defaultValue={style ?? ""}
            >
              <option value="">All styles</option>
              <option value="signature">Signature</option>
              <option value="minimal">Minimal</option>
              <option value="editorial">Editorial</option>
            </select>
          </label>
          <button className="button" type="submit">
            Show examples
          </button>
          <ProfileExamplesReset />
        </form>
        <p role="status">
          {examples.length} {examples.length === 1 ? "example" : "examples"}
        </p>
        <section
          className="profile-examples-grid"
          aria-label="Example professional profiles"
        >
          {examples.map((p) => (
            <article className="profile-example-card" key={p.slug}>
              <Link
                className="profile-example-card-image"
                href={p.path}
                tabIndex={-1}
                aria-hidden="true"
              >
                <Image
                  src={p.mediaSources[`${p.professional.id}-portfolio`]}
                  alt=""
                  width={600}
                  height={750}
                  unoptimized
                />
              </Link>
              <div className="profile-example-card-body">
                <p className="eyebrow">
                  {p.category} · {p.area}
                </p>
                <h2>
                  <Link href={p.path}>{p.name}</Link>
                </h2>
                <p>{p.bio}</p>
                <ul aria-label="Presentation choices">
                  <li>{p.style.profile_style} profile</li>
                  <li>
                    {p.style.portfolio_layout === "feature"
                      ? "Featured portfolio"
                      : "Portfolio grid"}
                  </li>
                  <li>
                    {p.style.service_style === "clean"
                      ? "Clean service list"
                      : "Service cards"}
                  </li>
                </ul>
                <Link className="text-link" href={p.path}>
                  Explore example profile →
                </Link>
              </div>
            </article>
          ))}
        </section>
        {!examples.length && (
          <p>
            No example profiles are currently available for this selection.{" "}
            <Link href="/profile-examples">View all ten profiles.</Link>
          </p>
        )}
        <section className="profile-examples-footer">
          <h2>Make your own profile.</h2>
          <p>
            Add your own business details, service menu and portfolio. Your
            account and chosen plan determine the available presentation
            options.
          </p>
          <Link
            className="button"
            href="/sign-up?intent=professional&returnTo=/professional/setup"
          >
            Create a professional account
          </Link>
          <Link href="/professional/profile">Open my profile editor</Link>
        </section>
      </main>
      <BottomNavigation active="search" signedIn={signedIn} />
    </>
  );
}
