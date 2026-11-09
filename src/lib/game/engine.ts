// Moteur idle de Beffroi : fonctions pures, sans accès réseau ni base.
// Le serveur s'en sert pour calculer l'état qui fait foi ; le navigateur pour animer le compteur.

import {
  BURN_CLICK_REDUCTION_MS,
  BURN_MS,
  BURN_PRODUCTION_FACTOR,
  CLICK_WINDOW_MAX_MS,
  COST_GROWTH,
  GENERATORS,
  MAX_CLICKS_PER_SECOND,
  OFFLINE_CAP_MS,
  PROTECTED_PER_TYPE,
  RAID_COOLDOWN_MS,
  RAID_COST_SECONDS,
  RAID_DESTROY_RATE,
  RAID_LOOT_RATE,
  RAID_MIN_COST,
  REVENGE_LOOT_RATE,
  REVENGE_MS,
  RUIN_REBUILD_FACTOR,
  SECURED_SECONDS,
  SHIELD_MS,
  STAGES,
  UPGRADE_BY_ID,
  type GeneratorId,
  type UpgradeDef,
} from "./config";

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
  let m = 1 + (world.legacyBonus ?? 0);
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
): { state: PlayerState; accepted: number } {
  const requested = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const windowMs = Math.min(Math.max(0, now - state.lastClickAt), CLICK_WINDOW_MAX_MS);
  const allowed = Math.floor((MAX_CLICKS_PER_SECOND * windowMs) / 1000);
  const accepted = Math.min(requested, allowed);
  if (accepted === 0) return { state, accepted };
  const gain = accepted * clickValue(state, world, stagesDoneAt(world, now));
  return {
    state: {
      ...state,
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

/** Coût d'un raid pour l'attaquant (en pierre). */
export function raidCost(attackerRate: number, guard = 1): number {
  return Math.ceil(Math.max(RAID_MIN_COST, attackerRate * RAID_COST_SECONDS) * guard);
}

export function hasRevenge(attacker: PlayerState, victimId: string, now: number): boolean {
  return attacker.revengeTarget === victimId && attacker.revengeUntil > now;
}

export interface RaidContext {
  now: number;
  attackerId: string;
  victimId: string;
  /** Production actuelle de l'attaquant (pour le coût) et de la victime (pour le stock sécurisé). */
  attackerRate: number;
  victimRate: number;
  /** Les seigneurs ne paient pas leurs raids. */
  attackerIsLord?: boolean;
  /** Multiplicateur de coût (seigneur bien gardé). */
  guard?: number;
}

export interface RaidReport {
  stolen: number;
  cost: number;
  destroyed: Partial<Record<GeneratorId, number>>;
  revenge: boolean;
}

/** Vérifie qu'un raid est permis. Renvoie un message d'erreur, ou null. */
export function raidBlocker(attacker: PlayerState, victim: PlayerState, ctx: RaidContext): string | null {
  const revenge = hasRevenge(attacker, ctx.victimId, ctx.now);
  if (ctx.attackerId === ctx.victimId) return "On ne se pille pas soi-même.";
  if (victim.shieldUntil > ctx.now) return "Cette cible est sous bouclier.";
  if (!revenge && attacker.lastRaidTarget === ctx.victimId) return "Pas deux raids de suite contre la même cible.";
  if (!revenge && !ctx.attackerIsLord && ctx.now - attacker.lastRaidAt < RAID_COOLDOWN_MS) return "Tes troupes se reposent encore.";
  const cost = revenge || ctx.attackerIsLord ? 0 : raidCost(ctx.attackerRate, ctx.guard);
  if (cost > attacker.stone) return "Pas assez de pierre pour payer les mercenaires.";
  return null;
}

/**
 * Résout un raid. Les deux états doivent déjà être avancés jusqu'à `ctx.now`.
 * La victime perd une part de son stock non sécurisé, voit ses ateliers incendiés et
 * quelques bâtiments détruits, puis reçoit un bouclier et un droit de revanche.
 */
export function resolveRaid(
  attacker: PlayerState,
  victim: PlayerState,
  ctx: RaidContext,
): Result<{ attacker: PlayerState; victim: PlayerState; report: RaidReport }> {
  const blocked = raidBlocker(attacker, victim, ctx);
  if (blocked) return { ok: false, error: blocked };
  const { now } = ctx;
  const revenge = hasRevenge(attacker, ctx.victimId, now);
  const cost = revenge || ctx.attackerIsLord ? 0 : raidCost(ctx.attackerRate, ctx.guard);

  const secured = ctx.victimRate * SECURED_SECONDS;
  const stolen = Math.floor(Math.max(0, victim.stone - secured) * (revenge ? REVENGE_LOOT_RATE : RAID_LOOT_RATE));

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
      attacker: {
        ...attacker,
        stone: attacker.stone - cost + stolen,
        totalPlundered: attacker.totalPlundered + stolen,
        lastRaidAt: now,
        lastRaidTarget: ctx.victimId,
        shieldUntil: 0, // attaquer fait tomber son propre bouclier
        ...(revenge ? { revengeTarget: null, revengeUntil: 0 } : {}),
      },
      victim: {
        ...victim,
        stone: victim.stone - stolen,
        generators,
        ruins,
        burnedUntil: Math.max(victim.burnedUntil, now + BURN_MS),
        shieldUntil: now + SHIELD_MS,
        revengeTarget: ctx.attackerId,
        revengeUntil: now + REVENGE_MS,
      },
      report: { stolen, cost, destroyed, revenge },
    },
  };
}
