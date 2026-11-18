# Vague 2 de la saison 2 : où brancher quoi

Ce document sert de point de départ pour intégrer la vague 2. Depuis le nettoyage de novembre 2026, le jeu ne connaît plus que la saison 2. Le code de la saison 1 a été retiré : on le retrouve au commit `e7cd1b0`, avec `git show e7cd1b0:chemin/du/fichier`.

## Comment la saison 2 est découpée

| Module | Rôle | Partagé navigateur / serveur |
|---|---|---|
| `src/lib/game/s2/map.ts` | Génération de la carte (sites, seigneurs, régions), `castleBlocker`, `regionAt`, `REGIONS` | oui |
| `src/lib/game/s2/economy.ts` | État `S2State`, concessions, convois, bâtiments d'appui, brigands, marché ; `settleS2` fait avancer le temps | oui |
| `src/lib/game/s2/lords.ts` | Fiefs et garnisons des seigneurs (`settleFief`, `garrison`, `fiefLoot`, `afterDefeat`) | oui |
| `src/lib/game/s2/apply.ts` | Actions du joueur `{ type: "s2", op }` (`applyS2Action`) | oui |
| `src/lib/game/s2/rules.ts` | Carte de la saison active (`s2Map`, `setS2Map`) et `s2Enabled` | oui |
| `src/lib/game/s2/fixture.ts` | Pour les tests : `useS2()`, `s2Player(now)` | tests |
| `src/lib/game/companies.ts`, `company-ops.ts` | Compagnies, caserne, recrutement payé en fer | oui |
| `src/lib/game/engine.ts` | `advance` (appelle `settleS2`), production, recherche, espionnage, `regionBoost` | oui |
| `src/lib/game/server.ts` | Seule autorité : charge et écrit les états, résout les marches, les événements et les seigneurs | serveur |
| `src/components/s2-map.tsx` | Carte et panneaux de la saison 2 | navigateur |
| `src/components/game.tsx` | Le reste de l'interface | navigateur |

La règle de base reste la même : toute règle de jeu est une fonction pure dans `src/lib/game/` (testée avec vitest), que le navigateur appelle pour l'aperçu immédiat et que le serveur rejoue pour faire foi. Les blocages (`…Blocker`) renvoient un texte en français ou `null`, et l'interface les affiche tels quels sur les boutons.

## Les points d'entrée

1. **Avancer le temps.** `settleS2(s, ctx, now)` découpe le temps aux instants où quelque chose change (chantiers, lancement, `ctx.breakpoints`), fait monter les stocks, part les convois et passe les brigands. Une règle qui dépend du temps (escorte qui expire, protection qui tombe) ajoute son instant de fin dans `cuts`.
2. **Arrivée d'un convoi.** C'est la boucle « Arrivées » en fin de `settleS2`. Un convoi y arrive au château, au beffroi ou dans la réserve d'une concession. C'est là qu'on branche tout ce qui touche un convoi arrivé (bonus, rapport). Ce qui touche un convoi en route se branche sur `dispatch`, la création du convoi.
3. **Actions du joueur.** On ajoute un `op` au type `{ type: "s2" }` de `types.ts`, puis un `case` dans `applyS2Action`. Le journal `s2_<op>` qu'il renvoie alimente la chronique et les quêtes du jour (fonction SQL `daily_counts`).
4. **Ce que le serveur sait des autres.** `S2Others` (places prises, châteaux) est construit dans `server.ts`, juste avant l'appel à `applyS2Action`. Une règle qui a besoin des autres joueurs (convois voisins, alliances) y ajoute un champ, rempli au même endroit.
5. **Combat contre un seigneur.** Le départ se fait par l'action `raid` dans `server.ts` (marche de type `raid`). La résolution est dans le bloc qui appelle `settleFief`, puis `fiefLoot` et `afterDefeat`. Le combat lui-même passe par `battle()` avec `playerAttackOpts`. `regionBoost` y applique déjà la région froid aux PV.
6. **Garde-fous serveur.** `company-ops.ts` et `startResearch` refusent ce qui n'a pas de sens en saison 2 (fortifications). Une règle de la vague 2 qui doit être refusée côté serveur s'ajoute là, ou dans le blocage correspondant.

## Chantiers de la vague 2 et où les poser

| Chantier | Où le brancher |
|---|---|
| Escortes de convoi | Champ sur `Convoy` (economy.ts), réglage dans `setConcession`, effet dans `dispatch` et à l'arrivée |
| Patrouilles des seigneurs | `patrolUnit` existe déjà (lords.ts) ; la rencontre se calcule au départ du convoi, avec la distance au fief |
| Règle des tiers | Une fonction pure qui plafonne le butin à un tiers, appelée par les raids de concession et par `fiefLoot` |
| Protection des débutants | Un instant `protectedUntil` dans `S2State` (posé dans `applyS2Action` au `place`), lu par tous les blocages d'attaque |
| Rapports de convoi | `log(st, at, text)` dans `settleS2` alimente déjà la boîte de réception (`S2State.log`) |
| Hostilité et sauf-conduits | Un nouvel état partagé côté serveur (table ou JSON d'alliance), passé dans `S2Others` |
| Vassalité | Lien joueur → seigneur dans `LordS2State` ; le tribut se verse dans `settleFief` |
| Interception (S8) | Une marche dont la cible est un convoi : nouvelle `March.kind`, résolue dans la boucle des marches du serveur |
| Contrats | Une action `s2` plus une liste dans `S2State`, réglée à l'arrivée du convoi |
| Bandits | Le système des brigands (`BANDIT_*` dans economy.ts) est la base : chance, part volée et passage horaire |
| Raids de concession | 25 % du stock et 15 % de la réserve, plafonnés au tiers ; défense +10 % en région froid (`regionBoost` côté défenseur) |
| Deux forteresses de plus | La forteresse est une ligne de la table `fortresses` et une position (`FORTRESS_POS`). Il faudra passer à une liste de positions et de lignes |

## Régions : bonus provisoires

Les régions froid et désert ont reçu un bonus simple, en attendant la vague 2. Froid donne +10 % de PV au combat (`regionBoost`, engine.ts). Désert donne +10 % d'or par convoi arrivé (`DESERT_GOLD_BONUS`, economy.ts). Leurs textes sont dans `REGIONS` (s2/map.ts).

## Restes de la saison 1 encore en place

Ces morceaux ne servent plus en jeu, mais ils touchent la base de données ou des fonctions partagées. Ils ont été laissés pour ne rien casser :

- `generators` dans `PlayerState` et dans la table `player_states`, et la destruction de bâtiments dans `resolveRaid` (engine.ts).
- `curfew` et `inCurfew` : vérifiés dans les blocages, mais plus réglables.
- Des champs S1 encore lus ou écrits dans le JSON `military` (`veinAt`, `quest`, `questFlags`, `merchantEvent`, `ruinImmuneUntil`…).
- `setS2Geometry` : la bascule entre la carte S1 (15 × 15) et la carte S2 (41 × 41) existe toujours dans config.ts, toujours activée.
- `total_plundered` dans `player_states` : plus affiché depuis le remplacement du classement des pillards.
- Les catégories du Panthéon `plunderer` et `defender` restent dans `HALL_ARCHIVE` pour afficher les podiums des saisons passées.

## Vérifier avant de pousser

```sh
npx tsc --noEmit -p .
npx eslint src
npx vitest run
npx next build
```
