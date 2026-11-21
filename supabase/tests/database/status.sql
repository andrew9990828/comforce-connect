-- Rollback-only TAP checks. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 tested status privacy, verification and stages.
begin;
set local plpgsql.check_asserts = on;
select '1..3';

set local role anon;
do $$
declare
  a jsonb := public.create_demo_workspace(); b jsonb := public.create_demo_workspace();
  ref text; s jsonb; need_food uuid; q jsonb;
begin
  ref := public.submit_request(gen_random_uuid(),array['food','transportation'],'Fictional groceries and a ride.','Riverwest',
    'text','(414) 555-0187','web',a->>'resident_token');
  s := public.request_status(ref,'0187',a->>'resident_token');
  assert jsonb_array_length(s->'needs') = 2;
  assert (select bool_and(n->>'stage' = 'received') from jsonb_array_elements(s->'needs') n);
  assert not (s ? 'contact') and not (s ? 'description');
  assert public.request_status(replace(ref,'CF-',''),'0187',a->>'resident_token')->>'reference' = ref;
  begin
    perform public.request_status(ref,'9999',a->>'resident_token');
    raise exception 'Wrong digits revealed a status';
  exception when no_data_found then null; end;
  begin
    perform public.request_status(ref,'0187',b->>'resident_token');
    raise exception 'Another workspace could read this status';
  exception when no_data_found then null; end;
  begin
    perform public.request_status(ref,'0187',null);
    raise exception 'An unscoped visitor could read a status';
  exception when insufficient_privilege then null; end;
  perform set_config('comforce_test.a',a::text,true);
  perform set_config('comforce_test.ref',ref,true);
end $$;
select 'ok 1 - status needs the reference, contact check and the same workspace, and hides contact details';

do $$
declare
  a jsonb := current_setting('comforce_test.a')::jsonb; ref text := current_setting('comforce_test.ref');
  q jsonb; food uuid; ride uuid; s jsonb;
begin
  q := public.team_queue(a->>'staff_token');
  select (n->>'id')::uuid into food from jsonb_array_elements(q) c, jsonb_array_elements(c->'needs') n
    where c->>'reference' = ref and n->>'service' = 'food';
  select (n->>'id')::uuid into ride from jsonb_array_elements(q) c, jsonb_array_elements(c->'needs') n
    where c->>'reference' = ref and n->>'service' = 'transportation';
  perform public.update_need(food,'refer','Demo Pantry',null,null,a->>'staff_token',p_key=>gen_random_uuid());
  perform public.update_need(ride,'unmet','Private internal reason',null,null,a->>'staff_token',p_key=>gen_random_uuid());
  s := public.request_status(ref,'0187',a->>'resident_token');
  assert (select n->>'stage' = 'in_progress' and n->>'partner' = 'Demo Pantry'
          from jsonb_array_elements(s->'needs') n where n->>'service' = 'food');
  assert (select n->>'stage' = 'closed' from jsonb_array_elements(s->'needs') n where n->>'service' = 'transportation');
  assert position('Private internal reason' in s::text) = 0;
  perform public.update_need(food,'fulfill',null,
    (select (f->>'id')::uuid from jsonb_array_elements(public.team_queue(a->>'staff_token')) c,
       jsonb_array_elements(c->'needs') n, jsonb_array_elements(n->'referrals') f
     where c->>'reference' = ref and n->>'service' = 'food'),null,a->>'staff_token',p_key=>gen_random_uuid());
  s := public.request_status(ref,'0187',a->>'resident_token');
  assert (select n->>'stage' = 'delivered' and n->>'provider' = 'Demo Pantry'
          from jsonb_array_elements(s->'needs') n where n->>'service' = 'food');
end $$;
select 'ok 2 - stages follow casework, credit the provider and never expose unmet reasons';

-- Verified staff follow the team queue's assignment rule, so a split request shows each caseworker only their own need.
reset role;
insert into comforce.staff(email,display_name,role) values
  ('status-admin@example.invalid','Status Administrator','administrator'),
  ('status-ride@example.invalid','Ride Caseworker','caseworker'),
  ('status-family@example.invalid','Family Caseworker','caseworker'),
  ('status-idle@example.invalid','Idle Caseworker','caseworker');
insert into auth.users(id,email,email_confirmed_at) values
  ('5a7a7a00-0000-4000-8000-000000000001','status-admin@example.invalid',now()),
  ('5a7a7a00-0000-4000-8000-000000000002','status-ride@example.invalid',now()),
  ('5a7a7a00-0000-4000-8000-000000000003','status-family@example.invalid',now()),
  ('5a7a7a00-0000-4000-8000-000000000004','status-idle@example.invalid',now());
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a7a7a00-0000-4000-8000-000000000001","email":"status-admin@example.invalid","role":"authenticated"}';
do $$
declare ref text; ride uuid; family uuid; s jsonb;
begin
  ref := public.submit_request('5a7a7a00-0000-4000-8000-0000000000aa',array['transportation','family_support'],
    'Fictional split request','Riverwest','text','(414) 555-0142','web',p_family=>'{"support":"A fictional callback","safe_contact":"Fictional relative"}');
  select (n->>'id')::uuid into strict ride from jsonb_array_elements(public.team_queue()) c, jsonb_array_elements(c->'needs') n
    where c->>'reference' = ref and n->>'service' = 'transportation';
  select (n->>'id')::uuid into strict family from jsonb_array_elements(public.team_queue()) c, jsonb_array_elements(c->'needs') n
    where c->>'reference' = ref and n->>'service' = 'family_support';
  perform public.update_need(ride,'assign',p_assignee=>'5a7a7a00-0000-4000-8000-000000000002',p_key=>gen_random_uuid());
  perform public.update_need(family,'assign',p_assignee=>'5a7a7a00-0000-4000-8000-000000000003',p_key=>gen_random_uuid());
  perform public.update_need(family,'refer','Private Family Partner',p_key=>gen_random_uuid());
  s := public.request_status(ref,'0142');
  assert jsonb_array_length(s->'needs') = 2, 'administrators see every need';
  perform set_config('comforce_test.split_ref',ref,true);
end $$;

set local request.jwt.claims = '{"sub":"5a7a7a00-0000-4000-8000-000000000002","email":"status-ride@example.invalid","role":"authenticated"}';
do $$
declare s jsonb := public.request_status(current_setting('comforce_test.split_ref'),'0142');
begin
  assert jsonb_array_length(s->'needs') = 1 and s->'needs'->0->>'service' = 'transportation';
  assert position('family_support' in s::text) = 0 and position('Private Family Partner' in s::text) = 0,
    'the ride caseworker saw the sibling family-support need';
end $$;

set local request.jwt.claims = '{"sub":"5a7a7a00-0000-4000-8000-000000000003","email":"status-family@example.invalid","role":"authenticated"}';
do $$
declare s jsonb := public.request_status(current_setting('comforce_test.split_ref'),'0142');
begin
  assert jsonb_array_length(s->'needs') = 1 and s->'needs'->0->>'service' = 'family_support';
  assert s->'needs'->0->>'partner' = 'Private Family Partner';
end $$;

set local request.jwt.claims = '{"sub":"5a7a7a00-0000-4000-8000-000000000004","email":"status-idle@example.invalid","role":"authenticated"}';
do $$
begin
  perform public.request_status(current_setting('comforce_test.split_ref'),'0142');
  raise exception 'A caseworker with no assigned need could read the request';
exception when no_data_found then null; end $$;

set local request.jwt.claims = '{"sub":"42667ca8-5125-4db0-834e-0000000000ff","email":"not-staff@example.invalid","role":"authenticated"}';
do $$
begin
  perform public.request_status(current_setting('comforce_test.split_ref'),'0142');
  raise exception 'A signed-in visitor could read a staff-scope request';
exception when insufficient_privilege then null; end $$;
reset role;
select 'ok 3 - verified staff see only the needs the team queue shows them';
rollback;
