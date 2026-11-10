-- Audit A9 : la taille d'une étape est fixée une fois, à son ouverture, à 4 h de la
-- production cumulée des joueurs actifs (calculée par le serveur et passée dans p_stage_bases).
-- sized_stage retient l'étape déjà dimensionnée : l'étape ouverte à la mise en ligne
-- est redimensionnée une seule fois, en gardant la pierre déjà versée.
alter table public.worksites add column if not exists sized_stage int;

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
