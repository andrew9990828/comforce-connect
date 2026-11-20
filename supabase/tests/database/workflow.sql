-- Rollback-only TAP checks. Contributor: OpenAI Codex (GPT-6), access, atomicity and accounting tests.
begin;
set local plpgsql.check_asserts = on;
select '1..8';

-- One temporary staff login and one visitor. The application authenticates with GoTrue.
insert into comforce.staff(email) values ('worker-test@example.invalid');
insert into auth.users(id,email,email_confirmed_at) values
  ('42667ca8-5125-4db0-834e-000000000001','worker-test@example.invalid',now()),
  ('42667ca8-5125-4db0-834e-000000000002','visitor-test@example.invalid',now());

do $$
begin
  assert (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='comforce' and c.relkind='r'), 'private tables must enable RLS';
  assert not has_schema_privilege('anon','comforce','usage');
  assert not has_schema_privilege('authenticated','comforce','usage');
  assert to_regprocedure('public.team_queue()') is null;
  assert to_regprocedure('public.update_need(uuid,text,text,uuid,timestamptz)') is null;
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
declare food uuid; ride uuid; declined uuid; accepted uuid; req uuid;
begin
  select id into strict req from comforce.requests where submission_key='42667ca8-5125-4db0-834e-000000000003';
  select id into strict food from comforce.needs where request_id=req and service='food';
  select id into strict ride from comforce.needs where request_id=req and service='transportation';
  perform public.update_need(food,'direct');
  perform public.update_need(food,'fulfill');
  perform public.update_need(food,'fulfill');
  assert (select count(*)=1 from comforce.history where need_id=food and action='fulfill');
  assert (select provider='ComForce' and fulfilled_at is not null from comforce.needs where id=food);
  perform public.update_need(ride,'assign','Dee');
  perform public.update_need(ride,'refer','Example First');
  select id into strict declined from comforce.referrals where need_id=ride;
  perform public.update_need(ride,'decline',p_referral=>declined);
  perform public.update_need(ride,'follow_up',p_when=>'2049-12-30 15:00-06');
  assert (select status='open' and follow_up is not null and owner='Dee' from comforce.needs where id=ride);
  perform public.update_need(ride,'refer','Example Second');
  select id into strict accepted from comforce.referrals where need_id=ride and partner='Example Second';
  perform public.update_need(ride,'fulfill',p_referral=>accepted);
  assert (select provider='Example Second' and follow_up is null from comforce.needs where id=ride);
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
set local role authenticated;
do $$
declare totals record;
begin
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
declare ref text; youth uuid;
begin
  ref := public.submit_request(gen_random_uuid(),array['youth'],'Hours did not fit','Unknown',
    'phone','414-555-0142','text');
  select n.id into strict youth from comforce.needs n join comforce.requests r on n.request_id=r.id
    where r.reference=ref;
  perform public.update_need(youth,'unmet','Family declined the offered time.');
  assert (select status='unmet' and fulfilled_at is null and provider is null
          and unmet_reason='Family declined the offered time.' from comforce.needs where id=youth);
end $$;
select 'ok 7 - closed-unmet needs preserve their reason and contribute zero fulfillments';

set local role authenticated;
do $$
declare queue jsonb;
begin
  queue := public.team_queue();
  assert exists(select 1 from jsonb_array_elements(queue) c
                where c->>'description'='Fictional test' and jsonb_array_length(c->'needs')=2);
end $$;
reset role;
select 'ok 8 - staff queue includes both sibling needs';
rollback;
