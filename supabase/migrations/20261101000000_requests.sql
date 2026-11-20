-- Case storage, operations and outcome totals. Contributor: OpenAI Codex (GPT-6), schema and RPCs.
create schema comforce;
revoke all on schema comforce from public, anon, authenticated;

create table comforce.staff (
  email text primary key
);

create table comforce.requests (
  id uuid primary key default gen_random_uuid(),
  submission_key uuid not null unique,
  reference_no bigint generated always as identity (start with 1001) unique,
  reference text generated always as ('CF-' || reference_no::text) stored,
  created_at timestamptz not null default now(),
  neighborhood text not null check (neighborhood in (
    'Harambee','Riverwest','Bay View','Silver City','Lincoln Park','Walker''s Point','Unknown'
  )),
  description text not null check (length(btrim(description)) between 1 and 800),
  contact_method text not null check (contact_method in ('phone','text','email')),
  contact text not null,
  source text not null check (source in ('web','call','text')),
  check (case when contact_method = 'email' then
    length(contact) <= 254 and contact ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  else
    length(contact) <= 35 and contact ~ '^[0-9+(). /-]+$'
      and length(regexp_replace(contact,'[^0-9]','','g')) between 7 and 15
  end)
);

create table comforce.needs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references comforce.requests,
  service text not null check (service in ('food','transportation','shelter','youth','other')),
  unique (request_id, service),
  status text not null default 'open' check (status in ('open','fulfilled','unmet')),
  owner text check (length(btrim(owner)) between 1 and 80),
  follow_up timestamptz,
  provider text check (length(btrim(provider)) between 1 and 100),
  fulfilled_at timestamptz,
  unmet_reason text check (length(btrim(unmet_reason)) between 1 and 500),
  check ((status = 'fulfilled') = (fulfilled_at is not null)),
  check ((status = 'fulfilled') = (provider is not null)),
  check ((status = 'unmet') = (unmet_reason is not null)),
  check (status = 'open' or follow_up is null)
);

create table comforce.referrals (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references comforce.needs,
  partner text not null check (length(btrim(partner)) between 1 and 100),
  sent_at timestamptz not null default now(),
  declined_at timestamptz check (declined_at >= sent_at)
);
create index on comforce.referrals (need_id, sent_at desc);

create table comforce.history (
  id bigint generated always as identity primary key,
  need_id uuid not null references comforce.needs,
  at timestamptz not null default now(),
  action text not null check (action in ('assign','direct','refer','decline','follow_up','fulfill','unmet')),
  detail text not null
);
create index on comforce.history (need_id, at desc, id desc);

-- Default-deny RLS. Client roles have no base-table privileges; the four RPCs are their entire API.
alter table comforce.requests enable row level security;
alter table comforce.needs enable row level security;
alter table comforce.referrals enable row level security;
alter table comforce.history enable row level security;
alter table comforce.staff enable row level security;
revoke all on all tables in schema comforce from public, anon, authenticated;
revoke all on all sequences in schema comforce from public, anon, authenticated;

create function comforce.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from comforce.staff s
    join auth.users u on u.email = s.email
    where u.id = auth.uid() and u.email = auth.jwt()->>'email' and u.email_confirmed_at is not null
  );
$$;
revoke all on function comforce.is_staff() from public, anon, authenticated;

create function public.submit_request(
  p_key uuid, p_services text[], p_description text, p_neighborhood text,
  p_contact_method text, p_contact text, p_source text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  receipt comforce.requests;
begin
  if p_source in ('call','text') and not comforce.is_staff() then
    raise insufficient_privilege using message = 'Staff sign-in required for a logged call or text.';
  end if;
  if cardinality(p_services) is null or cardinality(p_services) not between 1 and 5
     or cardinality(p_services) <> (select count(distinct value) from unnest(p_services) value)
     or not (p_services <@ array['food','transportation','shelter','youth','other']) then
    raise exception using errcode = '22023', message = 'Choose one or more distinct services.';
  end if;
  insert into comforce.requests(submission_key,description,neighborhood,contact_method,contact,source)
  values(p_key,btrim(p_description),p_neighborhood,p_contact_method,btrim(p_contact),p_source)
  on conflict (submission_key) do nothing returning * into receipt;
  if found then
    insert into comforce.needs(request_id,service)
    select receipt.id, value from unnest(p_services) as value;
  else
    -- A concurrent insert with this key has committed before ON CONFLICT returns.
    select * into strict receipt from comforce.requests where submission_key = p_key;
    if (receipt.description,receipt.neighborhood,receipt.contact_method,receipt.contact,receipt.source)
        is distinct from (btrim(p_description),p_neighborhood,p_contact_method,btrim(p_contact),p_source)
       or exists (select service from comforce.needs where request_id = receipt.id
                  except select unnest(p_services))
       or exists (select unnest(p_services)
                  except select service from comforce.needs where request_id = receipt.id) then
      raise exception using errcode = '22023', message = 'This submission key already has a different request.';
    end if;
  end if;
  return receipt.reference;
end;
$$;

create function public.public_impact()
returns table(month text, neighborhood text, requests_helped bigint, needs_fulfilled bigint,
              referrals_made bigint, food_fulfilled bigint)
language sql stable security definer set search_path = '' as $$
  with outcomes as (
    select r.id, r.neighborhood, n.service, n.fulfilled_at as occurred_at, true as fulfilled
    from comforce.needs n join comforce.requests r on r.id = n.request_id
    where n.status = 'fulfilled'
    union all
    select r.id, r.neighborhood, n.service, f.sent_at, false
    from comforce.referrals f join comforce.needs n on n.id = f.need_id
    join comforce.requests r on r.id = n.request_id
  ), dated as (
    select *, to_char(occurred_at at time zone 'America/Chicago','YYYY-MM') as period from outcomes
  )
  select period, d.neighborhood, count(distinct id) filter (where fulfilled),
         count(*) filter (where fulfilled), count(*) filter (where not fulfilled),
         count(*) filter (where fulfilled and service = 'food')
  from dated d group by grouping sets ((period, d.neighborhood), (period))
  order by period, d.neighborhood nulls first;
$$;

create function public.team_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not comforce.is_staff() then
    raise insufficient_privilege using message = 'Sign in with the local team mailbox.';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.reference desc),'[]')
    from (
      select r.id,r.reference,r.description,r.neighborhood,r.contact_method,r.contact,r.source,r.created_at,
        (select jsonb_agg(to_jsonb(n) - 'request_id' || jsonb_build_object(
          'referrals', (select coalesce(jsonb_agg(to_jsonb(f) - 'need_id' order by f.sent_at desc,f.id),'[]')
                        from comforce.referrals f where f.need_id = n.id),
          'history', (select coalesce(jsonb_agg(to_jsonb(h) - 'need_id' - 'id' order by h.at desc,h.id desc),'[]')
                      from comforce.history h where h.need_id = n.id)
        ) order by n.service) from comforce.needs n where n.request_id = r.id) as needs
      from comforce.requests r
    ) c);
end;
$$;

create function public.update_need(
  p_need uuid, p_action text, p_value text default null,
  p_referral uuid default null, p_when timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_need comforce.needs;
  label text := nullif(btrim(p_value),'');
  provider_name text := 'ComForce';
  detail text;
begin
  if not comforce.is_staff() then
    raise insufficient_privilege using message = 'Sign in with the local team mailbox.';
  end if;
  select * into strict current_need from comforce.needs where id = p_need for update;
  -- Serialize confirmations. A replay does not replace the provider, date or history.
  if current_need.status = 'fulfilled' and p_action = 'fulfill' then return; end if;
  if current_need.status <> 'open' then raise exception 'This need is already closed.'; end if;
  case p_action
  when 'assign' then
    update comforce.needs set owner = label where id = p_need;
    detail := coalesce(label,'Unassigned');
  when 'direct' then
    detail := 'ComForce will provide direct help.';
  when 'refer' then
    if label is null then raise exception 'Enter the partner name.'; end if;
    insert into comforce.referrals(need_id,partner) values(p_need,label);
    detail := label;
  when 'decline' then
    update comforce.referrals set declined_at = clock_timestamp()
    where id = p_referral and need_id = p_need and declined_at is null returning partner into detail;
    if not found then raise exception 'Choose a current referral for this need.'; end if;
  when 'follow_up' then
    if p_when is null or not isfinite(p_when) then raise exception 'Choose a follow-up date and time.'; end if;
    update comforce.needs set follow_up = p_when where id = p_need;
    detail := to_char(p_when at time zone 'America/Chicago','Mon DD, YYYY HH24:MI') || ' Chicago';
  when 'fulfill' then
    if p_referral is not null then
      select partner into provider_name from comforce.referrals
      where id = p_referral and need_id = p_need and declined_at is null;
      if not found then raise exception 'Choose a current referral for this need.'; end if;
    end if;
    update comforce.needs set status='fulfilled',provider=provider_name,
      fulfilled_at=clock_timestamp(),follow_up=null where id=p_need;
    detail := provider_name;
  when 'unmet' then
    if label is null then raise exception 'Enter an unmet reason.'; end if;
    update comforce.needs set status='unmet',unmet_reason=label,follow_up=null where id=p_need;
    detail := label;
  else
    raise exception 'Unknown need action.';
  end case;
  insert into comforce.history(need_id,action,detail,at) values(p_need,p_action,detail,clock_timestamp());
end;
$$;

revoke all on function public.submit_request(uuid,text[],text,text,text,text,text),
  public.public_impact(), public.team_queue(), public.update_need(uuid,text,text,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.submit_request(uuid,text[],text,text,text,text,text), public.public_impact()
  to anon, authenticated;
grant execute on function public.team_queue(), public.update_need(uuid,text,text,uuid,timestamptz)
  to authenticated;
