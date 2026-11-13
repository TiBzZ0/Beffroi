# 🔔 Beffroi

Un idle médiéval pour 3 à 10 amis, jouable dans le navigateur (mobile compris). Chacun taille sa pierre et développe ses ateliers, et tout le monde verse une part de sa production pour bâtir ensemble le grand beffroi. Une saison dure 2 semaines.

Ce dépôt contient le **MVP (saison 0)** du document de conception :

- connexion par e-mail, pseudo et mot de passe (connexion possible avec l'e-mail ou le pseudo), sans confirmation d'e-mail (mot de passe oublié : l'admin le réinitialise, faute de serveur d'e-mail) ;
- une ressource (la pierre), 7 bâtiments et 19 améliorations (« savoirs ») ;
- des gains hors ligne plafonnés à 8 h ;
- des clics regroupés par lots et plafonnés à 15 par seconde côté serveur ;
- un chantier commun en 3 étapes, dont la taille s'adapte au nombre de joueurs actifs, avec une barre en direct et un bonus permanent par étape ;
- le classement des contributeurs.

Les raids, le prestige, les écus de gloire, les seigneurs voisins et les équipes viendront dans les versions suivantes.

## Stack

| Brique | Rôle |
| --- | --- |
| Next.js 16 (App Router), conteneur Docker sur le PC-serveur | Interface React, API (Route Handlers), connexion (Server Actions) |
| Supabase auto-hébergé : Postgres | État des joueurs, saisons, chantier commun, journal des actions |
| Supabase Auth | Comptes e-mail + mot de passe, pseudo dans `profiles` |
| Supabase Realtime | Diffusion en direct de la barre du chantier |
| Redis local (API compatible Upstash via serverless-redis-http) | Classement (sorted set) et limitation de débit (optionnel en local) |

## Comment ça marche

- **Le serveur fait foi.** Il ne fait rien tourner en continu : à chaque requête, il recalcule l'état du joueur à partir du dernier état sauvé et du temps écoulé (`src/lib/game/engine.ts`, fonction `advance`). Le calcul est découpé en segments quand une étape du chantier se termine pendant l'absence.
- **Le navigateur prédit.** Il utilise exactement le même moteur pour animer le compteur 60 fois par seconde, et l'état du serveur écrase le sien à chaque réponse.
- **Le client n'envoie que des intentions** (`buy`, `upgrade`, `contribute`, `click`, `sync`) à `POST /api/game`. Jamais de valeurs.
- **La base refuse toute écriture du navigateur** (Row Level Security en lecture seule). L'API écrit avec la clé secrète, à travers la fonction SQL `commit_player_state`, qui applique un verrouillage optimiste et verse la contribution au chantier dans la même transaction.
- L'équilibrage se règle dans un seul fichier : `src/lib/game/config.ts`.

```
src/
  app/
    (auth)/connexion, (auth)/inscription   pages de connexion et d'inscription
    (auth)/actions.ts                      Server Actions : connexion, inscription, déconnexion
    (auth)/mot-de-passe-oublie, (auth)/nouveau-mot-de-passe   réinitialisation du mot de passe
    auth/callback/route.ts                 liens envoyés par e-mail
    api/game/route.ts                      point d'entrée unique du jeu
    api/leaderboard/route.ts               classement
    page.tsx                               page de jeu
  components/game.tsx, use-game.ts        interface et logique client
  lib/game/config.ts                       bâtiments, améliorations, étapes du chantier
  lib/game/engine.ts                       moteur idle pur (partagé client/serveur) + tests
  lib/game/server.ts                       logique serveur (charger, recalculer, enregistrer)
  proxy.ts                                 rafraîchissement de session et protection des pages
supabase/migrations/                       schéma SQL, RLS et fonctions
```

## Mise en ligne (PC-serveur auto-hébergé)

Depuis le 12 novembre 2026, le jeu ne tourne plus sur Vercel + Supabase cloud + Upstash, mais sur le PC-serveur de l'admin (Debian, Docker, allumé 24 h/24), publié sur Internet par **Tailscale Funnel** :

**https://machine-serveur.tail6d5d9d.ts.net**

```
Joueurs ─▶ Tailscale Funnel (HTTPS) ─▶ Caddy
             ├─ /auth/v1/*, /rest/v1/*, /realtime/v1/* ─▶ Supabase auto-hébergé (pile Docker officielle)
             └─ tout le reste ─▶ beffroi-app (Next.js, `npm run build` puis `next start`, Node 22)
                                   └─ Redis local (serverless-redis-http, API compatible Upstash)
```

La pile (`compose.yaml`, `Caddyfile`, `Dockerfile`, `.env`, scripts) vit sur le PC dans `/srv/docker/beffroi/`, avec le clone du dépôt dans `source/`. Elle n'est pas dans ce dépôt. Le clone suit la **branche par défaut du dépôt**.

### Livrer une nouvelle version

1. **D'abord les migrations SQL, s'il y en a.** Il n'y a plus de déploiement automatique des migrations : chaque nouveau fichier de `supabase/migrations/` se colle à la main dans **Studio → SQL Editor** (`http://machine-serveur:8000`, via Tailscale), dans l'ordre des noms de fichiers, **avant** l'étape 2. Chaque livraison doit dire clairement si elle contient une migration et laquelle.
2. Sur le PC-serveur :
   ```bash
   bash /srv/docker/beffroi/mettre-a-jour.sh   # git pull --ff-only, reconstruction, redémarrage (quelques secondes de coupure)
   ```

### Variables d'environnement

| Variable | Valeur |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | l'adresse publique du site (Caddy aiguille par chemin vers Supabase) |
| `NEXT_PUBLIC_SITE_URL` | l'adresse publique du site |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | clés du Supabase auto-hébergé |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | `http://srh:80` et le jeton local |
| `NEXT_PUBLIC_PASSWORD_RESET` | `1` seulement quand un SMTP est configuré dans Supabase (voir plus bas) |

Les `NEXT_PUBLIC_*` sont **figées à la construction** de l'image (`--build-arg`). Si l'adresse change (vrai domaine, par exemple), il faut reconstruire l'image et changer `SITE_URL` et `API_EXTERNAL_URL` dans le `.env` de Supabase.

### Mot de passe oublié

Le Supabase auto-hébergé n'a pas de serveur d'e-mail : le lien « Mot de passe oublié » est remplacé par « demande à l'admin ». Pour remettre un mot de passe à zéro, dans **Studio → SQL Editor** :

```sql
update auth.users
set encrypted_password = crypt('nouveau-mot-de-passe', gen_salt('bf'))
where email = 'joueur@exemple.fr';
```

Pour rétablir l'envoi par e-mail : configurer `SMTP_*` dans le `.env` de Supabase (Brevo, Resend, Gmail…), puis reconstruire l'image du jeu avec `NEXT_PUBLIC_PASSWORD_RESET=1`.

### Sans Redis

Le jeu fonctionne quand même : le classement est lu dans Postgres et la limitation de débit est désactivée.

## Développement local

```bash
npm install
cp .env.example .env.local   # puis renseigne les clés Supabase
npm run dev                  # http://localhost:3000
npm test                     # tests du moteur de jeu
npm run lint && npm run typecheck
```
