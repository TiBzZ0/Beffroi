-- Vague 2, fin : camps de bandits de la carte (état du monde de la saison) et quatre forteresses au lieu d'une.
-- Tout est additif : aucune donnée n'est supprimée.

-- Camps de bandits : gardés avec la carte de la saison, version pour le verrou optimiste.
alter table public.season_maps add column if not exists world jsonb not null default '{}'::jsonb;
alter table public.season_maps add column if not exists world_version int not null default 0;

-- Forteresses : une ligne par forteresse (idx 0 à 3). La ligne existante devient la forteresse 0 (du Nord).
alter table public.fortresses add column if not exists idx int not null default 0;
do $$
begin
  if exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.fortresses'::regclass and c.contype = 'p'
      and array_length(c.conkey, 1) = 1
  ) then
    alter table public.fortresses drop constraint fortresses_pkey;
    alter table public.fortresses add constraint fortresses_pkey primary key (season_id, idx);
  end if;
end;
$$;

-- Écrit l'état du joueur et une forteresse ensemble (verrou optimiste des deux côtés).
create or replace function public.apply_fortress_at(p_season int, p_idx int, p_state jsonb, p_version int, p_holder bigint, p_garrison jsonb, p_captured boolean, p_action text, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v int;
begin
  v := public.apply_state(p_season, p_state, true);
  if v is null then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;
  update public.fortresses set
    holder = p_holder,
    garrison = p_garrison,
    captured_at = case when p_captured then now() else captured_at end,
    version = version + 1
  where season_id = p_season and idx = p_idx and version = p_version;
  if not found then
    raise exception 'beffroi_conflict';
  end if;
  if p_action is not null then
    insert into public.action_log (user_id, season_id, action, details)
    values ((p_state ->> 'user_id')::uuid, p_season, p_action, coalesce(p_details, '{}'::jsonb));
  end if;
  if p_action = 'fortress_attack' then
    insert into public.chronicle (season_id, kind, actor_id, details)
    values (p_season, 'fortress', (p_state ->> 'user_id')::uuid, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('fort', p_idx));
  end if;
  return jsonb_build_object('ok', true, 'version', v);
end;
$$;

revoke execute on function public.apply_fortress_at(int, int, jsonb, int, bigint, jsonb, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_fortress_at(int, int, jsonb, int, bigint, jsonb, boolean, text, jsonb) to service_role;
