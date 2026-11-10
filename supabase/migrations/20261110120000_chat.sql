-- B11 : messages courts. Canal « general » pour tous, « a:<id alliance> » pour une alliance.
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  season_id int not null references public.seasons (id) on delete cascade,
  channel text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  reactions jsonb not null default '{}'::jsonb, -- { emoji: [id joueur, ...] }
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_channel_idx on public.chat_messages (season_id, channel, id desc);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at desc);
alter table public.chat_messages enable row level security;

-- Ajoute ou retire la réaction d'un joueur, sans écraser celles des autres.
create or replace function public.toggle_reaction(p_id bigint, p_user uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  uid text := p_user::text;
  list jsonb;
begin
  select reactions into r from public.chat_messages where id = p_id for update;
  if not found then
    return null;
  end if;
  list := coalesce(r -> p_emoji, '[]'::jsonb);
  if list ? uid then
    list := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(list) x where x <> uid);
  else
    list := list || to_jsonb(uid);
  end if;
  r := case when jsonb_array_length(list) = 0 then r - p_emoji else jsonb_set(r, array[p_emoji], list) end;
  update public.chat_messages set reactions = r where id = p_id;
  return r;
end;
$$;
revoke execute on function public.toggle_reaction(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_reaction(bigint, uuid, text) to service_role;
