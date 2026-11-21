-- Rollback-only TAP checks. OpenAI Codex (GPT-6) tested bounded capability isolation, family intake, history and callback accounting.
begin;
set local plpgsql.check_asserts = on;
select '1..4';

do $$ begin
  perform set_config('comforce_test.workspace_before',(select count(*)::text from comforce.workspaces),true);
end $$;
set local role anon;
do $$
declare
  a jsonb := public.create_demo_workspace(); b jsonb := public.create_demo_workspace();
begin
  perform set_config('comforce_test.a',a::text,true);
  perform set_config('comforce_test.b',b::text,true);
  assert a->>'workspace_id' <> b->>'workspace_id';
  assert a->>'resident_token' <> a->>'staff_token';
  assert length(a->>'staff_token')=64 and length(a->>'resident_token')=64;
  assert (a->>'expires_at')::timestamptz between statement_timestamp()+interval '23 hours'
    and statement_timestamp()+interval '25 hours';
  assert (select count(distinct month)>=8 from public.public_impact(a->>'resident_token'));
  assert jsonb_array_length(public.team_queue(a->>'staff_token')) > 0;
  begin
    perform public.team_queue(a->>'resident_token');
    raise exception 'Resident link could read a queue';
  exception when insufficient_privilege then null; end;
  begin
    perform public.team_queue(null);
    raise exception 'Unverified visitor read original staff records';
  exception when insufficient_privilege then null; end;
  assert (select count(distinct month)>=8 from public.public_impact(null));
  begin
    perform public.submit_request(gen_random_uuid(),array['food'],'Fictional','Unknown','text','414-555-0121',
      'call',a->>'resident_token');
    raise exception 'Resident link could log a staff phone call';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from comforce.workspaces)=current_setting('comforce_test.workspace_before')::bigint+2;
end $$;
set local role anon;
select 'ok 1 - shared impact is read-only and demo capabilities are separate, expiring and seeded';

do $$
declare
  a jsonb := current_setting('comforce_test.a')::jsonb; b jsonb := current_setting('comforce_test.b')::jsonb;
  k uuid := gen_random_uuid();
  family jsonb := '{"support":"A callback","safe_contact":"Text first","agency":"Fictional partner","agency_reference":"TEST-3"}';
  ref text; second_ref text; entry jsonb; family_id uuid; ride_id uuid;
begin
  ref := public.submit_request(k,array['family_support','transportation'],'Two needs','Harambee','text',
    '414-555-0121','web',a->>'resident_token',family);
  assert ref = public.submit_request(k,array['transportation','family_support'],'Two needs','Harambee','text',
    '414-555-0121','web',a->>'resident_token',family);
  second_ref := public.submit_request(k,array['food'],'Independent request','Unknown','email','test@example.invalid',
    'web',b->>'resident_token');
  assert ref <> second_ref;
  begin
    perform public.submit_request(k,array['family_support','transportation'],'Two needs','Harambee','text',
      '414-555-0121','web',a->>'resident_token',family || '{"safe_contact":"Different"}'::jsonb);
    raise exception 'Mismatched retry was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_request(gen_random_uuid(),array['family_support'],'Incomplete','Harambee','text',
      '414-555-0121','web',a->>'resident_token','{"support":"A callback"}');
    raise exception 'Missing safe-contact instructions accepted';
  exception when invalid_parameter_value then null; end;
  select q into strict entry from jsonb_array_elements(public.team_queue(a->>'staff_token')) q where q->>'reference'=ref;
  assert entry->'family_support' = family and jsonb_array_length(entry->'needs')=2;
  select (n->>'id')::uuid into strict family_id from jsonb_array_elements(entry->'needs') n where n->>'service'='family_support';
  select (n->>'id')::uuid into strict ride_id from jsonb_array_elements(entry->'needs') n where n->>'service'='transportation';
  assert not exists(select 1 from jsonb_array_elements(public.team_queue(b->>'staff_token')) q where q->>'reference'=ref);
  begin
    perform public.update_need(family_id,'assign','Wrong worker',p_token=>b->>'staff_token');
    raise exception 'Other workspace could alter a case';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_need(family_id,'assign','Wrong worker',p_token=>a->>'resident_token');
    raise exception 'Resident link could alter a case';
  exception when insufficient_privilege then null; end;
  perform set_config('comforce_test.family',family_id::text,true);
  perform set_config('comforce_test.ride',ride_id::text,true);
  perform set_config('comforce_test.reference',ref,true);
end $$;
select 'ok 2 - atomic multineed intake, safe retry and cross-workspace access guards';

do $$
declare
  a jsonb := current_setting('comforce_test.a')::jsonb; b jsonb := current_setting('comforce_test.b')::jsonb;
  family_id uuid := current_setting('comforce_test.family')::uuid;
  ride_id uuid := current_setting('comforce_test.ride')::uuid;
  k uuid := gen_random_uuid(); happened timestamptz := now();
  period text := to_char(happened at time zone 'America/Chicago','YYYY-MM');
  initial_callbacks bigint; initial_fulfilled bigint; outsider_callbacks bigint; overview record; need jsonb;
begin
  select coalesce(sum(family_followups),0),coalesce(sum(needs_fulfilled),0) into initial_callbacks,initial_fulfilled
    from public.public_impact(a->>'resident_token') where neighborhood is null and month=period;
  select coalesce(sum(family_followups),0) into outsider_callbacks from public.public_impact(b->>'resident_token')
    where neighborhood is null and month=period;
  perform public.update_need(family_id,'assign','Von',p_token=>a->>'staff_token');
  perform public.update_need(family_id,'partner_contact','Sample partner',p_token=>a->>'staff_token');
  perform public.update_need(family_id,'follow_up',p_when=>happened,p_token=>a->>'staff_token');
  perform public.update_need(family_id,'check_in','Reviewed support options',p_when=>happened,p_token=>a->>'staff_token',
    p_source=>'Family phone conversation',p_key=>k);
  perform public.update_need(family_id,'check_in','Reviewed support options',p_when=>happened,p_token=>a->>'staff_token',
    p_source=>'Family phone conversation',p_key=>k);
  select * into strict overview from public.public_impact(a->>'resident_token') where month=period and neighborhood is null;
  assert overview.family_followups=initial_callbacks+1 and overview.needs_fulfilled=initial_fulfilled;
  assert (select count(*)=7 from jsonb_object_keys(to_jsonb(overview))) and to_jsonb(overview) ?&
    array['family_followups','food_fulfilled','month','neighborhood','needs_fulfilled','referrals_made','requests_helped'];
  assert outsider_callbacks=(select coalesce(sum(family_followups),0) from public.public_impact(b->>'resident_token')
    where month=period and neighborhood is null);
  for need in select n from jsonb_array_elements(public.team_queue(a->>'staff_token')) q,
    jsonb_array_elements(q->'needs') n where q->>'reference'=current_setting('comforce_test.reference')
  loop
    assert need->>'status'='open';
    if (need->>'id')::uuid=family_id then
      assert need->>'owner'='Von' and need->>'partner_contact'='Sample partner' and need->>'follow_up' is null;
      assert (select count(*)=1 from jsonb_array_elements(need->'history') h
        where h->>'action'='check_in' and h->>'source'='Family phone conversation'
        and h->>'detail'='Reviewed support options' and (h->>'at')::timestamptz=happened);
    else
      assert (need->>'id')::uuid=ride_id and need->>'owner' is null;
    end if;
  end loop;
end $$;
select 'ok 3 - one verified callback, private outcome history, open ride and scoped public counts';

reset role;
insert into comforce.workspaces(staff_digest,resident_digest)
select sha256(convert_to('capacity-staff-'||n,'UTF8')),sha256(convert_to('capacity-resident-'||n,'UTF8'))
from generate_series(1,48) n;
set local role anon;
do $$
begin
  begin
    perform public.create_demo_workspace();
    raise exception 'Workspace capacity was not enforced';
  exception when program_limit_exceeded then null; end;
end $$;
reset role;
update comforce.workspaces set created_at=statement_timestamp()-interval '2 seconds',
  expires_at=statement_timestamp()-interval '1 second'
where id=(current_setting('comforce_test.b')::jsonb->>'workspace_id')::uuid;
set local role anon;
do $$
declare b jsonb := current_setting('comforce_test.b')::jsonb; replacement jsonb;
begin
  replacement := public.create_demo_workspace();
  assert replacement->>'workspace_id' <> b->>'workspace_id';
  begin
    perform public.team_queue(b->>'staff_token');
    raise exception 'Expired workspace credential remained valid';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare b jsonb := current_setting('comforce_test.b')::jsonb;
begin
  assert not exists(select 1 from comforce.workspaces where id=(b->>'workspace_id')::uuid);
  assert not exists(select 1 from comforce.requests where workspace_id=(b->>'workspace_id')::uuid);
end $$;
select 'ok 4 - active workspace cap, expiry cleanup and cascading deletion are enforced';
rollback;
