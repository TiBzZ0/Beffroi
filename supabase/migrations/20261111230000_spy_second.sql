-- E4 : rapports faussés par le contre-espionnage ; quête du jour « envoyer une reconnaissance ».
alter table public.spy_reports add column if not exists noise boolean not null default false;

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
    'ateliers', coalesce((select sum(case when jsonb_typeof(details->'qty') = 'number' then (details->'qty')::numeric when (details->>'qty') ~ '^[0-9]+$' then (details->>'qty')::numeric else 0 end) from log where action = 'buy'), 0),
    'savoir', (select count(*) from log where action = 'upgrade'),
    'renforts', (select count(*) from log where action = 'reinforce'),
    'veines', (select count(*) from log where action = 'vein'),
    'evenement', (select count(*) from log where action in ('event_march', 'event_attack', 'merchant', 'tournament_join')),
    'seigneur', (select count(*) from public.chronicle c where c.season_id = p_season and c.created_at >= p_since and c.kind = 'raid' and c.actor_id = p_user and c.target_id = any(p_lords) and (c.details->>'success')::boolean),
    'repousser', (select count(*) from public.chronicle c where c.season_id = p_season and c.created_at >= p_since and c.kind = 'raid' and c.target_id = p_user and not coalesce((c.details->>'success')::boolean, true)),
    'message', (select count(*) from public.chat_messages m where m.user_id = p_user and m.created_at >= p_since),
    'espion', (select count(*) from log where action = 'spy')
  );
$$;
revoke execute on function public.daily_counts(int, uuid, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.daily_counts(int, uuid, timestamptz, uuid[]) to service_role;
