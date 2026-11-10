-- Audit A14 et A15 : caravane personnelle (aucun chargement commun) et colosse payé à chaque assaut.
-- La fin d'un événement ne verse plus de prime commune ; un colosse abattu verse `p_bonus`
-- (15 minutes de production de chaque joueur qui l'a touché, calculées par le serveur).
-- Nouvelle fonction à côté de l'ancienne (gardée pour la mise en ligne, sans rien supprimer).
create or replace function public.settle_event_v2(p_event bigint, p_bonus jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  killed boolean;
  paid double precision;
  total double precision;
begin
  select * into e from public.events where id = p_event and not settled for update;
  if not found then
    return null;
  end if;
  killed := e.kind = 'colosse' and not exists (select 1 from jsonb_each_text(e.army) where value::double precision > 0);
  if e.ends_at > now() and not killed then
    return null;
  end if;
  update public.events set settled = true, ends_at = least(ends_at, now()) where id = p_event;
  paid := 0;
  if killed and e.pool > 0 then
    -- Colosse lancé avant cette règle : sa prime commune est partagée selon les pertes infligées.
    select coalesce(sum(value::double precision), 0) into total from jsonb_each_text(e.attackers);
    if total > 0 then
      update public.player_states ps set stone = ps.stone + e.pool * (a.value::double precision) / total, version = ps.version + 1
      from jsonb_each_text(e.attackers) a
      where ps.season_id = e.season_id and ps.user_id = a.key::uuid;
      paid := e.pool;
    end if;
  elsif killed then
    update public.player_states ps set stone = ps.stone + b.value::double precision, version = ps.version + 1
    from jsonb_each_text(coalesce(p_bonus, '{}'::jsonb)) b
    where ps.season_id = e.season_id and ps.user_id = b.key::uuid and e.attackers ? b.key;
    select coalesce(sum(value::double precision), 0) into paid from jsonb_each_text(coalesce(p_bonus, '{}'::jsonb));
  end if;
  insert into public.chronicle (season_id, kind, details)
  values (e.season_id, 'event', jsonb_build_object('phase', 'end', 'event', e.kind, 'success', killed,
    'bounty', paid,
    'stolen', case when e.kind = 'caravane' then (select coalesce(sum(value::double precision), 0) from jsonb_each_text(e.attackers)) else 0 end,
    'shares', e.attackers));
  return jsonb_build_object('killed', killed);
end;
$$;
revoke execute on function public.settle_event_v2(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.settle_event_v2(bigint, jsonb) to service_role;
