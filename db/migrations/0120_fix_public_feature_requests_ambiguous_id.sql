create or replace function beauty.public_feature_requests()
returns table(
  id uuid,
  audience text,
  title text,
  description text,
  status text,
  vote_count integer,
  my_vote boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  uid uuid;
begin
  select u.id into uid
  from beauty.users u
  where u.auth_id=beauty.auth_id();

  return query
  select
    f.id,
    f.audience,
    f.title,
    f.description,
    f.status,
    count(v.user_id)::integer,
    coalesce(bool_or(v.user_id=uid),false)
  from beauty.feature_requests f
  left join beauty.feature_votes v on v.feature_id=f.id
  where f.active
  group by f.id,f.audience,f.title,f.description,f.status,f.created_at
  order by count(v.user_id) desc,f.created_at desc;
end;
$function$;
