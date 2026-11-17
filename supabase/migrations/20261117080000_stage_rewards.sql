-- Fin d'étape du beffroi : une ligne par étape récompensée, pour ne verser écus et renom qu'une fois
-- (deux requêtes simultanées pouvaient voir la même étape s'achever).
create table if not exists public.stage_rewards (
  season_id int not null references public.seasons (id) on delete cascade,
  stage int not null,
  created_at timestamptz not null default now(),
  primary key (season_id, stage)
);
alter table public.stage_rewards enable row level security;

-- Les étapes déjà achevées sont déjà récompensées.
insert into public.stage_rewards (season_id, stage)
select w.season_id, s.n
from public.worksites w
cross join lateral generate_series(0, w.stage - 1) as s(n)
where w.stage > 0
on conflict do nothing;
