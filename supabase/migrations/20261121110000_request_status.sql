-- Resident request status lookup. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 wrote this function.
-- A resident proves ownership with the reference plus the last four phone digits (or the full email address).
-- Only service labels, stages, partner names and dates leave the database: never notes, owners, contacts or unmet reasons.
-- Verified staff (no workspace token) follow the team queue's rule: administrators see every need, caseworkers only
-- the needs assigned to them, and a request with none of theirs looks the same as an unknown reference.
create function public.request_status(p_reference text, p_check text, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  workspace uuid := comforce.resolve_workspace(p_token,false);
  wanted text := upper(regexp_replace(coalesce(p_reference,''),'\s','','g'));
  found_request comforce.requests;
  phone_check text := regexp_replace(coalesce(p_check,''),'\D','','g');
  actor_uid uuid;
  actor_role text;
begin
  if workspace is null then
    select user_id,role into actor_uid,actor_role from comforce.current_staff();
    if not found then raise insufficient_privilege using message = 'Verified staff access is required.'; end if;
  end if;
  if wanted ~ '^[0-9]+$' then wanted := 'CF-' || wanted; end if;
  select r.* into found_request from comforce.requests r
  where r.workspace_id is not distinct from workspace and r.reference = wanted;
  -- One generic error for an unknown reference or a wrong check, so references cannot be probed.
  if not found or (case when found_request.contact_method = 'email'
      then lower(btrim(coalesce(p_check,''))) <> lower(found_request.contact)
      else length(phone_check) <> 4 or phone_check <> right(regexp_replace(found_request.contact,'\D','','g'),4) end)
     or not exists (select 1 from comforce.needs v where v.request_id = found_request.id
                    and (workspace is not null or actor_role = 'administrator' or v.assigned_staff_id = actor_uid)) then
    raise exception using errcode = 'P0002', message = 'No request matches that reference and contact check.';
  end if;
  return jsonb_build_object(
    'reference', found_request.reference,
    'submitted_at', found_request.created_at,
    'contact_method', found_request.contact_method,
    'needs', (select coalesce(jsonb_agg(jsonb_build_object(
        'service', n.service,
        'stage', case
          when n.status = 'fulfilled' then 'delivered'
          when n.status = 'unmet' then 'closed'
          when n.owner is not null or n.partner_contact is not null
            or exists (select 1 from comforce.history h where h.need_id = n.id) then 'in_progress'
          else 'received' end,
        'provider', n.provider,
        'partner', (select f.partner from comforce.referrals f
                    where f.need_id = n.id and f.declined_at is null and n.status = 'open'
                    order by f.sent_at desc, f.id limit 1),
        'updated_at', greatest(found_request.created_at, n.fulfilled_at,
                               (select max(h.at) from comforce.history h where h.need_id = n.id))
      ) order by n.service), '[]'::jsonb)
      from comforce.needs n where n.request_id = found_request.id
        and (workspace is not null or actor_role = 'administrator' or n.assigned_staff_id = actor_uid)));
end $$;

revoke all on function public.request_status(text,text,text) from public,anon,authenticated;
grant execute on function public.request_status(text,text,text) to anon,authenticated;
