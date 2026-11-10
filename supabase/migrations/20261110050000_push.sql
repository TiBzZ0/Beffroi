-- Beffroi : notifications push (abonnements des navigateurs) et secrets du serveur.
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

-- Lu uniquement par le serveur (clé de service) : aucune politique, donc rien pour les joueurs.
-- La clé privée VAPID y est déposée à la main, jamais dans le dépôt.
create table public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
