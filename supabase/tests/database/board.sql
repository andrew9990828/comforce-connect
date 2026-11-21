-- Rollback-only TAP checks. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 tested board seeding, offers and privacy.
begin;
set local plpgsql.check_asserts = on;
select '1..8';

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
  perform public.manage_board('add_item',p_data=>jsonb_build_object('key',gen_random_uuid(),'kind','event','title','Tiny test event',
    'detail','Fictional.','starts_at',now() + interval '7 days','goal',1),p_token=>a->>'staff_token');
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
  perform public.manage_board('receive_offer',p_offer=>offer,p_data=>'{"received":6}',p_token=>a->>'staff_token');
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

-- Two staff views both saw 34 coats. Each records a different offer; neither overwrites the other.
do $$
declare
  w jsonb := public.create_demo_workspace(); t text := w->>'staff_token'; r text := w->>'resident_token';
  coats uuid; six uuid; four uuid; item jsonb;
begin
  select (i->>'id')::uuid into strict coats from jsonb_array_elements(public.community_board(r)->'items') i where i->>'title' like 'Winter coats%';
  perform public.offer_help(gen_random_uuid(),coats,'Dee','text','(414) 555-0142',6,null,r);
  perform public.offer_help(gen_random_uuid(),coats,'Eve','text','(414) 555-0143',4,null,r);
  select (o->>'id')::uuid into strict six from jsonb_array_elements(public.team_board(t)->'offers') o where o->>'name'='Dee';
  select (o->>'id')::uuid into strict four from jsonb_array_elements(public.team_board(t)->'offers') o where o->>'name'='Eve';
  perform public.manage_board('receive_offer',p_offer=>six,p_data=>'{"received":6}',p_token=>t);
  perform public.manage_board('receive_offer',p_offer=>four,p_data=>'{"received":4}',p_token=>t);
  perform public.manage_board('receive_offer',p_offer=>four,p_data=>'{"received":4}',p_token=>t); -- retry
  select i into strict item from jsonb_array_elements(public.community_board(r)->'items') i where (i->>'id')::uuid=coats;
  assert (item->>'collected')::int = 44 and (item->>'pledged')::int = 0, item::text;
  assert (select count(*) = 2 from jsonb_array_elements(public.team_board(t)->'offers') o where o->>'status'='confirmed');
  -- Correction: only five of Dee's six arrived.
  perform public.manage_board('receive_offer',p_offer=>six,p_data=>'{"received":5}',p_token=>t);
  assert (select (i->>'collected')::int = 43 from jsonb_array_elements(public.community_board(r)->'items') i where (i->>'id')::uuid=coats);
  -- Undo: Eve's coats did not come after all, so they are on the way again and no longer received.
  perform public.manage_board('offer_status',p_offer=>four,p_data=>'{"status":"contacted"}',p_token=>t);
  select i into strict item from jsonb_array_elements(public.community_board(r)->'items') i where (i->>'id')::uuid=coats;
  assert (item->>'collected')::int = 39 and (item->>'pledged')::int = 4, item::text;
  begin
    perform public.manage_board('offer_status',p_offer=>four,p_data=>'{"status":"confirmed"}',p_token=>t);
    raise exception 'A supply offer was marked received without a count';
  exception when invalid_parameter_value then null; end;
  -- Manual adjustments are separate and refuse to overwrite a count the editor did not see.
  perform public.manage_board('set_collected',p_item=>coats,p_data=>'{"collected":36,"expected":34}',p_token=>t);
  perform public.manage_board('set_collected',p_item=>coats,p_data=>'{"collected":36,"expected":34}',p_token=>t); -- retry
  begin
    perform public.manage_board('set_collected',p_item=>coats,p_data=>'{"collected":40,"expected":34}',p_token=>t);
    raise exception 'A stale manual count overwrote a newer one';
  exception when serialization_failure then null; end;
  assert (select (i->>'collected')::int = 41 from jsonb_array_elements(public.community_board(r)->'items') i where (i->>'id')::uuid=coats);
end $$;
select 'ok 4 - supply receipts are credited once per offer, survive retries and corrections, and manual counts stay separate';

do $$
declare w jsonb := public.create_demo_workspace(); t text := w->>'staff_token'; k uuid := gen_random_uuid(); first jsonb; again jsonb;
  d jsonb;
begin
  d := jsonb_build_object('key',k,'kind','supply','title','Winter gloves','detail','Fictional.','goal',20);
  first := public.manage_board('add_item',p_data=>d,p_token=>t);
  again := public.manage_board('add_item',p_data=>d,p_token=>t);
  assert first->>'id' = again->>'id';
  assert (select count(*) = 1 from jsonb_array_elements(public.team_board(t)->'items') i where i->>'title'='Winter gloves');
  begin
    perform public.manage_board('add_item',p_data=>'{"kind":"supply","title":"No key","detail":"Fictional.","goal":2}',p_token=>t);
    raise exception 'An item was created without an operation key';
  exception when invalid_parameter_value then null; end;
end $$;
select 'ok 5 - repeated item creation with one key creates one item';

do $$
declare w jsonb := public.create_demo_workspace(); t text := w->>'staff_token'; r text := w->>'resident_token'; k uuid := gen_random_uuid();
  event uuid;
begin
  event := (public.manage_board('add_item',p_data=>jsonb_build_object('key',gen_random_uuid(),'kind','event','title','Last seat',
    'detail','Fictional.','starts_at',now() + interval '2 days','goal',1),p_token=>t)->>'id')::uuid;
  assert public.offer_help(k,event,'Pat','text','(414) 555-0144',null,null,r)->>'title' = 'Last seat';
  -- The same submission arriving again after the event filled returns the original result, not "full".
  assert public.offer_help(k,event,'Pat','text','(414) 555-0144',null,null,r)->>'title' = 'Last seat';
  assert (select count(*) = 1 from jsonb_array_elements(public.team_board(t)->'offers') o where (o->>'item_id')::uuid = event);
end $$;
select 'ok 6 - a repeated sign-up for the last seat returns the original result';

reset role;
do $$
declare w jsonb := public.create_demo_workspace(); r text := w->>'resident_token'; past uuid;
begin
  perform public.community_board(r);
  insert into comforce.board_items(workspace_id,kind,title,detail,starts_at,goal)
    values((w->>'workspace_id')::uuid,'event','Earlier cleanup','Fictional.',now() - interval '7 days',10) returning id into past;
  perform set_config('comforce_test.w',w::text,true);
  perform set_config('comforce_test.past',past::text,true);
end $$;
set local role anon;
do $$
declare w jsonb := current_setting('comforce_test.w')::jsonb; past uuid := current_setting('comforce_test.past')::uuid;
begin
  assert not exists(select 1 from jsonb_array_elements(public.community_board(w->>'resident_token')->'items') i where (i->>'id')::uuid = past);
  begin
    perform public.offer_help(gen_random_uuid(),past,'Pat','text','(414) 555-0144',null,null,w->>'resident_token');
    raise exception 'A past event accepted a sign-up';
  exception when no_data_found then null; end;
  assert (select (i->>'ended')::boolean from jsonb_array_elements(public.team_board(w->>'staff_token')->'items') i where (i->>'id')::uuid = past);
  begin
    perform public.manage_board('add_item',p_data=>jsonb_build_object('key',gen_random_uuid(),'kind','event','title','Too late',
      'detail','Fictional.','starts_at',now() - interval '1 hour','goal',5),p_token=>w->>'staff_token');
    raise exception 'A past event was added to the board';
  exception when invalid_parameter_value then null; end;
end $$;
select 'ok 7 - past events leave the public board and stop accepting sign-ups';

-- Expiring a demo workspace (the bound-growth cleanup) must not be blocked by its board.
reset role;
do $$
declare w jsonb := current_setting('comforce_test.w')::jsonb; ws uuid := (w->>'workspace_id')::uuid; coats uuid;
begin
  select i.id into strict coats from comforce.board_items i where i.workspace_id = ws and i.title like 'Winter coats%';
  perform public.offer_help(gen_random_uuid(),coats,'Dee','text','(414) 555-0142',3,null,w->>'resident_token');
  assert exists(select 1 from comforce.volunteer_offers o where o.workspace_id = ws);
  delete from comforce.audit_log l using comforce.requests q where q.id = l.request_id and q.workspace_id = ws;
  delete from comforce.need_operations o using comforce.needs n, comforce.requests q where n.id = o.need_id and q.id = n.request_id and q.workspace_id = ws;
  delete from comforce.history h using comforce.needs n, comforce.requests q where n.id = h.need_id and q.id = n.request_id and q.workspace_id = ws;
  delete from comforce.referrals f using comforce.needs n, comforce.requests q where n.id = f.need_id and q.id = n.request_id and q.workspace_id = ws;
  delete from comforce.needs n using comforce.requests q where q.id = n.request_id and q.workspace_id = ws;
  delete from comforce.requests q where q.workspace_id = ws;
  delete from comforce.workspaces x where x.id = ws;
  assert not exists(select 1 from comforce.board_items i where i.workspace_id = ws);
  assert not exists(select 1 from comforce.volunteer_offers o where o.workspace_id = ws);
  assert not exists(select 1 from comforce.board_seeded s where s.workspace_id = ws);
end $$;
select 'ok 8 - deleting an expired workspace removes its board items, offers and seed marker';
rollback;
