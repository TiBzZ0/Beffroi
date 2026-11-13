-- H1 : les jours de présence ne comptent que les vrais joueurs (les seigneurs écrivent aussi dans action_log).
create or replace function public.season_login_days(p_season int, p_since timestamptz, p_until timestamptz)
returns table (user_id uuid, days int)
language sql
stable
security definer
set search_path = ''
as $$
  select x.user_id, count(distinct x.d)::int
  from (
    select a.user_id, (a.created_at at time zone 'Europe/Paris')::date as d from public.action_log a where a.season_id = p_season
    union
    select m.user_id, (m.created_at at time zone 'Europe/Paris')::date from public.chat_messages m where m.created_at >= p_since and m.created_at <= p_until
  ) x
  join public.profiles p on p.id = x.user_id and not p.is_bot
  group by x.user_id;
$$;
revoke execute on function public.season_login_days(int, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.season_login_days(int, timestamptz, timestamptz) to service_role;
