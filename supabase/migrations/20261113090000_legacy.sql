-- H1, H2 : héritage gardé d'une saison à l'autre, écus de clôture de saison.
alter table public.profiles add column if not exists legacy jsonb not null default '{}'::jsonb;

create table if not exists public.season_rewards (
  season_id int not null references public.seasons(id),
  user_id uuid not null references public.profiles(id),
  total int not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
alter table public.season_rewards enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'season_rewards' and policyname = 'season_rewards_own') then
    create policy season_rewards_own on public.season_rewards for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

-- Achat d'un niveau d'héritage : le niveau n coûte p_base × n écus.
create or replace function public.buy_legacy(p_user uuid, p_kind text, p_max int, p_base int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ecus int;
  v_legacy jsonb;
  v_level int;
  v_cost int;
begin
  select ecus, legacy into v_ecus, v_legacy from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Profil introuvable.'); end if;
  v_level := coalesce((v_legacy ->> p_kind)::int, 0);
  if v_level >= p_max then return jsonb_build_object('ok', false, 'error', 'Ce bonus est déjà au plus haut.'); end if;
  v_cost := p_base * (v_level + 1);
  if coalesce(v_ecus, 0) < v_cost then return jsonb_build_object('ok', false, 'error', 'Pas assez d''écus.'); end if;
  update public.profiles
  set ecus = ecus - v_cost, legacy = coalesce(legacy, '{}'::jsonb) || jsonb_build_object(p_kind, v_level + 1)
  where id = p_user
  returning ecus, legacy into v_ecus, v_legacy;
  return jsonb_build_object('ok', true, 'ecus', v_ecus, 'legacy', v_legacy, 'cost', v_cost);
end;
$$;
revoke execute on function public.buy_legacy(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.buy_legacy(uuid, text, int, int) to service_role;

-- Paiement des écus de clôture : une seule fois par joueur et par saison.
create or replace function public.pay_season_rewards(p_season int, p_rows jsonb)
returns int
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.season_rewards (season_id, user_id, total, details)
    select p_season, (r ->> 'user_id')::uuid, (r ->> 'total')::int, coalesce(r -> 'details', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where exists (select 1 from public.profiles p where p.id = (r ->> 'user_id')::uuid)
    on conflict (season_id, user_id) do nothing
    returning user_id, total
  ), paid as (
    update public.profiles p set ecus = p.ecus + ins.total from ins where p.id = ins.user_id returning p.id
  )
  select count(*)::int from paid;
$$;
revoke execute on function public.pay_season_rewards(int, jsonb) from public, anon, authenticated;
grant execute on function public.pay_season_rewards(int, jsonb) to service_role;

-- Jours de connexion d'une saison (heure de Paris) : actions et messages.
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
  group by x.user_id;
$$;
revoke execute on function public.season_login_days(int, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.season_login_days(int, timestamptz, timestamptz) to service_role;
