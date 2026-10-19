import Image from "next/image";
import Link from "next/link";
import type { ExampleListing } from "@/modules/professionals/example-visibility";

export function ExampleProfessionalListings({
  examples,
}: {
  examples: ExampleListing[];
}) {
  if (!examples.length) return null;
  return (
    <section
      className="example-listings"
      aria-label="Example professional profiles"
    >
      <h3>Explore example profiles</h3>
      <p>
        Fictional businesses showing what your GLOHAUS profile can look like.
        These examples cannot take appointments, messages or payments.
      </p>
      <div className="map-pro-list">
        {examples.map((p) => (
          <article
            key={p.slug}
            className="discovery-card example-discovery-card"
          >
            <div className="discovery-card-photo">
              <Link
                href={`/profile-examples/${p.slug}`}
                aria-label={`Preview ${p.name}`}
              >
                <Image
                  src={p.image}
                  alt={`${p.name} example brand illustration`}
                  fill
                  sizes="(max-width:600px) 100vw, 190px"
                  unoptimized
                />
              </Link>
            </div>
            <div className="discovery-card-copy">
              <small className="eyebrow">EXAMPLE · FICTIONAL BUSINESS</small>
              <Link
                className="map-pro-name"
                href={`/profile-examples/${p.slug}`}
              >
                {p.name}
              </Link>
              <p>
                {p.category} · {p.specialities}
              </p>
              <p>{p.bio}</p>
              <Link className="text-link" href={`/profile-examples/${p.slug}`}>
                Preview profile →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
