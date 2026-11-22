-- OpenAI Codex (GPT-6): preserve active visitor workspaces while opening 50 slots for the rollout.
-- Take the allocator's lock before marking the existing cohort. Future inserts use the false default.
select pg_advisory_xact_lock(hashtextextended('comforce.create_demo_workspace',0));

alter table comforce.workspaces add column pre_rollout boolean not null default false;

update comforce.workspaces
set pre_rollout=true
where id <> comforce.template_id() and expires_at > clock_timestamp();

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
  if (select count(*) from comforce.workspaces where id <> template and not pre_rollout) >= 50 then
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
