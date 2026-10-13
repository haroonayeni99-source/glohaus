import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ProfessionalVerificationBadges } from "@/components/professional-verification-badges";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount } from "@/modules/accounts/repository";
import {
  publicProfile,
  updateProfile,
} from "@/modules/professionals/repository";
const db = await createTestDatabase();
let proId: string;
beforeAll(async () => {
  await applyTestMigrations(db);
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query(
      "SELECT set_config('app.auth_id','badge-professional',true)",
    );
    const account = await enrolAccount(
      tx,
      {
        authId: "badge-professional",
        email: "badge@example.test",
        displayName: "Badge studio",
        secondFactorAge: null,
      },
      "professional",
    );
    proId = account.professionalId!;
    await updateProfile(tx, proId, {
      slug: "badge-studio",
      businessName: "Badge Studio",
      bio: "Beauty studio for isolated verification checks.",
      city: "London",
      category: "Nails",
      publicationStatus: "published",
    });
  });
  await db.query("INSERT INTO beauty.professional_trust_status(professional_id) VALUES($1) ON CONFLICT DO NOTHING", [proId]);
});
afterAll(() => db.close());
async function publicBadges() {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id','',true)");
    return (await publicProfile(tx, "badge-studio"))!.professional;
  });
}
it("exposes approved tiers publicly without changing the underlying access rules", async () => {
  await db.query(
    "UPDATE beauty.professional_trust_status SET verification_status='verified', business_verified=true, professional_verified=false WHERE professional_id=$1",
    [proId],
  );
  const result = await publicBadges();
  expect(result).toMatchObject({
    verification_status: "verified",
    identity_verified: true,
    business_verified: true,
    professional_verified: false,
  });
  const html = renderToStaticMarkup(
    React.createElement(ProfessionalVerificationBadges, {
      professional: result,
    }),
  );
  expect(html).toContain("Identity verified");
  expect(html).toContain("Business verified");
  expect(html).not.toContain(">Professional verified<");
  expect(result).not.toHaveProperty("auth_id");
  await db.query(
    "UPDATE beauty.professional_trust_status SET professional_verified=true WHERE professional_id=$1",
    [proId],
  );
  const all = renderToStaticMarkup(
    React.createElement(ProfessionalVerificationBadges, {
      professional: await publicBadges(),
    }),
  );
  expect(all).toContain(">Professional verified<");
  await db.query(
    "UPDATE beauty.professional_trust_status SET standing_status='restricted' WHERE professional_id=$1",
    [proId],
  );
  expect(await publicBadges()).toMatchObject({
    verification_status: "restricted",
    identity_verified: false,
    business_verified: false,
    professional_verified: false,
  });
});
it.each(["unverified", "pending", "restricted"] as const)(
  "never shows approved crests for %s profiles even with stale flags",
  (status) => {
    const html = renderToStaticMarkup(
      React.createElement(ProfessionalVerificationBadges, {
        professional: {
          verification_status: status,
          identity_verified: true,
          business_verified: true,
          professional_verified: true,
        },
      }),
    );
    expect(html).not.toContain("verification-crest");
  },
);
