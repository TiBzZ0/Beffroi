-- Beffroi : raid groupé, le butin est aussi versé aux alliés dont les renforts ont combattu.
create function public.apply_raid_group(p_season int, p_attacker jsonb, p_victim jsonb, p_allies jsonb, p_attacker_touch boolean, p_chronicle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attacker int;
  v_victim int;
  ally jsonb;
begin
  v_attacker := public.apply_state(p_season, p_attacker, p_attacker_touch);
  if v_attacker is null then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;
  v_victim := public.apply_state(p_season, p_victim, false);
  if v_victim is null then
    raise exception 'beffroi_conflict';
  end if;
  for ally in select * from jsonb_array_elements(coalesce(p_allies, '[]'::jsonb)) loop
    if public.apply_state(p_season, ally, false) is null then
      raise exception 'beffroi_conflict';
    end if;
  end loop;
  insert into public.chronicle (season_id, kind, actor_id, target_id, details)
  values (p_season, 'raid', (p_attacker ->> 'user_id')::uuid, (p_victim ->> 'user_id')::uuid, coalesce(p_chronicle, '{}'::jsonb));
  insert into public.action_log (user_id, season_id, action, details)
  values ((p_attacker ->> 'user_id')::uuid, p_season, 'raid', coalesce(p_chronicle, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'version', v_attacker, 'victim_version', v_victim);
end;
$$;

revoke execute on function public.apply_raid_group(int, jsonb, jsonb, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.apply_raid_group(int, jsonb, jsonb, jsonb, boolean, jsonb) to service_role;
