-- Rollback-only TAP checks. Contributor: OpenAI Codex (GPT-6), access, atomicity and accounting tests.
begin;
set local plpgsql.check_asserts = on;
select '1..10';

-- One administrator, one caseworker and one visitor. The application authenticates with GoTrue.
insert into comforce.staff(email,display_name,role) values
  ('worker-test@example.invalid','Test Administrator','administrator'),
  ('caseworker-test@example.invalid','Test Caseworker','caseworker');
insert into auth.users(id,email,email_confirmed_at) values
  ('42667ca8-5125-4db0-834e-000000000001','worker-test@example.invalid',now()),
  ('42667ca8-5125-4db0-834e-000000000002','visitor-test@example.invalid',now()),
  ('42667ca8-5125-4db0-834e-000000000004','caseworker-test@example.invalid',now());

do $$
begin
  assert (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='comforce' and c.relkind='r'), 'private tables must enable RLS';
  assert not has_schema_privilege('anon','comforce','usage');
  assert not has_schema_privilege('authenticated','comforce','usage');
  assert to_regprocedure('public.team_queue()') is null;
  assert to_regprocedure('public.update_need(uuid,text,text,uuid,timestamptz)') is null;
  assert to_regprocedure('public.update_need(uuid,text,text,uuid,timestamptz,text,text,uuid)') is null;
  assert to_regprocedure('public.update_need(uuid,text,text,uuid,timestamptz,text,text,uuid,uuid)') is not null;
end $$;
select 'ok 1 - base tables are private and unscoped overloads are removed';

-- Existing records stay in the original scope. Only allowlisted verified staff can enter it.
set local role authenticated;
set local request.jwt.claims = '{"sub":"42667ca8-5125-4db0-834e-000000000001","email":"worker-test@example.invalid","role":"authenticated"}';
do $$
declare ref text;
begin
  ref := public.submit_request('42667ca8-5125-4db0-834e-000000000003',array['food','transportation'],
    'Fictional test','Harambee','email','test@example.invalid','web');
  assert ref like 'CF-%';
  assert ref = public.submit_request('42667ca8-5125-4db0-834e-000000000003',array['transportation','food'],
    'Fictional test','Harambee','email','test@example.invalid','web');
  begin
    perform public.submit_request('42667ca8-5125-4db0-834e-000000000003',array['food'],
      'Fictional test','Harambee','email','test@example.invalid','web');
    raise exception 'accepted different payload for the same key';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
do $$
begin
  assert (select count(*)=2 from comforce.needs n join comforce.requests r on r.id=n.request_id
          where r.submission_key='42667ca8-5125-4db0-834e-000000000003');
end $$;
select 'ok 2 - intake retries return one reference and one set of needs';

do $$
declare k uuid := gen_random_uuid();
begin
  begin
    perform public.submit_request(k,array['food','invalid'],'Test','Riverwest','text','4145550123','web');
    raise exception 'invalid service accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_request(k,array['food'],'Test','Riverwest','email','invalid','web');
    raise exception 'invalid contact accepted';
  exception when check_violation then null;
  end;
  assert not exists(select 1 from comforce.requests where submission_key=k);
end $$;
select 'ok 3 - invalid submissions leave no records';

set local role authenticated;
set local request.jwt.claims = '{"sub":"42667ca8-5125-4db0-834e-000000000002","email":"visitor-test@example.invalid","role":"authenticated","user_metadata":{"email":"worker-test@example.invalid"}}';
do $$
begin
  begin
    perform public.team_queue();
    raise exception 'visitor read staff queue';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_need(gen_random_uuid(),'direct');
    raise exception 'visitor could update a need';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'ok 4 - a signed-in visitor cannot read or write team cases';

set local request.jwt.claims = '{"sub":"42667ca8-5125-4db0-834e-000000000001","email":"worker-test@example.invalid","role":"authenticated"}';
update auth.users set email_confirmed_at=null where email='worker-test@example.invalid';
do $$
begin
  assert not comforce.is_staff(), 'unconfirmed account gained staff access';
end $$;
update auth.users set email_confirmed_at=now() where email='worker-test@example.invalid';
do $$
declare
  food uuid; ride uuid; declined uuid; accepted uuid; req uuid;
  direct_key uuid := gen_random_uuid(); food_fulfill_key uuid := gen_random_uuid(); assign_key uuid := gen_random_uuid();
  first_referral_key uuid := gen_random_uuid(); decline_key uuid := gen_random_uuid(); follow_key uuid := gen_random_uuid();
  second_referral_key uuid := gen_random_uuid(); ride_fulfill_key uuid := gen_random_uuid();
begin
  select id into strict req from comforce.requests where submission_key='42667ca8-5125-4db0-834e-000000000003';
  select id into strict food from comforce.needs where request_id=req and service='food';
  select id into strict ride from comforce.needs where request_id=req and service='transportation';
  perform public.update_need(food,'direct',p_key=>direct_key);
  perform public.update_need(food,'direct',p_key=>direct_key);
  perform public.update_need(food,'fulfill',p_key=>food_fulfill_key);
  perform public.update_need(food,'fulfill',p_key=>food_fulfill_key);
  assert (select count(*)=1 from comforce.history where need_id=food and action='fulfill');
  assert (select provider='ComForce' and fulfilled_at is not null from comforce.needs where id=food);
  perform public.update_need(ride,'assign',p_assignee=>'42667ca8-5125-4db0-834e-000000000004',p_key=>assign_key);
  perform public.update_need(ride,'assign',p_assignee=>'42667ca8-5125-4db0-834e-000000000004',p_key=>assign_key);
  begin
    perform public.update_need(ride,'assign',p_assignee=>'42667ca8-5125-4db0-834e-000000000001',p_key=>assign_key);
    raise exception 'Mismatched assignee retry was accepted';
  exception when invalid_parameter_value then null; end;
  perform public.update_need(ride,'refer','Example First',p_key=>first_referral_key);
  perform public.update_need(ride,'refer','Example First',p_key=>first_referral_key);
  select id into strict declined from comforce.referrals where need_id=ride;
  perform public.update_need(ride,'decline',p_referral=>declined,p_key=>decline_key);
  perform public.update_need(ride,'decline',p_referral=>declined,p_key=>decline_key);
  perform public.update_need(ride,'follow_up',p_when=>'2049-12-30 15:00-06',p_key=>follow_key);
  perform public.update_need(ride,'follow_up',p_when=>'2049-12-30 15:00-06',p_key=>follow_key);
  assert (select status='open' and follow_up is not null and owner='Test Caseworker'
          and assigned_staff_id='42667ca8-5125-4db0-834e-000000000004' from comforce.needs where id=ride);
  perform public.update_need(ride,'refer','Example Second',p_key=>second_referral_key);
  perform public.update_need(ride,'refer','Example Second',p_key=>second_referral_key);
  select id into strict accepted from comforce.referrals where need_id=ride and partner='Example Second';
  perform public.update_need(ride,'fulfill',p_referral=>accepted,p_key=>ride_fulfill_key);
  perform public.update_need(ride,'fulfill',p_referral=>accepted,p_key=>ride_fulfill_key);
  assert (select provider='Example Second' and follow_up is null from comforce.needs where id=ride);
  assert (select count(*)=2 from comforce.referrals where need_id=ride);
  assert not exists(select 1 from comforce.history where need_id in (food,ride) and operation_key is null);
  assert (select count(*) from comforce.need_operations where need_id in (food,ride)) =
         (select count(*) from comforce.history where need_id in (food,ride));
  assert (select bool_and(actor_uid='42667ca8-5125-4db0-834e-000000000001' and actor_role='administrator')
          from comforce.history where need_id in (food,ride) and actor_uid is not null);
end $$;
select 'ok 5 - confirmed staff can deliver, retry, record a refusal and reroute a ride';

-- Chicago is still in December at 04:30 UTC on Jan 1. Use a quiet future month
-- so edits made during a teammate walkthrough do not affect these totals.
update comforce.needs set fulfilled_at='2050-01-01 04:30+00' where request_id in (
  select id from comforce.requests where submission_key='42667ca8-5125-4db0-834e-000000000003'
);
update comforce.referrals set sent_at='2049-12-28 10:00-06',
  declined_at=case when declined_at is not null then '2049-12-29 10:00-06'::timestamptz end
where need_id in (select n.id from comforce.needs n join comforce.requests r on n.request_id=r.id
                  where r.submission_key='42667ca8-5125-4db0-834e-000000000003');
set local role anon;
do $$ begin
  perform set_config('comforce_test.template_totals', (
    select jsonb_agg(to_jsonb(i) order by i.month,i.neighborhood)::text from public.public_impact(null,true) i
  ),true);
end $$;
reset role;
set local role authenticated;
do $$
declare totals record;
begin
  assert not exists(select 1 from public.public_impact(null,true) where month='2049-12');
  assert (select jsonb_agg(to_jsonb(i) order by i.month,i.neighborhood) from public.public_impact(null,true) i)
    = current_setting('comforce_test.template_totals')::jsonb;
  select * into strict totals from public.public_impact() where month='2049-12' and neighborhood is null;
  assert (totals.requests_helped,totals.needs_fulfilled,totals.referrals_made,totals.food_fulfilled)
         = (1,2,2,1);
  assert (select count(*)=7 from jsonb_object_keys(to_jsonb(totals)));
  assert (select count(*)=1 from public.public_impact() where month='2049-12' and neighborhood='Harambee');
  assert not exists(select 1 from public.public_impact() where month='2050-01');
end $$;
reset role;
select 'ok 6 - public aggregates use Chicago outcome months and count each request once';

do $$
declare ref text; youth uuid; unmet_key uuid := gen_random_uuid();
begin
  ref := public.submit_request(gen_random_uuid(),array['youth'],'Hours did not fit','Unknown',
    'phone','414-555-0142','text');
  select n.id into strict youth from comforce.needs n join comforce.requests r on n.request_id=r.id
    where r.reference=ref;
  perform public.update_need(youth,'unmet','Family declined the offered time.',p_key=>unmet_key);
  perform public.update_need(youth,'unmet','Family declined the offered time.',p_key=>unmet_key);
  assert (select status='unmet' and fulfilled_at is null and provider is null
          and unmet_reason='Family declined the offered time.' from comforce.needs where id=youth);
end $$;
select 'ok 7 - closed-unmet needs preserve their reason and contribute zero fulfillments';

set local role authenticated;
do $$
declare queue jsonb; assigned_ref text; mixed_ref text;
begin
  queue := public.team_queue();
  assert exists(select 1 from jsonb_array_elements(queue) c
                where c->>'description'='Fictional test' and jsonb_array_length(c->'needs')=2);
  assigned_ref := public.submit_request(gen_random_uuid(),array['shelter'],'Assigned caseworker test','Unknown',
    'email','assigned@example.invalid','web');
  mixed_ref := public.submit_request(gen_random_uuid(),array['transportation','family_support'],
    'Mixed visibility test','Unknown','phone','414-555-0188','call',p_family=>jsonb_build_object(
      'support','Private sibling support','safe_contact','Do not leave voicemail',
      'agency','Private agency','agency_reference','PRIVATE-42'));
  perform set_config('comforce_test.assigned_ref',assigned_ref,true);
  perform set_config('comforce_test.mixed_ref',mixed_ref,true);
end $$;
reset role;

-- Fixture lookup stays privileged and selects each exact need before staff-role calls begin.
do $$
declare assigned_open uuid; mixed_transport uuid; mixed_family uuid; food uuid;
begin
  select n.id into strict assigned_open from comforce.needs n join comforce.requests r on r.id=n.request_id
    where r.reference=current_setting('comforce_test.assigned_ref') and n.service='shelter';
  select n.id into strict mixed_transport from comforce.needs n join comforce.requests r on r.id=n.request_id
    where r.reference=current_setting('comforce_test.mixed_ref') and n.service='transportation';
  select n.id into strict mixed_family from comforce.needs n join comforce.requests r on r.id=n.request_id
    where r.reference=current_setting('comforce_test.mixed_ref') and n.service='family_support';
  select n.id into strict food from comforce.needs n join comforce.requests r on r.id=n.request_id
    where r.submission_key='42667ca8-5125-4db0-834e-000000000003' and n.service='food';
  perform set_config('comforce_test.assigned_open',assigned_open::text,true);
  perform set_config('comforce_test.mixed_transport',mixed_transport::text,true);
  perform set_config('comforce_test.mixed_family',mixed_family::text,true);
  perform set_config('comforce_test.food',food::text,true);
end $$;

set local role authenticated;
do $$
declare assign_key uuid := gen_random_uuid();
begin
  perform public.update_need(current_setting('comforce_test.assigned_open')::uuid,'assign',
    p_assignee=>'42667ca8-5125-4db0-834e-000000000004',p_key=>assign_key);
  -- Compatibility for an already-open pre-role tab: owner label and no operation key.
  perform public.update_need(current_setting('comforce_test.mixed_transport')::uuid,'assign','Test Caseworker');
end $$;
reset role;
do $$
begin
  assert (select owner='Test Caseworker'
      and assigned_staff_id='42667ca8-5125-4db0-834e-000000000004'
    from comforce.needs where id=current_setting('comforce_test.mixed_transport')::uuid);
  assert exists(select 1 from comforce.history
    where need_id=current_setting('comforce_test.mixed_transport')::uuid
      and action='assign' and operation_key is not null);
end $$;
select 'ok 8 - staff fixtures use exact private lookups and legacy assignment tabs remain compatible';

-- A caseworker receives only assigned needs, and request-level family details follow the family need.
set local request.jwt.claims = '{"sub":"42667ca8-5125-4db0-834e-000000000004","email":"caseworker-test@example.invalid","role":"authenticated"}';
set local role authenticated;
do $$
declare queue jsonb; context jsonb; phone_ref text; direct_key uuid := gen_random_uuid();
  mixed_case jsonb;
begin
  queue := public.team_queue();
  select q into strict mixed_case from jsonb_array_elements(queue) q
    where q->>'reference'=current_setting('comforce_test.mixed_ref');
  assert jsonb_array_length(mixed_case->'needs')=1;
  assert mixed_case->'needs'->0->>'service'='transportation';
  assert mixed_case->'family_support'='null'::jsonb;
  assert not exists(select 1 from jsonb_array_elements(queue) q, jsonb_array_elements(q->'needs') n
                    where (n->>'id')::uuid=current_setting('comforce_test.food')::uuid);
  assert exists(select 1 from jsonb_array_elements(queue) q, jsonb_array_elements(q->'needs') n
                where (n->>'id')::uuid=current_setting('comforce_test.assigned_open')::uuid);
  context := public.staff_context();
  assert context->>'role'='caseworker' and context->>'display_name'='Test Caseworker'
    and context->>'can_assign'='false' and jsonb_array_length(context->'staff')=0;
  begin
    perform public.update_need(current_setting('comforce_test.food')::uuid,'direct',p_key=>gen_random_uuid());
    raise exception 'caseworker altered an unassigned sibling need';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_need(current_setting('comforce_test.mixed_transport')::uuid,'assign',
      p_assignee=>'42667ca8-5125-4db0-834e-000000000001',p_key=>gen_random_uuid());
    raise exception 'caseworker reassigned a case';
  exception when insufficient_privilege then null; end;
  perform public.update_need(current_setting('comforce_test.assigned_open')::uuid,'direct',p_key=>direct_key);
  phone_ref := public.submit_request(gen_random_uuid(),array['youth'],'Caseworker phone receipt','Unknown',
    'phone','414-555-0177','call');
  queue := public.team_queue();
  assert exists(select 1 from jsonb_array_elements(queue) q, jsonb_array_elements(q->'needs') n
    where q->>'reference'=phone_ref and n->>'owner'='Test Caseworker'
      and (n->>'assigned_staff_id')::uuid='42667ca8-5125-4db0-834e-000000000004');
  perform set_config('comforce_test.phone_ref',phone_ref,true);
end $$;
reset role;
do $$
begin
  assert exists(select 1 from comforce.history
    where need_id=current_setting('comforce_test.assigned_open')::uuid and action='direct'
      and actor_uid='42667ca8-5125-4db0-834e-000000000004' and actor_role='caseworker');
  assert exists(select 1 from comforce.requests r join comforce.needs n on n.request_id=r.id
    where r.reference=current_setting('comforce_test.phone_ref')
      and r.submitted_by='42667ca8-5125-4db0-834e-000000000004'
      and n.assigned_staff_id='42667ca8-5125-4db0-834e-000000000004');
end $$;
select 'ok 9 - caseworkers see assigned needs without sibling family details and retain phone intake access';

set local request.jwt.claims = '{"sub":"42667ca8-5125-4db0-834e-000000000001","email":"worker-test@example.invalid","role":"authenticated"}';
set local role authenticated;
do $$
declare context jsonb; queue jsonb; mixed_case jsonb;
begin
  context := public.staff_context();
  assert context->>'role'='administrator' and context->>'can_assign'='true'
    and jsonb_array_length(context->'staff')=2;
  queue := public.team_queue();
  select q into strict mixed_case from jsonb_array_elements(queue) q
    where q->>'reference'=current_setting('comforce_test.mixed_ref');
  assert mixed_case->'family_support'->>'safe_contact'='Do not leave voicemail';
end $$;
reset role;
do $$
begin
  assert not exists(select 1 from comforce.audit_log where actor_uid is null);
  assert exists(select 1 from comforce.audit_log
    where actor_uid='42667ca8-5125-4db0-834e-000000000001' and action='request_submit');
  assert exists(select 1 from comforce.audit_log
    where actor_uid='42667ca8-5125-4db0-834e-000000000001' and action='assign'
      and (detail->>'assignee')::uuid='42667ca8-5125-4db0-834e-000000000004');
  assert exists(select 1 from comforce.audit_log
    where actor_uid='42667ca8-5125-4db0-834e-000000000004' and actor_role='caseworker' and action='direct');
end $$;
select 'ok 10 - administrators receive the full case and every real action is attributable';
rollback;
