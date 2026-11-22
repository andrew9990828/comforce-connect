-- Bound anonymous demo storage and let the public atlas read the immutable fictional template.
alter table comforce.workspaces
  add column created_at timestamptz not null default clock_timestamp(),
  add column expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  add check (expires_at > created_at);

-- Existing visitor copies receive one final day. The template is permanent and remains inaccessible by capability.
update comforce.workspaces
set created_at = '-infinity', expires_at = 'infinity'
where id = comforce.template_id();

-- Workspace deletion must remove the copied request graph as one operation.
alter table comforce.requests
  drop constraint requests_workspace_id_fkey,
  add constraint requests_workspace_id_fkey foreign key (workspace_id) references comforce.workspaces on delete cascade;
alter table comforce.needs
  drop constraint needs_request_id_fkey,
  add constraint needs_request_id_fkey foreign key (request_id) references comforce.requests on delete cascade;
alter table comforce.referrals
  drop constraint referrals_need_id_fkey,
  add constraint referrals_need_id_fkey foreign key (need_id) references comforce.needs on delete cascade;
alter table comforce.history
  drop constraint history_need_id_fkey,
  add constraint history_need_id_fkey foreign key (need_id) references comforce.needs on delete cascade;

alter table comforce.need_operations
  drop constraint need_operations_need_id_fkey,
  add foreign key (need_id) references comforce.needs on delete cascade;

create index if not exists requests_workspace_id_idx on comforce.requests(workspace_id);
create index if not exists needs_request_id_idx on comforce.needs(request_id);

create function comforce.cleanup_demo_workspaces(p_now timestamptz default statement_timestamp()) returns bigint
language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  delete from comforce.workspaces
  where id <> comforce.template_id() and expires_at <= p_now;
  get diagnostics removed = row_count;
  return removed;
end $$;

create or replace function comforce.resolve_workspace(p_token text, staff_only boolean) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  digest bytea;
  workspace uuid;
begin
  if p_token is null and comforce.is_staff() then return null; end if;
  if p_token ~ '^[0-9a-f]{64}$' then
    digest := sha256(convert_to(p_token,'UTF8'));
    select id into workspace from comforce.workspaces
    where expires_at > statement_timestamp()
      and (staff_digest = digest or (not staff_only and resident_digest = digest));
  end if;
  if workspace is null then
    raise insufficient_privilege using message = 'A valid, unexpired workspace credential is required.';
  end if;
  return workspace;
end $$;

create or replace function public.create_demo_workspace() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  workspace uuid;
  expiration timestamptz;
  staff_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  resident_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  template uuid := comforce.template_id();
begin
  -- Serialize cleanup, the capacity check and insertion so concurrent callers cannot pass the limit together.
  perform pg_advisory_xact_lock(hashtextextended('comforce.create_demo_workspace',0));
  perform comforce.cleanup_demo_workspaces();
  if (select count(*) from comforce.workspaces where id <> template) >= 50 then
    raise exception using errcode = '54000',
      message = 'The demo is at capacity. Please try again after an existing workspace expires.';
  end if;
  if not exists(select 1 from comforce.requests where workspace_id = template) then
    raise exception 'The fictional demo seed has not been loaded.';
  end if;
  insert into comforce.workspaces(staff_digest,resident_digest)
    values(sha256(convert_to(staff_token,'UTF8')),sha256(convert_to(resident_token,'UTF8')))
    returning id,expires_at into workspace,expiration;
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
  insert into comforce.need_operations(need_id,operation_key,request_hash)
    select comforce.copy_id(workspace,o.need_id),o.operation_key,o.request_hash
    from comforce.need_operations o join comforce.needs n on n.id=o.need_id
    join comforce.requests r on r.id=n.request_id where r.workspace_id=template;
  insert into comforce.need_operations(need_id,operation_key,request_hash)
    select comforce.copy_id(workspace,h.need_id),h.operation_key,
           comforce.need_operation_hash(h.action,h.detail,null,h.at,h.source,null)
    from comforce.history h join comforce.needs n on n.id=h.need_id
    join comforce.requests r on r.id=n.request_id
    where r.workspace_id=template and h.operation_key is not null
    on conflict do nothing;
  return jsonb_build_object('workspace_id',workspace,'staff_token',staff_token,
    'resident_token',resident_token,'expires_at',expiration);
end $$;

-- Validate both capabilities before upgrading a browser record from the previous release.
create function public.demo_workspace_expiry(p_staff text, p_resident text) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select expires_at from comforce.workspaces
  where id <> comforce.template_id() and expires_at > statement_timestamp()
    and staff_digest = sha256(convert_to(p_staff,'UTF8'))
    and resident_digest = sha256(convert_to(p_resident,'UTF8'))
$$;

drop function public.public_impact(text);
create function public.public_impact(p_token text default null, p_template boolean default false)
returns table(month text, neighborhood text, requests_helped bigint, needs_fulfilled bigint,
              referrals_made bigint, food_fulfilled bigint, family_followups bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  workspace uuid := case
    when p_token is null and (p_template or not comforce.is_staff()) then comforce.template_id()
    else comforce.resolve_workspace(p_token,false)
  end;
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

revoke all on function comforce.cleanup_demo_workspaces(timestamptz) from public,anon,authenticated;
revoke all on function comforce.resolve_workspace(text,boolean) from public,anon,authenticated;
revoke all on function public.create_demo_workspace(),public.public_impact(text,boolean),public.demo_workspace_expiry(text,text) from public,anon,authenticated;
grant execute on function public.create_demo_workspace(),public.public_impact(text,boolean),public.demo_workspace_expiry(text,text) to anon,authenticated;
