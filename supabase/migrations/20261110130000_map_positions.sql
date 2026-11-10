-- T1 : position des joueurs sur la carte du royaume (les seigneurs ont des cases fixes dans la configuration).
create table if not exists public.map_positions (
  season_id int not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  x int not null,
  y int not null,
  primary key (season_id, x, y),
  unique (season_id, user_id)
);
alter table public.map_positions enable row level security;
