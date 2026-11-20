-- Isolated synthetic workspaces and family-support check-ins. OpenAI Codex (GPT-6) implemented the scoped SQL API.
create table comforce.workspaces (
  id uuid primary key default gen_random_uuid(),
  staff_digest bytea not null unique,
  resident_digest bytea not null unique,
  check (staff_digest <> resident_digest)
);
alter table comforce.workspaces enable row level security;
revoke all on comforce.workspaces from public, anon, authenticated;

-- A null workspace identifies the existing, verified-staff cases. No legacy records are copied.
alter table comforce.requests
  add column workspace_id uuid references comforce.workspaces,
  add column family_support jsonb check (jsonb_typeof(family_support) = 'object'),
  drop constraint requests_submission_key_key,
  add unique nulls not distinct (workspace_id, submission_key);
alter table comforce.needs
  drop constraint needs_service_check,
  add check (service in ('food','transportation','shelter','youth','other','family_support')),
  add column partner_contact text check (length(btrim(partner_contact)) between 1 and 100);
alter table comforce.history
  drop constraint history_action_check,
  add check (action in ('assign','direct','refer','decline','follow_up','fulfill','unmet','partner_contact','check_in')),
  add column source text,
  add column operation_key uuid,
  add unique (need_id,operation_key),
  add check (action <> 'check_in' or (source is not null and length(btrim(source)) between 1 and 120
                                     and length(btrim(detail)) between 1 and 500 and operation_key is not null));

-- Only a hash of each random capability is stored. Possessing a resident link never satisfies a staff lookup.
create function comforce.resolve_workspace(p_token text, staff_only boolean) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  digest bytea;
  workspace uuid;
begin
  if p_token is null and comforce.is_staff() then return null; end if;
  if p_token ~ '^[0-9a-f]{64}$' then
    digest := sha256(convert_to(p_token,'UTF8'));
    select id into workspace from comforce.workspaces
    where staff_digest = digest or (not staff_only and resident_digest = digest);
  end if;
  if workspace is null then
    raise insufficient_privilege using message = 'A valid workspace credential is required.';
  end if;
  return workspace;
end $$;

-- The seed inserts a private, inaccessible template workspace at this ID. Its cases are always fictional.
create function comforce.template_id() returns uuid
language sql immutable set search_path = '' as $$ select '0a687801-8bed-4cbe-99c2-ff65cd70cdec'::uuid $$;
create function comforce.copy_id(workspace uuid, original uuid) returns uuid
language sql immutable strict set search_path = '' as $$ select md5(workspace::text || original::text)::uuid $$;

create function public.create_demo_workspace() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  workspace uuid;
  staff_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  resident_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  template uuid := comforce.template_id();
begin
  if not exists(select 1 from comforce.requests where workspace_id = template) then
    raise exception 'The fictional demo seed has not been loaded.';
  end if;
  insert into comforce.workspaces(staff_digest,resident_digest)
    values(sha256(convert_to(staff_token,'UTF8')),sha256(convert_to(resident_token,'UTF8'))) returning id into workspace;
  insert into comforce.requests(workspace_id,id,submission_key,created_at,neighborhood,description,contact_method,contact,source,family_support)
    select workspace,comforce.copy_id(workspace,r.id),gen_random_uuid(),r.created_at,r.neighborhood,r.description,
           r.contact_method,r.contact,r.source,r.family_support
    from comforce.requests r where r.workspace_id=template order by r.created_at,r.id;
  insert into comforce.needs(id,request_id,service,status,owner,follow_up,provider,fulfilled_at,unmet_reason,partner_contact)
    select comforce.copy_id(workspace,n.id),comforce.copy_id(workspace,n.request_id),
           n.service,n.status,n.owner,n.follow_up,n.provider,n.fulfilled_at,n.unmet_reason,n.partner_contact
    from comforce.needs n join comforce.requests r on r.id=n.request_id where r.workspace_id=template;
  insert into comforce.referrals(id,need_id,partner,sent_at,declined_at)
    select comforce.copy_id(workspace,f.id),comforce.copy_id(workspace,f.need_id),f.partner,f.sent_at,f.declined_at
    from comforce.referrals f join comforce.needs n on n.id=f.need_id join comforce.requests r on r.id=n.request_id
    where r.workspace_id=template;
  insert into comforce.history(need_id,at,action,detail,source,operation_key)
    select comforce.copy_id(workspace,h.need_id),h.at,h.action,h.detail,h.source,h.operation_key
    from comforce.history h join comforce.needs n on n.id=h.need_id join comforce.requests r on r.id=n.request_id
    where r.workspace_id=template order by h.id;
  return jsonb_build_object('workspace_id',workspace,'staff_token',staff_token,'resident_token',resident_token);
end $$;

-- Remove the old unscoped overloads as part of the same migration.
drop function public.team_queue();
drop function public.submit_request(uuid,text[],text,text,text,text,text);
drop function public.update_need(uuid,text,text,uuid,timestamptz);
drop function public.public_impact();

create function public.submit_request(
  p_key uuid, p_services text[], p_description text, p_neighborhood text,
  p_contact_method text, p_contact text, p_source text, p_token text default null, p_family jsonb default null
) returns text language plpgsql security definer set search_path = '' as $$
declare
  workspace uuid := comforce.resolve_workspace(p_token,p_source in ('call','text'));
  receipt comforce.requests;
  family jsonb;
begin
  if cardinality(p_services) is null or cardinality(p_services) not between 1 and 6
     or cardinality(p_services) <> (select count(distinct value) from unnest(p_services) value)
     or not (p_services <@ array['food','transportation','shelter','youth','other','family_support']) then
    raise exception using errcode = '22023', message = 'Choose one or more distinct services.';
  end if;
  if 'family_support' = any(p_services) then
    if (jsonb_typeof(p_family) = 'object' and jsonb_typeof(p_family->'support') = 'string'
        and jsonb_typeof(p_family->'safe_contact') = 'string'
        and length(btrim(p_family->>'support')) between 1 and 500
        and length(btrim(p_family->>'safe_contact')) between 1 and 300
        and coalesce(jsonb_typeof(jsonb_strip_nulls(p_family)->'agency'),'string')='string'
        and coalesce(jsonb_typeof(jsonb_strip_nulls(p_family)->'agency_reference'),'string')='string'
        and length(coalesce(p_family->>'agency','')) <= 120
        and length(coalesce(p_family->>'agency_reference','')) <= 80) is not true then
      raise exception using errcode = '22023', message = 'Describe the requested family support and safe follow-up.';
    end if;
    family := jsonb_strip_nulls(jsonb_build_object('support',btrim(p_family->>'support'),
      'safe_contact',btrim(p_family->>'safe_contact'),'agency',nullif(btrim(p_family->>'agency'),''),
      'agency_reference',nullif(btrim(p_family->>'agency_reference'),'')));
  elsif p_family is not null then
    raise exception using errcode = '22023', message = 'Select family support before adding family contact instructions.';
  end if;
  insert into comforce.requests(workspace_id,submission_key,description,neighborhood,contact_method,contact,source,family_support)
  values(workspace,p_key,btrim(p_description),p_neighborhood,p_contact_method,btrim(p_contact),p_source,family)
  on conflict (workspace_id,submission_key) do nothing returning * into receipt;
  if found then
    insert into comforce.needs(request_id,service) select receipt.id,value from unnest(p_services) value;
  else
    select * into strict receipt from comforce.requests
    where workspace_id is not distinct from workspace and submission_key=p_key;
    if (receipt.description,receipt.neighborhood,receipt.contact_method,receipt.contact,receipt.source,receipt.family_support)
       is distinct from (btrim(p_description),p_neighborhood,p_contact_method,btrim(p_contact),p_source,family)
       or exists (select service from comforce.needs where request_id = receipt.id except select unnest(p_services))
       or exists (select unnest(p_services) except select service from comforce.needs where request_id = receipt.id) then
      raise exception using errcode = '22023', message = 'This submission key already has a different request.';
    end if;
  end if;
  return receipt.reference;
end $$;

create function public.team_queue(p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare workspace uuid := comforce.resolve_workspace(p_token,true);
begin
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.reference desc),'[]')
    from (
      select r.id,r.reference,r.description,r.neighborhood,r.contact_method,r.contact,r.source,r.created_at,r.family_support,
        (select jsonb_agg(to_jsonb(n) - 'request_id' || jsonb_build_object(
          'referrals', (select coalesce(jsonb_agg(to_jsonb(f) - 'need_id' order by f.sent_at desc,f.id),'[]')
                        from comforce.referrals f where f.need_id = n.id),
          'history', (select coalesce(jsonb_agg(to_jsonb(h) - 'need_id' - 'id' - 'operation_key' order by h.at desc,h.id desc),'[]')
                      from comforce.history h where h.need_id = n.id)
        ) order by n.service) from comforce.needs n where n.request_id = r.id) as needs
      from comforce.requests r where r.workspace_id is not distinct from workspace
    ) c);
end $$;

create function public.public_impact(p_token text default null)
returns table(month text, neighborhood text, requests_helped bigint, needs_fulfilled bigint,
              referrals_made bigint, food_fulfilled bigint, family_followups bigint)
language plpgsql stable security definer set search_path = '' as $$
declare workspace uuid := comforce.resolve_workspace(p_token,false);
begin
  return query
  with scoped as (
    select r.id as request_id,r.neighborhood,n.id as need_id,n.service,n.fulfilled_at
    from comforce.requests r join comforce.needs n on n.request_id = r.id
    where r.workspace_id is not distinct from workspace
  ), outcomes as (
    select s.*,s.fulfilled_at as occurred_at,'fulfill' as action from scoped s where s.fulfilled_at is not null
    union all
    select s.*,f.sent_at,'refer' from scoped s join comforce.referrals f on f.need_id=s.need_id
    union all
    select s.*,h.at,'check_in' from scoped s join comforce.history h on h.need_id=s.need_id
    where s.service='family_support' and h.action='check_in'
  ), dated as (
    select o.*,to_char(o.occurred_at at time zone 'America/Chicago','YYYY-MM') as period from outcomes o
  )
  select d.period,d.neighborhood,count(distinct d.request_id) filter (where action='fulfill'),
    count(*) filter (where action='fulfill'),count(*) filter (where action='refer'),
    count(*) filter (where action='fulfill' and service='food'),count(*) filter (where action='check_in')
  from dated d group by grouping sets ((d.period,d.neighborhood),(d.period)) order by d.period,d.neighborhood nulls first;
end $$;

create function public.update_need(
  p_need uuid, p_action text, p_value text default null, p_referral uuid default null,
  p_when timestamptz default null, p_token text default null, p_source text default null, p_key uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  workspace uuid := comforce.resolve_workspace(p_token,true);
  current_need comforce.needs;
  prior comforce.history;
  label text := nullif(btrim(p_value),'');
  verified_source text;
  provider_name text := 'ComForce';
  detail text;
  occurred_at timestamptz := clock_timestamp();
begin
  select n.* into current_need from comforce.needs n join comforce.requests r on r.id=n.request_id
  where n.id=p_need and r.workspace_id is not distinct from workspace for update of n;
  if not found then raise insufficient_privilege using message='This need is unavailable in this workspace.'; end if;
  if p_action='fulfill' and current_need.status='fulfilled' then return; end if;
  if p_action='check_in' then
    verified_source := nullif(btrim(p_source),'');
    if label is null or length(label)>500 or verified_source is null or length(verified_source)>120
       or p_key is null or p_when is null or not isfinite(p_when) or p_when>clock_timestamp()+interval '2 minutes' then
      raise exception using errcode='22023', message='Enter the check-in outcome, source and time it happened.';
    end if;
    select * into prior from comforce.history where need_id=p_need and operation_key=p_key;
    if found then
      if (prior.action,prior.detail,prior.source,prior.at) is distinct from (p_action,label,verified_source,p_when) then
        raise exception using errcode='22023', message='This check-in key was already used.';
      end if;
      return;
    end if;
  end if;
  if current_need.status<>'open' then raise exception 'This need is already closed.'; end if;
  case p_action
  when 'assign' then
    update comforce.needs set owner=label where id=p_need;
    detail := coalesce(label,'Unassigned');
  when 'direct' then detail := 'ComForce will provide direct help.';
  when 'refer' then
    if label is null then raise exception 'Enter the partner name.'; end if;
    insert into comforce.referrals(need_id,partner) values(p_need,label);
    detail := label;
  when 'decline' then
    update comforce.referrals set declined_at=clock_timestamp()
      where id=p_referral and need_id=p_need and declined_at is null returning partner into detail;
    if not found then raise exception 'Choose a current referral for this need.'; end if;
  when 'partner_contact' then
    if label is null then raise exception 'Enter the partner contacted.'; end if;
    update comforce.needs set partner_contact=label where id=p_need;
    detail := label;
  when 'follow_up' then
    if p_when is null or not isfinite(p_when) then raise exception 'Choose a follow-up date and time.'; end if;
    update comforce.needs set follow_up=p_when where id=p_need;
    detail := to_char(p_when at time zone 'America/Chicago','Mon DD, YYYY HH24:MI') || ' Chicago';
  when 'check_in' then
    if current_need.follow_up is null then raise exception 'There is no pending follow-up on this need.'; end if;
    update comforce.needs set follow_up=null where id=p_need;
    detail := label;
    occurred_at := p_when;
  when 'fulfill' then
    if p_referral is not null then
      select partner into provider_name from comforce.referrals where id=p_referral and need_id=p_need and declined_at is null;
      if not found then raise exception 'Choose a current referral for this need.'; end if;
    end if;
    update comforce.needs set status='fulfilled',provider=provider_name,fulfilled_at=occurred_at,follow_up=null where id=p_need;
    detail := provider_name;
  when 'unmet' then
    if label is null then raise exception 'Enter an unmet reason.'; end if;
    update comforce.needs set status='unmet',unmet_reason=label,follow_up=null where id=p_need;
    detail := label;
  else raise exception 'Unknown need action.';
  end case;
  insert into comforce.history(need_id,action,detail,at,source,operation_key)
  values(p_need,p_action,detail,occurred_at,verified_source,case when p_action='check_in' then p_key end);
end $$;

revoke all on all functions in schema comforce from public,anon,authenticated;
revoke all on function public.create_demo_workspace(),public.public_impact(text),public.team_queue(text),
  public.submit_request(uuid,text[],text,text,text,text,text,text,jsonb),
  public.update_need(uuid,text,text,uuid,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_demo_workspace(),public.public_impact(text),public.team_queue(text),
  public.submit_request(uuid,text[],text,text,text,text,text,text,jsonb),
  public.update_need(uuid,text,text,uuid,timestamptz,text,text,uuid) to anon,authenticated;
