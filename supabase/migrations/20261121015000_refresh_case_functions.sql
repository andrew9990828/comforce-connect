-- Apply the hotfix RPC definitions to installations that already recorded the staff and retry migrations.
-- CREATE OR REPLACE preserves existing grants, data and staff role assignments.
create or replace function public.submit_request(
  p_key uuid, p_services text[], p_description text, p_neighborhood text,
  p_contact_method text, p_contact text, p_source text, p_token text default null, p_family jsonb default null
) returns text language plpgsql security definer set search_path = '' as $$
declare
  workspace uuid := comforce.resolve_workspace(p_token,p_source in ('call','text'));
  receipt comforce.requests;
  family jsonb;
  actor_uid uuid;
  actor_email text;
  actor_name text;
  actor_role text;
begin
  if workspace is null and comforce.is_staff() then
    select user_id,email,display_name,role into actor_uid,actor_email,actor_name,actor_role
    from comforce.current_staff();
  end if;
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
  insert into comforce.requests(workspace_id,submission_key,description,neighborhood,contact_method,contact,source,family_support,submitted_by)
  values(workspace,p_key,btrim(p_description),p_neighborhood,p_contact_method,btrim(p_contact),p_source,family,
    case when workspace is null then actor_uid end)
  on conflict (workspace_id,submission_key) do nothing returning * into receipt;
  if found then
    insert into comforce.needs(request_id,service,assigned_staff_id,owner)
    select receipt.id,value,
      case when workspace is null and actor_role='caseworker' then actor_uid end,
      case when workspace is null and actor_role='caseworker' then actor_name end
    from unnest(p_services) value;
    if actor_uid is not null then
      if actor_role='caseworker' then
        insert into comforce.history(need_id,action,detail,operation_key,actor_uid,actor_name,actor_role)
        select n.id,'assign',actor_name,p_key,actor_uid,actor_name,actor_role
        from comforce.needs n where n.request_id=receipt.id;
        insert into comforce.audit_log(actor_uid,actor_email,actor_role,action,request_id,need_id,detail)
        select actor_uid,actor_email,actor_role,'assign',receipt.id,n.id,
          jsonb_build_object('detail',actor_name,'assignee',actor_uid,'automatic',true)
        from comforce.needs n where n.request_id=receipt.id;
      end if;
      insert into comforce.audit_log(actor_uid,actor_email,actor_role,action,request_id,detail)
      values(actor_uid,actor_email,actor_role,'request_submit',receipt.id,
        jsonb_build_object('source',p_source,'services',to_jsonb(p_services)));
    end if;
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

create or replace function public.team_queue(p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  workspace uuid := comforce.resolve_workspace(p_token,true);
  actor_uid uuid;
  actor_role text;
begin
  if workspace is null then
    select user_id,role into actor_uid,actor_role from comforce.current_staff();
    if not found then raise insufficient_privilege using message='Verified staff access is required.'; end if;
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.reference desc),'[]')
    from (
      select r.id,r.reference,r.description,r.neighborhood,r.contact_method,r.contact,r.source,r.created_at,
        case when workspace is not null or actor_role='administrator' or exists (
          select 1 from comforce.needs family_need
          where family_need.request_id=r.id and family_need.service='family_support'
            and family_need.assigned_staff_id=actor_uid
        ) then r.family_support end as family_support,
        (select jsonb_agg(to_jsonb(n) - 'request_id' || jsonb_build_object(
          'assignment_required',case when workspace is null then n.assigned_staff_id is null else n.owner is null end,
          'referrals', (select coalesce(jsonb_agg(to_jsonb(f) - 'need_id' order by f.sent_at desc,f.id),'[]')
                        from comforce.referrals f where f.need_id = n.id),
          'history', (select coalesce(jsonb_agg(to_jsonb(h) - 'need_id' - 'id' - 'operation_key' - 'actor_uid'
                        order by h.at desc,h.id desc),'[]') from comforce.history h where h.need_id = n.id)
        ) order by n.service) from comforce.needs n where n.request_id = r.id
          and (workspace is not null or actor_role='administrator' or n.assigned_staff_id=actor_uid)) as needs
      from comforce.requests r
      where r.workspace_id is not distinct from workspace
        and (workspace is not null or actor_role='administrator' or exists (
          select 1 from comforce.needs visible where visible.request_id=r.id and visible.assigned_staff_id=actor_uid
        ))
    ) c);
end $$;

create or replace function public.update_need(
  p_need uuid, p_action text, p_value text default null, p_referral uuid default null,
  p_when timestamptz default null, p_token text default null, p_source text default null,
  p_key uuid default null, p_assignee uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  workspace uuid := comforce.resolve_workspace(p_token,true);
  current_need comforce.needs;
  prior comforce.need_operations;
  actor_uid uuid;
  actor_email text;
  actor_name text;
  actor_role text;
  target_name text;
  target_assignee uuid := p_assignee;
  request_id uuid;
  effective_key uuid := coalesce(p_key,gen_random_uuid());
  label text := nullif(btrim(p_value),'');
  verified_source text := nullif(btrim(p_source),'');
  request_hash bytea := comforce.need_operation_hash(p_action,p_value,p_referral,p_when,p_source,p_assignee);
  provider_name text := 'ComForce';
  detail text;
  occurred_at timestamptz := clock_timestamp();
begin
  if workspace is null then
    select user_id,email,display_name,role into actor_uid,actor_email,actor_name,actor_role
    from comforce.current_staff();
    if not found then raise insufficient_privilege using message='Verified staff access is required.'; end if;
    if p_action='assign' and actor_role<>'administrator' then
      raise insufficient_privilege using message='Only administrators can assign or reassign cases.';
    end if;
  elsif p_assignee is not null then
    raise exception using errcode='22023', message='Demo assignments use a worker name.';
  end if;

  select n.* into current_need from comforce.needs n join comforce.requests r on r.id=n.request_id
  where n.id=p_need and r.workspace_id is not distinct from workspace
    and (workspace is not null or actor_role='administrator' or n.assigned_staff_id=actor_uid)
  for update of n;
  if not found then raise insufficient_privilege using message='This need is unavailable or is not assigned to you.'; end if;
  request_id := current_need.request_id;
  select * into prior from comforce.need_operations where need_id=p_need and operation_key=effective_key;
  if found then
    if prior.request_hash is distinct from request_hash then
      raise exception using errcode='22023', message='This operation key was already used for a different update.';
    end if;
    return;
  end if;
  if p_action='check_in' and
     (label is null or length(label)>500 or verified_source is null or length(verified_source)>120
      or p_when is null or not isfinite(p_when) or p_when>clock_timestamp()+interval '2 minutes') then
    raise exception using errcode='22023', message='Enter the check-in outcome, source and time it happened.';
  end if;
  if current_need.status<>'open' then raise exception 'This need is already closed.'; end if;
  case p_action
  when 'assign' then
    if workspace is null then
      if target_assignee is not null then
        select coalesce(nullif(btrim(s.display_name),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),split_part(s.email,'@',1))
          into target_name
        from comforce.staff s join auth.users u on lower(u.email)=lower(s.email)
        where u.id=target_assignee and u.email_confirmed_at is not null and (s.user_id is null or s.user_id=u.id);
        if not found then raise exception using errcode='22023', message='Choose an active staff member.'; end if;
      elsif p_key is null and label is not null then
        -- The pre-role frontend sent an owner label and no key. Preserve that tab during
        -- rollout and link it only when the label resolves to one active staff account.
        select min(u.id::text)::uuid,
               min(coalesce(nullif(btrim(s.display_name),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),split_part(s.email,'@',1)))
          into target_assignee,target_name
        from comforce.staff s join auth.users u on lower(u.email)=lower(s.email)
        where u.email_confirmed_at is not null and (s.user_id is null or s.user_id=u.id)
          and lower(label) in (lower(s.email),lower(split_part(s.email,'@',1)),
            lower(coalesce(nullif(btrim(s.display_name),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),split_part(s.email,'@',1))))
        having count(*)=1;
        if not found then target_name := label; end if;
      end if;
      update comforce.needs set assigned_staff_id=target_assignee,owner=target_name where id=p_need;
      detail := coalesce(target_name,'Unassigned');
    else
      update comforce.needs set owner=label where id=p_need;
      detail := coalesce(label,'Unassigned');
    end if;
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
  insert into comforce.history(need_id,action,detail,at,source,operation_key,actor_uid,actor_name,actor_role)
  values(p_need,p_action,detail,occurred_at,case when p_action='check_in' then verified_source end,effective_key,
    actor_uid,actor_name,actor_role);
  insert into comforce.need_operations(need_id,operation_key,request_hash)
  values(p_need,effective_key,request_hash);
  if workspace is null then
    insert into comforce.audit_log(actor_uid,actor_email,actor_role,action,request_id,need_id,detail)
    values(actor_uid,actor_email,actor_role,p_action,request_id,p_need,
      jsonb_strip_nulls(jsonb_build_object('detail',detail,'assignee',case when p_action='assign' then target_assignee end,
        'legacy_client',case when p_key is null then true end)));
  end if;
end $$;
