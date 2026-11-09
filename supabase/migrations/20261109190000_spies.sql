-- Beffroi : rapports d'espions (lus et écrits par le serveur uniquement).
create table public.spy_reports (
  id bigint generated always as identity primary key,
  season_id int not null references public.seasons (id) on delete cascade,
  spy_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index spy_reports_spy_idx on public.spy_reports (season_id, spy_id, expires_at desc);
alter table public.spy_reports enable row level security;
