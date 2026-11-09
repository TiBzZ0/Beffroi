// Moteur idle de Beffroi : fonctions pures, sans accès réseau ni base.
// Le serveur s'en sert pour calculer l'état qui fait foi ; le navigateur pour animer le compteur.

import {
  BURN_CLICK_REDUCTION_MS,
  BURN_MS,
  BURN_PRODUCTION_FACTOR,
  CLICK_PAUSE_MS,
  CLICK_RATE_MIN_WINDOW_MS,
  CLICK_STRIKES_FOR_PAUSE,
  CLICK_WINDOW_MAX_MS,
  SUSPICIOUS_CLICK_RATE,
  COST_GROWTH,
  GENERATORS,
  MAX_CLICKS_PER_SECOND,
  OFFLINE_CAP_MS,
  PROTECTED_PER_TYPE,
  DEFENSE_IDS,
  UNIT_IDS,
  DEFENSE_REPAIR_RATE,
  DEFENSES,
  GUARDS_PER_DOMAIN,
  RAID_COOLDOWN_MS,
  RAID_DESTROY_RATE,
  RAID_LOOT_RATE,
  REVENGE_ATTACK_BONUS,
  REVENGE_LOOT_RATE,
  REVENGE_MS,
  RUIN_REBUILD_FACTOR,
  SECURED_SECONDS,
  SPY_COST_SECONDS,
  SPY_DETECT_BASE,
  SPY_DETECT_MAX,
  SPY_DETECT_PER_TOWER,
  SPY_MIN_COST,
  MIN_EXPOSED_SHARE,
  SHIELD_MS,
  FORTRESS_PRODUCTION_BONUS,
  LORD_SHIELD_MS,
  STAGES,
  UNITS,
  UPGRADE_BY_ID,
  type CombatantId,
  type DefenseId,
  type GeneratorId,
  type UnitId,
  type UpgradeDef,
} from "./config";
import { armySize, armyValue, battle, cleanArmy, type Army } from "./battle";

export interface PlayerState {
  stone: number;
  generators: Partial<Record<GeneratorId, number>>;
  upgrades: string[];
  totalProduced: number;
  totalContributed: number;
  totalClicks: number;
  /** Horodatage (ms) de la dernière mise à jour de la pierre. */
  lastUpdate: number;
  /** Horodatage (ms) du dernier lot de clics accepté. */
  lastClickAt: number;
  /** Bâtiments détruits par un raid, en attente de reconstruction. */
  ruins: Partial<Record<GeneratorId, number>>;
  /** Ateliers incendiés (production réduite) jusqu'à cet horodatage. */
  burnedUntil: number;
  /** Protégé des raids jusqu'à cet horodatage. */
  shieldUntil: number;
  lastRaidAt: number;
  lastRaidTarget: string | null;
  /** Seigneur ou joueur contre qui une revanche est possible, et jusqu'à quand. */
  revengeTarget: string | null;
  revengeUntil: number;
  totalPlundered: number;
  troops: Partial<Record<UnitId, number>>;
  defenses: Partial<Record<DefenseId, number>>;
  /** Anti-triche : envois trop rapides d'affilée, et fin de la pause forcée du marteau. */
  clickStrikes: number;
  clickPausedUntil: number;
  /** Troupes d'alliés postées ici : elles défendent et attaquent avec ce joueur. */
  stationed: Record<string, Partial<Record<UnitId, number>>>;
  /** Son alliance tient la forteresse (bonus de production). Fixé par le serveur, jamais enregistré. */
  fortress?: boolean;
}

/** Ce que le joueur doit savoir du monde pour calculer sa production. */
export interface WorldState {
  /** Horodatages (ms) de fin de chaque étape du chantier, dans l'ordre. */
  stageCompletedAt: number[];
  /** Bonus d'héritage (ex. 0.05 = +5 %). Toujours 0 en saison 0. */
  legacyBonus?: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function newPlayerState(now: number): PlayerState {
  return {
    stone: 0,
    generators: {},
    upgrades: [],
    totalProduced: 0,
    totalContributed: 0,
    totalClicks: 0,
    lastUpdate: now,
    lastClickAt: now,
    ruins: {},
    burnedUntil: 0,
    shieldUntil: 0,
    lastRaidAt: 0,
    lastRaidTarget: null,
    revengeTarget: null,
    revengeUntil: 0,
    totalPlundered: 0,
    troops: {},
    defenses: {},
    clickStrikes: 0,
    clickPausedUntil: 0,
    stationed: {},
  };
}

export function ruinsOf(state: PlayerState, id: GeneratorId): number {
  return state.ruins[id] ?? 0;
}

export function owned(state: PlayerState, id: GeneratorId): number {
  return state.generators[id] ?? 0;
}

export function stagesDoneAt(world: WorldState, t: number): number {
  return world.stageCompletedAt.filter((at) => at <= t).length;
}

function stageMultiplier(stagesDone: number, key: "production" | "click"): number {
  let m = 1;
  for (let i = 0; i < Math.min(stagesDone, STAGES.length); i++) {
    m *= STAGES[i].bonus[key] ?? 1;
  }
  return m;
}

function ownedUpgrades(state: PlayerState): UpgradeDef[] {
  return state.upgrades.map((id) => UPGRADE_BY_ID.get(id)).filter((u): u is UpgradeDef => !!u);
}

export function generatorRate(state: PlayerState, id: GeneratorId): number {
  const def = GENERATORS.find((g) => g.id === id)!;
  let rate = def.baseRate;
  for (const u of ownedUpgrades(state)) {
    if (u.effect.kind === "generator" && u.effect.generator === id) rate *= u.effect.multiplier;
  }
  return rate;
}

/** Multiplicateur global de production (améliorations, chantier, héritage). */
export function productionMultiplier(state: PlayerState, world: WorldState, stagesDone: number): number {
  let m = (1 + (world.legacyBonus ?? 0)) * (state.fortress ? FORTRESS_PRODUCTION_BONUS : 1);
  for (const u of ownedUpgrades(state)) {
    if (u.effect.kind === "production") m *= u.effect.multiplier;
  }
  return m * stageMultiplier(stagesDone, "production");
}

/** Production de pierre par seconde pour un nombre d'étapes terminées donné. */
export function productionPerSecond(state: PlayerState, world: WorldState, stagesDone: number): number {
  let base = 0;
  for (const g of GENERATORS) {
    const n = owned(state, g.id);
    if (n > 0) base += n * generatorRate(state, g.id);
  }
  return base * productionMultiplier(state, world, stagesDone);
}

/** Pierre rapportée par un coup de marteau. */
export function clickValue(state: PlayerState, world: WorldState, stagesDone: number): number {
  let value = 1;
  let fromProduction = 0;
  for (const u of ownedUpgrades(state)) {
    if (u.effect.kind === "click") value *= u.effect.multiplier;
    if (u.effect.kind === "clickFromProduction") fromProduction += u.effect.fraction;
  }
  value *= stageMultiplier(stagesDone, "click");
  return value + fromProduction * productionPerSecond(state, world, stagesDone);
}

export interface AdvanceOptions {
  /** Production de base fixe (seigneurs voisins), à la place des bâtiments. */
  flatRate?: number;
}

/** Production réelle à l'instant t (incendie compris). */
export function rateAt(state: PlayerState, world: WorldState, t: number, opts: AdvanceOptions = {}): number {
  const base = opts.flatRate ?? productionPerSecond(state, world, stagesDoneAt(world, t));
  return t < state.burnedUntil ? base * BURN_PRODUCTION_FACTOR : base;
}

/**
 * Calcul paresseux : fait avancer l'état jusqu'à `now`.
 * Le temps hors ligne est plafonné, et le calcul est découpé en segments à chaque
 * événement survenu pendant l'absence (étape du chantier terminée, fin d'incendie).
 */
export function advance(state: PlayerState, now: number, world: WorldState, opts: AdvanceOptions = {}): PlayerState {
  if (now <= state.lastUpdate) return state;
  const start = Math.max(state.lastUpdate, now - OFFLINE_CAP_MS);
  const events = [...world.stageCompletedAt, state.burnedUntil];
  const breakpoints = events.filter((t) => t > start && t < now).sort((a, b) => a - b);
  let gain = 0;
  let cursor = start;
  for (const t of [...breakpoints, now]) {
    gain += (rateAt(state, world, cursor, opts) * (t - cursor)) / 1000;
    cursor = t;
  }
  return { ...state, stone: state.stone + gain, totalProduced: state.totalProduced + gain, lastUpdate: now };
}

/** Prix de `qty` bâtiments supplémentaires (série géométrique). */
export function generatorCost(state: PlayerState, id: GeneratorId, qty = 1): number {
  const def = GENERATORS.find((g) => g.id === id)!;
  // Les ruines comptent : se faire détruire un bâtiment ne rend pas le suivant moins cher.
  const n = owned(state, id) + ruinsOf(state, id);
  return Math.ceil((def.baseCost * Math.pow(COST_GROWTH, n) * (Math.pow(COST_GROWTH, qty) - 1)) / (COST_GROWTH - 1));
}

/** Nombre maximal de bâtiments achetables avec la pierre disponible. */
export function maxAffordable(state: PlayerState, id: GeneratorId): number {
  const def = GENERATORS.find((g) => g.id === id)!;
  const n = owned(state, id) + ruinsOf(state, id);
  const first = def.baseCost * Math.pow(COST_GROWTH, n);
  if (state.stone < first) return 0;
  let qty = Math.floor(Math.log((state.stone * (COST_GROWTH - 1)) / first + 1) / Math.log(COST_GROWTH));
  while (qty > 0 && generatorCost(state, id, qty) > state.stone) qty--;
  return qty;
}

export function buyGenerator(state: PlayerState, id: GeneratorId, qty: number): Result<PlayerState> {
  if (!GENERATORS.some((g) => g.id === id)) return { ok: false, error: "Bâtiment inconnu." };
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) return { ok: false, error: "Quantité invalide." };
  const cost = generatorCost(state, id, qty);
  if (cost > state.stone) return { ok: false, error: "Pas assez de pierre." };
  return {
    ok: true,
    value: { ...state, stone: state.stone - cost, generators: { ...state.generators, [id]: owned(state, id) + qty } },
  };
}

export function upgradeUnlocked(state: PlayerState, u: UpgradeDef): boolean {
  return !u.requires || owned(state, u.requires.generator) >= u.requires.count;
}

export function buyUpgrade(state: PlayerState, id: string): Result<PlayerState> {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return { ok: false, error: "Amélioration inconnue." };
  if (state.upgrades.includes(id)) return { ok: false, error: "Déjà achetée." };
  if (!upgradeUnlocked(state, u)) return { ok: false, error: "Pas encore débloquée." };
  if (u.cost > state.stone) return { ok: false, error: "Pas assez de pierre." };
  return { ok: true, value: { ...state, stone: state.stone - u.cost, upgrades: [...state.upgrades, id] } };
}

/**
 * Applique un lot de clics. Le serveur accepte au plus MAX_CLICKS_PER_SECOND clics
 * par seconde écoulée depuis le dernier lot (fenêtre plafonnée) et ignore l'excédent.
 */
export function applyClicks(
  state: PlayerState,
  count: number,
  now: number,
  world: WorldState,
): { state: PlayerState; accepted: number; paused: boolean } {
  const requested = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (now < state.clickPausedUntil) return { state: { ...state, lastClickAt: now }, accepted: 0, paused: true };
  const windowMs = Math.min(Math.max(0, now - state.lastClickAt), CLICK_WINDOW_MAX_MS);

  // Cadence surhumaine soutenue : avertissements, puis marteau confisqué.
  let strikes = state.clickStrikes;
  if (requested > 0 && windowMs >= 1000) {
    strikes = requested / (Math.max(windowMs, CLICK_RATE_MIN_WINDOW_MS) / 1000) > SUSPICIOUS_CLICK_RATE ? strikes + 1 : Math.max(0, strikes - 1);
  }
  if (strikes >= CLICK_STRIKES_FOR_PAUSE) {
    return { state: { ...state, clickStrikes: 0, clickPausedUntil: now + CLICK_PAUSE_MS, lastClickAt: now }, accepted: 0, paused: true };
  }

  const allowed = Math.floor((MAX_CLICKS_PER_SECOND * windowMs) / 1000);
  const accepted = Math.min(requested, allowed);
  if (accepted === 0) return { state: { ...state, clickStrikes: strikes }, accepted, paused: false };
  const gain = accepted * clickValue(state, world, stagesDoneAt(world, now));
  return {
    paused: false,
    state: {
      ...state,
      clickStrikes: strikes,
      stone: state.stone + gain,
      totalProduced: state.totalProduced + gain,
      totalClicks: state.totalClicks + accepted,
      lastClickAt: now,
      // Frapper la pierre aide à éteindre l'incendie des ateliers.
      burnedUntil: state.burnedUntil > now ? Math.max(now, state.burnedUntil - accepted * BURN_CLICK_REDUCTION_MS) : state.burnedUntil,
    },
    accepted,
  };
}

/** Verse de la pierre dans le chantier commun. */
export function contribute(state: PlayerState, amount: number): Result<PlayerState> {
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, error: "Montant invalide." };
  const given = Math.floor(Math.min(amount, state.stone));
  if (given < 1) return { ok: false, error: "Pas assez de pierre." };
  return {
    ok: true,
    value: { ...state, stone: state.stone - given, totalContributed: state.totalContributed + given },
  };
}

/** Taille de l'étape en cours, selon le nombre de joueurs actifs. */
export function stageTarget(stage: number, activePlayers: number): number {
  const def = STAGES[Math.min(stage, STAGES.length - 1)];
  return def.basePerPlayer * Math.max(1, activePlayers);
}

// ---------------------------------------------------------------------------
// Ruines et raids
// ---------------------------------------------------------------------------

/** Prix de reconstruction d'une ruine : moitié du prix d'un bâtiment au niveau actuel. */
export function ruinCost(state: PlayerState, id: GeneratorId): number {
  const def = GENERATORS.find((g) => g.id === id)!;
  return Math.ceil(def.baseCost * Math.pow(COST_GROWTH, owned(state, id)) * RUIN_REBUILD_FACTOR);
}

export function rebuildRuin(state: PlayerState, id: GeneratorId): Result<PlayerState> {
  if (!GENERATORS.some((g) => g.id === id)) return { ok: false, error: "Bâtiment inconnu." };
  if (ruinsOf(state, id) < 1) return { ok: false, error: "Aucune ruine à rebâtir." };
  const cost = ruinCost(state, id);
  if (cost > state.stone) return { ok: false, error: "Pas assez de pierre." };
  return {
    ok: true,
    value: {
      ...state,
      stone: state.stone - cost,
      generators: { ...state.generators, [id]: owned(state, id) + 1 },
      ruins: { ...state.ruins, [id]: ruinsOf(state, id) - 1 },
    },
  };
}

// ---------------------------------------------------------------------------
// Troupes et défenses
// ---------------------------------------------------------------------------

export function unitCount(state: PlayerState, id: UnitId): number {
  return state.troops[id] ?? 0;
}

export function defenseCount(state: PlayerState, id: DefenseId): number {
  return state.defenses[id] ?? 0;
}

/** Troupes présentes : les siennes plus les renforts d'alliés. */
export function troopsHere(state: PlayerState): Army {
  const out: Army = { ...state.troops };
  for (const group of Object.values(state.stationed ?? {})) {
    for (const [id, n] of Object.entries(group) as [UnitId, number][]) out[id] = (out[id] ?? 0) + n;
  }
  return cleanArmy(out);
}

/** Armée qui part en raid : toutes les troupes présentes, renforts compris. */
export function attackArmy(state: PlayerState): Army {
  return troopsHere(state);
}

/** Armée qui défend le domaine : troupes (renforts compris), fortifications et gardes du château. */
export function defenseArmy(state: PlayerState): Army {
  return cleanArmy({ ...troopsHere(state), ...state.defenses, garde: GUARDS_PER_DOMAIN });
}

/**
 * Répartit des pertes de troupes entre le joueur et ses renforts, au prorata de ce que chacun
 * a engagé (le reste des arrondis tombe sur les plus gros contingents).
 */
export function splitTroopLosses(state: PlayerState, lost: Army): { troops: PlayerState["troops"]; stationed: PlayerState["stationed"]; byOwner: Record<string, Army> } {
  const troops = { ...state.troops };
  const stationed: PlayerState["stationed"] = Object.fromEntries(Object.entries(state.stationed ?? {}).map(([o, g]) => [o, { ...g }]));
  const byOwner: Record<string, Army> = {};
  for (const id of UNIT_IDS) {
    const loss = lost[id] ?? 0;
    if (loss <= 0) continue;
    const holders: { key: string; n: number }[] = [{ key: "", n: troops[id] ?? 0 }, ...Object.entries(stationed).map(([o, g]) => ({ key: o, n: g[id] ?? 0 }))].filter((h) => h.n > 0);
    const total = holders.reduce((s, h) => s + h.n, 0);
    const take = Math.min(loss, total);
    const shares = holders.map((h) => ({ ...h, l: Math.floor((take * h.n) / total) }));
    let rest = take - shares.reduce((s, h) => s + h.l, 0);
    for (const h of [...shares].sort((a, b) => b.n - b.l - (a.n - a.l))) {
      if (rest <= 0) break;
      if (h.l < h.n) {
        h.l++;
        rest--;
      }
    }
    for (const h of shares) {
      if (h.l <= 0) continue;
      const left = h.n - h.l;
      const target = h.key === "" ? troops : stationed[h.key];
      if (left > 0) target[id] = left;
      else delete target[id];
      (byOwner[h.key] ??= {})[id] = h.l;
    }
  }
  for (const [o, g] of Object.entries(stationed)) if (Object.keys(g).length === 0) delete stationed[o];
  return { troops, stationed, byOwner };
}

/**
 * Partage du butin d'un raid groupé : chaque allié reçoit une part proportionnelle à la valeur
 * des troupes qu'il a engagées (avant la bataille). Renvoie les parts des alliés uniquement.
 */
export function lootShares(attacker: PlayerState, stolen: number): Record<string, number> {
  const worth = (troops: Partial<Record<UnitId, number>>) => armyValue(cleanArmy({ ...troops }));
  const own = worth(attacker.troops);
  const groups = Object.entries(attacker.stationed ?? {}).map(([owner, troops]) => [owner, worth(troops)] as const);
  const total = own + groups.reduce((s, [, v]) => s + v, 0);
  const shares: Record<string, number> = {};
  if (total <= 0 || stolen <= 0) return shares;
  for (const [owner, v] of groups) {
    const part = Math.floor((stolen * v) / total);
    if (part > 0) shares[owner] = part;
  }
  return shares;
}

/** Envoie des troupes chez un allié. */
export function sendReinforcements(sender: PlayerState, host: PlayerState, senderId: string, unit: string, qty: number): Result<{ sender: PlayerState; host: PlayerState }> {
  if (!(UNIT_IDS as string[]).includes(unit)) return { ok: false, error: "Troupe inconnue." };
  const id = unit as UnitId;
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, error: "Quantité invalide." };
  const have = sender.troops[id] ?? 0;
  if (qty > have) return { ok: false, error: "Tu n'as pas assez de ces troupes chez toi." };
  const troops = { ...sender.troops };
  if (have - qty > 0) troops[id] = have - qty;
  else delete troops[id];
  const group = { ...(host.stationed?.[senderId] ?? {}) };
  group[id] = (group[id] ?? 0) + qty;
  return { ok: true, value: { sender: { ...sender, troops }, host: { ...host, stationed: { ...host.stationed, [senderId]: group } } } };
}

/** Rappelle toutes ses troupes postées chez un allié. */
export function recallReinforcements(owner: PlayerState, host: PlayerState, ownerId: string): Result<{ owner: PlayerState; host: PlayerState }> {
  const group = host.stationed?.[ownerId];
  if (!group || Object.keys(group).length === 0) return { ok: false, error: "Tu n'as pas de troupes là-bas." };
  const troops = { ...owner.troops };
  for (const [id, n] of Object.entries(group) as [UnitId, number][]) troops[id] = (troops[id] ?? 0) + n;
  const stationed = { ...host.stationed };
  delete stationed[ownerId];
  return { ok: true, value: { owner: { ...owner, troops }, host: { ...host, stationed } } };
}

/** Valeur en pierre des troupes et fortifications d'un joueur. */
export function armyWorth(state: PlayerState): number {
  return armyValue(cleanArmy({ ...state.troops, ...state.defenses }));
}

export function buyArmy(state: PlayerState, kind: "unit" | "defense", id: string, qty: number): Result<PlayerState> {
  const def = kind === "unit" ? UNITS.find((u) => u.id === id) : DEFENSES.find((d) => d.id === id);
  if (!def) return { ok: false, error: kind === "unit" ? "Troupe inconnue." : "Fortification inconnue." };
  if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) return { ok: false, error: "Quantité invalide." };
  const cost = def.cost * qty;
  if (cost > state.stone) return { ok: false, error: "Pas assez de pierre." };
  const key = kind === "unit" ? "troops" : "defenses";
  const current = (state[key] as Record<string, number>)[id] ?? 0;
  return { ok: true, value: { ...state, stone: state.stone - cost, [key]: { ...state[key], [id]: current + qty } } };
}

// ---------------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------------

/**
 * Pierre qu'un raid réussi emporterait : 10 % (20 % en revanche) de la part exposée du stock.
 * La dernière demi-heure de production est à l'abri, mais jamais plus de la moitié du stock.
 */
export function lootOf(stone: number, rate: number, revenge: boolean): number {
  const secured = Math.min(rate * SECURED_SECONDS, stone * (1 - MIN_EXPOSED_SHARE));
  return Math.floor(Math.max(0, stone - secured) * (revenge ? REVENGE_LOOT_RATE : RAID_LOOT_RATE));
}

export function hasRevenge(attacker: PlayerState, victimId: string, now: number): boolean {
  return attacker.revengeTarget === victimId && attacker.revengeUntil > now;
}

export interface RaidContext {
  now: number;
  attackerId: string;
  victimId: string;
  /** Production actuelle de la victime (pour son stock sécurisé). */
  victimRate: number;
  /** Les seigneurs n'achètent pas de troupes : on fournit leur armée (jamais entamée). */
  attackerIsLord?: boolean;
  /** Riposte d'un seigneur : il peut frapper deux fois de suite la même cible. */
  allowRepeat?: boolean;
  /** Attaquant et cible sont dans la même alliance. */
  allied?: boolean;
  /** Leurs alliances sont en guerre : ni bouclier, ni pause, ni limite de cible. */
  atWar?: boolean;
  attackerArmy?: Army;
  defenderArmy?: Army;
  /** Tirages aléatoires entre 0 et 1 (fournis pour des tests reproductibles). */
  rng: () => number;
}

export interface RaidReport {
  success: boolean;
  rounds: number;
  stolen: number;
  /** Part du butin versée à chaque allié dont les renforts ont participé (le reste revient à l'attaquant). */
  allyShares: Record<string, number>;
  destroyed: Partial<Record<GeneratorId, number>>;
  /** Pertes de l'attaquant. */
  attackerLost: Army;
  /** Pertes définitives du défenseur (après réparation des fortifications). */
  defenderLost: Army;
  revenge: boolean;
}

export function raidArmies(attacker: PlayerState, victim: PlayerState, ctx: Pick<RaidContext, "attackerArmy" | "defenderArmy" | "victimId" | "now">) {
  return {
    attack: ctx.attackerArmy ?? attackArmy(attacker),
    defense: ctx.defenderArmy ?? defenseArmy(victim),
    attackBonus: hasRevenge(attacker, ctx.victimId, ctx.now) ? REVENGE_ATTACK_BONUS : 1,
  };
}

/** Vérifie qu'un raid est permis. Renvoie un message d'erreur, ou null. */
export function raidBlocker(attacker: PlayerState, victim: PlayerState, ctx: Omit<RaidContext, "rng">): string | null {
  const revenge = hasRevenge(attacker, ctx.victimId, ctx.now);
  if (ctx.attackerId === ctx.victimId) return "On ne se pille pas soi-même.";
  if (ctx.allied) return "On ne pille pas un allié.";
  const free = revenge || !!ctx.atWar;
  if (!ctx.atWar && victim.shieldUntil > ctx.now) return "Cette cible est sous bouclier.";
  if (!free && !ctx.allowRepeat && attacker.lastRaidTarget === ctx.victimId) return "Pas deux raids de suite contre la même cible.";
  if (!free && !ctx.attackerIsLord && ctx.now - attacker.lastRaidAt < RAID_COOLDOWN_MS) return "Tes troupes se reposent encore.";
  if (armySize(ctx.attackerArmy ?? attackArmy(attacker)) === 0) return "Il te faut des troupes pour lancer un raid.";
  return null;
}

/** Retire des pertes d'un stock de troupes ou de fortifications. */
function withoutLosses<Id extends string>(counts: Partial<Record<Id, number>>, lost: Army): Partial<Record<Id, number>> {
  const out: Partial<Record<Id, number>> = {};
  for (const [id, n] of Object.entries(counts) as [Id, number][]) {
    const left = n - ((lost as Record<string, number>)[id] ?? 0);
    if (left > 0) out[id] = left;
  }
  return out;
}

/**
 * Résout un raid. Les deux états doivent déjà être avancés jusqu'à `ctx.now`.
 * Une bataille en quelques rounds décide de l'issue ; les pertes des deux camps sont réelles
 * (les fortifications abattues se relèvent en partie, les gardes sont toujours remplacés).
 * En cas de succès, la victime perd une part de son stock non sécurisé, voit ses ateliers
 * incendiés et quelques bâtiments ruinés, puis reçoit un bouclier et un droit de revanche.
 */
export function resolveRaid(
  attacker: PlayerState,
  victim: PlayerState,
  ctx: RaidContext,
): Result<{ attacker: PlayerState; victim: PlayerState; report: RaidReport }> {
  const blocked = raidBlocker(attacker, victim, ctx);
  if (blocked) return { ok: false, error: blocked };
  const { now, rng } = ctx;
  const revenge = hasRevenge(attacker, ctx.victimId, now);
  const armies = raidArmies(attacker, victim, ctx);
  const fight = battle(armies.attack, armies.defense, rng, { attackBonus: armies.attackBonus });

  // Pertes définitives du défenseur : troupes tombées, fortifications non réparées.
  const defenderLost: Army = {};
  for (const [id, n] of Object.entries(fight.defenderLost) as [CombatantId, number][]) {
    if (id === "garde") continue;
    let lost = n;
    if ((DEFENSE_IDS as string[]).includes(id)) {
      const exact = n * (1 - DEFENSE_REPAIR_RATE);
      lost = Math.floor(exact) + (rng() < exact - Math.floor(exact) ? 1 : 0);
    }
    if (lost > 0) defenderLost[id] = lost;
  }
  const attackerSplit = ctx.attackerArmy ? null : splitTroopLosses(attacker, fight.attackerLost);
  const victimSplit = ctx.defenderArmy ? null : splitTroopLosses(victim, defenderLost);

  const attackerAfter: PlayerState = {
    ...attacker,
    ...(attackerSplit ? { troops: attackerSplit.troops, stationed: attackerSplit.stationed } : {}),
    lastRaidAt: now,
    lastRaidTarget: ctx.victimId,
    shieldUntil: 0, // attaquer fait tomber son propre bouclier
    ...(revenge ? { revengeTarget: null, revengeUntil: 0 } : {}),
  };
  const victimArmyAfter: PlayerState = ctx.defenderArmy
    ? victim
    : { ...victim, troops: victimSplit!.troops, stationed: victimSplit!.stationed, defenses: withoutLosses(victim.defenses, defenderLost) };
  const base: RaidReport = {
    success: fight.success,
    rounds: fight.rounds,
    stolen: 0,
    allyShares: {},
    destroyed: {},
    attackerLost: fight.attackerLost,
    defenderLost: ctx.defenderArmy ? fight.defenderLost : defenderLost,
    revenge,
  };
  if (!fight.success) return { ok: true, value: { attacker: attackerAfter, victim: victimArmyAfter, report: base } };

  const stolen = lootOf(victim.stone, ctx.victimRate, revenge);
  const allyShares = ctx.attackerArmy ? {} : lootShares(attacker, stolen);
  const allyTotal = Object.values(allyShares).reduce((a, b) => a + b, 0);

  // Destruction : 5 % des bâtiments (arrondi à l'inférieur), au plus un par type,
  // en commençant par les plus précieux, jamais en dessous des premiers protégés.
  const total = GENERATORS.reduce((sum, g) => sum + owned(victim, g.id), 0);
  let toDestroy = Math.floor(total * RAID_DESTROY_RATE);
  const generators = { ...victim.generators };
  const ruins = { ...victim.ruins };
  const destroyed: RaidReport["destroyed"] = {};
  for (const g of [...GENERATORS].reverse()) {
    if (toDestroy <= 0) break;
    if (owned(victim, g.id) > PROTECTED_PER_TYPE) {
      generators[g.id] = owned(victim, g.id) - 1;
      ruins[g.id] = ruinsOf(victim, g.id) + 1;
      destroyed[g.id] = 1;
      toDestroy--;
    }
  }

  return {
    ok: true,
    value: {
      attacker: { ...attackerAfter, stone: attacker.stone + stolen - allyTotal, totalPlundered: attacker.totalPlundered + stolen - allyTotal },
      victim: {
        ...victimArmyAfter,
        stone: victim.stone - stolen,
        generators,
        ruins,
        burnedUntil: Math.max(victim.burnedUntil, now + BURN_MS),
        shieldUntil: now + (ctx.defenderArmy ? LORD_SHIELD_MS : SHIELD_MS),
        revengeTarget: ctx.attackerId,
        revengeUntil: now + REVENGE_MS,
      },
      report: { ...base, stolen, allyShares, destroyed },
    },
  };
}

// ---------------------------------------------------------------------------
// Espions
// ---------------------------------------------------------------------------

export function spyCost(state: PlayerState, world: WorldState, now: number): number {
  return Math.max(SPY_MIN_COST, Math.ceil(rateAt(state, world, now) * SPY_COST_SECONDS));
}

/** Risque que l'espion soit repéré, selon les tours d'archers de la cible. */
export function spyDetectChance(defense: Army): number {
  return Math.min(SPY_DETECT_MAX, SPY_DETECT_BASE + SPY_DETECT_PER_TOWER * (defense.tour ?? 0));
}

/** Nombre vu de loin : 5 près pour les petites troupes, un seul chiffre significatif ensuite. */
export function fuzzyCount(n: number): number {
  if (n <= 0) return 0;
  if (n < 15) return Math.max(5, Math.round(n / 5) * 5);
  const mag = 10 ** Math.floor(Math.log10(n));
  return Math.round(n / mag) * mag;
}

/** Armée vue sans espion : comptes arrondis (les gardes du château sont connus de tous). */
export function fuzzyArmy(army: Army): Army {
  const out: Army = {};
  for (const [id, n] of Object.entries(army) as [CombatantId, number][]) out[id] = id === "garde" ? n : fuzzyCount(n);
  return out;
}
