-- Beffroi : alliances entre joueurs et renforts postés chez un allié.

create table public.alliances (
  id bigint generated always as identity primary key,
  season_id int not null references public.seasons (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  created_at timestamptz not null default now()
);
alter table public.alliances enable row level security;
create policy "alliances lisibles par les joueurs" on public.alliances
  for select to authenticated using (true);

create table public.alliance_invites (
  id bigint generated always as identity primary key,
  season_id int not null references public.seasons (id) on delete cascade,
  alliance_id bigint not null references public.alliances (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (alliance_id, invitee_id)
);
alter table public.alliance_invites enable row level security;

-- Appartenance (hors verrou optimiste) et troupes d'alliés postées ici : { propriétaire: { unité: nombre } }.
alter table public.player_states
  add column alliance_id bigint references public.alliances (id) on delete set null,
  add column stationed jsonb not null default '{}'::jsonb;

create or replace function public.apply_state(p_season int, s jsonb, p_touch boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_version int;
begin
  update public.player_states set
    stone = (s ->> 'stone')::double precision,
    generators = s -> 'generators',
    upgrades = s -> 'upgrades',
    total_produced = (s ->> 'total_produced')::double precision,
    total_contributed = (s ->> 'total_contributed')::double precision,
    total_clicks = (s ->> 'total_clicks')::bigint,
    last_update = (s ->> 'last_update')::timestamptz,
    last_click_at = (s ->> 'last_click_at')::timestamptz,
    ruins = s -> 'ruins',
    burned_until = (s ->> 'burned_until')::timestamptz,
    shield_until = (s ->> 'shield_until')::timestamptz,
    last_raid_at = (s ->> 'last_raid_at')::timestamptz,
    last_raid_target = nullif(s ->> 'last_raid_target', '')::uuid,
    revenge_target = nullif(s ->> 'revenge_target', '')::uuid,
    revenge_until = (s ->> 'revenge_until')::timestamptz,
    total_plundered = (s ->> 'total_plundered')::double precision,
    troops = coalesce(s -> 'troops', troops),
    defenses = coalesce(s -> 'defenses', defenses),
    stationed = coalesce(s -> 'stationed', stationed),
    click_strikes = coalesce((s ->> 'click_strikes')::int, click_strikes),
    click_paused_until = coalesce((s ->> 'click_paused_until')::timestamptz, click_paused_until),
    last_ip = coalesce(s ->> 'last_ip', last_ip),
    next_raid_at = case when s ? 'next_raid_at' then (s ->> 'next_raid_at')::timestamptz else next_raid_at end,
    next_contrib_at = case when s ? 'next_contrib_at' then (s ->> 'next_contrib_at')::timestamptz else next_contrib_at end,
    last_seen = case when p_touch then now() else last_seen end,
    version = version + 1
  where user_id = (s ->> 'user_id')::uuid
    and season_id = p_season
    and version = (s ->> 'version')::int
  returning version into new_version;
  return new_version;
end;
$$;

-- Écrit plusieurs états d'un coup (envoi ou rappel de renforts, départ d'une alliance) : tout ou rien.
-- Le premier état est celui du joueur qui agit. Renvoie sa nouvelle version, ou un conflit.
create function public.apply_states(p_season int, p_states jsonb, p_action text, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
  v int;
  first_version int;
  i int := 0;
begin
  for s in select * from jsonb_array_elements(p_states) loop
    v := public.apply_state(p_season, s, i = 0);
    if v is null then
      if i = 0 then
        return jsonb_build_object('ok', false, 'conflict', true);
      end if;
      raise exception 'beffroi_conflict';
    end if;
    if i = 0 then first_version := v; end if;
    i := i + 1;
  end loop;
  if p_action is not null then
    insert into public.action_log (user_id, season_id, action, details)
    values ((p_states -> 0 ->> 'user_id')::uuid, p_season, p_action, coalesce(p_details, '{}'::jsonb));
  end if;
  return jsonb_build_object('ok', true, 'version', first_version);
end;
$$;

revoke execute on function public.apply_state(int, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.apply_states(int, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_states(int, jsonb, text, jsonb) to service_role;
