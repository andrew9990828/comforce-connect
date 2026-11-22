-- A private catalog of reproducible fictional cases, April–November 2026. OpenAI Codex (GPT-6) designed the demo scenarios.
-- Run after migrations. Existing templates, visitor workspaces and original staff cases are preserved.
do $seed$
declare
  template uuid := comforce.template_id();
  fixture record;
  request_id uuid;
  need_id uuid;
  service_name text;
  area_names text[] := array['Harambee','Riverwest','Bay View','Silver City','Walker''s Point','Lincoln Park'];
  received timestamptz;
  delivered timestamptz;
  provider_name text;
  family jsonb := '{"support":"Talk through family support options.","safe_contact":"Call after school. Leave no voicemail."}';
begin
  insert into comforce.workspaces(id,staff_digest,resident_digest,created_at,expires_at)
  values(template,sha256(convert_to(gen_random_uuid()::text,'UTF8')),sha256(convert_to(gen_random_uuid()::text,'UTF8')),
         '-infinity','infinity')
  on conflict(id) do nothing;
  if not found then return; end if;

  -- Each cell gives a number of fictional cases to create in that neighborhood and month.
  -- The atlas reads outcomes on the resulting needs, referrals and check-ins through public_impact.
  for fixture in
    select month_start,area,case_no
    from (values
      ('2026-04-01'::date,array[2,1,0,2,0,1]), ('2026-05-01',array[3,0,1,1,2,0]),
      ('2026-06-01',array[1,4,2,0,1,1]), ('2026-07-01',array[2,2,0,4,1,0]),
      ('2026-08-01',array[4,1,3,1,0,1]), ('2026-09-01',array[3,2,1,0,4,1]),
      ('2026-10-01',array[2,3,2,2,1,0]), ('2026-11-01',array[4,2,1,3,2,0])
    ) ledger(month_start,counts)
    cross join generate_series(1,6) area
    cross join lateral generate_series(1,counts[area]) case_no
    order by month_start,area,case_no
  loop
    received := (fixture.month_start + (fixture.case_no*2 + fixture.area-2) + time '10:00') at time zone 'America/Chicago';
    delivered := received + interval '1 day 3 hours';
    service_name := case
      when fixture.case_no=1 and fixture.area in (1,4) then 'family_support'
      when (fixture.case_no+fixture.area)%4=0 then 'transportation'
      when (fixture.case_no+fixture.area)%5=0 then 'shelter'
      when (fixture.case_no+fixture.area)%6=0 then 'youth'
      else 'food' end;
    provider_name := case when (fixture.case_no+fixture.area)%3=0 then 'Sample Community Partner' else 'ComForce' end;
    insert into comforce.requests(workspace_id,submission_key,created_at,neighborhood,description,contact_method,contact,source,family_support)
    values(template,gen_random_uuid(),received,area_names[fixture.area],
      case service_name when 'family_support' then 'Family asked for a callback and local support options.'
        when 'food' then 'Requested a grocery delivery for the week.' when 'shelter' then 'Asked about a place to stay.'
        when 'youth' then 'Asked for an after-school activity.' else 'Requested a ride to an appointment.' end,
      'email','resident@example.invalid','web',case when service_name='family_support' then family end)
    returning id into request_id;
    insert into comforce.needs(request_id,service,status,owner,provider,fulfilled_at)
    values(request_id,service_name,'fulfilled',(array['Von','Maya','Dee'])[1+(fixture.area%3)],provider_name,delivered)
    returning id into need_id;
    if provider_name <> 'ComForce' then
      insert into comforce.referrals(need_id,partner,sent_at) values(need_id,provider_name,received+interval '1 hour');
      insert into comforce.history(need_id,at,action,detail) values(need_id,received+interval '1 hour','refer',provider_name);
    end if;
    if service_name='family_support' then
      insert into comforce.history(need_id,at,action,detail,source,operation_key)
      values(need_id,delivered-interval '30 minutes','check_in','Reviewed support options with the family.',
        'Family phone conversation',gen_random_uuid());
    end if;
    insert into comforce.history(need_id,at,action,detail) values(need_id,delivered,'fulfill',provider_name);
  end loop;

  -- Open family callback. A verified contact update never implies a change in the missing person's status.
  insert into comforce.requests(workspace_id,submission_key,created_at,neighborhood,description,contact_method,contact,source,family_support)
  values(template,gen_random_uuid(),'2026-11-04 09:00-06','Harambee','Family needs a callback about available support.',
    'phone','414-555-0104','call','{"support":"Arrange a family check-in.","safe_contact":"Call between 2 and 4 pm. Leave no voicemail.","agency":"Sample Family Liaison"}')
  returning id into request_id;
  insert into comforce.needs(request_id,service,owner,follow_up,partner_contact)
  values(request_id,'family_support','Von','2026-11-12 15:00-06','Sample Family Liaison') returning id into need_id;
  insert into comforce.history(need_id,at,action,detail) values
    (need_id,'2026-11-04 09:15-06','assign','Von'),
    (need_id,'2026-11-10 10:30-06','partner_contact','Sample Family Liaison'),
    (need_id,'2026-11-10 11:00-06','follow_up','Nov 12, 2026 15:00 Chicago');
  insert into comforce.history(need_id,at,action,detail,source,operation_key) values
    (need_id,'2026-11-05 14:15-06','check_in','Family confirmed the best callback window.','Family phone conversation',gen_random_uuid());

  -- Two independently tracked needs belonging to a different fictional family.
  insert into comforce.requests(workspace_id,submission_key,created_at,neighborhood,description,contact_method,contact,source,family_support)
  values(template,gen_random_uuid(),'2026-11-13 11:30-06','Walker''s Point','A family requested support and a ride to a meeting.',
    'text','414-555-0113','text','{"support":"Help coordinating a meeting and support resources.","safe_contact":"Text before calling.","agency":"Sample Support Network","agency_reference":"SAMPLE-14"}')
  returning id into request_id;
  insert into comforce.needs(request_id,service) values(request_id,'family_support'),(request_id,'transportation');

  -- Partial delivery and a declined ride referral subsequently sent to another partner.
  insert into comforce.requests(workspace_id,submission_key,created_at,neighborhood,description,contact_method,contact,source)
  values(template,gen_random_uuid(),'2026-11-05 09:05-06','Riverwest','Groceries and a ride to collect a prescription.',
    'email','groceries@example.invalid','web') returning id into request_id;
  insert into comforce.needs(request_id,service,status,owner,provider,fulfilled_at)
  values(request_id,'food','fulfilled','Dee','ComForce','2026-11-06 12:30-06') returning id into need_id;
  insert into comforce.history(need_id,at,action,detail) values(need_id,'2026-11-06 12:30-06','fulfill','ComForce');
  insert into comforce.needs(request_id,service,owner,follow_up) values
    (request_id,'transportation','Dee','2026-11-14 10:00-06') returning id into need_id;
  insert into comforce.referrals(need_id,partner,sent_at,declined_at) values
    (need_id,'Sample Ride Circle','2026-11-05 13:10-06','2026-11-05 16:00-06'),
    (need_id,'Sample Neighborhood Rides','2026-11-06 10:00-06',null);
  insert into comforce.history(need_id,at,action,detail) values
    (need_id,'2026-11-05 09:40-06','assign','Dee'), (need_id,'2026-11-05 13:10-06','refer','Sample Ride Circle'),
    (need_id,'2026-11-05 16:00-06','decline','Sample Ride Circle'),
    (need_id,'2026-11-06 10:00-06','refer','Sample Neighborhood Rides'),
    (need_id,'2026-11-06 10:05-06','follow_up','Nov 14, 2026 10:00 Chicago');
end $seed$;

-- Logged in August, delivered in September in Chicago, and October on a UTC clock.
-- A fixed template key lets an existing installation pick up this example without replacing cases.
do $boundary$
declare request_id uuid; need_id uuid;
begin
  insert into comforce.requests(workspace_id,submission_key,created_at,neighborhood,description,contact_method,contact,source)
  values(comforce.template_id(),'ba94bb04-6a5f-4002-97c1-6fbac7750b24','2026-08-31 14:30-05','Riverwest',
    'Evening ride for a follow-up appointment.','email','evening@example.invalid','call')
  on conflict (workspace_id,submission_key) do nothing returning id into request_id;
  if not found then return; end if;
  insert into comforce.needs(request_id,service,status,owner,provider,fulfilled_at)
  values(request_id,'transportation','fulfilled','Dee','ComForce','2026-10-01 03:30+00') returning id into need_id;
  insert into comforce.history(need_id,at,action,detail) values(need_id,'2026-10-01 03:30+00','fulfill','ComForce');
end $boundary$;
