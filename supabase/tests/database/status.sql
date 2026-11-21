-- Rollback-only TAP checks. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 tested status privacy, verification and stages.
begin;
set local plpgsql.check_asserts = on;
select '1..2';

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
rollback;
