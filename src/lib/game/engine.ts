// Moteur idle de Beffroi : fonctions pures, sans accès réseau ni base.
// Le serveur s'en sert pour calculer l'état qui fait foi ; le navigateur pour animer le compteur.

import {
  CLICK_WINDOW_MAX_MS,
  COST_GROWTH,
  GENERATORS,
  MAX_CLICKS_PER_SECOND,
  OFFLINE_CAP_MS,
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
  };
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

/**
 * Calcul paresseux : fait avancer l'état jusqu'à `now`.
 * Le temps hors ligne est plafonné, et le calcul est découpé en segments
 * à chaque étape du chantier terminée pendant l'absence.
 */
export function advance(state: PlayerState, now: number, world: WorldState): PlayerState {
  if (now <= state.lastUpdate) return state;
  const start = Math.max(state.lastUpdate, now - OFFLINE_CAP_MS);
  const breakpoints = world.stageCompletedAt.filter((t) => t > start && t < now).sort((a, b) => a - b);
  let gain = 0;
  let cursor = start;
  for (const t of [...breakpoints, now]) {
    gain += (productionPerSecond(state, world, stagesDoneAt(world, cursor)) * (t - cursor)) / 1000;
    cursor = t;
  }
  return { ...state, stone: state.stone + gain, totalProduced: state.totalProduced + gain, lastUpdate: now };
}

/** Prix de `qty` bâtiments supplémentaires (série géométrique). */
export function generatorCost(state: PlayerState, id: GeneratorId, qty = 1): number {
  const def = GENERATORS.find((g) => g.id === id)!;
  const n = owned(state, id);
  return Math.ceil((def.baseCost * Math.pow(COST_GROWTH, n) * (Math.pow(COST_GROWTH, qty) - 1)) / (COST_GROWTH - 1));
}

/** Nombre maximal de bâtiments achetables avec la pierre disponible. */
export function maxAffordable(state: PlayerState, id: GeneratorId): number {
  const def = GENERATORS.find((g) => g.id === id)!;
  const n = owned(state, id);
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
