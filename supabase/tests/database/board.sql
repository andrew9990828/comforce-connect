-- Rollback-only TAP checks. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 tested board seeding, offers and privacy.
begin;
set local plpgsql.check_asserts = on;
select '1..3';

set local role anon;
do $$
declare
  a jsonb := public.create_demo_workspace(); b jsonb := public.create_demo_workspace();
  board jsonb; coats uuid; skill uuid; k uuid := gen_random_uuid();
begin
  board := public.community_board(a->>'resident_token');
  assert jsonb_array_length(board->'items') = 9;
  assert jsonb_array_length(public.community_board(a->>'resident_token')->'items') = 9;
  select (i->>'id')::uuid into strict coats from jsonb_array_elements(board->'items') i where i->>'title' like 'Winter coats%';
  select (i->>'id')::uuid into strict skill from jsonb_array_elements(board->'items') i where i->>'title' = 'Volunteer drivers';
  perform public.offer_help(k,coats,'Dee','text','(414) 555-0142',6,'Mostly kids sizes',a->>'resident_token');
  perform public.offer_help(k,coats,'Dee','text','(414) 555-0142',6,'Mostly kids sizes',a->>'resident_token');
  perform public.offer_help(gen_random_uuid(),skill,'Sam','email','sam@example.com',null,null,a->>'resident_token');
  board := public.community_board(a->>'resident_token');
  assert (select (i->>'pledged')::int = 6 from jsonb_array_elements(board->'items') i where (i->>'id')::uuid = coats);
  assert (board->>'offers_this_month')::int = 2;
  assert position('555-0142' in board::text) = 0 and position('Dee' in board::text) = 0;
  begin
    perform public.offer_help(gen_random_uuid(),coats,'Dee','text','(414) 555-0142',null,null,a->>'resident_token');
    raise exception 'Supply offer without a quantity was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.offer_help(gen_random_uuid(),coats,'Eve','text','(414) 555-0143',1,null,b->>'resident_token');
    raise exception 'Another workspace could offer on this item';
  exception when no_data_found then null; end;
  begin
    perform public.team_board(a->>'resident_token');
    raise exception 'A resident link could read volunteer contacts';
  exception when insufficient_privilege then null; end;
  assert (public.community_board(b->>'resident_token')->>'offers_this_month')::int = 0;
  perform set_config('comforce_test.a',a::text,true);
end $$;
select 'ok 1 - each workspace gets one starter board; offers are idempotent, scoped and hidden from the public';

do $$
declare
  a jsonb := current_setting('comforce_test.a')::jsonb; team jsonb; event uuid; offer uuid;
begin
  team := public.team_board(a->>'staff_token');
  assert jsonb_array_length(team->'offers') = 2;
  assert exists(select 1 from jsonb_array_elements(team->'offers') o where o->>'contact' = '(414) 555-0142');
  perform public.manage_board('add_item',p_data=>'{"kind":"event","title":"Tiny test event","detail":"Fictional.","starts_at":"2026-12-01T16:00:00Z","goal":1}',
    p_token=>a->>'staff_token');
  select (i->>'id')::uuid into strict event from jsonb_array_elements(public.team_board(a->>'staff_token')->'items') i
    where i->>'title' = 'Tiny test event';
  perform public.offer_help(gen_random_uuid(),event,'Pat','text','(414) 555-0144',null,null,a->>'resident_token');
  begin
    perform public.offer_help(gen_random_uuid(),event,'Lee','text','(414) 555-0145',null,null,a->>'resident_token');
    raise exception 'A full event accepted another sign-up';
  exception when invalid_parameter_value then null; end;
  select (o->>'id')::uuid into strict offer from jsonb_array_elements(public.team_board(a->>'staff_token')->'offers') o where o->>'name' = 'Pat';
  perform public.manage_board('offer_status',p_offer=>offer,p_data=>'{"status":"confirmed"}',p_token=>a->>'staff_token');
  select (o->>'id')::uuid into strict offer from jsonb_array_elements(public.team_board(a->>'staff_token')->'offers') o where o->>'name' = 'Dee';
  perform public.manage_board('offer_status',p_offer=>offer,p_data=>'{"status":"confirmed"}',p_token=>a->>'staff_token');
  assert (select (i->>'pledged')::int = 0 from jsonb_array_elements(public.community_board(a->>'resident_token')->'items') i
          where i->>'title' like 'Winter coats%');
  perform public.manage_board('close_item',p_item=>event,p_token=>a->>'staff_token');
  assert not exists(select 1 from jsonb_array_elements(public.community_board(a->>'resident_token')->'items') i
                    where (i->>'id')::uuid = event);
end $$;
select 'ok 2 - staff see contacts, add items, update offers, and closed or full items stop taking offers';

do $$
declare a jsonb := current_setting('comforce_test.a')::jsonb;
begin
  begin
    perform public.manage_board('close_item',p_item=>gen_random_uuid(),p_token=>a->>'resident_token');
    raise exception 'A resident link could manage the board';
  exception when insufficient_privilege then null; end;
end $$;
select 'ok 3 - resident links cannot manage the board';
rollback;
