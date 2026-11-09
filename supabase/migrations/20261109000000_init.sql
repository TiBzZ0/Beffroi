-- Beffroi : schéma initial (MVP, saison 0).
-- À exécuter une fois dans Supabase (SQL Editor) ou via `supabase db push`.
--
-- Principe de sécurité : le navigateur ne peut que LIRE. Toutes les écritures passent
-- par l'API Next.js, qui utilise la clé secrète (rôle service_role) et les fonctions ci-dessous.

-- ---------------------------------------------------------------------------
-- Profils (pseudo public lié au compte Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_-]{3,20}$'),
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- Crée le profil à l'inscription, à partir du pseudo passé dans les métadonnées.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Saisons (2 semaines) et chantier commun
-- ---------------------------------------------------------------------------
create table public.seasons (
  id serial primary key,
  number int not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);

create table public.worksites (
  season_id int primary key references public.seasons (id) on delete cascade,
  stage int not null default 0,                 -- étape en cours (0, 1, 2 ; 3 = monument terminé)
  progress double precision not null default 0, -- pierre versée dans l'étape en cours
  target double precision not null default 0,   -- taille de l'étape en cours
  total double precision not null default 0,    -- pierre versée depuis le début de la saison
  active_players int not null default 1,
  stage_completed_at timestamptz[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- État de chaque joueur pour une saison
-- ---------------------------------------------------------------------------
create table public.player_states (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id int not null references public.seasons (id) on delete cascade,
  stone double precision not null default 0,
  generators jsonb not null default '{}'::jsonb,
  upgrades jsonb not null default '[]'::jsonb,
  total_produced double precision not null default 0,
  total_contributed double precision not null default 0,
  total_clicks bigint not null default 0,
  last_update timestamptz not null default now(),
  last_click_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  version int not null default 0,
  primary key (user_id, season_id)
);
create index player_states_season_contrib_idx on public.player_states (season_id, total_contributed desc);

-- ---------------------------------------------------------------------------
-- Journal des actions sensibles (achats, contributions)
-- ---------------------------------------------------------------------------
create table public.action_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id int not null references public.seasons (id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index action_log_user_idx on public.action_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security : lecture seule pour le navigateur, aucune écriture directe.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.worksites enable row level security;
alter table public.player_states enable row level security;
alter table public.action_log enable row level security;

create policy "profils lisibles par les joueurs" on public.profiles
  for select to authenticated using (true);
create policy "saisons lisibles" on public.seasons
  for select to anon, authenticated using (true);
create policy "chantier lisible" on public.worksites
  for select to anon, authenticated using (true);
create policy "états lisibles par les joueurs" on public.player_states
  for select to authenticated using (true);
create policy "journal personnel" on public.action_log
  for select to authenticated using ((select auth.uid()) = user_id);

-- Le chantier commun est diffusé en direct (Supabase Realtime).
alter publication supabase_realtime add table public.worksites;

-- ---------------------------------------------------------------------------
-- Fonctions appelées uniquement par l'API (service_role)
-- ---------------------------------------------------------------------------

-- Renvoie la saison en cours, et ouvre la suivante si la précédente est terminée.
create function public.ensure_active_season(p_days int default 14, p_first_stage_base double precision default 50000)
returns public.seasons
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
begin
  select * into s from public.seasons
    where now() >= starts_at and now() < ends_at
    order by number desc limit 1;
  if found then
    return s;
  end if;

  -- Verrou pour que deux requêtes simultanées n'ouvrent pas deux saisons.
  perform pg_advisory_xact_lock(hashtext('beffroi_season'));
  select * into s from public.seasons
    where now() >= starts_at and now() < ends_at
    order by number desc limit 1;
  if found then
    return s;
  end if;

  insert into public.seasons (number, starts_at, ends_at)
  values (
    coalesce((select max(number) + 1 from public.seasons), 0),
    now(),
    now() + make_interval(days => p_days)
  )
  returning * into s;

  insert into public.worksites (season_id, target) values (s.id, p_first_stage_base);
  return s;
end;
$$;

-- Enregistre l'état d'un joueur (verrouillage optimiste par version) et, si besoin,
-- verse sa contribution au chantier commun, le tout dans une seule transaction.
-- Renvoie { ok, version, worksite } ou { ok: false, conflict: true }.
create function public.commit_player_state(
  p_user uuid,
  p_season int,
  p_expected_version int,
  p_stone double precision,
  p_generators jsonb,
  p_upgrades jsonb,
  p_total_produced double precision,
  p_total_contributed double precision,
  p_total_clicks bigint,
  p_last_update timestamptz,
  p_last_click_at timestamptz,
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
  active int;
  stage_count int := coalesce(array_length(p_stage_bases, 1), 0);
begin
  update public.player_states set
    stone = p_stone,
    generators = p_generators,
    upgrades = p_upgrades,
    total_produced = p_total_produced,
    total_contributed = p_total_contributed,
    total_clicks = p_total_clicks,
    last_update = p_last_update,
    last_click_at = p_last_click_at,
    last_seen = now(),
    version = version + 1
  where user_id = p_user and season_id = p_season and version = p_expected_version
  returning version into new_version;

  if not found then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;

  -- Le chantier est verrouillé pour sérialiser les contributions simultanées.
  select * into w from public.worksites where season_id = p_season for update;

  select greatest(count(*), 1)::int into active from public.player_states
    where season_id = p_season and last_seen > now() - make_interval(days => p_active_window_days);

  -- On n'écrit le chantier que s'il change, pour ne pas inonder le temps réel.
  if p_contribution > 0 or active <> w.active_players then
    w.progress := w.progress + greatest(p_contribution, 0);
    w.total := w.total + greatest(p_contribution, 0);
    w.active_players := active;
    if w.stage < stage_count then
      w.target := p_stage_bases[w.stage + 1] * active;
    end if;

    -- Une contribution peut terminer plusieurs étapes d'un coup ; le surplus passe à la suivante.
    while w.stage < stage_count and w.progress >= w.target loop
      w.progress := w.progress - w.target;
      w.stage_completed_at := array_append(w.stage_completed_at, now());
      w.stage := w.stage + 1;
      if w.stage < stage_count then
        w.target := p_stage_bases[w.stage + 1] * active;
      end if;
    end loop;

    update public.worksites set
      stage = w.stage,
      progress = w.progress,
      target = w.target,
      total = w.total,
      active_players = w.active_players,
      stage_completed_at = w.stage_completed_at,
      updated_at = now()
    where season_id = p_season
    returning * into w;
  end if;

  if p_action is not null then
    insert into public.action_log (user_id, season_id, action, details)
    values (p_user, p_season, p_action, coalesce(p_details, '{}'::jsonb));
  end if;

  return jsonb_build_object('ok', true, 'version', new_version, 'worksite', to_jsonb(w));
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.ensure_active_season(int, double precision) from public, anon, authenticated;
revoke execute on function public.commit_player_state(uuid, int, int, double precision, jsonb, jsonb, double precision, double precision, bigint, timestamptz, timestamptz, double precision, double precision[], int, text, jsonb) from public, anon, authenticated;
grant execute on function public.ensure_active_season(int, double precision) to service_role;
grant execute on function public.commit_player_state(uuid, int, int, double precision, jsonb, jsonb, double precision, double precision, bigint, timestamptz, timestamptz, double precision, double precision[], int, text, jsonb) to service_role;
