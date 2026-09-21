export function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_APP_URL,
  );
}
export function accountsConfigured(): boolean {
  return authConfigured() && Boolean(process.env.DATABASE_URL);
}
