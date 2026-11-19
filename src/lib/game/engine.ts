// Moteur idle de Beffroi : fonctions pures, sans accès réseau ni base.
// Le serveur s'en sert pour calculer l'état qui fait foi ; le navigateur pour animer le compteur.

import type { DailyState } from "./daily";
import { wingLevel, type Wings } from "./hall";
import type { WingId } from "./config";
import {
  BURN_MS,
  WING_ARMY_SPEED,
  WING_HEAL_MS,
  WING_PRODUCTION,
  WING_REINFORCE_SPEED,
  WING_REINFORCE_STRENGTH,
  WING_SAFE_SECONDS,
  GENERATORS,
  OFFLINE_CAP_MS,
  PROTECTED_PER_TYPE,
  DEFENSE_IDS,
  COMBATANTS,
  RESEARCH_COST_FACTOR,
  RESEARCH_COST_GROWTH,
  RESEARCH_BASE_MS,
  RESEARCH_TIME_GROWTH,
  ACADEMY_SPEED,
  RESEARCH_REFUND,
  ACADEMY_BASE_COST,
  ACADEMY_COST_GROWTH,
  SABOTAGE_COST_SECONDS,
  SABOTAGE_MIN_COST,
  MIN_TARGET_SIZE,
  PVP_LOOT_CAP_SECONDS,
  LORD_LOOT_CAP_SECONDS,
  LORD_LOOT_PLAYER_CAP_SECONDS,
  TRIBUTE_MAX_SECONDS,
  TRIBUTE_RECHARGE,
  INFIRMARY_MS,
  WOUNDED_WINNER,
  WOUNDED_ATTACKER_BEATEN,
  WOUNDED_DEFENDER_BEATEN,
  RANSOM_SHARE,
  LOT_BONUS,
  MASTER_BONUSES,
  type MasterBonusKind,
  FAIRNESS_SLOPE,
  RUIN_IMMUNITY_MS,
  RESEARCH_QUEUE_MAX,
  SABOTAGE_BASE_SUCCESS,
  SABOTAGE_PER_GAP,
  SABOTAGE_MAX_SUCCESS,
  SPY_LEVEL_GROWTH,
  SPY_LEVEL_MAX,
  SPY_LEVEL_SECONDS,
  SPY_MIN_MS,
  SPY_RISK_BASE,
  SPY_RISK_MAX,
  SPY_RISK_MIN,
  SPY_RISK_PER_CELL,
  SPY_RISK_PER_GAP,
  SPY_SPEED,
  RUMOR_FACTOR,
  COUNTER_SECONDS,
  COUNTER_MS,
  RUMOR_SECONDS,
  RUMOR_MS,
  MOLE_SECONDS,
  BLIND_MS,
  SABOTAGE_MIN_SUCCESS,
  SABOTAGE_DELAY,
  SABOTAGE_IMMUNITY_MS,
  UNIT_IDS,
  DEFENSE_REPAIR_RATE,
  GUARDS_PER_DOMAIN,
  RAID_DESTROY_RATE,
  RAID_LOOT_RATE,
  REVENGE_ATTACK_BONUS,
  REVENGE_LOOT_RATE,
  REVENGE_MS,
  SECURED_SECONDS,
  SPY_COST_SECONDS,
  SPY_MIN_COST,
  s2GeometryOn,
  MIN_EXPOSED_SHARE,
  SHIELD_MS,
  FORTRESS_PRODUCTION_BONUS,
  CATCH_UP_MAX,
  CATCH_UP_MIN_GAP,
  CATCH_UP_PER_DECADE,
  LORD_SHIELD_MS,
  STAGES,
  LEGACY,
  LEGACY_CARRIER,
  LEGACY_START,
  LEGACY_RAMPART,
  LEGACY_START_MS,
  LEGACY_CAVE_SECONDS,
  type LegacyId,
  TOTAL_STAGES,
  EMBELLISH_PRODUCTION,
  type CombatantId,
  type DefenseId,
  type GeneratorId,
  type UnitId,
  STAGE_MIN_SIZE,
  STAGE_SIZE_HOURS,
  STAGE_END_HOURS,
  STAGE_FLOOR_SHARE,
  stagesSpread,
  stageHours,
  MAX_TITHE,
  CURFEW_MINUTES,
  SHARE_HOURS,
  donorTiersFor,
  DONOR_TIER_ECUS,
  DONOR_TIER_BONUS,
  MAX_MARCHES,
  BATTLE_FORTUNE,
  TRAVEL_BASE_MIN,
  travelMaxMin,
  TRAVEL_MIN_MIN,
  TRAVEL_PER_CELL_MIN,
  UNIT_SPEED,
} from "./config";
import { armySize, armyValue, battle, cleanArmy, type Army, type BattleOptions, type Boost, type Levels, type RoundLog } from "./battle";
import { settleRift, type RiftState } from "./rift";
import { armyBoost, hasTrait, type Captain, type Relic, type TraitId } from "./captains";
import { BANDIT_GRACE_MS, convoyTravelMs, productionValue, settleS2, VALUE as S2_VALUE, type S2State } from "./s2/economy";
import { cheb, type Pos, type S2Map } from "./s2/map";
import type { LordS2State } from "./s2/lords";
import { s2Map } from "./s2/rules";
import { combatLevels, companyLevels, lockedMen, trainLevels, refRate, settleArmy, type ArmyWorks, type Company, type Escort, type RecruitOrder } from "./companies";
import { annexConvoys, banditGuard, convoyRisk, vassalConvoys, WATCH_ESCORT_BONUS, WATCH_STAGE, type RouteContext, type Side } from "./s2/convoys";
import { tradeConvoys } from "./s2/players";
import { lin, LIN_ATTACK, LIN_ATTACK_LOSSES, LIN_CAVE_SECONDS, LIN_DONOR_TIERS, LIN_FORT_DAMAGE, LIN_FORTUNE, LIN_PRODUCTION, LIN_PROTECTED, LIN_PVP_CAP, LIN_RESEARCH_SPEED, LIN_REVENGE_MS, LIN_SABOTAGE, LIN_SPEED, LIN_SPY_SPEED, LIN_WOUNDED, type LineageState } from "./lineage";

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
  /** File de recherche ; `cost` : prix payé (R2, pour rembourser la moitié à l'annulation). */
  research: { id: ResearchId; endsAt: number; cost?: number }[];
  /** E1 : niveau d'espionnage (0 à 10). */
  spyLevel?: number;
  /** E3 : espions en route (aller simple). */
  spies?: SpyMission[];
  /** E4 : taupes posées chez d'autres, contre-espionnage, fausse rumeur, sabotages subis (grenier, guet), journal des alertes. */
  moles?: Mole[];
  counterUntil?: number;
  rumor?: { mode: "fort" | "faible"; until: number } | null;
  granaryCutUntil?: number;
  /** G5 : réserve « Tribut des seigneurs » (secondes de production au moment `at`) ; absente = pleine. */
  tribute?: { seconds: number; at: number };
  /** U2 : dernière lecture de chaque catégorie de rapports (suivie d'un appareil à l'autre). */
  inboxRead?: Record<string, number>;
  blindUntil?: number;
  spyLog?: { at: number; text: string }[];
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
  /** Prime de lot (D2) : +10 % de production tant que moins de ce nombre d'étapes sont finies. Fixé par le serveur. */
  lotBonusUntilStage?: number;
  /** Bonus du maître d'œuvre (D3) pour les membres du premier lot fini. Fixé par le serveur. */
  /** H2 : niveaux d'héritage du profil (permanents) et début de la saison (pour le départ lancé). */
  legacy?: Partial<Record<LegacyId, number>>;
  seasonStart?: number;
  /** R6 : bonus de maître d'œuvre, un par genre au plus à la fois ; un second du même genre allonge le premier. */
  masterBonuses?: { kind: MasterBonusKind; from: number; until: number }[];
  /** Coup de pouce aux joueurs distancés (0.3 = +30 % de production et de défense). Fixé par le serveur, jamais enregistré. */
  catchUp?: number;
  /** T3 : armées en route (aller ou retour). Les troupes en route ne défendent plus le domaine. */
  marches?: March[];
  /** Saison 2, vague B : compagnies affectées à l'escorte des routes. */
  escorts?: Escort[];
  /** V15 : bonus achetés au marchand, et passage du marchand où l'on a déjà acheté. */
  boostProdUntil?: number;
  boostSafeUntil?: number;
  merchantEvent?: number;
  /** Quêtes du jour, et bonus du coffre (production en plus jusqu'à `dailyBoostUntil`). */
  daily?: DailyState | null;
  dailyBoostUntil?: number;
  dailyBoost?: number;
  /** Ailes de la halle de l'alliance (ou de la loge), posées au chargement ; jamais enregistrées. */
  hall?: Wings;
  /** Part de la dîme qui va à la halle (0 à 0,5). */
  hallTithe?: number;
  /** L2 : nœuds de la Lignée achetés en renom (repart à zéro à chaque saison). */
  lineage?: LineageState;
  /** C1 à C4 (saison 1 et suivantes) : compagnies, caserne, chantiers, fortifications en niveaux, files de recrutement. */
  companies?: Company[];
  barracks?: number;
  works?: ArmyWorks;
  fortLevels?: Partial<Record<DefenseId, number>>;
  recruits?: RecruitOrder[];
  /** Mes troupes postées ailleurs. Fixé par le serveur, jamais enregistré. */
  abroad?: Army;
  /** Modèle des compagnies en vigueur. Fixé par le serveur selon la saison, jamais enregistré. */
  companyModel?: boolean;
  /** Saison 2 : château, concessions, convois, fer et or (absent avant la saison 2). */
  s2?: S2State;
  /** Saison 2 : fief et garnison d'un seigneur. */
  lordS2?: LordS2State;
  /** F1 : la faille (semaine, plus haut étage, repos des compagnies, expédition). */
  rift?: RiftState | null;
  /** C3, F3 : capitaines, reliques, et les trois traits proposés au dernier recrutement. */
  captains?: Captain[];
  relics?: Relic[];
  captainOffer?: TraitId[] | null;
}

/** Une recherche de la Forge : un type de troupe ou de fortification, ou l'espionnage. */
export type ResearchId = CombatantId | "espionnage";

/** E3 : un espion en route vers sa cible (joueur, seigneur, « fortress » ou « hall:<id> »). */
export interface SpyMission {
  id: string;
  kind: "recon";
  target: string;
  departAt: number;
  arriveAt: number;
  /** Distance en cases, pour le risque d'être repéré. */
  distance: number;
}

/** E4 : une taupe chez la cible ; on retient ce qu'elle a déjà signalé. */
export interface Mole {
  id: string;
  target: string;
  until: number;
  distance: number;
  seen: string[];
  shielded: boolean;
  curfew: boolean;
}

/** E4 : armée affichée par la fausse rumeur (×2 ou ÷2). */
export function rumorArmy(state: PlayerState, army: Army, now: number): Army {
  const r = state.rumor;
  if (!r || r.until <= now) return army;
  const f = r.mode === "fort" ? RUMOR_FACTOR : 1 / RUMOR_FACTOR;
  return Object.fromEntries(Object.entries(army).map(([id, n]) => [id, Math.max(1, Math.round((n ?? 0) * f))])) as Army;
}

/** E4 : contre-espionnage actif ? Il retire 2 à l'écart de tous ceux qui agissent contre soi. */
export function counterActive(state: PlayerState, now: number): boolean {
  return (state.counterUntil ?? 0) > now;
}

/** E4 : contre-espionnage et fausse rumeur se paient en minutes de production de base. */
export function buyCounter(state: PlayerState, base: number, now: number): Result<PlayerState> {
  const cost = Math.max(spyMin(), Math.ceil(base * COUNTER_SECONDS));
  if (cost > state.stone) return { ok: false, error: "Pas assez de pierre." };
  return { ok: true, value: { ...state, stone: state.stone - cost, counterUntil: Math.max(now, state.counterUntil ?? 0) + COUNTER_MS } };
}

export function buyRumor(state: PlayerState, mode: string, base: number, now: number): Result<PlayerState> {
  if (mode !== "fort" && mode !== "faible") return { ok: false, error: "Rumeur inconnue." };
  const cost = Math.max(spyMin(), Math.ceil(base * RUMOR_SECONDS));
  if (cost > state.stone) return { ok: false, error: "Pas assez de pierre." };
  return { ok: true, value: { ...state, stone: state.stone - cost, rumor: { mode, until: now + RUMOR_MS } } };
}

/** Prix plancher de l'espionnage : 200 pierres, ou 1 or en saison 2. */
function spyMin(): number {
  return s2GeometryOn() ? 1 : SPY_MIN_COST;
}
export function counterCost(base: number): number {
  return Math.max(spyMin(), Math.ceil(base * COUNTER_SECONDS));
}
export function rumorCost(base: number): number {
  return Math.max(spyMin(), Math.ceil(base * RUMOR_SECONDS));
}
export function moleCost(base: number): number {
  return Math.max(spyMin(), Math.ceil(base * MOLE_SECONDS));
}

/** E3 : durée du trajet d'un espion (vitesse 3, 1 minute au moins). */
export function spyTravelMs(distance: number, fast = false): number {
  // L2 : Pieds légers, espions 25 % plus rapides.
  return Math.max(SPY_MIN_MS, Math.round(((TRAVEL_BASE_MIN + (TRAVEL_PER_CELL_MIN * distance) / SPY_SPEED) * 60_000) / (fast ? 1 + LIN_SPY_SPEED : 1)));
}

/** E3 : risque d'être repéré pour un écart de niveau `gap` et une distance en cases. */
export function spyRisk(gap: number, distance: number): number {
  return Math.min(SPY_RISK_MAX, Math.max(SPY_RISK_MIN, SPY_RISK_BASE - SPY_RISK_PER_GAP * gap + SPY_RISK_PER_CELL * distance));
}

/** Secondes de stock à l'abri en plus (grenier de la halle, héritage, Lignée). */
export function extraSecured(state: PlayerState): number {
  return WING_SAFE_SECONDS[wingLevel(state.hall, "grenier")] + LEGACY_CAVE_SECONDS * legacyLevel(state, "cave") + (lin(state, "cave") ? LIN_CAVE_SECONDS : 0);
}

export interface March {
  id: string;
  /** Raid, renforts envoyés à un allié, assaut ou garnison de la forteresse (T6). */
  kind: "raid" | "reinforce" | "fortress" | "station" | "event" | "hall_station" | "hall_siege" | "pillage" | "contract" | "intercept" | "camp";
  /** Vague B : concession visée par un pillage, ou dont on intercepte un convoi. */
  conc?: string;
  /** S8 : départ du convoi intercepté (avec `conc`, il l'identifie). */
  convoy?: number;
  /** Vague B : contrat d'un seigneur que l'armée part remplir. */
  contract?: { lord: string; kind: "escorte" | "interception" | "camp"; rival?: string; gold: number };
  /** H5 : aile visée par un assaut de halle. */
  wing?: WingId;
  target: string;
  troops: Army;
  departAt: number;
  arriveAt: number;
  /** Aller : "out". Retour (après le combat, un demi-tour ou un rappel) : "back", jusqu'à `returnAt`.
   *  "camp" : postée sur place (filon, trésor) jusqu'à `returnAt`, la fin de l'événement. */
  status: "out" | "back" | "camp";
  returnAt: number;
  /** T5 : le défenseur verra le nom de l'attaquant (tirage fait au départ). */
  revealed: boolean;
  /** Prévenu à mi-chemin (notification envoyée). */
  warned: boolean;
  /** V14 : passé à mi-chemin dans le brouillard, le défenseur ne voit rien venir. */
  hidden?: boolean;
  /** Butin et rançon rapportés, crédités au retour. */
  loot: number;
  ransom: number;
  /** Saison 2 : butin d'un fief de seigneur, dans les trois monnaies, crédité au retour. */
  lootS2?: { pierre: number; fer: number; or: number };
  /** Ce qui s'est passé à l'arrivée, pour l'affichage. */
  outcome?: "won" | "lost" | "turned" | "recalled";
  /** R3 : renforts d'alliés emmenés en raid, par propriétaire ; ils rentrent chez l'hôte au retour. */
  allies?: Record<string, Army>;
  /** R3 : alliés qui ont demandé le rappel pendant le trajet ; il s'applique au retour. */
  recallAllies?: string[];
}

/** T2 : durée de l'aller, en millisecondes, au pas de l'unité la plus lente. */
export function travelMs(army: Army, distance: number, speedBonus = 0): number {
  const speeds = (Object.entries(army) as [string, number][]).filter(([, n]) => n > 0).map(([id]) => UNIT_SPEED[id] ?? 1);
  const speed = speeds.length ? Math.min(...speeds) : 1;
  // Halle : écuries (et salle d'armes pour les renforts) raccourcissent la route.
  const minutes = Math.min(travelMaxMin(), Math.max(TRAVEL_MIN_MIN, TRAVEL_BASE_MIN + (TRAVEL_PER_CELL_MIN * distance) / speed) / (1 + Math.max(0, speedBonus)));
  return Math.round(minutes * 60_000);
}

/** T3 : vérifie et retire du domaine les troupes envoyées. */
export function sendTroops(state: PlayerState, wanted: Army): Result<{ state: PlayerState; sent: Army }> {
  const sent: Army = {};
  for (const [id, raw] of Object.entries(wanted) as [CombatantId, number][]) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!(UNIT_IDS as string[]).includes(id)) return { ok: false, error: "Seules les troupes partent : fortifications et gardes restent au domaine." };
    const have = ((state.troops as Record<string, number>)[id] ?? 0) - ((lockedMen(state, state.lastUpdate) as Record<string, number>)[id] ?? 0);
    if (n > have) return { ok: false, error: have < ((state.troops as Record<string, number>)[id] ?? 0) ? "Une compagnie à l'entraînement ne peut pas sortir." : "Tu n'as pas autant de troupes." };
    sent[id] = n;
  }
  if (armySize(sent) === 0) return { ok: false, error: "Choisis au moins une troupe à envoyer." };
  if ((state.marches ?? []).length >= MAX_MARCHES) return { ok: false, error: `${MAX_MARCHES} armées en route au plus.` };
  const troops = { ...state.troops } as Record<string, number>;
  for (const [id, n] of Object.entries(sent) as [string, number][]) {
    troops[id] -= n;
    if (troops[id] <= 0) delete troops[id];
  }
  return { ok: true, value: { state: { ...state, troops: troops as PlayerState["troops"] }, sent } };
}

/** T4 : rappel d'une armée à l'aller ; elle rentre en autant de temps qu'elle a marché. */
export function recallMarch(state: PlayerState, id: string, now: number): Result<PlayerState> {
  const m = (state.marches ?? []).find((x) => x.id === id);
  if (!m) return { ok: false, error: "Armée introuvable." };
  if (m.status === "camp") {
    return { ok: true, value: { ...state, marches: (state.marches ?? []).map((x) => (x.id === id ? { ...x, status: "back", returnAt: now + (x.arriveAt - x.departAt), outcome: "recalled" } : x)) } };
  }
  if (m.status !== "out" || now >= m.arriveAt) return { ok: false, error: "Elle est déjà arrivée." };
  return { ok: true, value: { ...state, marches: (state.marches ?? []).map((x) => (x.id === id ? { ...x, status: "back", returnAt: now + (now - x.departAt), outcome: "recalled" } : x)) } };
}

/** T4 : armée rentrée, survivants et butin rendus au domaine. */
export function landMarch(state: PlayerState, id: string): PlayerState {
  const m = (state.marches ?? []).find((x) => x.id === id);
  if (!m) return state;
  const troops = { ...state.troops } as Record<string, number>;
  for (const [u, n] of Object.entries(m.troops) as [string, number][]) if (n > 0) troops[u] = (troops[u] ?? 0) + n;
  const gain = m.loot + m.ransom;
  // R3 : les renforts emmenés reprennent leur place chez l'hôte.
  const stationed: PlayerState["stationed"] = { ...state.stationed };
  for (const [owner, group] of Object.entries(m.allies ?? {})) {
    const g = { ...(stationed[owner] ?? {}) } as Record<string, number>;
    for (const [u, n] of Object.entries(group) as [string, number][]) if (n > 0) g[u] = (g[u] ?? 0) + n;
    if (Object.keys(g).length > 0) stationed[owner] = g as PlayerState["stationed"][string];
  }
  const s2 = m.lootS2 && state.s2 ? { ...state.s2, iron: state.s2.iron + m.lootS2.fer, gold: state.s2.gold + m.lootS2.or } : state.s2;
  return {
    ...state,
    stationed,
    troops: troops as PlayerState["troops"],
    ...(s2 ? { s2 } : {}),
    stone: state.stone + gain + (m.lootS2 && state.s2 ? m.lootS2.pierre : 0),
    totalPlundered: state.totalPlundered + m.loot,
    marches: (state.marches ?? []).filter((x) => x.id !== id),
  };
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
  // G1 : chaque embellissement achevé ajoute +5 % de production, cumulés par addition.
  if (key === "production" && stagesDone > STAGES.length) m *= 1 + EMBELLISH_PRODUCTION * (stagesDone - STAGES.length);
  return m;
}

/** B6 : somme d'un bonus additif sur les étapes achevées. */
export function stagePerk(stagesDone: number, key: "defenseHp" | "elan" | "securedSeconds" | "researchSpeed"): number {
  let sum = 0;
  for (let i = 0; i < Math.min(stagesDone, STAGES.length); i++) sum += STAGES[i].bonus[key] ?? 0;
  return sum;
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
  const m = (1 + (world.legacyBonus ?? 0)) * (state.fortress ? FORTRESS_PRODUCTION_BONUS : 1) * (1 + (state.catchUp ?? 0)) * (1 + DONOR_TIER_BONUS * (state.donorTiers ?? 0)) * (stagesDone < (state.lotBonusUntilStage ?? 0) ? 1 + LOT_BONUS : 1);
  return m * (1 + WING_PRODUCTION[wingLevel(state.hall, "loge")]) * stageMultiplier(stagesDone, "production") * (1 + LEGACY_CARRIER * legacyLevel(state, "carrier") + (lin(state, "carriere") ? LIN_PRODUCTION : 0));
}

/** H2 : niveau d'héritage, borné. */
export function legacyLevel(state: PlayerState, id: LegacyId): number {
  const max = LEGACY.find((l) => l.id === id)?.max ?? 0;
  return Math.min(max, Math.max(0, Math.floor(state.legacy?.[id] ?? 0)));
}

/** H2 : fin du départ lancé (0 sans ce bonus). */
export function legacyStartUntil(state: PlayerState): number {
  return legacyLevel(state, "depart") > 0 && state.seasonStart ? state.seasonStart + LEGACY_START_MS : 0;
}

/** Production par seconde, en valeur pierre : celle des concessions (le château ne produit rien). */
export function productionPerSecond(state: PlayerState, world: WorldState, stagesDone: number): number {
  const map = state.s2 ? s2Map() : null;
  if (!state.s2 || !map) return 0;
  return (productionValue(state.s2, map) / 3600) * productionMultiplier(state, world, stagesDone);
}

/** R6 : enchaîne les bonus d'un même genre (chacun ajoute 24 h à la fin du précédent s'il tombe pendant). */
export function chainMasterBonuses(list: { kind: MasterBonusKind; from: number; until: number }[]): { kind: MasterBonusKind; from: number; until: number }[] {
  const out: { kind: MasterBonusKind; from: number; until: number }[] = [];
  for (const b of [...list].sort((a, c) => a.from - c.from)) {
    const last = [...out].reverse().find((x) => x.kind === b.kind);
    if (last && b.from < last.until) last.until += b.until - b.from;
    else out.push({ ...b });
  }
  return out;
}

/** Le bonus de maître d'œuvre `kind` est-il actif à `t` ? */
export function masterActive(state: PlayerState, kind: MasterBonusKind, t: number): boolean {
  return (state.masterBonuses ?? []).some((m) => m.kind === kind && t >= m.from && t < m.until);
}

export interface AdvanceOptions {
  /** Production de base fixe (seigneurs voisins), à la place des bâtiments. */
  flatRate?: number;
}

/**
 * Production de base à l'instant t : bâtiments et bonus durables, sans les coups de pouce passagers
 * (élan des clics, frénésie, coffre, marchand, maître d'œuvre, trêve) ni l'incendie.
 * C'est elle qui fixe les prix : cliquer ne doit pas faire monter la note.
 */
export function baseRate(state: PlayerState, world: WorldState, t: number): number {
  return productionPerSecond(state, world, stagesDoneAt(world, t));
}

/** Production réelle à l'instant t, avec les bonus passagers (maître d'œuvre, coffre, départ lancé). */
export function rateAt(state: PlayerState, world: WorldState, t: number, opts: AdvanceOptions = {}): number {
  const base = opts.flatRate ?? productionPerSecond(state, world, stagesDoneAt(world, t));
  if (opts.flatRate) return base;
  const master = masterActive(state, "production", t) ? 1 + MASTER_BONUSES.production.value : 1;
  const chest = t < (state.dailyBoostUntil ?? 0) ? 1 + (state.dailyBoost ?? 0) : 1;
  const start = t < legacyStartUntil(state) ? 1 + LEGACY_START * legacyLevel(state, "depart") : 1;
  return base * master * chest * start;
}

/**
 * Calcul paresseux : fait avancer l'état jusqu'à `now`.
 * Le temps hors ligne est plafonné, et le calcul est découpé en segments à chaque
 * événement survenu pendant l'absence (étape du chantier terminée, fin d'incendie).
 */
export function advance(state: PlayerState, now: number, world: WorldState, opts: AdvanceOptions = {}): PlayerState {
  state = settleRift(settleArmy(settleWounded(settleCurfew(settleResearch(state, now), now), now), now), now, addWounded);
  if (now <= state.lastUpdate) return state;
  const start = Math.max(state.lastUpdate, now - OFFLINE_CAP_MS);
  const events = [...world.stageCompletedAt, ...(state.masterBonuses ?? []).flatMap((m) => [m.from, m.until]), state.dailyBoostUntil ?? 0, legacyStartUntil(state)];
  const breakpoints = events.filter((t) => t > start && t < now).sort((a, b) => a - b);
  let gain = 0;
  let tithed = 0;
  const tithe = Math.min(MAX_TITHE, Math.max(0, state.tithe ?? 0));
  const map = state.s2 ? s2Map() : null;
  if (state.s2 && map) {
    // Les concessions produisent, les convois rapportent ; un multiplicateur commun (bonus passagers) par segment.
    const base = productionValue(state.s2, map) / 3600;
    const multiplier = (t: number) => (base > 0 ? rateAt(state, world, t, opts) / base : 1);
    // S10 : Cave profonde (+30 min de stock local), Charpentiers (convois 10 % plus rapides), Grands chariots (charge +25 %).
    const perked = { ...state.s2, stockBonusHours: lin(state, "cave") ? 0.5 : 0, convoySpeed: lin(state, "charpentiers") ? 0.1 : 0, loadBonus: lin(state, "fondations") ? 0.25 : 0 };
    // Vague B : escortes, patrouilles, brigands et expéditions, réglés à l'arrivée des convois.
    const route = routeOf(state, map, stagesDoneAt(world, now));
    const { s: s2, arrived } = settleS2(perked, { map, stageConcessions: stagesDoneAt(world, now) >= 1 ? 1 : 0, multiplier, breakpoints: events.filter((t) => t > state.s2!.at && t < now), belfryDone: stagesDoneAt(world, now) >= TOTAL_STAGES, banditsFrom: (state.seasonStart || 0) + BANDIT_GRACE_MS, risk: (st, v) => convoyRisk(st, v, route.rc), guard: (st, c, at) => banditGuard(st, c, at, route.rc), extra: (st, from, to) => {
      const travel = (a: Pos, b: Pos) => convoyTravelMs(st, a, b);
      vassalConvoys(st, map, state.seasonStart || 0, from, to, travel);
      annexConvoys(st, map, state.seasonStart || 0, from, to, travel);
      tradeConvoys(st, state.seasonStart || 0, from, to, travel);
    } }, now);
    if (route.changed()) state = route.apply(state, now);
    const toBelfry = stagesDoneAt(world, now) < TOTAL_STAGES ? arrived.pierre * tithe : 0;
    const value = arrived.pierre + arrived.fer * 2 + arrived.or * 4;
    return {
      ...state,
      s2: { ...s2, iron: s2.iron + arrived.fer, gold: s2.gold + arrived.or, ...(arrived.beffroi > 0 || s2.giftOwed ? { giftOwed: (s2.giftOwed ?? 0) + arrived.beffroi } : {}) },
      stone: state.stone + arrived.pierre - toBelfry,
      totalProduced: state.totalProduced + value,
      titheOwed: (state.titheOwed ?? 0) + toBelfry,
      lastUpdate: now,
    };
  }
  // Sans domaine (seigneurs) : production fixe, découpée aux fins d'étape pour la dîme.
  let cursor = start;
  for (const t of [...breakpoints, now]) {
    const part = (rateAt(state, world, cursor, opts) * (t - cursor)) / 1000;
    gain += part;
    // La dîme ne s'applique que tant qu'une étape du chantier est ouverte.
    if (tithe > 0 && stagesDoneAt(world, cursor) < TOTAL_STAGES) tithed += part * tithe;
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

/**
 * Contexte des routes d'un joueur : ses escortes (copie modifiée par les combats), et de quoi reporter leurs pertes
 * (morts, blessés qui rentrent au château) sur l'état une fois le calcul fini.
 */
function routeOf(state: PlayerState, map: S2Map, stagesDone: number) {
  const escorts = (state.escorts ?? []).map((e) => ({ ...e }));
  // Vague C : les mercenaires escortent aussi, avec leur propre entraînement (ils n'ont pas de blessés qui rentrent).
  const mercs = (state.s2?.mercs ?? []).map((m) => ({ ...m }));
  const wounded: Army = {};
  let touched = false;
  const rc: RouteContext = {
    map,
    seasonStart: state.seasonStart || 0,
    stagesDone,
    march: (a, b) => travelMs({ piquier: 1 } as Army, cheb(a, b)),
    escort: (concId, at) => escortSide(state, escorts, mercs, concId, stagesDone, at ?? state.lastUpdate),
    hurt: (concId, lost, won, at) => {
      const e = escorts.find((x) => x.conc === concId && x.men > 0);
      const c = e ? state.companies?.find((x) => x.id === e.company) : undefined;
      const m = mercs.find((x) => x.conc === concId && x.until > at && x.men > 0);
      const own = e && c ? e.men : 0;
      const hired = m ? m.men : 0;
      if (own + hired <= 0) return;
      touched = true;
      const dead = lost as Record<string, number>;
      // Les pertes d'un même type se partagent au prorata entre la compagnie et les mercenaires.
      const share = (unit: string, men: number, other: number) => (dead[unit] ?? 0) * (men / Math.max(1, men + other));
      const ownDead = e && c ? Math.min(e.men, Math.round(share(c.unit, own, m && m.unit === c.unit ? hired : 0))) : 0;
      const mercDead = m ? Math.min(m.men, Math.round(share(m.unit, hired, e && c && c.unit === m.unit ? own : 0))) : 0;
      if (e && c) {
        e.men = Math.max(0, e.men - ownDead);
        const w = woundedOf({ [c.unit]: ownDead } as Army, won ? WOUNDED_WINNER : WOUNDED_DEFENDER_BEATEN);
        for (const [id, n] of Object.entries(w) as [CombatantId, number][]) (wounded as Record<string, number>)[id] = ((wounded as Record<string, number>)[id] ?? 0) + n;
      }
      if (m) m.men = Math.max(0, m.men - mercDead);
    },
  };
  return {
    rc,
    changed: () => touched,
    apply: (s: PlayerState, now: number): PlayerState => addWounded({ ...s, escorts: escorts.filter((e) => e.men > 0), ...(s.s2 ? { s2: { ...s.s2, mercs: mercs.filter((m) => m.men > 0 && m.until > now) } } : {}) }, wounded, now),
  };
}

/** Ce qui défend les convois d'une concession : sa compagnie d'escorte et ses mercenaires (chacun à son entraînement). */
export function escortSide(state: PlayerState, escorts: Escort[], mercs: NonNullable<S2State["mercs"]>, concId: string, stagesDone: number, t: number): Side | null {
  const e = escorts.find((x) => x.conc === concId && x.men > 0);
  const c = e ? state.companies?.find((x) => x.id === e.company) : undefined;
  const m = mercs.find((x) => x.conc === concId && x.men > 0 && x.until > t);
  if (!(e && c) && !m) return null;
  const army: Record<string, number> = {};
  const levels: Record<string, number> = { ...(state.levels as Record<string, number>) };
  if (e && c) {
    army[c.unit] = e.men;
    Object.assign(levels, { [c.unit]: (companyLevels(state, [c.id], { [c.id]: e.men }) as Record<string, number>)[c.unit] ?? 0 });
  }
  if (m) {
    const mine = army[m.unit] ?? 0;
    const theirs = (trainLevels(m.train) as Record<string, number>)[m.unit] ?? 0;
    levels[m.unit] = mine > 0 ? ((levels[m.unit] ?? 0) * mine + theirs * m.men) / (mine + m.men) : theirs;
    army[m.unit] = mine + m.men;
  }
  const units = Object.keys(army) as UnitId[];
  const boost = units.reduce<Boost | undefined>((b, u) => mergeBoost(b, escortBoost(state, u, stagesDone)), undefined);
  return { army: army as Army, levels: levels as Levels, boost };
}

function mergeBoost(a: Boost | undefined, b: Boost | undefined): Boost | undefined {
  if (!a) return b;
  if (!b) return a;
  return { ...a, ...b, atk: { ...(a.atk ?? {}), ...(b.atk ?? {}) } } as Boost;
}

/** Bonus d'une escorte : région (froid), et « La tour de guet » (+15 % de dégâts). */
export function escortBoost(state: PlayerState, unit: UnitId, stagesDone: number): Boost | undefined {
  return regionBoost(state, stagesDone >= WATCH_STAGE ? { atk: { [unit]: 1 + WATCH_ESCORT_BONUS } } : undefined);
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

/** Règle la dîme, en pour cent entiers de 0 à 20. */
export function setTithe(state: PlayerState, percent: number): Result<PlayerState> {
  if (!Number.isInteger(percent) || percent < 0 || percent > MAX_TITHE * 100) return { ok: false, error: "Dîme invalide." };
  return { ok: true, value: { ...state, tithe: percent / 100, titheSet: true } };
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
export function openShare(state: PlayerState, stage: number, world: WorldState, now: number, fixed?: number): PlayerState {
  if (stage >= TOTAL_STAGES || state.share?.stage === stage) return state;
  const size = fixed && fixed > 0 ? Math.ceil(fixed) : shareSize(state, world, now, stage);
  return { ...state, share: { stage, size, given: 0, tiers: 0 } };
}

const SHARE_FLOOR = 0.25;

/** Part de chantier d'un joueur : autant d'heures de sa production actuelle que l'étape en compte (4 h, puis 12 h et 24 h). */
export function shareSize(state: PlayerState, world: WorldState, now: number, stage?: number): number {
  const hours = stage === undefined ? SHARE_HOURS : SHARE_HOURS * (stageHours(stage) / STAGE_SIZE_HOURS);
  // Saison 1 : jamais moins de 25 % de la part d'un joueur actif typique à cet âge de la saison (un compte endormi
  // n'obtient plus paliers, écus et renom pour quelques pierres).
  const floorRate = state.companyModel && state.seasonStart ? SHARE_FLOOR * refRate((now - state.seasonStart) / 3_600_000) : 0;
  return Math.max(1, Math.ceil(Math.max(productionPerSecond(state, world, stagesDoneAt(world, now)), floorRate) * hours * 3600));
}

/** Seuils des paliers de don (L2 : 20 % de moins avec la Dîme généreuse). */
export function donorThresholds(state: PlayerState, stage: number): number[] {
  const f = lin(state, "dime") ? LIN_DONOR_TIERS : 1;
  return donorTiersFor(stage).map((t) => t * f);
}

/** Compte un don dans la part de chantier ; renvoie les paliers franchis et les écus gagnés. */
export function recordGift(state: PlayerState, amount: number): { state: PlayerState; tiers: number; ecus: number } {
  const share = state.share;
  // Q4 : un don nul rattrape aussi les paliers franchis quand les seuils baissent.
  if (!share || !(amount >= 0)) return { state, tiers: 0, ecus: 0 };
  const given = share.given + amount;
  const thresholds = donorThresholds(state, share.stage);
  let tiers = share.tiers;
  let ecus = 0;
  while (tiers < thresholds.length && given >= share.size * thresholds[tiers]) {
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
export function stageSize(activeRates: number[], hours = STAGE_SIZE_HOURS): number {
  const sum = activeRates.reduce((a, r) => a + (Number.isFinite(r) && r > 0 ? r : 0), 0);
  return Math.max(STAGE_MIN_SIZE, Math.ceil(sum * hours * 3600));
}

/** Production de référence cumulée (pierres par joueur) entre deux âges de la saison, en heures. */
export function refStone(fromHours: number, toHours: number): number {
  const a = Math.max(0, fromHours);
  const b = Math.max(a, toHours);
  const steps = Math.max(1, Math.ceil((b - a) * 4));
  const dt = (b - a) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) sum += refRate(a + (i + 0.5) * dt) * dt * 3600;
  return sum;
}

/**
 * B1 : taille d'une étape (saison 2 et suivantes) : 20 % × joueurs équivalents (chacun compte pour sa production /
 * la production de référence du moment, sans plafond) × production de référence cumulée entre l'ouverture prévue
 * de l'étape (fin visée de la précédente) et sa fin visée. Si les joueurs versent 20 % de ce qu'ils produisent et
 * gardent leur rythme, l'étape finit à sa fin visée. 0 hors du beffroi étalé.
 */
export function stageTarget(stage: number, activeRates: number[], ageHours: number): number {
  if (!stagesSpread() || stage >= STAGE_END_HOURS.length) return 0;
  const ref = refRate(ageHours);
  const players = activeRates.reduce((a, r) => a + (Number.isFinite(r) && r > 0 ? r / ref : 0), 0);
  const from = stage === 0 ? 0 : STAGE_END_HOURS[stage - 1];
  return Math.max(STAGE_MIN_SIZE, Math.ceil(players * STAGE_FLOOR_SHARE * refStone(from, STAGE_END_HOURS[stage])));
}

// ---------------------------------------------------------------------------
// Ruines et raids
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Troupes et défenses
// ---------------------------------------------------------------------------


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
  // L2 : les Chirurgiens soignent 10 % de blessés en plus.
  const care = lin(state, "chirurgiens") ? 1 + LIN_WOUNDED : 1;
  for (const [id, n] of Object.entries(wounded) as [UnitId, number][]) w[id] = (w[id] ?? 0) + Math.round(n * care);
  return { ...state, wounded: w, healAt: now + (wingLevel(state.hall, "infirmerie") > 0 ? WING_HEAL_MS[wingLevel(state.hall, "infirmerie")] : INFIRMARY_MS) };
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

// ---------------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------------

/**
 * Pierre qu'un raid réussi emporterait : 25 % (40 % en revanche) de la part exposée du stock.
 * Chez un joueur, les 2 dernières heures de production sont à l'abri, mais jamais plus de la moitié du stock.
 * Un seigneur n'a pas de stock à l'abri. Entre joueurs, le butin est plafonné à 2 h de production de l'attaquant.
 */
export function lootOf(stone: number, rate: number, revenge: boolean, opts: { lord?: boolean; cap?: number; factor?: number; stagesDone?: number; extraSecured?: number; securedFactor?: number } = {}): number {
  // E4 : un grenier saboté ne met plus à l'abri que la moitié.
  const securedSeconds = (SECURED_SECONDS + stagePerk(opts.stagesDone ?? 0, "securedSeconds") + (opts.extraSecured ?? 0)) * (opts.securedFactor ?? 1);
  const secured = opts.lord ? 0 : Math.min(rate * securedSeconds, stone * (1 - MIN_EXPOSED_SHARE));
  const loot = Math.floor(Math.max(0, stone - secured) * (revenge ? REVENGE_LOOT_RATE : RAID_LOOT_RATE) * (opts.factor ?? 1));
  return opts.cap !== undefined ? Math.min(loot, Math.floor(opts.cap)) : loot;
}

/** U2 : catégories de la boîte de réception. */
export const INBOX_CATEGORIES = ["combats", "espionnage", "alliance", "chantier", "royaume"] as const;
export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

/** U2 : marque lue une catégorie (ou toutes). */
export function markInboxRead(state: PlayerState, category: string, now: number): Result<PlayerState> {
  const all = category === "all";
  if (!all && !(INBOX_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "Catégorie inconnue." };
  const read = { ...(state.inboxRead ?? {}) };
  for (const c of all ? INBOX_CATEGORIES : [category]) read[c] = now;
  return { ok: true, value: { ...state, inboxRead: read } };
}

/** G5 : secondes de production restant dans le « Tribut des seigneurs » (pleine si jamais entamée). */
export function tributeLeft(state: Pick<PlayerState, "tribute">, now: number): number {
  const t = state.tribute;
  if (!t) return TRIBUTE_MAX_SECONDS;
  return Math.max(0, Math.min(TRIBUTE_MAX_SECONDS, t.seconds + Math.max(0, now - t.at) / 1000 * TRIBUTE_RECHARGE));
}

/** G5 : plafond du butin sur un seigneur, en pierre, pour une production de base donnée. */
export function lordLootCapOf(state: Pick<PlayerState, "tribute">, baseRate: number, now: number): number {
  return Math.max(0, baseRate) * Math.min(LORD_LOOT_PLAYER_CAP_SECONDS, tributeLeft(state, now));
}

/** G5 : le tribut après un pillage de seigneur ayant rapporté `stolen` pierres. */
export function spendTribute(state: Pick<PlayerState, "tribute">, stolen: number, baseRate: number, now: number): { seconds: number; at: number } {
  const used = baseRate > 0 ? stolen / baseRate : 0;
  return { seconds: Math.max(0, tributeLeft(state, now) - used), at: now };
}

/** E3 : coefficient d'équité entre joueurs, min(1, 2 × taille relative) ; 1 en revanche. */
export function fairness(relative: number | undefined, revenge: boolean): number {
  if (revenge || relative === undefined || !Number.isFinite(relative)) return 1;
  return Math.max(0, Math.min(1, FAIRNESS_SLOPE * relative));
}

/** E2 : rançon d'une victoire contre un joueur, d'après les défenseurs abattus (gardes exclus). */
export function ransomOf(felled: Army, factor: number): number {
  const counted = Object.fromEntries(Object.entries(felled).filter(([id]) => id !== "garde")) as Army;
  return Math.floor(armyValue(counted) * RANSOM_SHARE * factor);
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
  /** Production de base de la victime (sans bonus passagers) : sert au plafond d'un seigneur. */
  victimBaseRate?: number;
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
  /** Étapes du chantier achevées (bonus d'étape : défense, stock à l'abri). */
  stagesDone?: number;
  /** T3 : armée envoyée sur la route ; pas de repos, pertes et butin réglés sur l'armée elle-même. */
  marching?: boolean;
  /** R3 : renforts d'alliés partis avec l'armée, par propriétaire. */
  allyArmies?: Record<string, Army>;
  /** G2 : équité sur le butin pris à un seigneur (1 sans réduction). */
  lordFairness?: number;
  /** G5 : plafond du butin d'un joueur sur un seigneur (1 h de production de base, borné par le tribut restant). */
  lordLootCap?: number;
  /** Saison 1 : butin fixe pris à un seigneur (minutes de production de base selon son niveau, bornées par le tribut). */
  lordLootFixed?: number;
  /** Saison 2 : niveaux de combat de la garnison d'un seigneur (sinon ceux de la victime). */
  defenderLevels?: Levels;
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
  /** Rançon versée par le jeu (E2) et coefficient d'équité appliqué (E3). */
  ransom: number;
  fairness: number;
  revenge: boolean;
  /** B7 : déroulé round par round. */
  log?: RoundLog[];
  /** R3 : pertes et blessés des renforts emmenés, par allié. */
  allyLost?: Record<string, Army>;
  allyWounded?: Record<string, Army>;
  /** R10 : armées au départ. */
  attackerStart?: Army;
  defenderStart?: Army;
}

/** R3 : l'armée envoyée plus les renforts d'alliés qui l'accompagnent. */
export function withAllies(own: Army, allies?: Record<string, Army>): Army {
  const out = { ...own } as Record<string, number>;
  for (const g of Object.values(allies ?? {})) for (const [id, n] of Object.entries(g) as [string, number][]) if (n > 0) out[id] = (out[id] ?? 0) + n;
  return cleanArmy(out as Army);
}

export function raidArmies(attacker: PlayerState, victim: PlayerState, ctx: Pick<RaidContext, "attackerArmy" | "defenderArmy" | "victimId" | "now" | "stagesDone" | "allyArmies" | "attackerIsLord" | "defenderLevels">) {
  // Le coup de pouce de la victime rend ses défenseurs plus durs à abattre.
  const sturdy = (masterActive(victim, "defense", ctx.now) ? 1 + MASTER_BONUSES.defense.value : 1) * (ctx.defenderArmy ? 1 : 1 + stagePerk(ctx.stagesDone ?? 0, "defenseHp")) * (ctx.defenderArmy ? 1 : reinforcementStrength(victim) * rampartStrength(victim));
  const attackBonus = ((hasRevenge(attacker, ctx.victimId, ctx.now) ? REVENGE_ATTACK_BONUS : 1) + (ctx.attackerIsLord ? 0 : warAttack(attacker))) / (1 + (victim.catchUp ?? 0)) / sturdy;
  const opts: BattleOptions = { ...(ctx.attackerIsLord ? {} : warOpts(attacker)), attackBonus, attackerLevels: combatLevels(attacker), defenderLevels: ctx.defenderLevels ?? combatLevels(victim), fortune: ctx.attackerIsLord ? false : warFortune(attacker), attackerBoost: armyBoost(attacker, "attack"), defenderBoost: armyBoost(victim, "defense") };
  return {
    attack: ctx.attackerArmy ? withAllies(ctx.attackerArmy, ctx.allyArmies) : attackArmy(attacker),
    defense: ctx.defenderArmy ?? defenseArmy(victim),
    attackBonus,
    opts,
  };
}

/** L2 : bonus d'attaque additif de la Forge vive. */
export function warAttack(state: PlayerState): number {
  return lin(state, "forge") ? LIN_ATTACK : 0;
}

/** L2 : fortune d'une bataille menée par ce joueur (Chef de guerre : 0,95 à 1,25). */
export function warFortune(state: PlayerState): BattleOptions["fortune"] {
  const base = lin(state, "chef") ? { ...LIN_FORTUNE } : { min: 1 - BATTLE_FORTUNE, max: 1 + BATTLE_FORTUNE };
  // C3 : un capitaine Veinard empêche la fortune de descendre sous 0,95.
  if (hasTrait(state, "veinard")) return { min: Math.max(0.95, base.min), max: Math.max(base.max, 0.95) };
  return lin(state, "chef") ? base : true;
}

/** L2 : options de bataille que la Lignée donne à l'attaquant (béliers lourds, vétérans). */
export function warOpts(state: PlayerState): Pick<BattleOptions, "fortBonus" | "attackerLosses"> {
  return {
    ...(lin(state, "beliers") ? { fortBonus: 1 + LIN_FORT_DAMAGE } : {}),
    ...(lin(state, "veterans") ? { attackerLosses: LIN_ATTACK_LOSSES } : {}),
  };
}

/** L2 : options complètes d'une attaque de joueur hors raid (forteresse, halles, événements, simulateur). */
export function playerAttackOpts(state: PlayerState, opts: BattleOptions = {}): BattleOptions {
  return { ...opts, ...warOpts(state), attackBonus: (opts.attackBonus ?? 1) + warAttack(state), attackerLevels: opts.attackerLevels ?? combatLevels(state), attackerBoost: regionBoost(state, opts.attackerBoost ?? armyBoost(state, "attack")), fortune: warFortune(state) };
}

/** Saison 2 : un château dans le froid endurcit ses troupes (+10 % de points de vie au combat). */
export function regionBoost(state: PlayerState, boost: Boost | undefined): Boost | undefined {
  if (state.s2?.region !== "froid") return boost;
  const hp: Partial<Record<string, number>> = { ...(boost?.hp ?? {}) };
  for (const id of UNIT_IDS) hp[id] = (hp[id] ?? 1) * (1 + COLD_HP_BONUS);
  return { ...(boost ?? {}), hp };
}

const COLD_HP_BONUS = 0.1;

/** Halle : la salle d'armes rend les renforts postés plus durs, au prorata de leur part dans la défense. */
export function reinforcementStrength(victim: PlayerState): number {
  const bonus = WING_REINFORCE_STRENGTH[wingLevel(victim.hall, "armes")];
  if (!(bonus > 0)) return 1;
  const all = armySize(troopsHere(victim));
  const guests = all - armySize(cleanArmy({ ...victim.troops }));
  return all > 0 ? 1 + (bonus * guests) / all : 1;
}

/** G6 : le Rempart rend les fortifications plus dures, au prorata de leur valeur dans la défense. */
export function rampartStrength(victim: PlayerState): number {
  const lv = legacyLevel(victim, "rempart");
  if (lv <= 0) return 1;
  const all = armyValue(defenseArmy(victim));
  const walls = armyValue(cleanArmy({ ...victim.defenses }));
  return all > 0 ? 1 + (LEGACY_RAMPART * lv * walls) / all : 1;
}

/** Halle : vitesse en plus d'une armée (écuries, et salle d'armes pour des renforts). */
export function armySpeedBonus(state: PlayerState, reinforce = false): number {
  // Saison 2 : un château en plaine a des armées 10 % plus rapides.
  return WING_ARMY_SPEED[wingLevel(state.hall, "ecuries")] + (reinforce ? WING_REINFORCE_SPEED[wingLevel(state.hall, "armes")] : 0) + (lin(state, "marche") ? LIN_SPEED : 0) + (state.s2?.region === "plaine" ? 0.1 : 0);
}

/** Vérifie qu'un raid est permis. Renvoie un message d'erreur, ou null. */
export function raidBlocker(attacker: PlayerState, victim: PlayerState, ctx: Omit<RaidContext, "rng">): string | null {
  const revenge = hasRevenge(attacker, ctx.victimId, ctx.now);
  if (ctx.attackerId === ctx.victimId) return "On ne se pille pas soi-même.";
  if (ctx.allied) return "On ne pille pas un allié.";
  if (inCurfew(attacker, ctx.now)) return "Tu es en couvre-feu : pas d'attaque pendant ta plage.";
  if (inCurfew(victim, ctx.now)) return "Ce domaine est en couvre-feu.";
  // En guerre, seuls les boucliers tombent ; la règle « pas deux fois la même cible » restent.
  const free = revenge;
  if (!ctx.atWar && victim.shieldUntil > ctx.now) return "Cette cible est sous bouclier.";
  if (!free && !ctx.allowRepeat && attacker.lastRaidTarget === ctx.victimId) return "Pas deux raids de suite contre la même cible.";
  // R1 : plus de repos entre deux raids pour les joueurs : le trajet le remplace.
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
  // R3 : pertes d'une armée en route partagées entre l'hôte et les renforts emmenés, au prorata des effectifs.
  const allyEntries = Object.entries(ctx.allyArmies ?? {}).filter(([, g]) => armySize(g) > 0);
  const marchSplit = ctx.marching && ctx.attackerArmy && allyEntries.length > 0
    ? splitTroopLosses({ troops: { ...ctx.attackerArmy }, stationed: Object.fromEntries(allyEntries.map(([o, g]) => [o, { ...g }])) } as unknown as PlayerState, fight.attackerLost)
    : null;
  const woundShare = fight.success ? WOUNDED_WINNER : WOUNDED_ATTACKER_BEATEN;
  // Infirmerie : une part de ses propres troupes tombées revient dans 30 minutes.
  const ownLost = attackerSplit ? (attackerSplit.byOwner[""] ?? {}) : marchSplit ? (marchSplit.byOwner[""] ?? {}) : ctx.marching ? fight.attackerLost : {};
  const attackerWounded = woundedOf(ownLost, woundShare);
  const allyLost: Record<string, Army> = marchSplit ? Object.fromEntries(Object.entries(marchSplit.byOwner).filter(([o]) => o !== "")) : {};
  const allyWounded: Record<string, Army> = Object.fromEntries(Object.entries(allyLost).map(([o, l]) => [o, woundedOf(l, woundShare)]));
  const defenderWounded = victimSplit ? woundedOf(victimSplit.byOwner[""] ?? {}, fight.success ? WOUNDED_DEFENDER_BEATEN : WOUNDED_WINNER) : {};

  const attackerAfter: PlayerState = {
    ...addWounded(attacker, attackerWounded, now),
    ...(attackerSplit ? { troops: attackerSplit.troops, stationed: attackerSplit.stationed } : {}),
    lastRaidAt: now,
    lastRaidTarget: ctx.victimId,
    shieldUntil: 0, // attaquer fait tomber son propre bouclier
    ...(revenge ? { revengeTarget: null, revengeUntil: 0 } : {}),
  };
  // A10 : qui repousse un seigneur récupère toutes ses pertes.
  const repelledLord = !!ctx.attackerIsLord && !fight.success;
  const victimArmyAfter: PlayerState = ctx.defenderArmy || repelledLord
    ? victim
    : { ...addWounded(victim, defenderWounded, now), troops: victimSplit!.troops, stationed: victimSplit!.stationed, defenses: withoutLosses(victim.defenses, defenderLost) };
  const base: RaidReport = {
    success: fight.success,
    rounds: fight.rounds,
    stolen: 0,
    allyShares: {},
    destroyed: {},
    attackerLost: fight.attackerLost,
    defenderLost: ctx.defenderArmy ? fight.defenderLost : repelledLord ? {} : defenderLost,
    attackerWounded,
    defenderWounded: repelledLord ? {} : defenderWounded,
    ...(marchSplit ? { allyLost, allyWounded } : {}),
    ransom: 0,
    fairness: 1,
    revenge,
    log: fight.log,
    attackerStart: fight.attackerStart,
    defenderStart: fight.defenderStart,
  };
  if (!fight.success) return { ok: true, value: { attacker: attackerAfter, victim: victimArmyAfter, report: base } };

  const playerVsPlayer = !ctx.attackerIsLord && !ctx.defenderArmy;
  const factor = playerVsPlayer ? fairness(ctx.relativeSize, revenge) : ctx.defenderArmy ? (ctx.lordFairness ?? 1) : 1;
  // C3 : un capitaine Pillard dont la compagnie part au raid ajoute 15 % au butin (sous les plafonds).
  const pillard = (attacker.captains ?? []).some((k) => k.trait === "pillard" && k.company && ((fight.attackerStart as Record<string, number>)[attacker.companies?.find((c) => c.id === k.company)?.unit ?? ""] ?? 0) > 0);
  const lootBonus = (masterActive(attacker, "loot", now) ? 1 + MASTER_BONUSES.loot.value : 1) * (pillard ? 1.15 : 1);
  const stolen = ctx.defenderArmy && ctx.lordLootFixed !== undefined ? Math.floor(Math.max(0, ctx.lordLootFixed)) : lootOf(victim.stone, ctx.victimRate, revenge, {
    extraSecured: extraSecured(victim),
    securedFactor: (victim.granaryCutUntil ?? 0) > now ? 0.5 : 1,
    lord: !!ctx.defenderArmy,
    // Un seigneur prend au plus 30 minutes de la production de base de sa victime, revanche comprise.
    // G5 : un joueur prend au plus le plafond de tribut fourni par le serveur à un seigneur.
    cap: ctx.attackerIsLord ? Math.min(ctx.victimRate, ctx.victimBaseRate ?? ctx.victimRate) * LORD_LOOT_CAP_SECONDS : ctx.defenderArmy ? ctx.lordLootCap : playerVsPlayer && ctx.attackerRate !== undefined ? ctx.attackerRate * PVP_LOOT_CAP_SECONDS * (1 + (lin(attacker, "pillard") ? LIN_PVP_CAP : 0)) : undefined,
    factor: factor * lootBonus,
    stagesDone: ctx.stagesDone,
  });
  // Rançon : pierre créée par le jeu (pas prise à la victime), sur les défenseurs abattus avant soins et réparations.
  const ransom = playerVsPlayer ? ransomOf(fight.defenderLost, factor) : 0;
  const allyShares = !ctx.attackerArmy
    ? lootShares(attacker, stolen)
    : allyEntries.length > 0
      ? lootShares({ troops: { ...ctx.attackerArmy }, stationed: Object.fromEntries(allyEntries.map(([o, g]) => [o, { ...g }])) } as unknown as PlayerState, stolen)
      : {};
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
    if (owned(victim, g.id) > PROTECTED_PER_TYPE + (lin(victim, "fondations") ? LIN_PROTECTED : 0)) {
      generators[g.id] = owned(victim, g.id) - 1;
      ruins[g.id] = ruinsOf(victim, g.id) + 1;
      destroyed[g.id] = 1;
      toDestroy--;
    }
  }

  return {
    ok: true,
    value: {
      // T4 : une armée en route rapporte son butin au retour (voir landMarch).
      attacker: ctx.marching ? attackerAfter : { ...attackerAfter, stone: attacker.stone + stolen - allyTotal + ransom, totalPlundered: attacker.totalPlundered + stolen - allyTotal },
      victim: {
        ...victimArmyAfter,
        stone: Math.max(0, victim.stone - stolen),
        generators,
        ruins,
        burnedUntil: Math.max(victim.burnedUntil, now + BURN_MS),
        ruinImmuneUntil: Object.keys(destroyed).length > 0 ? now + RUIN_IMMUNITY_MS : (victim.ruinImmuneUntil ?? 0),
        shieldUntil: now + (ctx.defenderArmy ? LORD_SHIELD_MS : SHIELD_MS),
        revengeTarget: ctx.attackerId,
        revengeUntil: now + REVENGE_MS + (lin(victim, "rancune") ? LIN_REVENGE_MS : 0),
      },
      report: { ...base, stolen, allyShares, destroyed, ransom, fairness: factor },
    },
  };
}

// ---------------------------------------------------------------------------
// Espions
// ---------------------------------------------------------------------------

/**
 * Base des prix d'espionnage (par seconde). Saison 2 : payés en or, au prix d'aujourd'hui converti par la courbe de
 * référence (la production de référence du jour, en or), au lieu de la production du joueur.
 */
export function spyBase(state: PlayerState, world: WorldState, now: number): number {
  if (state.s2 && state.seasonStart) return refRate((now - state.seasonStart) / 3_600_000) / S2_VALUE.or;
  return baseRate(state, world, now);
}
/** Base du prix du niveau d'espionnage (pierre par seconde) : en saison 2, la production de référence du jour. */
export function researchBase(state: PlayerState, world: WorldState, now: number): number {
  if (state.s2 && state.seasonStart) return refRate((now - state.seasonStart) / 3_600_000);
  return baseRate(state, world, now);
}
/** Saison 2 : l'espionnage se paie en or. On prête l'or aux règles qui comptent en « stone ». */
export function goldView(s: PlayerState): PlayerState {
  return s.s2 ? { ...s, stone: s.s2.gold } : s;
}
export function fromGold(orig: PlayerState, s: PlayerState): PlayerState {
  return orig.s2 && s.s2 ? { ...s, stone: orig.stone, s2: { ...s.s2, gold: s.stone } } : s;
}

export function spyCost(state: PlayerState, world: WorldState, now: number): number {
  return Math.max(state.s2 ? 1 : SPY_MIN_COST, Math.ceil(spyBase(state, world, now) * SPY_COST_SECONDS));
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
  let spyLevel = state.spyLevel ?? 0;
  for (const r of queue) {
    if (r.endsAt <= now && rest.length === 0) {
      if (r.id === "espionnage") spyLevel = Math.min(SPY_LEVEL_MAX, spyLevel + 1);
      else levels[r.id] = (levels[r.id] ?? 0) + 1;
    } else rest.push(r);
  }
  return { ...state, research: rest, levels, spyLevel };
}

/** Niveau qu'aura ce type une fois la file terminée (c'est ce niveau-là qu'une nouvelle recherche améliore). */
export function queuedLevel(state: PlayerState, id: ResearchId): number {
  const done = id === "espionnage" ? (state.spyLevel ?? 0) : levelOf(state, id);
  return done + (state.research ?? []).filter((r) => r.id === id).length;
}

/** Prix d'une recherche ; l'espionnage se paie en minutes de production de base (`base`, par seconde). */
export function researchCost(state: PlayerState, id: ResearchId, base = 0): number {
  if (id === "espionnage") return Math.max(1, Math.ceil(SPY_LEVEL_SECONDS * base * SPY_LEVEL_GROWTH ** queuedLevel(state, id)));
  const def = COMBATANTS.get(id);
  // Saison 2 : recalé sur la production de référence du jour (`base`) : 1 h pour un piquier niveau 1, au prorata du coût de la troupe.
  if (state.s2 && base > 0) return Math.ceil(3600 * base * ((def?.cost ?? 0) / 400) * 1.8 ** queuedLevel(state, id));
  return Math.ceil((def?.cost ?? 0) * RESEARCH_COST_FACTOR * RESEARCH_COST_GROWTH ** queuedLevel(state, id));
}

export function researchTime(state: PlayerState, id: ResearchId, stagesDone = 0): number {
  return Math.ceil((RESEARCH_BASE_MS * RESEARCH_TIME_GROWTH ** queuedLevel(state, id)) / (1 + ACADEMY_SPEED * (state.academy ?? 0)) / (1 + stagePerk(stagesDone, "researchSpeed") + (lin(state, "savants") ? LIN_RESEARCH_SPEED : 0)));
}

/** Types qu'on peut améliorer : troupes et fortifications (pas les gardes). */
export const RESEARCHABLE: readonly CombatantId[] = [...UNIT_IDS, ...DEFENSE_IDS];

/** Ajoute une recherche en bout de file : elle commence quand la précédente se termine. */
export function startResearch(state: PlayerState, id: string, now: number, stagesDone = 0, base = 0): Result<PlayerState> {
  const spy = id === "espionnage";
  if (!spy && !RESEARCHABLE.includes(id as CombatantId)) return { ok: false, error: "Amélioration inconnue." };
  // Saison 2 : pas de fortifications (personne n'attaque le château), donc rien à y améliorer.
  if (state.s2 && (DEFENSE_IDS as readonly string[]).includes(id)) return { ok: false, error: "Pas de fortifications cette saison." };
  const s = settleResearch(state, now);
  const queue = s.research ?? [];
  if (queue.length >= RESEARCH_QUEUE_MAX) return { ok: false, error: `La file de recherche est pleine (${RESEARCH_QUEUE_MAX} au plus).` };
  if (spy && queuedLevel(s, "espionnage") >= SPY_LEVEL_MAX) return { ok: false, error: `L'espionnage est déjà au niveau ${SPY_LEVEL_MAX}.` };
  const rid = id as ResearchId;
  const cost = researchCost(s, rid, base);
  if (cost > s.stone) return { ok: false, error: "Pas assez de pierre." };
  const start = Math.max(now, queue[queue.length - 1]?.endsAt ?? now);
  return { ok: true, value: { ...s, stone: s.stone - cost, research: [...queue, { id: rid, endsAt: start + researchTime(s, rid, stagesDone), cost }] } };
}

export function academyCost(state: PlayerState, base = 0): number {
  // Saison 2 : 2 h de production de référence du jour (`base`), ×2 par niveau.
  if (state.s2 && base > 0) return Math.ceil(2 * 3600 * base * 2 ** (state.academy ?? 0));
  return Math.ceil(ACADEMY_BASE_COST * ACADEMY_COST_GROWTH ** (state.academy ?? 0));
}

export function buyAcademy(state: PlayerState, now = 0, base = 0): Result<PlayerState> {
  const cost = academyCost(state, base);
  if (cost > state.stone) return { ok: false, error: "Pas assez de pierre." };
  const level = state.academy ?? 0;
  // R2 : la recherche en cours et la file profitent tout de suite du nouveau niveau.
  const factor = (1 + ACADEMY_SPEED * level) / (1 + ACADEMY_SPEED * (level + 1));
  let prevOld = now;
  let prevNew = now;
  const research = (state.research ?? []).map((r) => {
    const span = Math.max(0, r.endsAt - Math.max(prevOld, now));
    prevOld = r.endsAt;
    prevNew = Math.max(prevNew, now) + Math.ceil(span * factor);
    return { ...r, endsAt: prevNew };
  });
  return { ok: true, value: { ...state, stone: state.stone - cost, academy: level + 1, research } };
}

/** R2 : annule une recherche (en cours ou en file) ; la moitié du prix revient, les suivantes avancent d'autant. */
export function cancelResearch(state: PlayerState, endsAt: number, now: number, base = 0): Result<{ state: PlayerState; refund: number }> {
  const s = settleResearch(state, now);
  const queue = s.research ?? [];
  const i = queue.findIndex((r) => r.endsAt === endsAt);
  if (i < 0) return { ok: false, error: "Cette recherche n'est plus dans la file." };
  const r = queue[i];
  const paid = r.cost ?? researchCost({ ...s, research: queue.slice(0, i) }, r.id, base);
  const refund = Math.floor(paid * RESEARCH_REFUND);
  const start = i === 0 ? now : Math.max(now, queue[i - 1].endsAt);
  const freed = Math.max(0, r.endsAt - start);
  const research = [...queue.slice(0, i), ...queue.slice(i + 1).map((q) => ({ ...q, endsAt: q.endsAt - freed }))];
  return { ok: true, value: { refund, state: { ...s, stone: s.stone + refund, research } } };
}

/**
 * Prix d'un sabotage : une part de ce qu'a coûté le niveau d'académie visé (il grimpe donc avec l'académie de la cible),
 * et au moins quelques minutes de la production du saboteur.
 */
export function sabotageCost(saboteur: PlayerState, target: PlayerState, world: WorldState, now: number): number {
  void target;
  // E4 : 10 minutes de production de base, quelle que soit la cible.
  return Math.max(saboteur.s2 ? 1 : SABOTAGE_MIN_COST, Math.ceil(spyBase(saboteur, world, now) * SABOTAGE_COST_SECONDS * (lin(saboteur, "poudre") ? LIN_SABOTAGE : 1)));
}

export type SabotageAim = "academie" | "guet";

/** E4 : réussite d'un sabotage selon l'écart de niveau d'espionnage (les tours ne comptent plus). */
export function sabotageChance(gap: number): number {
  return Math.min(SABOTAGE_MAX_SUCCESS, Math.max(SABOTAGE_MIN_SUCCESS, SABOTAGE_BASE_SUCCESS + SABOTAGE_PER_GAP * gap));
}

/** Pourquoi on ne peut pas saboter cette cible, ou null. */
export function sabotageBlocker(target: PlayerState, now: number, saboteur?: PlayerState, aim: SabotageAim = "academie"): string | null {
  if (saboteur && inCurfew(saboteur, now)) return "Tu es en couvre-feu : pas de sabotage pendant ta plage.";
  if (inCurfew(target, now)) return "Ce domaine est en couvre-feu.";
  if (target.sabotageImmuneUntil > now) return "Sa garde est sur le qui-vive après un sabotage récent.";
  if (aim === "academie" && (target.academy ?? 0) === 0 && (target.research ?? []).length === 0) return "Rien à saboter : pas d'académie ni de recherche en cours.";
  return null;
}

/** Effet d'un sabotage réussi sur la cible. */
export function applySabotage(target: PlayerState, now: number, aim: SabotageAim = "academie"): PlayerState {
  if (aim === "guet") return { ...target, blindUntil: now + BLIND_MS, sabotageImmuneUntil: now + SABOTAGE_IMMUNITY_MS };
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
