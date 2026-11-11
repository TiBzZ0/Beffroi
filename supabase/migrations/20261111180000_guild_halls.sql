-- Halle de guilde (H1 à H6) : une par alliance, ou une loge par joueur seul.
alter table public.alliances add column if not exists chief_id uuid references public.profiles (id) on delete set null;

create table if not exists public.guild_halls (
  id bigint generated always as identity primary key,
  season_id int not null references public.seasons (id) on delete cascade,
  alliance_id bigint references public.alliances (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  x int not null,
  y int not null,
  stage int not null default 0,          -- étapes terminées
  progress double precision not null default 0,
  cost double precision not null,        -- prix de l'étape en cours
  received double precision not null default 0,
  gifts jsonb not null default '{}'::jsonb,
  wings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((alliance_id is null) <> (user_id is null)),
  unique (season_id, alliance_id),
  unique (season_id, user_id),
  unique (season_id, x, y)
);
alter table public.guild_halls enable row level security;
create policy "halles lisibles par les joueurs" on public.guild_halls for select to authenticated using (true);

-- Verse de la pierre à la halle ; termine autant d'étapes que la caisse le permet.
create or replace function public.hall_give(p_hall bigint, p_user uuid, p_amount double precision, p_per_second double precision, p_max_stage int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.guild_halls;
  done int := 0;
begin
  select * into h from public.guild_halls where id = p_hall for update;
  if not found then return jsonb_build_object('ok', false); end if;
  h.progress := h.progress + greatest(0, p_amount);
  while h.stage < p_max_stage and h.progress >= h.cost loop
    h.progress := h.progress - h.cost;
    h.stage := h.stage + 1;
    done := done + 1;
    h.cost := greatest(1, ceil(0.5 * power(1.4, h.stage) * greatest(p_per_second, 0) * 3600));
  end loop;
  update public.guild_halls set
    progress = h.progress, stage = h.stage, cost = h.cost,
    received = received + greatest(0, p_amount),
    gifts = jsonb_set(gifts, array[p_user::text], to_jsonb(coalesce((gifts ->> p_user::text)::double precision, 0) + greatest(0, p_amount)))
  where id = p_hall;
  return jsonb_build_object('ok', true, 'stage', h.stage, 'completed', done);
end;
$$;

-- Monte une aile d'un niveau si un niveau est libre.
create or replace function public.hall_place(p_hall bigint, p_wing text, p_available int, p_max_kinds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w jsonb;
  total int;
  kinds int;
  lvl int;
begin
  select wings into w from public.guild_halls where id = p_hall for update;
  if not found then return false; end if;
  select coalesce(sum(value::int), 0), count(*) filter (where value::int > 0) into total, kinds from jsonb_each_text(w);
  lvl := coalesce((w ->> p_wing)::int, 0);
  if total >= p_available or lvl >= 3 or (lvl = 0 and kinds >= p_max_kinds) then return false; end if;
  update public.guild_halls set wings = jsonb_set(wings, array[p_wing], to_jsonb(lvl + 1)) where id = p_hall;
  return true;
end;
$$;

revoke execute on function public.hall_give(bigint, uuid, double precision, double precision, int) from public, anon, authenticated;
revoke execute on function public.hall_place(bigint, text, int, int) from public, anon, authenticated;
grant execute on function public.hall_give(bigint, uuid, double precision, double precision, int) to service_role;
grant execute on function public.hall_place(bigint, text, int, int) to service_role;
