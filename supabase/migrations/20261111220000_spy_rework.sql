-- Refonte de l'espionnage (E1 à E4) : écart de niveau dans le rapport, cibles hors joueurs (halles).
alter table public.spy_reports
  add column if not exists gap int,
  add column if not exists target_key text;
create index if not exists spy_reports_season_exp_idx on public.spy_reports (season_id, expires_at desc);
