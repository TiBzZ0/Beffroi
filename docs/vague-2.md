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

Les rapports de route vont dans `S2State.log` (catégorie « combats »), regroupés par heure pour les patrouilles (`pushLog` avec une clé).

## Ce qui reste à faire

| Chantier | Où le brancher |
|---|---|
| Interception et sabotage des convois des joueurs (S8) | Les convois des autres sont dans `S2WorldView.convoys` ; une marche `kind: "intercept"` réglée comme `settlePillage`, avec `Convoy.lost` pour la règle du tiers |
| Routes commerciales | Un convoi sans charge entre deux châteaux, payé à l'arrivée dans `settleS2` |
| Camps de bandits sur la carte | Les contrats les simulent ; un vrai camp serait une entité de la carte avec sa garnison |
| Expéditions qui vident la garnison du seigneur | Aujourd'hui l'expédition se règle sans toucher au fief ; il faudrait enregistrer son départ dans `LordS2State` |
| Vision des convois (« La tour de guet ») | Filtrer `S2WorldView.convoys` selon la distance aux sites du joueur |
| Trois forteresses de plus | La forteresse est une ligne de la table `fortresses` et une position (`FORTRESS_POS`) : passer à une liste |
| Rivalités, mercenaires, chute des seigneurs (vague C) | `LordS2State` et `contractsFor` |

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
