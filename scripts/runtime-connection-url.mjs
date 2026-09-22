const password = process.env.GLOHAUS_RUNTIME_DATABASE_PASSWORD;
const host = process.env.GLOHAUS_POOLER_HOST;
const ref = process.env.GLOHAUS_SUPABASE_PROJECT_REF;
const port = process.env.GLOHAUS_POOLER_PORT ?? "6543";

if (!password || !host || !ref) {
  console.error(
    "Set GLOHAUS_RUNTIME_DATABASE_PASSWORD, GLOHAUS_POOLER_HOST and GLOHAUS_SUPABASE_PROJECT_REF.",
  );
  process.exit(1);
}

const url = new URL(`postgresql://glohaus_runtime.${ref}@${host}:${port}/postgres`);
url.password = password;
url.searchParams.set("sslmode", "require");
process.stdout.write(url.toString());
