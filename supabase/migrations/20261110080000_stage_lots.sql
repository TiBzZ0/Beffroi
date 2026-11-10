-- Audit D1 à D4 : lots d'alliance (ou individuels) du chantier, prime de lot, maître d'œuvre.
create table if not exists public.stage_lots (
  season_id int not null references public.seasons (id) on delete cascade,
  stage int not null,
  owner text not null,               -- 'a:<id alliance>' ou 'p:<id joueur>'
  alliance_id bigint,
  user_id uuid,
  target double precision not null,
  progress double precision not null default 0,
  members jsonb not null default '{}'::jsonb, -- { id joueur: { "share": part, "given": versé } }
  closes_at timestamptz,             -- l'étape est finie : le lot reste ouvert jusque-là
  finished_at timestamptz,
  master boolean not null default false,
  master_choice text,                -- production | defense | loot
  master_from timestamptz,
  created_at timestamptz not null default now(),
  primary key (season_id, stage, owner)
);
alter table public.stage_lots enable row level security;

-- Un don compte pour le lot du joueur. Renvoie le lot, et s'il vient d'être fini.
create or replace function public.add_to_lot(p_season int, p_stage int, p_user uuid, p_amount double precision, p_lot_bonus_ecus int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.stage_lots;
  uid text := p_user::text;
  first boolean;
  just boolean := false;
begin
  select * into l from public.stage_lots
  where season_id = p_season and stage = p_stage and members ? uid
    and finished_at is null and (closes_at is null or closes_at > now())
  for update;
  if not found or p_amount <= 0 then
    return null;
  end if;
  l.members := jsonb_set(l.members, array[uid, 'given'], to_jsonb(coalesce((l.members -> uid ->> 'given')::double precision, 0) + p_amount));
  l.progress := l.progress + p_amount;
  if l.progress >= l.target then
    just := true;
    l.finished_at := now();
    select not exists (select 1 from public.stage_lots where season_id = p_season and stage = p_stage and finished_at is not null) into first;
    l.master := first;
    -- Prime de lot : 10 écus à chaque membre qui a versé au moins 25 % de sa part.
    update public.profiles p set ecus = p.ecus + p_lot_bonus_ecus
    where p.id::text in (
      select key from jsonb_each(l.members)
      where coalesce((value ->> 'given')::double precision, 0) >= 0.25 * coalesce((value ->> 'share')::double precision, 0)
    );
  end if;
  update public.stage_lots set members = l.members, progress = l.progress, finished_at = l.finished_at, master = l.master
  where season_id = p_season and stage = p_stage and owner = l.owner;
  return jsonb_build_object('owner', l.owner, 'finished', just, 'master', l.master, 'stage', l.stage);
end;
$$;
revoke execute on function public.add_to_lot(int, int, uuid, double precision, int) from public, anon, authenticated;
grant execute on function public.add_to_lot(int, int, uuid, double precision, int) to service_role;

-- La fin d'une étape fixe l'heure de fermeture de ses lots non finis.
create or replace function public.add_to_worksite(p_season int, p_contribution double precision, p_stage_bases double precision[], p_active_window_days int)
returns public.worksites
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.worksites;
  active int := public.active_humans(p_season, p_active_window_days);
  stage_count int := coalesce(array_length(p_stage_bases, 1), 0);
  resize boolean;
begin
  select * into w from public.worksites where season_id = p_season for update;
  resize := w.stage < stage_count and w.sized_stage is distinct from w.stage;
  if p_contribution > 0 or active <> w.active_players or resize then
    w.progress := w.progress + greatest(p_contribution, 0);
    w.total := w.total + greatest(p_contribution, 0);
    w.active_players := active;
    if resize then
      w.target := p_stage_bases[w.stage + 1];
      w.sized_stage := w.stage;
    end if;
    while w.stage < stage_count and w.progress >= w.target loop
      w.progress := w.progress - w.target;
      w.stage_completed_at := array_append(w.stage_completed_at, now());
      w.stage := w.stage + 1;
      -- D1 : les lots non finis de l'étape achevée restent ouverts 6 heures.
      update public.stage_lots set closes_at = now() + interval '6 hours'
      where season_id = p_season and stage = w.stage - 1 and finished_at is null and closes_at is null;
      if w.stage < stage_count then
        w.target := p_stage_bases[w.stage + 1];
        w.sized_stage := w.stage;
      end if;
    end loop;
    update public.worksites set
      stage = w.stage, progress = w.progress, target = w.target, total = w.total,
      active_players = w.active_players, stage_completed_at = w.stage_completed_at,
      sized_stage = w.sized_stage, updated_at = now()
    where season_id = p_season
    returning * into w;
  end if;
  return w;
end;
$$;
revoke execute on function public.add_to_worksite(int, double precision, double precision[], int) from public, anon, authenticated;

-- Inscrit un joueur dans un lot (créé au besoin) avec sa part ; la cible du lot grandit d'autant.
create or replace function public.join_lot(p_season int, p_stage int, p_owner text, p_alliance bigint, p_user uuid, p_share double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := p_user::text;
begin
  -- Un joueur n'est que dans un lot par étape.
  if exists (select 1 from public.stage_lots where season_id = p_season and stage = p_stage and members ? uid) then
    return;
  end if;
  insert into public.stage_lots (season_id, stage, owner, alliance_id, user_id, target, members)
  values (p_season, p_stage, p_owner, p_alliance, case when p_alliance is null then p_user end, p_share,
          jsonb_build_object(uid, jsonb_build_object('share', p_share, 'given', 0)))
  on conflict (season_id, stage, owner) do update
    set members = public.stage_lots.members || jsonb_build_object(uid, jsonb_build_object('share', p_share, 'given', 0)),
        target = public.stage_lots.target + p_share
    where public.stage_lots.finished_at is null;
end;
$$;
revoke execute on function public.join_lot(int, int, text, bigint, uuid, double precision) from public, anon, authenticated;
grant execute on function public.join_lot(int, int, text, bigint, uuid, double precision) to service_role;
