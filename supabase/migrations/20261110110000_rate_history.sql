-- B12 : production de chaque joueur relevée une fois par jour (meilleure progression sur 7 jours).
create table if not exists public.rate_history (
  season_id int not null references public.seasons (id) on delete cascade,
  user_id uuid not null,
  day date not null,
  rate double precision not null,
  primary key (season_id, user_id, day)
);
alter table public.rate_history enable row level security;
