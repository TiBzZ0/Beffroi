-- V10 à V12 : convoi royal, siège du beffroi, tournoi.
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('caravane', 'colosse', 'foire', 'fete', 'etoiles', 'treve', 'marchand', 'lune', 'brouillard', 'filon', 'bandits', 'tresor', 'convoi', 'siege', 'tournoi'));

-- V11 : siège perdu, l'étape en cours perd une part de sa pierre (le monument achevé ne risque rien).
drop function if exists public.siege_damage(int, double precision);
create or replace function public.siege_damage(p_season int, p_share double precision, p_stages int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.worksites
  set total = greatest(0, total - progress * p_share), progress = progress * (1 - p_share), updated_at = now()
  where season_id = p_season and stage < p_stages;
$$;
revoke execute on function public.siege_damage(int, double precision, int) from public, anon, authenticated;
grant execute on function public.siege_damage(int, double precision, int) to service_role;
