-- Saison 2 : la carte de chaque saison (sites, seigneurs, régions), tirée une fois à l'ouverture et gardée.
create table if not exists public.season_maps (
  season_id int primary key references public.seasons (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.season_maps enable row level security;
