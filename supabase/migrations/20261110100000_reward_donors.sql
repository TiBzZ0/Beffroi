-- B6 : le beffroi légendaire achevé verse des écus à chaque joueur qui a atteint au moins un palier de don.
create or replace function public.reward_donors(p_season int, p_amount int)
returns int
language sql
security definer
set search_path = ''
as $$
  with paid as (
    update public.profiles p set ecus = p.ecus + greatest(p_amount, 0)
    from public.player_states ps
    where ps.season_id = p_season and ps.user_id = p.id
      and coalesce((ps.military ->> 'donorTiers')::int, 0) > 0
    returning p.id
  )
  select count(*)::int from paid;
$$;
revoke execute on function public.reward_donors(int, int) from public, anon, authenticated;
grant execute on function public.reward_donors(int, int) to service_role;
