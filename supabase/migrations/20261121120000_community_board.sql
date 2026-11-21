-- Lend a Hand community board: supply drives, volunteer events, skill needs and resident offers of help.
-- Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 wrote the schema, starter content and RPCs.
-- Each workspace gets its own copy of the fictional starter board on first read. Offers carry contact details,
-- so only team_board (staff capability) returns them; the public board returns counts only.
-- Every board row cascades from its workspace so expiring an anonymous demo workspace removes its board too.
-- Received supplies = the item's manual count (starter stock, walk-in donations) + each received offer's own credit,
-- so two staff recording different offers never overwrite each other. Events close to sign-ups when they start.

create table comforce.board_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references comforce.workspaces on delete cascade,
  operation_key uuid,
  kind text not null check (kind in ('supply','event','skill')),
  title text not null check (length(btrim(title)) between 1 and 80),
  detail text not null check (length(btrim(detail)) between 1 and 300),
  location text check (length(btrim(location)) between 1 and 120),
  starts_at timestamptz,
  goal integer check (goal between 1 and 10000),
  collected integer not null default 0 check (collected between 0 and 10000),
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'event') = (starts_at is not null)),
  check (kind = 'skill' or goal is not null)
);
create index on comforce.board_items (workspace_id, closed, kind);
create unique index board_items_operation_key on comforce.board_items (workspace_id, operation_key) nulls not distinct
  where operation_key is not null;

create table comforce.board_seeded (
  workspace_id uuid references comforce.workspaces on delete cascade,
  unique nulls not distinct (workspace_id)
);

create table comforce.volunteer_offers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references comforce.workspaces on delete cascade,
  submission_key uuid not null,
  unique nulls not distinct (workspace_id, submission_key),
  item_id uuid not null references comforce.board_items on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  contact_method text not null check (contact_method in ('phone','text','email')),
  contact text not null,
  quantity integer check (quantity between 1 and 500),
  note text check (length(btrim(note)) between 1 and 300),
  status text not null default 'new' check (status in ('new','contacted','confirmed')),
  received integer check (received between 1 and 500),
  check (received is null or status = 'confirmed'),
  created_at timestamptz not null default now(),
  check (case when contact_method = 'email' then
    length(contact) <= 254 and contact ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  else
    length(contact) <= 35 and contact ~ '^[0-9+(). /-]+$'
      and length(regexp_replace(contact,'[^0-9]','','g')) between 7 and 15
  end)
);
create index on comforce.volunteer_offers (item_id);

alter table comforce.board_items enable row level security;
alter table comforce.board_seeded enable row level security;
alter table comforce.volunteer_offers enable row level security;
revoke all on comforce.board_items, comforce.board_seeded, comforce.volunteer_offers from public, anon, authenticated;

-- Fictional starter content, dated relative to today so the demo never shows past events.
create function comforce.ensure_board(workspace uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  today timestamp := date_trunc('day', now() at time zone 'America/Chicago');
begin
  insert into comforce.board_seeded(workspace_id) values (workspace) on conflict do nothing;
  if not found then return; end if;
  insert into comforce.board_items(workspace_id,kind,title,detail,location,starts_at,goal,collected) values
    (workspace,'supply','Winter coats, all sizes','New or gently used coats for kids and adults before the first deep freeze.',
     'Drop off at the ComForce hub, Mon–Fri 9–5',null,50,34),
    (workspace,'supply','Holiday gift drive toys, ages 5–12','Unwrapped toys, books and games for the annual door-to-door gift drive.',
     'Drop off at the ComForce hub by Dec 20',null,200,82),
    (workspace,'supply','Hygiene kits','Travel-size soap, toothpaste, deodorant and socks for shelter guests.',
     'Drop off at the ComForce hub',null,40,12),
    (workspace,'event','Harambee park cleanup','Pick up litter, rake leaves and meet neighbors. Gloves and bags provided.',
     'Harambee',(today + interval '8 days 10 hours') at time zone 'America/Chicago',30,18),
    (workspace,'event','Gift drive wrapping night','Wrap and label gifts for families. Snacks provided, all ages welcome.',
     'Riverwest',(today + interval '13 days 18 hours') at time zone 'America/Chicago',20,9),
    (workspace,'event','Youth mentoring meetup','Spend an afternoon with Cycle Breakers youth: games, homework help and conversation.',
     'Lincoln Park',(today + interval '10 days 15 hours') at time zone 'America/Chicago',15,6),
    (workspace,'skill','Volunteer drivers','Give residents rides to appointments, pantries and shelters. Background check required.',
     null,null,null,0),
    (workspace,'skill','Spanish interpreters','Help families during intake calls and check-ins.',null,null,null,0),
    (workspace,'skill','Youth mentors','Mentor a Cycle Breakers teen for an hour a week.',null,null,null,0);
end $$;


-- One closing rule for the public listing and for writes: closed by staff, or an event that has started.
create function comforce.board_open(item comforce.board_items) returns boolean
language sql stable set search_path = '' as $$
  select not item.closed and (item.kind <> 'event' or item.starts_at > now())
$$;

-- Supplies received so far: the manual count plus every received offer's own credit.
create function comforce.board_received(item comforce.board_items) returns integer
language sql stable security definer set search_path = '' as $$
  select item.collected + case when item.kind = 'supply' then
    (select coalesce(sum(o.received),0)::integer from comforce.volunteer_offers o where o.item_id = item.id) else 0 end
$$;

-- Public view: open items with progress counts. No names or contact details.
create function public.community_board(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare workspace uuid := comforce.resolve_workspace(p_token,false);
begin
  perform comforce.ensure_board(workspace);
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'kind',i.kind,'title',i.title,'detail',i.detail,'location',i.location,'starts_at',i.starts_at,
        'goal',i.goal,'collected',comforce.board_received(i),
        -- Received offers are already counted in collected, so only the rest are "on the way".
        'pledged',(select coalesce(sum(o.quantity),0) from comforce.volunteer_offers o
                   where o.item_id=i.id and i.kind='supply' and o.status<>'confirmed'),
        'signed_up',(select count(*) from comforce.volunteer_offers o where o.item_id=i.id)
      ) order by i.kind, i.starts_at nulls last, i.created_at), '[]'::jsonb)
      from comforce.board_items i where i.workspace_id is not distinct from workspace and comforce.board_open(i)),
    -- Offer records, not people: one neighbor can make several offers and no identity is matched across them.
    'offers_this_month', (select count(*) from comforce.volunteer_offers o
      where o.workspace_id is not distinct from workspace
        and date_trunc('month', o.created_at at time zone 'America/Chicago') = date_trunc('month', now() at time zone 'America/Chicago')));
end $$;

create function public.offer_help(
  p_key uuid, p_item uuid, p_name text, p_contact_method text, p_contact text,
  p_quantity integer default null, p_note text default null, p_token text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  workspace uuid := comforce.resolve_workspace(p_token,false);
  item comforce.board_items;
  prior uuid;
begin
  if p_key is null then raise exception using errcode='22023', message='A submission key is required.'; end if;
  select o.item_id into prior from comforce.volunteer_offers o where o.workspace_id is not distinct from workspace and o.submission_key=p_key;
  if found then return jsonb_build_object('title',(select title from comforce.board_items where id=prior)); end if;
  select * into item from comforce.board_items i
  where i.id=p_item and i.workspace_id is not distinct from workspace and not i.closed for update;
  if not found then raise exception using errcode='P0002', message='This item is no longer on the board.'; end if;
  -- The item lock serializes offers. A retry that waited behind its own first attempt returns that result
  -- instead of being judged against the capacity the first attempt used up.
  select o.item_id into prior from comforce.volunteer_offers o where o.workspace_id is not distinct from workspace and o.submission_key=p_key;
  if found then return jsonb_build_object('title',(select title from comforce.board_items where id=prior)); end if;
  if not comforce.board_open(item) then
    raise exception using errcode='P0002', message='Sign-ups for this event have closed.';
  end if;
  if item.kind='supply' and p_quantity is null then
    raise exception using errcode='22023', message='Enter how many you can bring.';
  end if;
  if item.kind='event' and item.collected + (select count(*) from comforce.volunteer_offers o where o.item_id=item.id) >= item.goal then
    raise exception using errcode='22023', message='This event is full.';
  end if;
  insert into comforce.volunteer_offers(workspace_id,submission_key,item_id,name,contact_method,contact,quantity,note)
  values(workspace,p_key,item.id,btrim(p_name),p_contact_method,btrim(p_contact),
         case when item.kind='supply' then p_quantity end, nullif(btrim(coalesce(p_note,'')),''))
  on conflict do nothing;
  if not found then
    select o.item_id into strict prior from comforce.volunteer_offers o where o.workspace_id is not distinct from workspace and o.submission_key=p_key;
    return jsonb_build_object('title',(select title from comforce.board_items where id=prior));
  end if;
  return jsonb_build_object('title',item.title);
end $$;

-- Team view: every item plus who offered what, newest first.
create function public.team_board(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare workspace uuid := comforce.resolve_workspace(p_token,true);
begin
  perform comforce.ensure_board(workspace);
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(i) - 'workspace_id' - 'operation_key' || jsonb_build_object(
        'received',comforce.board_received(i),
        'ended',i.kind = 'event' and i.starts_at <= now(),
        'offers',(select count(*) from comforce.volunteer_offers o where o.item_id=i.id),
        'pledged',(select coalesce(sum(o.quantity),0) from comforce.volunteer_offers o where o.item_id=i.id and o.status<>'confirmed'))
      order by i.closed, i.kind, i.starts_at nulls last, i.created_at), '[]'::jsonb)
      from comforce.board_items i where i.workspace_id is not distinct from workspace),
    'offers', (select coalesce(jsonb_agg(to_jsonb(o) - 'workspace_id' - 'submission_key' || jsonb_build_object('title',i.title,'kind',i.kind)
      order by o.created_at desc), '[]'::jsonb)
      from comforce.volunteer_offers o join comforce.board_items i on i.id=o.item_id
      where o.workspace_id is not distinct from workspace));
end $$;

-- Every action is safe to retry: add_item is keyed, receive_offer and offer_status set absolute per-offer values,
-- and set_collected only applies while the count still matches what the editor saw.
create function public.manage_board(
  p_action text, p_item uuid default null, p_offer uuid default null, p_data jsonb default '{}'::jsonb, p_token text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  workspace uuid := comforce.resolve_workspace(p_token,true);
  new_id uuid;
  offer comforce.volunteer_offers;
  item_kind text;
  amount integer;
begin
  case p_action
  when 'add_item' then
    if p_data->>'key' is null then raise exception using errcode='22023', message='An operation key is required.'; end if;
    if p_data->>'kind' = 'event' and (p_data->>'starts_at')::timestamptz <= now() then
      raise exception using errcode='22023', message='Choose a start time in the future.';
    end if;
    insert into comforce.board_items(workspace_id,operation_key,kind,title,detail,location,starts_at,goal)
    values(workspace,(p_data->>'key')::uuid,p_data->>'kind',btrim(p_data->>'title'),btrim(p_data->>'detail'),
           nullif(btrim(coalesce(p_data->>'location','')),''),(p_data->>'starts_at')::timestamptz,(p_data->>'goal')::integer)
    on conflict do nothing returning id into new_id;
    if new_id is null then
      select i.id into strict new_id from comforce.board_items i
      where i.workspace_id is not distinct from workspace and i.operation_key=(p_data->>'key')::uuid;
    end if;
    return jsonb_build_object('id',new_id);
  when 'set_collected' then
    amount := (p_data->>'collected')::integer;
    update comforce.board_items i set collected=amount
    where i.id=p_item and i.workspace_id is not distinct from workspace
      and (i.collected=(p_data->>'expected')::integer or i.collected=amount);
    if not found then
      if exists(select 1 from comforce.board_items i where i.id=p_item and i.workspace_id is not distinct from workspace) then
        raise exception using errcode='40001', message='Someone else changed this count. Check the new number and try again.';
      end if;
      raise insufficient_privilege using message='This item is unavailable in this workspace.';
    end if;
  when 'receive_offer' then
    amount := (p_data->>'received')::integer;
    if amount is null or amount not between 1 and 500 then
      raise exception using errcode='22023', message='Enter how many arrived, from 1 to 500.';
    end if;
    -- One statement: the offer's credit and its status change together, and repeating it changes nothing.
    update comforce.volunteer_offers o set received=amount, status='confirmed'
    from comforce.board_items i
    where o.id=p_offer and o.workspace_id is not distinct from workspace and i.id=o.item_id and i.kind='supply';
    if not found then raise insufficient_privilege using message='This supply offer is unavailable in this workspace.'; end if;
  when 'close_item', 'reopen_item' then
    update comforce.board_items i set closed=(p_action='close_item')
    where i.id=p_item and i.workspace_id is not distinct from workspace;
    if not found then raise insufficient_privilege using message='This item is unavailable in this workspace.'; end if;
  when 'offer_status' then
    select o.* into offer from comforce.volunteer_offers o
    where o.id=p_offer and o.workspace_id is not distinct from workspace for update;
    if not found then raise insufficient_privilege using message='This offer is unavailable in this workspace.'; end if;
    select i.kind into item_kind from comforce.board_items i where i.id=offer.item_id;
    if item_kind='supply' and p_data->>'status'='confirmed' and offer.received is null then
      raise exception using errcode='22023', message='Record how many arrived to mark a supply offer received.';
    end if;
    -- Moving an offer back out of Received removes its credit.
    update comforce.volunteer_offers o set status=p_data->>'status',
      received=case when p_data->>'status'='confirmed' then o.received end
    where o.id=offer.id;
  else raise exception using errcode='22023', message='Unknown board action.';
  end case;
  return '{}'::jsonb;
end $$;

revoke all on function comforce.ensure_board(uuid), comforce.board_received(comforce.board_items) from public,anon,authenticated;
revoke all on function public.community_board(text), public.offer_help(uuid,uuid,text,text,text,integer,text,text),
  public.team_board(text), public.manage_board(text,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.community_board(text), public.offer_help(uuid,uuid,text,text,text,integer,text,text),
  public.team_board(text), public.manage_board(text,uuid,uuid,jsonb,text) to anon,authenticated;
