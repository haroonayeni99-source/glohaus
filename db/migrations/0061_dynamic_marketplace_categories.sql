alter table beauty.professional_profiles
  drop constraint if exists professional_profiles_category_check;

alter table beauty.professional_profiles
  add constraint professional_profiles_category_length
  check (char_length(trim(category)) between 2 and 60);

alter table beauty.services
  add column if not exists category text;

update beauty.services s
set category = p.category
from beauty.professional_profiles p
where p.id=s.professional_id
  and (s.category is null or btrim(s.category)='');

alter table beauty.services
  alter column category set default 'Hair',
  alter column category set not null;

alter table beauty.services
  drop constraint if exists services_category_length;

alter table beauty.services
  add constraint services_category_length
  check (char_length(trim(category)) between 2 and 60);

drop view if exists beauty.public_services;

create view beauty.public_services
with (security_invoker=true)
as
select
  s.id,
  s.professional_id,
  s.name,
  s.description,
  s.duration_minutes,
  s.price_pence,
  s.deposit_pence,
  a.id as asset_id,
  a.alt_text as image_alt,
  s.category
from beauty.services s
left join beauty.public_portfolio a
  on a.id=s.asset_id and a.professional_id=s.professional_id
where s.active;

grant select on beauty.public_services to beauty_app;
