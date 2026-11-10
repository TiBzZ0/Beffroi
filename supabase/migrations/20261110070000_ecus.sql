-- Audit B2 : les écus, monnaie entière du profil, jamais remise à zéro ni pillée.
alter table public.profiles add column if not exists ecus int not null default 0;

create or replace function public.add_ecus(p_user uuid, p_amount int)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.profiles set ecus = ecus + greatest(p_amount, 0) where id = p_user returning ecus;
$$;
revoke execute on function public.add_ecus(uuid, int) from public, anon, authenticated;
grant execute on function public.add_ecus(uuid, int) to service_role;
