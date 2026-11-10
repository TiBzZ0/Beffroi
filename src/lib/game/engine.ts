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
  COMBATANTS,
  RESEARCH_COST_FACTOR,
  RESEARCH_COST_GROWTH,
  RESEARCH_BASE_MS,
  RESEARCH_TIME_GROWTH,
  ACADEMY_SPEED,
  ACADEMY_BASE_COST,
  ACADEMY_COST_GROWTH,
  SABOTAGE_COST_SECONDS,
  SABOTAGE_MIN_COST,
  ELAN_PER_CLICK_MS,
  ELAN_MAX_MS,
  MIN_TARGET_SIZE,
  PVP_LOOT_CAP_SECONDS,
  INFIRMARY_MS,
  WOUNDED_WINNER,
  WOUNDED_ATTACKER_BEATEN,
  WOUNDED_DEFENDER_BEATEN,
  RUIN_IMMUNITY_MS,
  RESEARCH_QUEUE_MAX,
  SABOTAGE_LEVEL_SHARE,
  SABOTAGE_BASE_SUCCESS,
  SABOTAGE_PER_TOWER,
  SABOTAGE_MIN_SUCCESS,
  SABOTAGE_DELAY,
  SABOTAGE_IMMUNITY_MS,
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
  CATCH_UP_MAX,
  CATCH_UP_MIN_GAP,
  CATCH_UP_PER_DECADE,
  LORD_SHIELD_MS,
  STAGES,
  UNITS,
  UPGRADE_BY_ID,
  type CombatantId,
  type DefenseId,
  type GeneratorId,
  type UnitId,
  type UpgradeDef,
  STAGE_MIN_SIZE,
  STAGE_SIZE_HOURS,
  MAX_TITHE,
  CURFEW_MINUTES,
  CURFEW_DELAY_MS,
  QUESTS,
  QUEST_REWARD_SECONDS,
  QUEST_MIN_REWARD,
  QUEST_FINAL_ECUS,
  type QuestId,
  VEIN_MIN_MS,
  VEIN_MAX_MS,
  VEIN_VISIBLE_MS,
  VEIN_GRACE_MS,
  VEIN_FRENZY_CHANCE,
  VEIN_FRENZY_MS,
  VEIN_FRENZY_FACTOR,
  VEIN_RAIN_SECONDS,
  SHARE_HOURS,
  DONOR_TIERS,
  DONOR_TIER_ECUS,
  DONOR_TIER_BONUS,
} from "./config";
import { armySize, armyValue, battle, cleanArmy, type Army, type BattleOptions, type Levels } from "./battle";

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
  /** Améliorations militaires : niveau de chaque type, recherche en cours, académie. */
  levels: Levels;
  /** File de recherches (3 au plus), dans l'ordre ; chacune a son heure de fin. */
  research: { id: CombatantId; endsAt: number }[];
  academy: number;
  /** Protégé des sabotages jusqu'à cet horodatage. */
  sabotageImmuneUntil: number;
  /** Plus de bâtiments ruinés par un raid avant cet horodatage. */
  ruinImmuneUntil: number;
  /** Fin de la réserve d'élan (bonus de production tant qu'on frappe). */
  elanUntil: number;
  /** Dîme : part de la production passive versée d'office au chantier (0 à 0,2). */
  tithe: number;
  /** Dîme prélevée mais pas encore versée (le serveur la verse à l'enregistrement suivant). */
  titheOwed: number;
  /** Part de chantier de l'étape en cours (B2) : taille fixée à l'ouverture, dons versés, paliers atteints. */
  share: StageShare | null;
  /** Paliers de don atteints depuis le début de la saison (+2 % de production chacun). */
  donorTiers: number;
  /** Couvre-feu (C2) : début de la plage de 8 h en minutes UTC, et changement en attente. */
  curfew: Curfew;
  /** Compteurs relevés au dernier passage du joueur (résumé « pendant ton absence »). Fixé par le serveur. */
  seen?: { produced: number; contributed: number; levels: Levels };
  /** Veine d'or (C1) : heure d'apparition de la prochaine, et fin de la frénésie en cours. */
  veinAt: number;
  frenzyUntil: number;
  /** Accueil guidé (B4) : index de la quête en cours (10 = fini), null pour un ancien compte. */
  quest: number | null;
  /** Quêtes qui ne se lisent pas dans l'état (dîme réglée…), notées au passage. */
  questFlags: string[];
  /** Infirmerie (E1) : blessés qui reviendront à `healAt` ; ils ne se battent pas. */
  wounded: Partial<Record<UnitId, number>>;
  healAt: number;
  /** Le joueur a déjà réglé sa dîme (sinon on lui montre le bandeau « Règle ta dîme »). */
  titheSet: boolean;
  /** Son alliance tient la forteresse (bonus de production). Fixé par le serveur, jamais enregistré. */
  fortress?: boolean;
  /** Coup de pouce aux joueurs distancés (0.3 = +30 % de production et de défense). Fixé par le serveur, jamais enregistré. */
  catchUp?: number;
}

export interface Curfew {
  /** Minute UTC (0 à 1439) où commence la plage en vigueur, ou null sans couvre-feu. */
  start: number | null;
  /** Plage choisie qui entrera en vigueur à `from` (null pour supprimer le couvre-feu). */
  next?: { start: number | null; from: number } | null;
}

export interface StageShare {
  stage: number;
  size: number;
  given: number;
  tiers: number;
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
    levels: {},
    research: [],
    academy: 0,
    sabotageImmuneUntil: 0,
    ruinImmuneUntil: 0,
    elanUntil: 0,
    tithe: 0,
    titheOwed: 0,
    titheSet: false,
    wounded: {},
    healAt: 0,
    quest: null,
    questFlags: [],
    veinAt: 0,
    frenzyUntil: 0,
    curfew: { start: null },
    share: null,
    donorTiers: 0,
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

/**
 * Coup de pouce d'un joueur selon son retard sur le premier (pierre produite depuis le début de la saison).
 * Renvoie 0 tant que l'écart reste sous CATCH_UP_MIN_GAP.
 */
export function catchUpBonus(produced: number, leaderProduced: number): number {
  const gap = leaderProduced / Math.max(1, produced);
  if (!(gap >= CATCH_UP_MIN_GAP)) return 0;
  return Math.min(CATCH_UP_MAX, CATCH_UP_PER_DECADE * Math.log10(gap));
}

/** Multiplicateur global de production (améliorations, chantier, héritage, coup de pouce). */
export function productionMultiplier(state: PlayerState, world: WorldState, stagesDone: number): number {
  let m = (1 + (world.legacyBonus ?? 0)) * (state.fortress ? FORTRESS_PRODUCTION_BONUS : 1) * (1 + (state.catchUp ?? 0)) * (1 + DONOR_TIER_BONUS * (state.donorTiers ?? 0));
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
  void world;
  let value = 1;
  for (const u of ownedUpgrades(state)) if (u.effect.kind === "click") value *= u.effect.multiplier;
  return value * stageMultiplier(stagesDone, "click");
}

/** Bonus de production de l'élan (0 sans marteau) : +20 % avec le Marteau de maître, +50 % avec le runique en plus. */
export function elanBonus(state: PlayerState): number {
  return ownedUpgrades(state).reduce((sum, u) => sum + (u.effect.kind === "elan" ? u.effect.bonus : 0), 0);
}

export interface AdvanceOptions {
  /** Production de base fixe (seigneurs voisins), à la place des bâtiments. */
  flatRate?: number;
}

/** Production réelle à l'instant t (incendie compris). */
export function rateAt(state: PlayerState, world: WorldState, t: number, opts: AdvanceOptions = {}): number {
  const base = opts.flatRate ?? productionPerSecond(state, world, stagesDoneAt(world, t));
  const elan = !opts.flatRate && t < (state.elanUntil ?? 0) ? 1 + elanBonus(state) : 1;
  const frenzy = !opts.flatRate && t < (state.frenzyUntil ?? 0) ? VEIN_FRENZY_FACTOR : 1;
  return (t < state.burnedUntil ? base * BURN_PRODUCTION_FACTOR : base) * elan * frenzy;
}

/**
 * Calcul paresseux : fait avancer l'état jusqu'à `now`.
 * Le temps hors ligne est plafonné, et le calcul est découpé en segments à chaque
 * événement survenu pendant l'absence (étape du chantier terminée, fin d'incendie).
 */
export function advance(state: PlayerState, now: number, world: WorldState, opts: AdvanceOptions = {}): PlayerState {
  state = settleWounded(settleCurfew(settleResearch(state, now), now), now);
  if (now <= state.lastUpdate) return state;
  const start = Math.max(state.lastUpdate, now - OFFLINE_CAP_MS);
  const events = [...world.stageCompletedAt, state.burnedUntil, state.elanUntil ?? 0, state.frenzyUntil ?? 0];
  const breakpoints = events.filter((t) => t > start && t < now).sort((a, b) => a - b);
  let gain = 0;
  let tithed = 0;
  const tithe = Math.min(MAX_TITHE, Math.max(0, state.tithe ?? 0));
  let cursor = start;
  for (const t of [...breakpoints, now]) {
    const part = (rateAt(state, world, cursor, opts) * (t - cursor)) / 1000;
    gain += part;
    // La dîme ne s'applique que tant qu'une étape du chantier est ouverte.
    if (tithe > 0 && stagesDoneAt(world, cursor) < STAGES.length) tithed += part * tithe;
    cursor = t;
  }
  return {
    ...state,
    stone: state.stone + gain - tithed,
    totalProduced: state.totalProduced + gain,
    titheOwed: (state.titheOwed ?? 0) + tithed,
    lastUpdate: now,
  };
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
  const elapsed = Math.max(0, now - state.lastClickAt);
  const windowMs = Math.min(elapsed, CLICK_WINDOW_MAX_MS);

  // Cadence surhumaine soutenue : avertissements, puis marteau confisqué. La cadence se mesure sur le temps
  // réel écoulé (non plafonné) : un lot honnête retardé par le réseau ne compte pas comme une rafale.
  let strikes = state.clickStrikes;
  if (requested > 0 && elapsed >= 1000) {
    strikes = requested / (Math.max(elapsed, CLICK_RATE_MIN_WINDOW_MS) / 1000) > SUSPICIOUS_CLICK_RATE ? strikes + 1 : Math.max(0, strikes - 1);
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
      elanUntil: Math.min(now + ELAN_MAX_MS, Math.max(state.elanUntil ?? 0, now) + accepted * ELAN_PER_CLICK_MS),
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

/** Plage de couvre-feu en vigueur à `now` (minute UTC de début), ou null. */
export function curfewStart(state: PlayerState, now: number): number | null {
  const c = state.curfew;
  if (!c) return null;
  if (c.next && c.next.from <= now) return c.next.start;
  return c.start;
}

/** Le joueur est-il dans sa plage de couvre-feu à `now` ? */
export function inCurfew(state: PlayerState, now: number): boolean {
  const start = curfewStart(state, now);
  if (start === null) return false;
  const minute = Math.floor((now % 86_400_000) / 60_000);
  return (minute - start + 1440) % 1440 < CURFEW_MINUTES;
}

/** Fait passer en vigueur un changement de plage arrivé à échéance. */
export function settleCurfew(state: PlayerState, now: number): PlayerState {
  const next = state.curfew?.next;
  if (!next || next.from > now) return state;
  return { ...state, curfew: { start: next.start } };
}

/** Choisit une plage (minute UTC de début, ou null pour aucune) : elle prend effet 24 h plus tard. */
export function setCurfew(state: PlayerState, start: number | null, now: number): Result<PlayerState> {
  if (start !== null && (!Number.isInteger(start) || start < 0 || start >= 1440)) return { ok: false, error: "Plage invalide." };
  const current = settleCurfew(state, now).curfew ?? { start: null };
  if (current.start === start) return { ok: true, value: { ...state, curfew: { start } } };
  return { ok: true, value: { ...state, curfew: { start: current.start, next: { start, from: now + CURFEW_DELAY_MS } } } };
}

/** Programme la prochaine veine d'or si la précédente est passée (le joueur doit être là pour la voir). */
export function scheduleVein(state: PlayerState, now: number, rng: () => number = Math.random): PlayerState {
  if (state.veinAt > 0 && now <= state.veinAt + VEIN_VISIBLE_MS + VEIN_GRACE_MS) return state;
  return { ...state, veinAt: now + VEIN_MIN_MS + Math.floor(rng() * (VEIN_MAX_MS - VEIN_MIN_MS)) };
}

export type VeinOutcome = { kind: "frenzy"; until: number } | { kind: "rain"; stone: number };

/** Prise d'une veine d'or ; l'état doit déjà être avancé jusqu'à `now`. */
export function catchVein(state: PlayerState, now: number, world: WorldState, rng: () => number = Math.random): Result<{ state: PlayerState; outcome: VeinOutcome }> {
  if (!(state.veinAt > 0) || now < state.veinAt - VEIN_GRACE_MS || now > state.veinAt + VEIN_VISIBLE_MS + VEIN_GRACE_MS) {
    return { ok: false, error: "La veine s'est refermée." };
  }
  const next = { ...state, veinAt: now + VEIN_MIN_MS + Math.floor(rng() * (VEIN_MAX_MS - VEIN_MIN_MS)) };
  if (rng() < VEIN_FRENZY_CHANCE) {
    const until = now + VEIN_FRENZY_MS;
    return { ok: true, value: { state: { ...next, frenzyUntil: until }, outcome: { kind: "frenzy", until } } };
  }
  const stone = productionPerSecond(state, world, stagesDoneAt(world, now)) * VEIN_RAIN_SECONDS;
  return {
    ok: true,
    value: { state: { ...next, stone: next.stone + stone, totalProduced: next.totalProduced + stone }, outcome: { kind: "rain", stone } },
  };
}

/** Progression de la quête `id` d'après l'état (les quêtes notées à part valent 0 ou 1). */
export function questProgress(state: PlayerState, id: QuestId, extra: { alliance?: boolean } = {}): number {
  const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, b) => a + (b ?? 0), 0);
  switch (id) {
    case "clicks":
      return state.totalClicks;
    case "workshop":
    case "workshops":
      return sum(state.generators);
    case "upgrade":
      return state.upgrades.length;
    case "troops":
      return sum(state.troops) + Object.values(state.stationed ?? {}).reduce((a, t) => a + sum(t), 0);
    case "defense":
      return sum(state.defenses);
    case "alliance":
      return extra.alliance ? 1 : 0;
    default:
      return (state.questFlags ?? []).includes(id) ? 1 : 0;
  }
}

/** Valide la quête en cours si elle est remplie : récompense et passage à la suivante. */
export function claimQuest(state: PlayerState, world: WorldState, now: number, extra: { alliance?: boolean } = {}): { state: PlayerState; done: number | null; ecus: number } {
  const i = state.quest;
  if (i === null || i === undefined || i >= QUESTS.length) return { state, done: null, ecus: 0 };
  const q = QUESTS[i];
  if (questProgress(state, q.id, extra) < q.goal) return { state, done: null, ecus: 0 };
  const reward = Math.max(QUEST_MIN_REWARD, productionPerSecond(state, world, stagesDoneAt(world, now)) * QUEST_REWARD_SECONDS);
  return {
    state: { ...state, quest: i + 1, stone: state.stone + reward, totalProduced: state.totalProduced + reward },
    done: i,
    ecus: i === QUESTS.length - 1 ? QUEST_FINAL_ECUS : 0,
  };
}

/** Note une quête qui ne se lit pas dans l'état. */
export function flagQuest(state: PlayerState, id: QuestId): PlayerState {
  if (state.quest === null || (state.questFlags ?? []).includes(id)) return state;
  return { ...state, questFlags: [...(state.questFlags ?? []), id] };
}

/** Règle la dîme, en pour cent entiers de 0 à 20. */
export function setTithe(state: PlayerState, percent: number): Result<PlayerState> {
  if (!Number.isInteger(percent) || percent < 0 || percent > MAX_TITHE * 100) return { ok: false, error: "Dîme invalide." };
  return { ok: true, value: flagQuest({ ...state, tithe: percent / 100, titheSet: true }, "tithe") };
}

/** Verse au chantier la dîme prélevée (pierres entières) ; le reste attend le prochain versement. */
export function payTithe(state: PlayerState): { state: PlayerState; paid: number } {
  const paid = Math.floor(state.titheOwed ?? 0);
  if (paid < 1) return { state, paid: 0 };
  return { state: { ...state, titheOwed: state.titheOwed - paid, totalContributed: state.totalContributed + paid }, paid };
}

/**
 * Ouvre la part de chantier du joueur pour l'étape en cours : 4 h de sa production,
 * mesurée la première fois qu'on le voit pendant cette étape.
 */
export function openShare(state: PlayerState, stage: number, world: WorldState, now: number): PlayerState {
  if (stage >= STAGES.length || state.share?.stage === stage) return state;
  const size = Math.max(1, Math.ceil(productionPerSecond(state, world, stagesDoneAt(world, now)) * SHARE_HOURS * 3600));
  return { ...state, share: { stage, size, given: 0, tiers: 0 } };
}

/** Compte un don dans la part de chantier ; renvoie les paliers franchis et les écus gagnés. */
export function recordGift(state: PlayerState, amount: number): { state: PlayerState; tiers: number; ecus: number } {
  const share = state.share;
  if (!share || !(amount > 0)) return { state, tiers: 0, ecus: 0 };
  const given = share.given + amount;
  let tiers = share.tiers;
  let ecus = 0;
  while (tiers < DONOR_TIERS.length && given >= share.size * DONOR_TIERS[tiers]) {
    ecus += DONOR_TIER_ECUS[tiers];
    tiers++;
  }
  const gained = tiers - share.tiers;
  return {
    state: { ...state, share: { ...share, given, tiers }, donorTiers: (state.donorTiers ?? 0) + gained },
    tiers: gained,
    ecus,
  };
}

/** Taille d'une étape à son ouverture : 4 h de la production cumulée des joueurs actifs. */
export function stageSize(activeRates: number[]): number {
  const sum = activeRates.reduce((a, r) => a + (Number.isFinite(r) && r > 0 ? r : 0), 0);
  return Math.max(STAGE_MIN_SIZE, Math.ceil(sum * STAGE_SIZE_HOURS * 3600));
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
/** Part des troupes tombées qui reviendra de l'infirmerie (arrondi au plus proche). */
export function woundedOf(lost: Army, share: number): Army {
  const out: Army = {};
  for (const id of UNIT_IDS) {
    const n = Math.round((lost[id] ?? 0) * share);
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Ajoute des blessés à l'infirmerie ; le retour est repoussé à 30 minutes. */
export function addWounded(state: PlayerState, wounded: Army, now: number): PlayerState {
  if (Object.keys(wounded).length === 0) return state;
  const w: PlayerState["wounded"] = { ...(state.wounded ?? {}) };
  for (const [id, n] of Object.entries(wounded) as [UnitId, number][]) w[id] = (w[id] ?? 0) + n;
  return { ...state, wounded: w, healAt: now + INFIRMARY_MS };
}

/** Les blessés guéris rejoignent la garnison. */
export function settleWounded(state: PlayerState, now: number): PlayerState {
  if (!(state.healAt > 0) || state.healAt > now) return state;
  const troops = { ...state.troops };
  for (const [id, n] of Object.entries(state.wounded ?? {}) as [UnitId, number][]) if (n > 0) troops[id] = (troops[id] ?? 0) + n;
  return { ...state, troops, wounded: {}, healAt: 0 };
}

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
  if (!Number.isSafeInteger(qty) || qty < 1) return { ok: false, error: "Quantité invalide." };
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
 * Pierre qu'un raid réussi emporterait : 25 % (40 % en revanche) de la part exposée du stock.
 * Chez un joueur, les 2 dernières heures de production sont à l'abri, mais jamais plus de la moitié du stock.
 * Un seigneur n'a pas de stock à l'abri. Entre joueurs, le butin est plafonné à 2 h de production de l'attaquant.
 */
export function lootOf(stone: number, rate: number, revenge: boolean, opts: { lord?: boolean; cap?: number } = {}): number {
  const secured = opts.lord ? 0 : Math.min(rate * SECURED_SECONDS, stone * (1 - MIN_EXPOSED_SHARE));
  const loot = Math.floor(Math.max(0, stone - secured) * (revenge ? REVENGE_LOOT_RATE : RAID_LOOT_RATE));
  return opts.cap !== undefined ? Math.min(loot, Math.floor(opts.cap)) : loot;
}

/**
 * Taille relative d'une cible : le plus grand des deux rapports (armée, production).
 * Prendre le maximum évite qu'un joueur riche et sans armée devienne intouchable.
 */
export function relativeSize(target: { army: number; rate: number }, attacker: { army: number; rate: number }): number {
  const ra = attacker.army > 0 ? target.army / attacker.army : Infinity;
  const rp = attacker.rate > 0 ? target.rate / attacker.rate : Infinity;
  return Math.max(ra, rp);
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
  /** Production de l'attaquant par seconde (plafond du butin entre joueurs). */
  attackerRate?: number;
  /** Taille relative de la cible (voir relativeSize) ; trop petite, on ne peut pas l'attaquer. */
  relativeSize?: number;
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
  /** Pertes du défenseur (après réparation des fortifications), blessés compris. */
  defenderLost: Army;
  /** Blessés qui reviendront dans 30 minutes, de chaque côté (troupes propres seulement). */
  attackerWounded: Army;
  defenderWounded: Army;
  revenge: boolean;
}

export function raidArmies(attacker: PlayerState, victim: PlayerState, ctx: Pick<RaidContext, "attackerArmy" | "defenderArmy" | "victimId" | "now">) {
  // Le coup de pouce de la victime rend ses défenseurs plus durs à abattre.
  const attackBonus = (hasRevenge(attacker, ctx.victimId, ctx.now) ? REVENGE_ATTACK_BONUS : 1) / (1 + (victim.catchUp ?? 0));
  const opts: BattleOptions = { attackBonus, attackerLevels: attacker.levels, defenderLevels: victim.levels };
  return {
    attack: ctx.attackerArmy ?? attackArmy(attacker),
    defense: ctx.defenderArmy ?? defenseArmy(victim),
    attackBonus,
    opts,
  };
}

/** Vérifie qu'un raid est permis. Renvoie un message d'erreur, ou null. */
export function raidBlocker(attacker: PlayerState, victim: PlayerState, ctx: Omit<RaidContext, "rng">): string | null {
  const revenge = hasRevenge(attacker, ctx.victimId, ctx.now);
  if (ctx.attackerId === ctx.victimId) return "On ne se pille pas soi-même.";
  if (ctx.allied) return "On ne pille pas un allié.";
  if (inCurfew(attacker, ctx.now)) return "Tu es en couvre-feu : pas d'attaque pendant ta plage.";
  if (inCurfew(victim, ctx.now)) return "Ce domaine est en couvre-feu.";
  // En guerre, seuls les boucliers tombent ; le repos et la règle « pas deux fois la même cible » restent.
  const free = revenge;
  if (!ctx.atWar && victim.shieldUntil > ctx.now) return "Cette cible est sous bouclier.";
  if (!free && !ctx.allowRepeat && attacker.lastRaidTarget === ctx.victimId) return "Pas deux raids de suite contre la même cible.";
  if (!free && !ctx.attackerIsLord && ctx.now - attacker.lastRaidAt < RAID_COOLDOWN_MS) return "Tes troupes se reposent encore.";
  if (!free && !ctx.atWar && !ctx.attackerIsLord && !ctx.defenderArmy && ctx.relativeSize !== undefined && ctx.relativeSize < MIN_TARGET_SIZE) return "Ce domaine est trop petit pour toi.";
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
  const fight = battle(armies.attack, armies.defense, rng, armies.opts);

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
  // Infirmerie : une part de ses propres troupes tombées revient dans 30 minutes.
  const attackerWounded = attackerSplit ? woundedOf(attackerSplit.byOwner[""] ?? {}, fight.success ? WOUNDED_WINNER : WOUNDED_ATTACKER_BEATEN) : {};
  const defenderWounded = victimSplit ? woundedOf(victimSplit.byOwner[""] ?? {}, fight.success ? WOUNDED_DEFENDER_BEATEN : WOUNDED_WINNER) : {};

  const attackerAfter: PlayerState = {
    ...addWounded(attacker, attackerWounded, now),
    ...(attackerSplit ? { troops: attackerSplit.troops, stationed: attackerSplit.stationed } : {}),
    lastRaidAt: now,
    lastRaidTarget: ctx.victimId,
    shieldUntil: 0, // attaquer fait tomber son propre bouclier
    ...(revenge ? { revengeTarget: null, revengeUntil: 0 } : {}),
  };
  const victimArmyAfter: PlayerState = ctx.defenderArmy
    ? victim
    : { ...addWounded(victim, defenderWounded, now), troops: victimSplit!.troops, stationed: victimSplit!.stationed, defenses: withoutLosses(victim.defenses, defenderLost) };
  const base: RaidReport = {
    success: fight.success,
    rounds: fight.rounds,
    stolen: 0,
    allyShares: {},
    destroyed: {},
    attackerLost: fight.attackerLost,
    defenderLost: ctx.defenderArmy ? fight.defenderLost : defenderLost,
    attackerWounded,
    defenderWounded,
    revenge,
  };
  if (!fight.success) return { ok: true, value: { attacker: attackerAfter, victim: victimArmyAfter, report: base } };

  const playerVsPlayer = !ctx.attackerIsLord && !ctx.defenderArmy;
  const stolen = lootOf(victim.stone, ctx.victimRate, revenge, {
    lord: !!ctx.defenderArmy,
    cap: playerVsPlayer && ctx.attackerRate !== undefined ? ctx.attackerRate * PVP_LOOT_CAP_SECONDS : undefined,
  });
  const allyShares = ctx.attackerArmy ? {} : lootShares(attacker, stolen);
  const allyTotal = Object.values(allyShares).reduce((a, b) => a + b, 0);

  // Destruction : 5 % des bâtiments (arrondi à l'inférieur), au plus un par type,
  // en commençant par les plus précieux, jamais en dessous des premiers protégés.
  // Après un raid qui a ruiné des bâtiments, plus aucune ruine pendant 24 h (vaut aussi en guerre).
  const total = GENERATORS.reduce((sum, g) => sum + owned(victim, g.id), 0);
  let toDestroy = (victim.ruinImmuneUntil ?? 0) > now ? 0 : Math.floor(total * RAID_DESTROY_RATE);
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
        ruinImmuneUntil: Object.keys(destroyed).length > 0 ? now + RUIN_IMMUNITY_MS : (victim.ruinImmuneUntil ?? 0),
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

// ---------------------------------------------------------------------------
// Améliorations militaires
// ---------------------------------------------------------------------------

export function levelOf(state: PlayerState, id: CombatantId): number {
  return state.levels?.[id] ?? 0;
}

/** Termine les recherches de la file dont l'heure est passée. */
export function settleResearch(state: PlayerState, now: number): PlayerState {
  const queue = state.research ?? [];
  if (queue.length === 0 || queue[0].endsAt > now) return state;
  const levels = { ...state.levels };
  const rest: PlayerState["research"] = [];
  for (const r of queue) {
    if (r.endsAt <= now && rest.length === 0) levels[r.id] = (levels[r.id] ?? 0) + 1;
    else rest.push(r);
  }
  return { ...state, research: rest, levels };
}

/** Niveau qu'aura ce type une fois la file terminée (c'est ce niveau-là qu'une nouvelle recherche améliore). */
export function queuedLevel(state: PlayerState, id: CombatantId): number {
  return levelOf(state, id) + (state.research ?? []).filter((r) => r.id === id).length;
}

export function researchCost(state: PlayerState, id: CombatantId): number {
  const def = COMBATANTS.get(id);
  return Math.ceil((def?.cost ?? 0) * RESEARCH_COST_FACTOR * RESEARCH_COST_GROWTH ** queuedLevel(state, id));
}

export function researchTime(state: PlayerState, id: CombatantId): number {
  return Math.ceil((RESEARCH_BASE_MS * RESEARCH_TIME_GROWTH ** queuedLevel(state, id)) / (1 + ACADEMY_SPEED * (state.academy ?? 0)));
}

/** Types qu'on peut améliorer : troupes et fortifications (pas les gardes). */
export const RESEARCHABLE: readonly CombatantId[] = [...UNIT_IDS, ...DEFENSE_IDS];

/** Ajoute une recherche en bout de file : elle commence quand la précédente se termine. */
export function startResearch(state: PlayerState, id: string, now: number): Result<PlayerState> {
  if (!RESEARCHABLE.includes(id as CombatantId)) return { ok: false, error: "Amélioration inconnue." };
  const s = settleResearch(state, now);
  const queue = s.research ?? [];
  if (queue.length >= RESEARCH_QUEUE_MAX) return { ok: false, error: `La file de recherche est pleine (${RESEARCH_QUEUE_MAX} au plus).` };
  const cost = researchCost(s, id as CombatantId);
  if (cost > s.stone) return { ok: false, error: "Pas assez de pierre." };
  const start = Math.max(now, queue[queue.length - 1]?.endsAt ?? now);
  return { ok: true, value: { ...s, stone: s.stone - cost, research: [...queue, { id: id as CombatantId, endsAt: start + researchTime(s, id as CombatantId) }] } };
}

export function academyCost(state: PlayerState): number {
  return Math.ceil(ACADEMY_BASE_COST * ACADEMY_COST_GROWTH ** (state.academy ?? 0));
}

export function buyAcademy(state: PlayerState): Result<PlayerState> {
  const cost = academyCost(state);
  if (cost > state.stone) return { ok: false, error: "Pas assez de pierre." };
  return { ok: true, value: { ...state, stone: state.stone - cost, academy: (state.academy ?? 0) + 1 } };
}

/**
 * Prix d'un sabotage : une part de ce qu'a coûté le niveau d'académie visé (il grimpe donc avec l'académie de la cible),
 * et au moins quelques minutes de la production du saboteur.
 */
export function sabotageCost(saboteur: PlayerState, target: PlayerState, world: WorldState, now: number): number {
  const level = target.academy ?? 0;
  const levelPrice = level > 0 ? ACADEMY_BASE_COST * ACADEMY_COST_GROWTH ** (level - 1) : 0;
  return Math.max(SABOTAGE_MIN_COST, Math.ceil(rateAt(saboteur, world, now) * SABOTAGE_COST_SECONDS), Math.ceil(levelPrice * SABOTAGE_LEVEL_SHARE));
}

export function sabotageChance(defense: Army): number {
  return Math.max(SABOTAGE_MIN_SUCCESS, SABOTAGE_BASE_SUCCESS - SABOTAGE_PER_TOWER * (defense.tour ?? 0));
}

/** Pourquoi on ne peut pas saboter cette cible, ou null. */
export function sabotageBlocker(target: PlayerState, now: number, saboteur?: PlayerState): string | null {
  if (saboteur && inCurfew(saboteur, now)) return "Tu es en couvre-feu : pas de sabotage pendant ta plage.";
  if (inCurfew(target, now)) return "Ce domaine est en couvre-feu.";
  if (target.sabotageImmuneUntil > now) return "Sa garde est sur le qui-vive après un sabotage récent.";
  if ((target.academy ?? 0) === 0 && (target.research ?? []).length === 0) return "Rien à saboter : pas d'académie ni de recherche en cours.";
  return null;
}

/** Effet d'un sabotage réussi sur la cible. */
export function applySabotage(target: PlayerState, now: number): PlayerState {
  // La recherche en cours prend du retard, et toute la file avec elle.
  const queue = target.research ?? [];
  const delay = queue[0] && queue[0].endsAt > now ? Math.ceil((queue[0].endsAt - now) * SABOTAGE_DELAY) : 0;
  return {
    ...target,
    academy: Math.max(0, (target.academy ?? 0) - 1),
    research: queue.map((r) => ({ ...r, endsAt: r.endsAt + delay })),
    sabotageImmuneUntil: now + SABOTAGE_IMMUNITY_MS,
  };
}
