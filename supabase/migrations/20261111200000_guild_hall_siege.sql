-- Halle de guilde (H5) : garnison, ailes hors service, protection après un assaut.
alter table public.guild_halls
  add column if not exists garrison jsonb not null default '{}'::jsonb,
  add column if not exists disabled jsonb not null default '{}'::jsonb,
  add column if not exists immune_until bigint not null default 0,
  add column if not exists version int not null default 0;

-- Écrit des états de joueurs et la halle ensemble (version de la halle vérifiée).
create or replace function public.apply_hall(p_season int, p_states jsonb, p_hall bigint, p_version int, p_garrison jsonb, p_disabled jsonb, p_immune_until bigint, p_action text, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
  v int;
  i int := 0;
begin
  for s in select * from jsonb_array_elements(p_states) loop
    v := public.apply_state(p_season, s, i = 0);
    if v is null then
      if i = 0 then
        return jsonb_build_object('ok', false, 'conflict', true);
      end if;
      raise exception 'beffroi_conflict';
    end if;
    i := i + 1;
  end loop;
  update public.guild_halls set
    garrison = p_garrison,
    disabled = p_disabled,
    immune_until = p_immune_until,
    version = version + 1
  where id = p_hall and version = p_version;
  if not found then
    raise exception 'beffroi_conflict';
  end if;
  if p_action is not null then
    insert into public.action_log (user_id, season_id, action, details)
    values ((p_states -> 0 ->> 'user_id')::uuid, p_season, p_action, coalesce(p_details, '{}'::jsonb));
  end if;
  if p_action = 'hall_siege' then
    insert into public.chronicle (season_id, kind, actor_id, details)
    values (p_season, 'hall_siege', (p_states -> 0 ->> 'user_id')::uuid, coalesce(p_details, '{}'::jsonb));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.apply_hall(int, jsonb, bigint, int, jsonb, jsonb, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_hall(int, jsonb, bigint, int, jsonb, jsonb, bigint, text, jsonb) to service_role;
