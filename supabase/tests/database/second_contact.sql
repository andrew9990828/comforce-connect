-- Rollback-only checks for optional contact storage and retries. Codex (GPT-6).
begin;
set local plpgsql.check_asserts = on;
select '1..1';
set local role anon;
do $$
declare
  demo jsonb := public.create_demo_workspace();
  submission uuid := gen_random_uuid();
  ref text;
  item jsonb;
begin
  ref := public.submit_request(submission,array['food'],'Groceries','Unknown','text','4145550100','web',
    demo->>'resident_token',null,'email',' resident@example.invalid ');
  select value into strict item from jsonb_array_elements(public.team_queue(demo->>'staff_token'))
    where value->>'reference' = ref;
  assert item->>'second_method' = 'email' and item->>'second_contact' = 'resident@example.invalid';
  assert public.submit_request(submission,array['food'],'Groceries','Unknown','text','4145550100','web',
    demo->>'resident_token',null,'email','resident@example.invalid') = ref;
  begin
    perform public.submit_request(submission,array['food'],'Groceries','Unknown','text','4145550100','web',
      demo->>'resident_token');
    raise exception 'Conflicting second choice accepted on retry';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_request(gen_random_uuid(),array['food'],'Groceries','Unknown','text','4145550100','web',
      demo->>'resident_token',null,'text','4145550100');
    raise exception 'Duplicate contact method accepted';
  exception when check_violation then null; end;
end $$;
select 'ok 1 - second choice persists with scoped case and retry validation';
rollback;
