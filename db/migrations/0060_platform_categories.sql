create table if not exists beauty.platform_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_categories_name_len check (char_length(trim(name)) between 2 and 60),
  constraint platform_categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

insert into beauty.platform_categories(name,slug,sort_order)
values
 ('Hair','hair',10),
 ('Nails','nails',20),
 ('Makeup','makeup',30),
 ('Lashes & brows','lashes-brows',40),
 ('Skin','skin',50)
on conflict (slug) do nothing;

grant select on beauty.platform_categories to beauty_app;

create or replace function beauty.admin_upsert_category(
  target uuid,
  new_name text,
  new_slug text,
  next_active boolean,
  next_sort_order integer,
  decision_reason text
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  actor uuid;
  category_id uuid;
  old_row beauty.platform_categories%rowtype;
begin
  actor := beauty.require_admin();

  if new_name is null
     or char_length(trim(new_name)) not between 2 and 60
     or new_slug is null
     or trim(new_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or next_active is null
     or next_sort_order is null
     or next_sort_order < 0
     or next_sort_order > 10000
     or decision_reason is null
     or char_length(trim(decision_reason)) not between 5 and 500 then
    raise exception 'INVALID_REQUEST' using errcode='22023';
  end if;

  if target is null then
    insert into beauty.platform_categories(name,slug,active,sort_order)
    values(trim(new_name),trim(new_slug),next_active,next_sort_order)
    returning id into category_id;

    insert into beauty.admin_audit_logs(actor_reference,target_user_id,action,reason)
    values(actor::text,actor,'category.created',trim(decision_reason)||' ['||trim(new_name)||']');
  else
    select * into old_row
    from beauty.platform_categories
    where id=target
    for update;

    if not found then
      raise exception 'NOT_FOUND' using errcode='22023';
    end if;

    update beauty.platform_categories
    set name=trim(new_name),
        slug=trim(new_slug),
        active=next_active,
        sort_order=next_sort_order,
        updated_at=now()
    where id=target;

    category_id := target;

    insert into beauty.admin_audit_logs(actor_reference,target_user_id,action,reason)
    values(
      actor::text,
      actor,
      'category.updated',
      trim(decision_reason)||' ['||old_row.name||' -> '||trim(new_name)||']'
    );
  end if;

  return category_id;
end
$$;

revoke all on function beauty.admin_upsert_category(uuid,text,text,boolean,integer,text) from public;
grant execute on function beauty.admin_upsert_category(uuid,text,text,boolean,integer,text) to beauty_app;
