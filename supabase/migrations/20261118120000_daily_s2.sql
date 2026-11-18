-- Quêtes du jour de la saison 2 : travaux, marché et convois expédiés à la main remplacent ateliers, savoirs, veines et raids repoussés.
-- Les anciennes clés restent renvoyées (à zéro ou presque) pour ne rien casser chez un client en retard.
create or replace function public.daily_counts(p_season int, p_user uuid, p_since timestamptz, p_lords uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with log as (
    select action, details from public.action_log
    where user_id = p_user and season_id = p_season and created_at >= p_since
  )
  select jsonb_build_object(
    'don', coalesce((select sum(case when jsonb_typeof(details->'amount') = 'number' then (details->'amount')::numeric else 0 end) from log where action = 'contribute'), 0),
    'ameliorer', (select count(*) from log where action in ('s2_upgrade', 's2_build', 's2_cbuild')),
    'marche', (select count(*) from log where action = 's2_exchange'),
    'convoi', (select count(*) from log where action in ('s2_ship', 's2_supply')),
    'renforts', (select count(*) from log where action = 'reinforce'),
    'evenement', (select count(*) from log where action in ('event_march', 'event_attack', 'tournament_join')),
    'seigneur', (select count(*) from public.chronicle c where c.season_id = p_season and c.created_at >= p_since and c.kind = 'raid' and c.actor_id = p_user and c.target_id = any(p_lords) and (c.details->>'success')::boolean),
    'message', (select count(*) from public.chat_messages m where m.user_id = p_user and m.created_at >= p_since),
    'espion', (select count(*) from log where action = 'spy')
  );
$$;
revoke execute on function public.daily_counts(int, uuid, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.daily_counts(int, uuid, timestamptz, uuid[]) to service_role;
