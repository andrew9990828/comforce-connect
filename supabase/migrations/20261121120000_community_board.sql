-- Lend a Hand community board: supply drives, volunteer events, skill needs and resident offers of help.
-- Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 wrote the schema, starter content and RPCs.
-- Each workspace gets its own copy of the fictional starter board on first read. Offers carry contact details,
-- so only team_board (staff capability) returns them; the public board returns counts only.

create table comforce.board_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references comforce.workspaces,
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

create table comforce.board_seeded (
  workspace_id uuid references comforce.workspaces,
  unique nulls not distinct (workspace_id)
);

create table comforce.volunteer_offers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references comforce.workspaces,
  submission_key uuid not null,
  unique nulls not distinct (workspace_id, submission_key),
  item_id uuid not null references comforce.board_items,
  name text not null check (length(btrim(name)) between 1 and 80),
  contact_method text not null check (contact_method in ('phone','text','email')),
  contact text not null,
  quantity integer check (quantity between 1 and 500),
  note text check (length(btrim(note)) between 1 and 300),
  status text not null default 'new' check (status in ('new','contacted','confirmed')),
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

-- Public view: open items with progress counts. No names or contact details.
create function public.community_board(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare workspace uuid := comforce.resolve_workspace(p_token,false);
begin
  perform comforce.ensure_board(workspace);
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'kind',i.kind,'title',i.title,'detail',i.detail,'location',i.location,'starts_at',i.starts_at,
        'goal',i.goal,'collected',i.collected,
        -- Confirmed offers are already in the staff-entered collected count, so only pending ones are "on the way".
        'pledged',(select coalesce(sum(o.quantity),0) from comforce.volunteer_offers o
                   where o.item_id=i.id and i.kind='supply' and o.status<>'confirmed'),
        'signed_up',(select count(*) from comforce.volunteer_offers o where o.item_id=i.id)
      ) order by i.kind, i.starts_at nulls last, i.created_at), '[]'::jsonb)
      from comforce.board_items i where i.workspace_id is not distinct from workspace and not i.closed),
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
  prior comforce.volunteer_offers;
begin
  select * into prior from comforce.volunteer_offers where workspace_id is not distinct from workspace and submission_key=p_key;
  if found then return jsonb_build_object('title',(select title from comforce.board_items where id=prior.item_id)); end if;
  select * into item from comforce.board_items i
  where i.id=p_item and i.workspace_id is not distinct from workspace and not i.closed for update;
  if not found then raise exception using errcode='P0002', message='This item is no longer on the board.'; end if;
  if item.kind='supply' and p_quantity is null then
    raise exception using errcode='22023', message='Enter how many you can bring.';
  end if;
  if item.kind='event' and item.collected + (select count(*) from comforce.volunteer_offers where item_id=item.id) >= item.goal then
    raise exception using errcode='22023', message='This event is full.';
  end if;
  insert into comforce.volunteer_offers(workspace_id,submission_key,item_id,name,contact_method,contact,quantity,note)
  values(workspace,p_key,item.id,btrim(p_name),p_contact_method,btrim(p_contact),
         case when item.kind='supply' then p_quantity end, nullif(btrim(coalesce(p_note,'')),''));
  return jsonb_build_object('title',item.title);
end $$;

-- Team view: every item plus who offered what, newest first.
create function public.team_board(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare workspace uuid := comforce.resolve_workspace(p_token,true);
begin
  perform comforce.ensure_board(workspace);
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(i) - 'workspace_id' || jsonb_build_object(
        'offers',(select count(*) from comforce.volunteer_offers o where o.item_id=i.id),
        'pledged',(select coalesce(sum(o.quantity),0) from comforce.volunteer_offers o where o.item_id=i.id))
      order by i.closed, i.kind, i.starts_at nulls last, i.created_at), '[]'::jsonb)
      from comforce.board_items i where i.workspace_id is not distinct from workspace),
    'offers', (select coalesce(jsonb_agg(to_jsonb(o) - 'workspace_id' - 'submission_key' || jsonb_build_object('title',i.title,'kind',i.kind)
      order by o.created_at desc), '[]'::jsonb)
      from comforce.volunteer_offers o join comforce.board_items i on i.id=o.item_id
      where o.workspace_id is not distinct from workspace));
end $$;

create function public.manage_board(
  p_action text, p_item uuid default null, p_offer uuid default null, p_data jsonb default '{}'::jsonb, p_token text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare workspace uuid := comforce.resolve_workspace(p_token,true);
begin
  case p_action
  when 'add_item' then
    insert into comforce.board_items(workspace_id,kind,title,detail,location,starts_at,goal)
    values(workspace,p_data->>'kind',btrim(p_data->>'title'),btrim(p_data->>'detail'),nullif(btrim(coalesce(p_data->>'location','')),''),
           (p_data->>'starts_at')::timestamptz,(p_data->>'goal')::integer);
  when 'set_collected' then
    update comforce.board_items set collected=(p_data->>'collected')::integer
    where id=p_item and workspace_id is not distinct from workspace;
    if not found then raise insufficient_privilege using message='This item is unavailable in this workspace.'; end if;
  when 'close_item', 'reopen_item' then
    update comforce.board_items set closed=(p_action='close_item')
    where id=p_item and workspace_id is not distinct from workspace;
    if not found then raise insufficient_privilege using message='This item is unavailable in this workspace.'; end if;
  when 'offer_status' then
    update comforce.volunteer_offers set status=p_data->>'status'
    where id=p_offer and workspace_id is not distinct from workspace;
    if not found then raise insufficient_privilege using message='This offer is unavailable in this workspace.'; end if;
  else raise exception using errcode='22023', message='Unknown board action.';
  end case;
end $$;

revoke all on function comforce.ensure_board(uuid) from public,anon,authenticated;
revoke all on function public.community_board(text), public.offer_help(uuid,uuid,text,text,text,integer,text,text),
  public.team_board(text), public.manage_board(text,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.community_board(text), public.offer_help(uuid,uuid,text,text,text,integer,text,text),
  public.team_board(text), public.manage_board(text,uuid,uuid,jsonb,text) to anon,authenticated;
