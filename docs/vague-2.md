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

## Vague 2 : ce qui est livré

Tout est dans `src/lib/game/s2/convoys.ts` (règles pures, testées dans `convoys.test.ts`), branché dans `advance` (engine.ts) et dans le serveur.

| Fonction | Où |
|---|---|
| Combat de route : l'escorte gagne avec Pa² / (Pa² + Pb²), P = `effectivePower` (battle.ts) ; le perdant subit les pertes du moteur, le vainqueur la moitié | `fightChance`, `routeFight` |
| Escortes : une compagnie par route, ses hommes quittent le château (comptés par `menOf`, gardés par `allocation`) | `setEscort`, `releaseEscort`, action `{ type: "s2", op: "escort" }` |
| Patrouilles : zones traversées (Bresenham), une attaque au plus par zone, chance selon le rang et l'hostilité, plafond 60 % | `convoyRisk`, appelé par `settleS2` à l'arrivée de chaque convoi (`ctx.risk`) |
| Règle du tiers (le quart après « Le grand bourdon ») | `lossCap`, champ `Convoy.lost` |
| Brigands : l'escorte défend comme contre une patrouille de hobereau | `banditGuard` (`ctx.guard`) |
| Hostilité, décroissance de 10 par jour, niveaux, propagation d'un ennemi juré | `addHostility`, `hostilityAt`, `S2State.host` |
| Sauf-conduits (l'or va au fief) | `buySafe`, action `op: "safe"`, `giveToFief` (server.ts) |
| Rancune et expéditions des seigneurs hostiles | `afterLordAttack`, `S2State.grudge`, `S2State.expAt` |
| Vassalité 24 h, tribut d'un quart en convois, passage libre pour le suzerain et son alliance | `LordS2State.vassal`, `S2State.vassals`, `vassalConvoys` (`ctx.extra`), `setVassals` |
| Pillage de concession (25 % du stock, 15 % de la réserve, plafond du tiers, 6 h, protection 48 h) | action `pillage`, `settlePillage` (server.ts), `pillageLoot`, `pillageBlocker` |
| Contrats du jour (escorte, interception, camp de bandits) | `contractsFor`, action `contract`, `settleContract` (server.ts) |
| Renom : pillage (1, 4 par jour), vassal (3), contrat (3) | `RENOWN` (lineage.ts) |

Réglages après les essais en jeu : sur la route, le perdant se replie à la moitié de ses hommes (`ROUTE_LOSS_MAX`) ; une rancune attend la fin de la vassalité ; la récompense d'un contrat dépend du rang et du type (`CONTRACT_RANK_PAY`, `CONTRACT_KIND_PAY`), et le serveur refuse un départ sous 5 % de chance (`CONTRACT_MIN_CHANCE`).

Comptes de test gardés (saison d'essais) : `essai_claude_a` et `essai_claude_b`, identifiants sur le serveur dans `~/essais-claude/comptes.json`.

Les rapports de route vont dans `S2State.log` (catégorie « combats »), regroupés par heure pour les patrouilles (`pushLog` avec une clé).

## Vague 2, fin : ce qui est livré (19 novembre)

| Chantier | Où |
|---|---|
| Interception (S8) : point d'embuscade, combat contre l'escorte, tiers de la charge, Désert +10 %, renom `intercept` (2, 10 par jour) | `s2/players.ts` (`interceptPoint`, `interceptTake`, `hitConvoy`), action `intercept`, marche `kind: "intercept"`, `settleIntercept` (server.ts) |
| Embuscade posée sur une case : 4 h, convois ennemis à une case, une attaque de joueur par convoi ; registre `setAmbushes` (rempli dans `syncRoutes` depuis les marches `kind: "ambush"`), résultats notés chez la victime (`S2State.ambushed`) et relevés par `settleAmbush` quand elle se lève | `convoyRisk` (convoys.ts), action `ambush`, `marchDue` |
| Bonus des forteresses : Nord +10 % de production, Est convois +15 % de vitesse, Sud escortes +15 % de dégâts, Ouest patrouilles −25 % | `S2_FORTRESSES`, `FORT_*` (config.ts), `PlayerState.fortsHeld` (fixé dans `loadEntities`) |
| Sabotage : 1 h × REF / 4 en or, 60 % (+10 % Forêt, moins la vigilance de la cible), 15 % détruits, 15 min de retard | `sabotaged`, action `convoy_sabotage` (server.ts) |
| Vision des convois : 5 cases autour du château et des concessions, +4 avec « La tour de guet » ; mes convois et ceux de l'alliance toujours | `visionRange`, `watchPoints`, filtre dans `s2WorldView` |
| Routes commerciales : proposées des deux côtés (`S2State.trade`), ou vers une forteresse de l'alliance (`fort:<n>`) ; un convoi par heure (`dest: "commerce"`) | `setTradeOffer`, `activeTrades` (registre `setTrades`, rempli dans `syncRoutes`), `tradeConvoys` (`ctx.extra`) |
| Camps de bandits : trois à la fois, près d'une route active, 15 % d'attaque à une case, 1 h × REF en fer, réapparition 6 h plus tard | `Camp`, `campSpot`, `campSide` (convoys.ts) ; stockés dans `season_maps.world` (`ensureCamps`, `destroyCamp`), action `camp`, `settleCamp` |
| Expéditions qui vident la garnison | `S2State.sent` (écrit par `convoyRisk`), registre `setLordAway` (lords.ts), lu par `garrison` et la vue des seigneurs |
| Quatre forteresses | Table `fortresses` avec `idx` (0 à 3), fonction SQL `apply_fortress_at`, `fortressCount/Pos/Name/Key/Idx` (config.ts), `Conflicts.forts`, actions `fortress_*` avec `fort` |
| Rivalités (C) | `rivalOf` (paires voisines, 8 cases), dans `addHostility` ; `S2State.rivalDrop` |
| Mercenaires (C) | `s2/mercs.ts`, op `merc`, `S2State.mercs`, `escortSide` (engine.ts) qui mêle escorte et mercenaires |
| Chute (C) | `afterVassal` (lords.ts), `LordS2State.byAlliance/annexed/halved`, registre `setAnnexed`, `annexConvoys`, passage libre dans `freePass` |

La migration `20261119100000_wave2_world.sql` ajoute `season_maps.world` et `world_version`, la colonne `fortresses.idx` (clé primaire `(season_id, idx)`) et la fonction `apply_fortress_at`. Elle ne supprime rien.

Écarts avec la spécification : les mercenaires servent d'escorte de concession (ils ne partent pas en attaque) ; une expédition ne se voit pas sur la carte, seule la garnison réduite du seigneur se voit.

## Ce qui reste à faire

| Chantier | Où le brancher |
|---|---|
| Tours de site, nœuds de Lignée du commerce (vague C) | `S2State`, `lineage.ts` |
| Expéditions visibles sur la carte | `S2State.sent` contient déjà leur départ et leur retour |

## Régions

Froid donne +10 % de PV au combat (`regionBoost`, engine.ts). Désert donne +10 % de butin sur les convois interceptés (`DESERT_LOOT_BONUS`, economy.ts), comme le prévoit la spécification. Leurs textes sont dans `REGIONS` (s2/map.ts).

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
