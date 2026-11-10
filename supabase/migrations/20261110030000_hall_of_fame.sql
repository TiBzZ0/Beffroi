-- Beffroi : panthéon des saisons terminées (podium de chaque catégorie, figé à la clôture).
create table public.season_hall (
  season_id int not null references public.seasons (id) on delete cascade,
  category text not null,
  rank int not null,
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  value double precision not null,
  primary key (season_id, category, rank)
);
alter table public.season_hall enable row level security;
create policy "panthéon lisible par les joueurs" on public.season_hall for select to authenticated using (true);

alter table public.seasons add column hall_closed boolean not null default false;
