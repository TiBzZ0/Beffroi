-- V3 à V6, V15 : nouveaux événements sans combat, et annonces 15 minutes avant.
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('caravane', 'colosse', 'foire', 'fete', 'etoiles', 'treve', 'marchand'));

create table if not exists public.event_notices (
  season_id int not null references public.seasons (id) on delete cascade,
  after_event bigint not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (season_id, after_event)
);
alter table public.event_notices enable row level security;
