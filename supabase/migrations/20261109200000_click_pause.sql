-- Beffroi : anti-triche des cliqueurs trop rapides (avertissements, pause forcée du marteau).
alter table public.player_states
  add column click_strikes int not null default 0,
  add column click_paused_until timestamptz not null default 'epoch';

create or replace function public.apply_state(p_season int, s jsonb, p_touch boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_version int;
begin
  update public.player_states set
    stone = (s ->> 'stone')::double precision,
    generators = s -> 'generators',
    upgrades = s -> 'upgrades',
    total_produced = (s ->> 'total_produced')::double precision,
    total_contributed = (s ->> 'total_contributed')::double precision,
    total_clicks = (s ->> 'total_clicks')::bigint,
    last_update = (s ->> 'last_update')::timestamptz,
    last_click_at = (s ->> 'last_click_at')::timestamptz,
    ruins = s -> 'ruins',
    burned_until = (s ->> 'burned_until')::timestamptz,
    shield_until = (s ->> 'shield_until')::timestamptz,
    last_raid_at = (s ->> 'last_raid_at')::timestamptz,
    last_raid_target = nullif(s ->> 'last_raid_target', '')::uuid,
    revenge_target = nullif(s ->> 'revenge_target', '')::uuid,
    revenge_until = (s ->> 'revenge_until')::timestamptz,
    total_plundered = (s ->> 'total_plundered')::double precision,
    troops = coalesce(s -> 'troops', troops),
    defenses = coalesce(s -> 'defenses', defenses),
    click_strikes = coalesce((s ->> 'click_strikes')::int, click_strikes),
    click_paused_until = coalesce((s ->> 'click_paused_until')::timestamptz, click_paused_until),
    last_ip = coalesce(s ->> 'last_ip', last_ip),
    next_raid_at = case when s ? 'next_raid_at' then (s ->> 'next_raid_at')::timestamptz else next_raid_at end,
    next_contrib_at = case when s ? 'next_contrib_at' then (s ->> 'next_contrib_at')::timestamptz else next_contrib_at end,
    last_seen = case when p_touch then now() else last_seen end,
    version = version + 1
  where user_id = (s ->> 'user_id')::uuid
    and season_id = p_season
    and version = (s ->> 'version')::int
  returning version into new_version;
  return new_version;
end;
$$;

revoke execute on function public.apply_state(int, jsonb, boolean) from public, anon, authenticated;
