# 🔔 Beffroi

Un idle médiéval pour 3 à 10 amis, jouable dans le navigateur (mobile compris). Chacun taille sa pierre et développe ses ateliers, et tout le monde verse une part de sa production pour bâtir ensemble le grand beffroi. Une saison dure 2 semaines.

Ce dépôt contient le **MVP (saison 0)** du document de conception :

- connexion par e-mail, pseudo et mot de passe (connexion possible avec l'e-mail ou le pseudo), sans confirmation d'e-mail, avec « Mot de passe oublié » ;
- une ressource (la pierre), 7 bâtiments et 19 améliorations (« savoirs ») ;
- des gains hors ligne plafonnés à 8 h ;
- des clics regroupés par lots et plafonnés à 15 par seconde côté serveur ;
- un chantier commun en 3 étapes, dont la taille s'adapte au nombre de joueurs actifs, avec une barre en direct et un bonus permanent par étape ;
- le classement des contributeurs.

Les raids, le prestige, les écus de gloire, les seigneurs voisins et les équipes viendront dans les versions suivantes.

## Stack

| Brique | Rôle |
| --- | --- |
| Next.js 16 (App Router) sur Vercel | Interface React, API (Route Handlers), connexion (Server Actions) |
| Supabase Postgres | État des joueurs, saisons, chantier commun, journal des actions |
| Supabase Auth | Comptes e-mail + mot de passe, pseudo dans `profiles` |
| Supabase Realtime | Diffusion en direct de la barre du chantier |
| Upstash Redis | Classement (sorted set) et limitation de débit (optionnel en local) |

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

## Mise en ligne (tout en offres gratuites)

### 1. Supabase (base de données et comptes)

1. Crée un compte sur [supabase.com](https://supabase.com) puis un projet (plan Free, région Europe de préférence). Garde le mot de passe de la base dans un coin.
2. Dans **SQL Editor**, colle tout le contenu de `supabase/migrations/20261109000000_init.sql` et clique sur **Run**.
3. Dans **Project Settings → API Keys**, récupère la **Publishable key** et la **Secret key**, et dans **Project Settings → Data API** l'**URL du projet**.
4. Dans **Authentication → URL Configuration** (à faire après l'étape Vercel, quand tu connais l'adresse du site) :
   - **Site URL** : `https://<ton-projet>.vercel.app`
   - **Redirect URLs** : ajoute `https://<ton-projet>.vercel.app/auth/callback` et `http://localhost:3000/auth/callback`.
5. Désactive la confirmation d'e-mail : **Authentication → Sign In / Providers → Email**, décoche **Confirm email** et enregistre. On entre ainsi dans le jeu dès l'inscription. L'e-mail ne sert plus qu'au lien « Mot de passe oublié », envoyé par le service intégré de Supabase (quelques messages par heure, largement assez pour un groupe d'amis).

### 2. Vercel (hébergement)

1. Sur [vercel.com](https://vercel.com), connecte-toi avec GitHub, puis **Add New → Project** et importe le dépôt `Beffroi`.
2. Avant de déployer, ajoute les variables d'environnement :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
3. Clique sur **Deploy**, puis reviens à l'étape 1.4 avec l'adresse obtenue.

### 3. Upstash Redis (classement et anti-spam)

Le plus simple : dans le projet Vercel, onglet **Storage → Create Database → Upstash for Redis** (plan Free), et relie-le au projet. Vercel ajoute tout seul `KV_REST_API_URL` et `KV_REST_API_TOKEN`, que le code reconnaît. Redéploie ensuite.

Sans Redis, le jeu fonctionne quand même : le classement est lu dans Postgres et la limitation de débit est désactivée.

## Développement local

```bash
npm install
cp .env.example .env.local   # puis renseigne les clés Supabase
npm run dev                  # http://localhost:3000
npm test                     # tests du moteur de jeu
npm run lint && npm run typecheck
```
