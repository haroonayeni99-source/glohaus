-- Recovered table DDL from Supabase migration history, 2026-10-10.
-- No settings values or public-site control functions are changed.
create table if not exists beauty.platform_runtime_settings (
  singleton boolean primary key default true check (singleton),
  public_site_open boolean not null default true,
  closure_message text not null default 'GLOHAUS is temporarily unavailable while we make improvements.',
  updated_at timestamptz not null default now(),
  updated_by uuid null references beauty.users(id)
);

alter table beauty.platform_runtime_settings enable row level security;
