-- Beffroi : événements temporaires (caravane marchande, colosse à abattre à plusieurs).
create table public.events (
  id bigint generated always as identity primary key,
  season_id int not null references public.seasons (id) on delete cascade,
  kind text not null check (kind in ('caravane', 'colosse')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  -- Défenseurs restants et de départ.
  army jsonb not null default '{}'::jsonb,
  army_start jsonb not null default '{}'::jsonb,
  -- Caravane : pierre restante / de départ. Colosse : prime à partager / prime de départ.
  pool double precision not null default 0,
  prize double precision not null default 0,
  -- Joueur → pierre prise (caravane) ou dégâts infligés en valeur de pierre (colosse).
  attackers jsonb not null default '{}'::jsonb,
  settled boolean not null default false,
  version int not null default 0
);
create unique index events_one_active on public.events (season_id) where not settled;
create index events_season_idx on public.events (season_id, ends_at desc);
alter table public.events enable row level security;
create policy "événements lisibles par les joueurs" on public.events for select to authenticated using (true);

-- Écrit l'état du joueur et l'événement ensemble (verrou optimiste des deux côtés).
create function public.apply_event(p_season int, p_state jsonb, p_event bigint, p_version int, p_army jsonb, p_pool double precision, p_attackers jsonb, p_action text, p_details jsonb)
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
  update public.events set army = p_army, pool = p_pool, attackers = p_attackers, version = version + 1
  where id = p_event and season_id = p_season and version = p_version and not settled and ends_at > now();
  if not found then
    raise exception 'beffroi_conflict';
  end if;
  insert into public.action_log (user_id, season_id, action, details)
  values ((p_state ->> 'user_id')::uuid, p_season, p_action, coalesce(p_details, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'version', v);
end;
$$;

-- Clôt un événement fini (temps écoulé, caravane vidée ou colosse abattu).
-- Colosse abattu : la prime est partagée au prorata des dégâts.
create function public.settle_event(p_event bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  total double precision;
  killed boolean;
begin
  select * into e from public.events where id = p_event and not settled for update;
  if not found then
    return null;
  end if;
  killed := e.kind = 'colosse' and not exists (select 1 from jsonb_each_text(e.army) where value::double precision > 0);
  if e.ends_at > now() and not killed and not (e.kind = 'caravane' and e.pool <= 0) then
    return null;
  end if;
  update public.events set settled = true, ends_at = least(ends_at, now()) where id = p_event;
  select coalesce(sum(value::double precision), 0) into total from jsonb_each_text(e.attackers);
  if killed and total > 0 and e.pool > 0 then
    update public.player_states ps set stone = ps.stone + e.pool * (a.value::double precision) / total, version = ps.version + 1
    from jsonb_each_text(e.attackers) a
    where ps.season_id = e.season_id and ps.user_id = a.key::uuid;
  end if;
  insert into public.chronicle (season_id, kind, details)
  values (e.season_id, 'event', jsonb_build_object('phase', 'end', 'event', e.kind, 'success', killed,
    'bounty', case when killed then e.pool else 0 end, 'stolen', e.prize - e.pool, 'shares', e.attackers));
  return jsonb_build_object('killed', killed);
end;
$$;

revoke execute on function public.apply_event(int, jsonb, bigint, int, jsonb, double precision, jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.settle_event(bigint) from public, anon, authenticated;
grant execute on function public.apply_event(int, jsonb, bigint, int, jsonb, double precision, jsonb, text, jsonb) to service_role;
grant execute on function public.settle_event(bigint) to service_role;

alter publication supabase_realtime add table public.events;
