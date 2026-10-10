import { readdir } from "node:fs/promises";

// Preserve the checksums of applied repository migrations. Restore missing
// table prerequisites before the first repository migration that uses them.
export async function migrationPlan() {
  const directory = new URL("../db/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  const prerequisites = [
    "20261002113851_owner_auth_visibility_and_professional_commission_overrides.sql",
    "20261004180215_owner_public_site_availability_control.sql",
    "20261005205027_professional_booking_dispute_responses.sql",
  ].map(name => ({ name: `recovered/${name}`, url: new URL(`../db/recovered/${name}`, import.meta.url) }));
  return files.flatMap(name => [
    ...(name === "0093_public_fee_access_and_auth_rpc_boundary.sql" ? prerequisites : []),
    ...(name === "0098_harden_privileged_function_execute_grants.sql" ? [{
      name: "recovered/20261010_professional_referrals.sql",
      url: new URL("../db/recovered/20261010_professional_referrals.sql", import.meta.url),
    }] : []),
    ...(name === "0098_harden_privileged_function_execute_grants.sql" ? [{
      name: "recovered/20261010_privileged_function_prerequisites.sql",
      url: new URL("../db/recovered/20261010_privileged_function_prerequisites.sql", import.meta.url),
    }] : []),
    ...(name === "0115_fix_starter_booking_full_prepayment.sql" ? [{
      name: "recovered/20261010_starter_reservation_definition.sql",
      url: new URL("../db/recovered/20261010_starter_reservation_definition.sql", import.meta.url),
    }] : []),
    { name, url: new URL(name, directory) },
  ]);
}
