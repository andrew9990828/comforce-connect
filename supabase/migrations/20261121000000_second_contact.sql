-- Optional ranked contact for resident and staff intake. Codex (GPT-6) extended the scoped submission and queue.
alter table comforce.requests
  add column second_method text,
  add column second_contact text,
  add constraint valid_second_contact check (
    (second_method is null and second_contact is null) or
    (second_method is not null and second_contact is not null and second_method <> contact_method
      and second_method in ('phone','text','email')
      and case when second_method = 'email' then
        length(second_contact) <= 254 and second_contact ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      else length(second_contact) <= 35 and second_contact ~ '^[0-9+(). -]+$'
        and length(regexp_replace(second_contact,'[^0-9]','','g')) between 7 and 15
      end)
  );

drop function public.submit_request(uuid,text[],text,text,text,text,text,text,jsonb);

create function public.submit_request(
  p_key uuid, p_services text[], p_description text, p_neighborhood text,
  p_contact_method text, p_contact text, p_source text, p_token text default null, p_family jsonb default null,
  p_second_method text default null, p_second_contact text default null
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
  insert into comforce.requests(workspace_id,submission_key,description,neighborhood,contact_method,contact,source,family_support,second_method,second_contact)
  values(workspace,p_key,btrim(p_description),p_neighborhood,p_contact_method,btrim(p_contact),p_source,family,p_second_method,btrim(p_second_contact))
  on conflict (workspace_id,submission_key) do nothing returning * into receipt;
  if found then
    insert into comforce.needs(request_id,service) select receipt.id,value from unnest(p_services) value;
  else
    select * into strict receipt from comforce.requests
    where workspace_id is not distinct from workspace and submission_key=p_key;
    if (receipt.description,receipt.neighborhood,receipt.contact_method,receipt.contact,receipt.source,receipt.family_support,receipt.second_method,receipt.second_contact)
       is distinct from (btrim(p_description),p_neighborhood,p_contact_method,btrim(p_contact),p_source,family,p_second_method,btrim(p_second_contact))
       or exists (select service from comforce.needs where request_id = receipt.id except select unnest(p_services))
       or exists (select unnest(p_services) except select service from comforce.needs where request_id = receipt.id) then
      raise exception using errcode = '22023', message = 'This submission key already has a different request.';
    end if;
  end if;
  return receipt.reference;
end $$;

create or replace function public.team_queue(p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare workspace uuid := comforce.resolve_workspace(p_token,true);
begin
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.reference desc),'[]')
    from (
      select r.id,r.reference,r.description,r.neighborhood,r.contact_method,r.contact,r.source,r.created_at,r.family_support,r.second_method,r.second_contact,
        (select jsonb_agg(to_jsonb(n) - 'request_id' || jsonb_build_object(
          'referrals', (select coalesce(jsonb_agg(to_jsonb(f) - 'need_id' order by f.sent_at desc,f.id),'[]')
                        from comforce.referrals f where f.need_id = n.id),
          'history', (select coalesce(jsonb_agg(to_jsonb(h) - 'need_id' - 'id' - 'operation_key' order by h.at desc,h.id desc),'[]')
                      from comforce.history h where h.need_id = n.id)
        ) order by n.service) from comforce.needs n where n.request_id = r.id) as needs
      from comforce.requests r where r.workspace_id is not distinct from workspace
    ) c);
end $$;

revoke all on function public.submit_request(uuid,text[],text,text,text,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.submit_request(uuid,text[],text,text,text,text,text,text,jsonb,text,text) to anon,authenticated;
