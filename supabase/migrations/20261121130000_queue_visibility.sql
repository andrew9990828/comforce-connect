-- Contributor: OpenAI Codex (GPT-6) implemented role-scoped narrative visibility and template provenance.
-- Project the same case permissions onto both copies of a family narrative.
-- Only text copied from the demo template is eligible for translation.
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
  return (
    with template_requests as materialized (
      select r.id, comforce.copy_id(workspace,r.id) as copy_id from comforce.requests r
      where workspace is not null and r.workspace_id=comforce.template_id()
    ), template_checkins as materialized (
      select comforce.copy_id(workspace,n.id) as need_id,h.operation_key
      from template_requests tr join comforce.needs n on n.request_id=tr.id
      join comforce.history h on h.need_id=n.id and h.action='check_in' and h.operation_key is not null
    )
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.reference desc),'[]')
    from (
      select r.id,r.reference,
        case when r.family_support is null or access.family_visible then r.description else '' end as description,
        r.neighborhood,r.contact_method,r.contact,r.source,r.created_at,
        case when access.family_visible then r.family_support end as family_support,
        r.id in (select tr.copy_id from template_requests tr) as demo_fixture,
        (select jsonb_agg(to_jsonb(n) - 'request_id' || jsonb_build_object(
          'assignment_required',case when workspace is null then n.assigned_staff_id is null else n.owner is null end,
          'referrals', (select coalesce(jsonb_agg(to_jsonb(f) - 'need_id' order by f.sent_at desc,f.id),'[]')
                        from comforce.referrals f where f.need_id=n.id),
          'history', (select coalesce(jsonb_agg(to_jsonb(h) - 'need_id' - 'id' - 'operation_key' - 'actor_uid'
              || jsonb_build_object('demo_fixture', h.action='check_in' and h.operation_key is not null
                and (h.need_id,h.operation_key) in (select seed.need_id,seed.operation_key from template_checkins seed))
              order by h.at desc,h.id desc),'[]') from comforce.history h where h.need_id=n.id)
        ) order by n.service) from comforce.needs n where n.request_id=r.id
          and (workspace is not null or actor_role='administrator' or n.assigned_staff_id=actor_uid)) as needs
      from comforce.requests r
      cross join lateral (select workspace is not null or actor_role='administrator' or exists (
        select 1 from comforce.needs n where n.request_id=r.id and n.service='family_support'
          and n.assigned_staff_id=actor_uid
      ) as family_visible) access
      where r.workspace_id is not distinct from workspace
        and (workspace is not null or actor_role='administrator' or exists (
          select 1 from comforce.needs visible where visible.request_id=r.id and visible.assigned_staff_id=actor_uid
        ))
    ) c);
end $$;
