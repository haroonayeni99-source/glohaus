# GLOHAUS owner administration

The owner is an application role in `beauty.user_roles`, separate from Supabase Auth. It is never supplied by the browser, query string, cookies or user metadata.

## Initial owner setup

1. Create and verify the intended GLOHAUS account, then enrol it as a customer or professional so that a matching row exists in `beauty.users`.
2. In the Supabase dashboard, open **Authentication → Users**, select that account and copy its **User UID**. It is a UUID. Do not share passwords, recovery codes or database credentials.
3. On a trusted operator machine, set `MIGRATION_DATABASE_URL` to the privileged migration connection. Keep it out of browser code, source control and public environment variables.
4. Apply the ordered schema changes with `pnpm db:migrate`.
5. Grant the one owner role once:

```sh
pnpm owner:grant <Supabase-user-UUID> "operator reference" "Initial GLOHAUS owner"
```

The command locks the owner role, requires an active enrolled account, refuses a second owner and writes an audit event. The owner must complete a recent second-factor challenge before entering `/admin`.

## Access model

- `owner` has the highest administrative access and may delegate or remove `staff` and `admin` roles. It cannot be granted or removed from the web console.
- `admin` can perform the existing account, booking, review, content, report and label operations after the server verifies their identity, database role and recent second factor.
- `staff` begins with no administrative access. The owner can assign only specific permission keys; future staff areas must check those keys server-side and in the database before exposing data.
- `professional` and `customer` access remains scoped to records they own or participate in.

All owner delegation, report decisions and existing administrative decisions are recorded in the protected audit log. The application connection has no direct privilege to modify privileged roles or audit entries.
