-- Beffroi : raids, seigneurs voisins et chronique (version 1).
-- Migration additive : l'ancienne fonction commit_player_state reste disponible.

-- ---------------------------------------------------------------------------
-- Seigneurs voisins : des lignes de `profiles` marquées comme bots, sans compte Auth.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add column is_bot boolean not null default false;
alter table public.profiles add column display_name text;

-- Un compte supprimé dans Auth supprime toujours son profil.
create function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id and not is_bot;
  return old;
end;
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();

insert into public.profiles (id, username, is_bot, display_name) values
  ('00000000-0000-4000-8000-00000000c0b1', 'Corbelune', true, 'Baron de Corbelune'),
  ('00000000-0000-4000-8000-00000000a0be', 'Aubeval', true, 'Prieure d''Aubeval'),
  ('00000000-0000-4000-8000-0000000062e5', 'Grisemolle', true, 'Comte Grisemolle')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Nouvel état des joueurs : ruines, incendie, bouclier, revanche, pillage.
-- ---------------------------------------------------------------------------
alter table public.player_states
  add column ruins jsonb not null default '{}'::jsonb,
  add column burned_until timestamptz not null default 'epoch',
  add column shield_until timestamptz not null default 'epoch',
  add column last_raid_at timestamptz not null default 'epoch',
  add column last_raid_target uuid,
  add column revenge_target uuid,
  add column revenge_until timestamptz not null default 'epoch',
  add column total_plundered double precision not null default 0,
  add column last_ip text,
  add column next_raid_at timestamptz,
  add column next_contrib_at timestamptz;

-- ---------------------------------------------------------------------------
-- Chronique : raids et faits marquants, diffusés en direct.
-- ---------------------------------------------------------------------------
create table public.chronicle (
  id bigint generated always as identity primary key,
  season_id int not null references public.seasons (id) on delete cascade,
  kind text not null,
  actor_id uuid references public.profiles (id) on delete cascade,
  target_id uuid references public.profiles (id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index chronicle_season_idx on public.chronicle (season_id, created_at desc);
alter table public.chronicle enable row level security;
create policy "chronique lisible par les joueurs" on public.chronicle
  for select to authenticated using (true);
alter publication supabase_realtime add table public.chronicle;

-- ---------------------------------------------------------------------------
-- Écriture d'un état complet (jsonb), avec verrouillage optimiste par version.
-- Renvoie la nouvelle version, ou null en cas de conflit.
-- ---------------------------------------------------------------------------
create function public.apply_state(p_season int, s jsonb, p_touch boolean)
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

-- Nombre de vrais joueurs actifs (les seigneurs ne comptent pas).
create function public.active_humans(p_season int, p_days int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(count(*), 1)::int
  from public.player_states ps
  join public.profiles p on p.id = ps.user_id
  where ps.season_id = p_season
    and not p.is_bot
    and ps.last_seen > now() - make_interval(days => p_days);
$$;

-- Verse une contribution au chantier et met à jour sa taille. Renvoie la ligne du chantier.
create function public.add_to_worksite(p_season int, p_contribution double precision, p_stage_bases double precision[], p_active_window_days int)
returns public.worksites
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.worksites;
  active int := public.active_humans(p_season, p_active_window_days);
  stage_count int := coalesce(array_length(p_stage_bases, 1), 0);
begin
  select * into w from public.worksites where season_id = p_season for update;
  if p_contribution > 0 or active <> w.active_players then
    w.progress := w.progress + greatest(p_contribution, 0);
    w.total := w.total + greatest(p_contribution, 0);
    w.active_players := active;
    if w.stage < stage_count then
      w.target := p_stage_bases[w.stage + 1] * active;
    end if;
    while w.stage < stage_count and w.progress >= w.target loop
      w.progress := w.progress - w.target;
      w.stage_completed_at := array_append(w.stage_completed_at, now());
      w.stage := w.stage + 1;
      if w.stage < stage_count then
        w.target := p_stage_bases[w.stage + 1] * active;
      end if;
    end loop;
    update public.worksites set
      stage = w.stage, progress = w.progress, target = w.target, total = w.total,
      active_players = w.active_players, stage_completed_at = w.stage_completed_at, updated_at = now()
    where season_id = p_season
    returning * into w;
  end if;
  return w;
end;
$$;

-- Enregistre l'état d'un joueur (ou d'un seigneur) et sa contribution éventuelle.
create function public.commit_state(
  p_season int,
  p_state jsonb,
  p_touch boolean,
  p_contribution double precision,
  p_stage_bases double precision[],
  p_active_window_days int,
  p_action text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_version int;
  w public.worksites;
begin
  new_version := public.apply_state(p_season, p_state, p_touch);
  if new_version is null then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;
  w := public.add_to_worksite(p_season, p_contribution, p_stage_bases, p_active_window_days);
  if p_action is not null then
    insert into public.action_log (user_id, season_id, action, details)
    values ((p_state ->> 'user_id')::uuid, p_season, p_action, coalesce(p_details, '{}'::jsonb));
  end if;
  return jsonb_build_object('ok', true, 'version', new_version, 'worksite', to_jsonb(w));
end;
$$;

-- Applique un raid : attaquant et victime sont écrits ensemble, ou pas du tout.
create function public.apply_raid(p_season int, p_attacker jsonb, p_victim jsonb, p_attacker_touch boolean, p_chronicle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attacker int;
  v_victim int;
begin
  v_attacker := public.apply_state(p_season, p_attacker, p_attacker_touch);
  if v_attacker is null then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;
  v_victim := public.apply_state(p_season, p_victim, false);
  if v_victim is null then
    -- Annule aussi l'écriture de l'attaquant : le serveur réessaiera.
    raise exception 'beffroi_conflict';
  end if;
  insert into public.chronicle (season_id, kind, actor_id, target_id, details)
  values (p_season, 'raid', (p_attacker ->> 'user_id')::uuid, (p_victim ->> 'user_id')::uuid, coalesce(p_chronicle, '{}'::jsonb));
  insert into public.action_log (user_id, season_id, action, details)
  values ((p_attacker ->> 'user_id')::uuid, p_season, 'raid', coalesce(p_chronicle, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'version', v_attacker, 'victim_version', v_victim);
end;
$$;

-- L'ancienne fonction (version MVP) ignore désormais les seigneurs dans le nombre de joueurs actifs.
create or replace function public.commit_player_state(
  p_user uuid, p_season int, p_expected_version int, p_stone double precision, p_generators jsonb, p_upgrades jsonb,
  p_total_produced double precision, p_total_contributed double precision, p_total_clicks bigint,
  p_last_update timestamptz, p_last_click_at timestamptz, p_contribution double precision,
  p_stage_bases double precision[], p_active_window_days int, p_action text, p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_version int;
  w public.worksites;
begin
  update public.player_states set
    stone = p_stone, generators = p_generators, upgrades = p_upgrades,
    total_produced = p_total_produced, total_contributed = p_total_contributed, total_clicks = p_total_clicks,
    last_update = p_last_update, last_click_at = p_last_click_at, last_seen = now(), version = version + 1
  where user_id = p_user and season_id = p_season and version = p_expected_version
  returning version into new_version;
  if not found then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;
  w := public.add_to_worksite(p_season, p_contribution, p_stage_bases, p_active_window_days);
  if p_action is not null then
    insert into public.action_log (user_id, season_id, action, details)
    values (p_user, p_season, p_action, coalesce(p_details, '{}'::jsonb));
  end if;
  return jsonb_build_object('ok', true, 'version', new_version, 'worksite', to_jsonb(w));
end;
$$;

revoke execute on function public.handle_deleted_user() from public, anon, authenticated;
revoke execute on function public.apply_state(int, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.active_humans(int, int) from public, anon, authenticated;
revoke execute on function public.add_to_worksite(int, double precision, double precision[], int) from public, anon, authenticated;
revoke execute on function public.commit_state(int, jsonb, boolean, double precision, double precision[], int, text, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_raid(int, jsonb, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.commit_state(int, jsonb, boolean, double precision, double precision[], int, text, jsonb) to service_role;
grant execute on function public.apply_raid(int, jsonb, jsonb, boolean, jsonb) to service_role;
