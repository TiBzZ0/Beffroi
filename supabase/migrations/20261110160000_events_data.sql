-- V7, V8, V9 : données propres à chaque événement localisé (camps de bandits, détenteur du trésor), et nouveaux types.
alter table public.events add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('caravane', 'colosse', 'foire', 'fete', 'etoiles', 'treve', 'marchand', 'lune', 'brouillard', 'filon', 'bandits', 'tresor'));

-- Écrit plusieurs états de joueurs et les données d'un événement d'un seul coup (versions vérifiées).
create or replace function public.apply_event_data(p_season int, p_states jsonb, p_event bigint, p_version int, p_data jsonb, p_attackers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
  v int;
begin
  for s in select * from jsonb_array_elements(coalesce(p_states, '[]'::jsonb)) loop
    v := public.apply_state(p_season, s, false);
    if v is null then
      raise exception 'beffroi_conflict';
    end if;
  end loop;
  update public.events set data = p_data, attackers = coalesce(p_attackers, attackers), version = version + 1
  where id = p_event and season_id = p_season and version = p_version;
  if not found then
    raise exception 'beffroi_conflict';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.apply_event_data(int, jsonb, bigint, int, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_event_data(int, jsonb, bigint, int, jsonb, jsonb) to service_role;
