-- Beffroi : guerres d'alliances (24 h) et forteresse à conquérir.

create table public.wars (
  id bigint generated always as identity primary key,
  season_id int not null references public.seasons (id) on delete cascade,
  alliance_a bigint not null references public.alliances (id) on delete cascade,
  alliance_b bigint not null references public.alliances (id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  score_a double precision not null default 0,
  score_b double precision not null default 0,
  winner bigint,
  settled boolean not null default false
);
create index wars_season_idx on public.wars (season_id, ends_at desc);
alter table public.wars enable row level security;
create policy "guerres lisibles par les joueurs" on public.wars for select to authenticated using (true);

-- Ajoute du butin au score d'une alliance dans une guerre en cours.
create function public.add_war_score(p_war bigint, p_alliance bigint, p_amount double precision)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.wars set
    score_a = score_a + case when alliance_a = p_alliance then p_amount else 0 end,
    score_b = score_b + case when alliance_b = p_alliance then p_amount else 0 end
  where id = p_war and not settled and ends_at > now();
$$;

-- Clôt une guerre terminée (une seule fois) : la moitié du butin total est partagée entre les vainqueurs.
create function public.settle_war(p_war bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wars;
  win bigint;
  bounty double precision;
  n int;
begin
  update public.wars set settled = true where id = p_war and not settled and ends_at <= now() returning * into w;
  if not found then
    return null;
  end if;
  win := case when w.score_a > w.score_b then w.alliance_a when w.score_b > w.score_a then w.alliance_b end;
  bounty := floor((w.score_a + w.score_b) * 0.5);
  if win is not null then
    select count(*) into n from public.player_states where season_id = w.season_id and alliance_id = win;
    if n > 0 and bounty > 0 then
      update public.player_states set stone = stone + bounty / n, version = version + 1
      where season_id = w.season_id and alliance_id = win;
    end if;
  end if;
  update public.wars set winner = win where id = p_war;
  insert into public.chronicle (season_id, kind, details)
  values (w.season_id, 'war', jsonb_build_object('phase', 'end', 'war', w.id, 'a', w.alliance_a, 'b', w.alliance_b,
    'scoreA', w.score_a, 'scoreB', w.score_b, 'winner', win, 'bounty', case when win is null then 0 else bounty end));
  return jsonb_build_object('winner', win, 'bounty', bounty);
end;
$$;

create table public.fortresses (
  season_id int primary key references public.seasons (id) on delete cascade,
  holder bigint references public.alliances (id) on delete set null,
  garrison jsonb not null default '{}'::jsonb,
  captured_at timestamptz,
  version int not null default 0
);
alter table public.fortresses enable row level security;
create policy "forteresse lisible par les joueurs" on public.fortresses for select to authenticated using (true);

-- Écrit l'état du joueur et la forteresse ensemble (verrou optimiste des deux côtés).
create function public.apply_fortress(p_season int, p_state jsonb, p_version int, p_holder bigint, p_garrison jsonb, p_captured boolean, p_action text, p_details jsonb)
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
  where season_id = p_season and version = p_version;
  if not found then
    raise exception 'beffroi_conflict';
  end if;
  if p_action is not null then
    insert into public.action_log (user_id, season_id, action, details)
    values ((p_state ->> 'user_id')::uuid, p_season, p_action, coalesce(p_details, '{}'::jsonb));
  end if;
  if p_action = 'fortress_attack' then
    insert into public.chronicle (season_id, kind, actor_id, details)
    values (p_season, 'fortress', (p_state ->> 'user_id')::uuid, coalesce(p_details, '{}'::jsonb));
  end if;
  return jsonb_build_object('ok', true, 'version', v);
end;
$$;

revoke execute on function public.add_war_score(bigint, bigint, double precision) from public, anon, authenticated;
revoke execute on function public.settle_war(bigint) from public, anon, authenticated;
revoke execute on function public.apply_fortress(int, jsonb, int, bigint, jsonb, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_war_score(bigint, bigint, double precision) to service_role;
grant execute on function public.settle_war(bigint) to service_role;
grant execute on function public.apply_fortress(int, jsonb, int, bigint, jsonb, boolean, text, jsonb) to service_role;
