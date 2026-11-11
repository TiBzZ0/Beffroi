import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVE_WINDOW_DAYS,
  GENERATOR_IDS,
  LORD_BY_ID,
  LORD_MIN_RATE,
  LORDS,
  LORD_ARMY,
  LORD_MIN_BUDGET,
  LORD_GIFT_MAX_SHARE,
  STRONG_LORD_TOP_SHARE,
  REVENGE_MS,
  SPY_INTEL_MS,
  MAX_ALLIANCE_SIZE,
  FORTRESS_NAME,
  LORD_RATE_SCALE,
  LORD_COFFER_SECONDS,
  LORD_DEFENSE_SHARE,
  LORD_DEFENSE_FLOOR_SECONDS,
  PVP_LOOT_CAP_SECONDS,
  HALL,
  HALL_PODIUM,
  EVENT_GAP_MS,
  EVENT_DURATIONS_MS,
  EVENT_NOTICE_MS,
  EVENT_WEIGHTS,
  MERCHANT_PRICE_SECONDS,
  BANDIT_ARMY_SHARE,
  BANDIT_PRIZE_SECONDS,
  MINE_SLICE_MS,
  TREASURE_PRIZE_SECONDS,
  CONVOY_ATTACK_SHARE,
  CONVOY_PRIZE_SECONDS,
  CONVOY_WOUNDED,
  SIEGE_ATTACK_SHARE,
  SIEGE_PRIZE_SECONDS,
  SIEGE_STAGE_LOSS,
  TOURNEY_PRIZES_SECONDS,
  DAILY_QUESTS,
  UPGRADES,
  DAILY_STREAK_MAX,
  ONLINE_WINDOW_MS,
  UNITS,
  RED_MOON_RANSOM,
  WOUNDED_DEFENDER_BEATEN,
  MAX_MARCHES,
  LORD_TARGET_RADIUS,
  SPY_BAN_COUNT,
  SPY_BAN_MS,
  SPY_BAN_WINDOW_MS,
  SPY_MAX_ACTIVE,
  LORD_SPY_LEVEL,
  FEAST_GIFT_FACTOR,
  MERCHANT_OFFERS,
  type EventKind,
  type MerchantChoice,
  CARAVAN_MS,
  CARAVAN_PRIZE_SECONDS,
  CARAVAN_ESCORT_POWER,
  CARAVAN_ESCORT,
  COLOSSUS_MS,
  COLOSSUS_POWER,
  COLOSSUS_ARMY,
  COLOSSUS_BOUNTY,
  FORTRESS_WALLS,
  FORTRESS_WALLS_POWER,
  RAID_COOLDOWN_MS,
  WAR_MS,
  WAR_DELAY_MS,
  type UnitId,
  type CombatantId,
  GUARDS_PER_DOMAIN,
  COMBATANTS,
  SEASON_DAYS,
  STAGE_MIN_SIZE,
  stageHours,
  MAX_TITHE,
  NEW_PLAYER_TITHE,
  DONOR_TIER_BONUS,
  QUESTS,
  HALL_MIN_PRODUCED,
  COLOSSUS_KILL_SECONDS,
  FORTRESS_TRUCE_MS,
  FORTRESS_WALLS_START,
  FORTRESS_WALLS_STEP,
  FORTRESS_WALLS_STEP_MS,
  FORTRESS_WALLS_MAX,
  LORD_RAID_CHANCE,
  LOT_PRIME_SHARE,
  LOT_ECUS,
  MASTER_BONUSES,
  MASTER_BONUS_MS,
  MASTER_CHOICE_MS,
  type MasterBonusKind,
  WOUNDED_WINNER,
  WOUNDED_ATTACKER_BEATEN,
  STAGES,
  DEFENSE_IDS,
  UNIT_IDS,
  type GeneratorId,
  type LordDef,
  BELFRY_POS,
  FORTRESS_POS,
  LORD_POSITIONS,
  MAP_MIN_GAP,
  MAP_SIZE,
  MAP_SPAWN_RADIUS,
  mapDistance,
  type MapPos,
  HALL_FOUND_HOURS,
  HALL_SIEGE_IMMUNITY_MS,
  HALL_WALLS_SHARE,
  HALL_WING_DOWN_MS,
  HALL_TITHE_DEFAULT,
  HALL_TITHE_MAX,
  LODGE_MAX_WINGS,
  WING_IDS,
  WINGS,
  type WingId,
  MOLE_MS,
  MOLE_MAX,
  MOLE_MIN_GAP,
  COUNTER_GAP,
} from "./config";
import { banditSpot, caravanPath, caravanPos, colossusPos, fixedPlaces, pickSpawn } from "./map";
import { drawNextEvent, tourneyPodium } from "./events";
import { cleanWings, hallSpots, maxStages, placedLevels, wingBlocker, wingLevel, type Wings } from "./hall";
import { chestBonus, claimDaily, dailyDay, dailyProgress, dailyStart, openChest, rollDaily, seedOf, swapDaily, type DailyContext, type DailyCounts, type DailyState } from "./daily";
import {
  advance,
  applyClicks,
  buyGenerator,
  buyUpgrade,
  contribute,
  hasRevenge,
  lootOf,
  fuzzyArmy,
  spyCost,
  attackArmy,
  defenseArmy,
  newPlayerState,
  splitTroopLosses,
  recallReinforcements,
  sendReinforcements,
  spyRisk,
  spyTravelMs,
  type SpyMission,
  type Mole,
  type SabotageAim,
  rumorArmy,
  counterActive,
  buyCounter,
  buyRumor,
  moleCost,
  type ResearchId,

  productionPerSecond,
  catchUpBonus,
  raidArmies,
  raidBlocker,
  buyArmy,
  rateAt,
  relativeSize,
  troopsHere,
  startResearch,
  buyAcademy,
  buyFromMerchant,
  landMarch,
  mineReward,
  recallMarch,
  sendTroops,
  travelMs,
  type March,
  eventActive,
  extraSecured,
  queuedLevel,
  sabotageCost,
  sabotageChance,
  sabotageBlocker,
  applySabotage,
  RESEARCHABLE,
  rebuildRuin,
  resolveRaid,
  stageSize,
  setTithe,
  payTithe,
  openShare,
  shareSize,
  recordGift,
  type StageShare,
  type Curfew,
  inCurfew,
  setCurfew,
  scheduleVein,
  claimQuest,
  addWounded,
  woundedOf,
  fairness,
  ransomOf,
  flagQuest,
  catchVein,
  stagesDoneAt,
  type PlayerState,
  type RaidReport,
  type Result,
  type WorldState,
  armySpeedBonus,
  baseRate,
} from "./engine";
import {
  worksiteFromRow,
  worldFrom,
  type ChronicleEntry,
  type AwaySummary,
  type LotView,
  type GameAction,
  type GameSnapshot,
  type LeaderboardRow,
  type MapView,
  type IncomingView,
  type Leaderboards,
  type RivalView,
  type SeasonView,
  type WorksiteView,
  type AllianceView,
  type GarrisonAbroad,
  type InviteView,
  type FortressView,
  type WarView,
  type EventView,
  type DailyView,
  type HallPlace,
  type HallView,
  type HallCategory,
  type SeasonHall,
  type Standing,
} from "./types";
import { armyForChance, armyFromBudget, armySize, armyValue, battle, cleanArmy, estimateChance, seededRng, type Army, type Levels } from "./battle";
import { recordContribution } from "@/lib/redis";
import { notify, notifyEach, type PushMessage } from "@/lib/push";

// Toute la logique qui fait foi : charger l'état, le recalculer, appliquer l'intention
// du joueur, puis enregistrer (verrouillage optimiste, avec quelques nouvelles tentatives).
// Les seigneurs voisins jouent « paresseusement » : quand un joueur se synchronise,
// le serveur regarde si un seigneur a une action en retard et la joue.

const MAX_ATTEMPTS = 4;
/** Un seigneur ne s'en prend qu'aux joueurs vus récemment. */
const LORD_TARGET_RECENT_MS = 48 * 60 * 60 * 1000;

interface PlayerRow {
  user_id: string;
  stone: number;
  generators: Record<string, number>;
  upgrades: string[];
  total_produced: number;
  total_contributed: number;
  military?: { levels?: Record<string, number>; research?: { id: string; endsAt: number }[] | { id: string; endsAt: number } | null; academy?: number; sabotageImmuneUntil?: number; ruinImmuneUntil?: number; elanUntil?: number; tithe?: number; titheOwed?: number; titheSet?: boolean; share?: StageShare | null; donorTiers?: number; curfew?: Curfew | null; seen?: PlayerState["seen"] | null; veinAt?: number; frenzyUntil?: number; quest?: number | null; questFlags?: string[]; wounded?: Record<string, number>; healAt?: number; marches?: unknown; boostProdUntil?: number; boostSafeUntil?: number; merchantEvent?: number; daily?: unknown; dailyBoostUntil?: number; dailyBoost?: number; hallTithe?: number; spyLevel?: number; spies?: unknown; moles?: unknown; counterUntil?: number; rumor?: { mode?: string; until?: number } | null; granaryCutUntil?: number; blindUntil?: number; spyLog?: unknown } | null;
  total_clicks: number;
  last_update: string;
  last_click_at: string;
  last_seen: string;
  ruins: Record<string, number> | null;
  burned_until: string | null;
  shield_until: string | null;
  last_raid_at: string | null;
  last_raid_target: string | null;
  revenge_target: string | null;
  revenge_until: string | null;
  total_plundered: number | null;
  troops: Record<string, number> | null;
  defenses: Record<string, number> | null;
  click_strikes?: number | null;
  click_paused_until?: string | null;
  alliance_id?: number | null;
  stationed?: Record<string, Record<string, number>> | null;
  next_raid_at: string | null;
  next_contrib_at: string | null;
  version: number;
  profiles: { username: string; display_name: string | null; is_bot: boolean; ecus?: number | null } | null;
}

interface WorksiteRow {
  stage: number;
  progress: number;
  target: number;
  total: number;
  active_players: number;
  stage_completed_at: string[] | null;
}

/** Une ligne chargée : l'état du moteur plus ce qui sert à l'enregistrer. */
interface Entity {
  id: string;
  name: string;
  isLord: boolean;
  lord?: LordDef;
  version: number;
  state: PlayerState;
  lastSeen: number;
  nextRaidAt: number | null;
  nextContribAt: number | null;
  allianceId: number | null;
  /** Écus du profil (B2) : jamais remis à zéro, jamais pillés. */
  ecus: number;
}

const ms = (t: string | null | undefined) => (t ? Date.parse(t) : 0);
const iso = (t: number) => new Date(t).toISOString();

function counts(raw: Record<string, number> | null | undefined): Partial<Record<GeneratorId, number>> {
  const out: Partial<Record<GeneratorId, number>> = {};
  for (const id of GENERATOR_IDS) {
    const n = Number(raw?.[id] ?? 0);
    if (n > 0) out[id] = n;
  }
  return out;
}

function armyCounts<Id extends string>(raw: Record<string, number> | null | undefined, ids: readonly Id[]): Partial<Record<Id, number>> {
  const out: Partial<Record<Id, number>> = {};
  for (const id of ids) {
    const n = Number(raw?.[id] ?? 0);
    if (n > 0) out[id] = n;
  }
  return out;
}

function curfewMinute(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || !Number.isInteger(n) || n < 0 || n >= 1440 ? null : n;
}

function cleanCurfew(c: Curfew | null | undefined): Curfew {
  if (!c) return { start: null };
  const next = c.next && Number.isFinite(Number(c.next.from)) ? { start: curfewMinute(c.next.start), from: Number(c.next.from) } : null;
  return next ? { start: curfewMinute(c.start), next } : { start: curfewMinute(c.start) };
}

function toEntity(row: PlayerRow): Entity {
  const lord = LORD_BY_ID.get(row.user_id);
  return {
    id: row.user_id,
    name: lord?.name ?? row.profiles?.display_name ?? row.profiles?.username ?? "Inconnu",
    isLord: !!lord || !!row.profiles?.is_bot,
    lord,
    version: row.version,
    ecus: Number(row.profiles?.ecus ?? 0),
    lastSeen: ms(row.last_seen),
    nextRaidAt: row.next_raid_at ? ms(row.next_raid_at) : null,
    nextContribAt: row.next_contrib_at ? ms(row.next_contrib_at) : null,
    allianceId: row.alliance_id ?? null,
    state: {
      stone: Number(row.stone),
      generators: counts(row.generators),
      upgrades: Array.isArray(row.upgrades) ? row.upgrades : [],
      totalProduced: Number(row.total_produced),
      totalContributed: Number(row.total_contributed),
      totalClicks: Number(row.total_clicks),
      lastUpdate: ms(row.last_update),
      lastClickAt: ms(row.last_click_at),
      ruins: counts(row.ruins),
      burnedUntil: ms(row.burned_until),
      shieldUntil: ms(row.shield_until),
      lastRaidAt: ms(row.last_raid_at),
      lastRaidTarget: row.last_raid_target,
      revengeTarget: row.revenge_target,
      revengeUntil: ms(row.revenge_until),
      totalPlundered: Number(row.total_plundered ?? 0),
      troops: armyCounts(row.troops, UNIT_IDS),
      defenses: armyCounts(row.defenses, DEFENSE_IDS),
      clickStrikes: Number(row.click_strikes ?? 0),
      clickPausedUntil: ms(row.click_paused_until),
      stationed: Object.fromEntries(
        Object.entries(row.stationed ?? {})
          .map(([owner, group]) => [owner, armyCounts(group, UNIT_IDS)] as const)
          .filter(([, g]) => Object.keys(g).length > 0),
      ),
      levels: armyCounts(row.military?.levels ?? {}, [...UNIT_IDS, ...DEFENSE_IDS]),
      // Anciennes lignes : une seule recherche (objet) au lieu d'une file.
      research: [row.military?.research ?? []].flat().map((r) => ({ id: r.id as ResearchId, endsAt: Number(r.endsAt) })),
      spyLevel: Math.max(0, Math.floor(Number(row.military?.spyLevel ?? 0) || 0)),
      spies: cleanSpies(row.military?.spies),
      moles: cleanMoles(row.military?.moles),
      counterUntil: Number(row.military?.counterUntil ?? 0) || 0,
      rumor: row.military?.rumor && (row.military.rumor.mode === "fort" || row.military.rumor.mode === "faible") ? { mode: row.military.rumor.mode, until: Number(row.military.rumor.until) || 0 } : null,
      granaryCutUntil: Number(row.military?.granaryCutUntil ?? 0) || 0,
      blindUntil: Number(row.military?.blindUntil ?? 0) || 0,
      spyLog: Array.isArray(row.military?.spyLog) ? (row.military.spyLog as { at?: unknown; text?: unknown }[]).filter((x) => x && typeof x.text === "string").slice(-SPY_LOG_MAX).map((x) => ({ at: Number(x.at) || 0, text: String(x.text) })) : [],
      academy: Number(row.military?.academy ?? 0),
      sabotageImmuneUntil: Number(row.military?.sabotageImmuneUntil ?? 0),
      ruinImmuneUntil: Number(row.military?.ruinImmuneUntil ?? 0),
      elanUntil: Number(row.military?.elanUntil ?? 0),
      tithe: Math.min(MAX_TITHE, Math.max(0, Number(row.military?.tithe ?? 0) || 0)),
      titheOwed: Math.max(0, Number(row.military?.titheOwed ?? 0) || 0),
      titheSet: row.military?.titheSet === true,
      share: row.military?.share && Number.isFinite(Number(row.military.share.size))
        ? { stage: Number(row.military.share.stage), size: Number(row.military.share.size), given: Number(row.military.share.given ?? 0), tiers: Number(row.military.share.tiers ?? 0) }
        : null,
      donorTiers: Math.max(0, Math.floor(Number(row.military?.donorTiers ?? 0) || 0)),
      curfew: cleanCurfew(row.military?.curfew),
      veinAt: Number(row.military?.veinAt ?? 0) || 0,
      frenzyUntil: Number(row.military?.frenzyUntil ?? 0) || 0,
      quest: Number.isInteger(row.military?.quest) ? Number(row.military?.quest) : null,
      questFlags: Array.isArray(row.military?.questFlags) ? row.military.questFlags.map(String) : [],
      wounded: armyCounts(row.military?.wounded ?? {}, UNIT_IDS),
      healAt: Number(row.military?.healAt ?? 0) || 0,
      marches: cleanMarches(row.military?.marches),
      boostProdUntil: Number(row.military?.boostProdUntil ?? 0) || 0,
      boostSafeUntil: Number(row.military?.boostSafeUntil ?? 0) || 0,
      merchantEvent: Number(row.military?.merchantEvent ?? 0) || 0,
      daily: cleanDaily(row.military?.daily),
      dailyBoostUntil: Number(row.military?.dailyBoostUntil ?? 0) || 0,
      dailyBoost: Number(row.military?.dailyBoost ?? 0) || 0,
      hallTithe: row.military?.hallTithe === undefined ? HALL_TITHE_DEFAULT : Math.min(HALL_TITHE_MAX, Math.max(0, Number(row.military.hallTithe) || 0)),
      eventMods: currentEventMods,
      ...(row.military?.seen ? { seen: { produced: Number(row.military.seen.produced ?? 0), contributed: Number(row.military.seen.contributed ?? 0), levels: armyCounts(row.military.seen.levels ?? {}, [...UNIT_IDS, ...DEFENSE_IDS]) } } : {}),
    },
  };
}

function toJson(e: Entity, state: PlayerState, extra: Record<string, unknown> = {}) {
  return {
    user_id: e.id,
    version: e.version,
    stone: state.stone,
    generators: state.generators,
    upgrades: state.upgrades,
    total_produced: state.totalProduced,
    total_contributed: state.totalContributed,
    total_clicks: state.totalClicks,
    last_update: iso(state.lastUpdate),
    last_click_at: iso(state.lastClickAt),
    ruins: state.ruins,
    burned_until: iso(state.burnedUntil),
    shield_until: iso(state.shieldUntil),
    last_raid_at: iso(state.lastRaidAt),
    last_raid_target: state.lastRaidTarget,
    revenge_target: state.revengeTarget,
    revenge_until: iso(state.revengeUntil),
    total_plundered: state.totalPlundered,
    troops: state.troops,
    defenses: state.defenses,
    stationed: state.stationed,
    military: { levels: state.levels, research: state.research, academy: state.academy, sabotageImmuneUntil: state.sabotageImmuneUntil, ruinImmuneUntil: state.ruinImmuneUntil, elanUntil: state.elanUntil, tithe: state.tithe, titheOwed: state.titheOwed, titheSet: state.titheSet, share: state.share, donorTiers: state.donorTiers, curfew: state.curfew, seen: state.seen ?? null, veinAt: state.veinAt, frenzyUntil: state.frenzyUntil, quest: state.quest, questFlags: state.questFlags, wounded: state.wounded, healAt: state.healAt, marches: state.marches ?? [], boostProdUntil: state.boostProdUntil, boostSafeUntil: state.boostSafeUntil, merchantEvent: state.merchantEvent, daily: state.daily ?? null, dailyBoostUntil: state.dailyBoostUntil, dailyBoost: state.dailyBoost, hallTithe: state.hallTithe, spyLevel: state.spyLevel ?? 0, spies: state.spies ?? [], moles: state.moles ?? [], counterUntil: state.counterUntil ?? 0, rumor: state.rumor ?? null, granaryCutUntil: state.granaryCutUntil ?? 0, blindUntil: state.blindUntil ?? 0, spyLog: (state.spyLog ?? []).slice(-SPY_LOG_MAX) },
    click_strikes: state.clickStrikes,
    click_paused_until: iso(state.clickPausedUntil),
    ...extra,
  };
}

function toSeason(row: { id: number; number: number; starts_at: string; ends_at: string }): SeasonView {
  return { id: row.id, number: row.number, startsAt: Date.parse(row.starts_at), endsAt: Date.parse(row.ends_at) };
}

/** Saison en cours, gardée en mémoire 30 s (tant qu'elle n'est pas finie) pour économiser un aller-retour par action. */
let seasonCache: { season: SeasonView; until: number } | null = null;

export async function getActiveSeason(admin: SupabaseClient): Promise<SeasonView> {
  const now = Date.now();
  if (seasonCache && seasonCache.until > now) return seasonCache.season;
  const { data, error } = await admin.rpc("ensure_active_season", { p_days: SEASON_DAYS, p_first_stage_base: STAGE_MIN_SIZE });
  if (error || !data) throw new Error(`Saison introuvable : ${error?.message}`);
  const season = toSeason(Array.isArray(data) ? data[0] : data);
  seasonCache = { season, until: Math.min(now + 30_000, season.endsAt) };
  return season;
}

async function loadWorksite(admin: SupabaseClient, seasonId: number): Promise<WorksiteView> {
  const { data, error } = await admin.from("worksites").select("*").eq("season_id", seasonId).single();
  if (error || !data) throw new Error(`Chantier introuvable : ${error?.message}`);
  return worksiteFromRow(data as WorksiteRow);
}

/** Charge tous les participants de la saison (au plus une dizaine de joueurs et 3 seigneurs). */
async function loadEntities(admin: SupabaseClient, seasonId: number, userId: string): Promise<Map<string, Entity>> {
  const select = () =>
    admin.from("player_states").select("*, profiles(username, display_name, is_bot, ecus)").eq("season_id", seasonId);
  const fortP = admin.from("fortresses").select("holder").eq("season_id", seasonId).maybeSingle();
  const lotsP = admin.from("stage_lots").select("*").eq("season_id", seasonId);
  const guildsP = loadGuilds(admin, seasonId);
  let { data, error } = await select();
  if (error) throw new Error(`Joueurs introuvables : ${error.message}`);
  const present = new Set((data ?? []).map((r) => (r as PlayerRow).user_id));
  const missing = [userId, ...LORDS.map((l) => l.id)].filter((id) => !present.has(id));
  if (missing.length > 0) {
    const now = iso(Date.now());
    // Nouveau compte : aucune saison jouée avant celle-ci. Il a l'accueil guidé.
    const { count: earlier } = missing.includes(userId)
      ? await admin.from("player_states").select("user_id", { count: "exact", head: true }).eq("user_id", userId).neq("season_id", seasonId)
      : { count: 1 };
    await admin.from("player_states").upsert(
      missing.map((id) => ({
        user_id: id, season_id: seasonId, last_update: now, last_click_at: now, last_seen: now,
        // Un nouveau compte démarre avec une dîme de 5 % (les seigneurs n'en versent pas).
        ...(LORDS.some((l) => l.id === id) ? {} : { military: { tithe: NEW_PLAYER_TITHE, titheSet: true, ...(id === userId && !earlier ? { quest: 0 } : {}) } }),
      })),
      { onConflict: "user_id,season_id", ignoreDuplicates: true },
    );
    ({ data, error } = await select());
    if (error) throw new Error(`Joueurs introuvables : ${error.message}`);
  }
  const entities = new Map((data as PlayerRow[]).map((r) => [r.user_id, toEntity(r)]));
  // L'alliance qui tient la forteresse profite de son bonus de production.
  const { data: fort } = await fortP;
  const holder = (fort?.holder as number | null | undefined) ?? null;
  if (holder !== null) for (const e of entities.values()) if (e.allianceId === holder) e.state = { ...e.state, fortress: true };
  // Coup de pouce aux joueurs très distancés par le premier.
  const humans = [...entities.values()].filter((e) => !e.isLord);
  const leader = Math.max(0, ...humans.map((e) => e.state.totalProduced));
  for (const e of humans) {
    const catchUp = catchUpBonus(e.state.totalProduced, leader);
    if (catchUp > 0) e.state = { ...e.state, catchUp };
  }
  // Les seigneurs suivent les améliorations des joueurs (niveau médian de chaque type).
  const levels = medianLevels(entities);
  for (const e of entities.values()) if (e.isLord) e.state = { ...e.state, levels, research: [] };
  // Lots du chantier : prime de lot et bonus du maître d'œuvre (D2, D3).
  const { data: lotRows } = await lotsP;
  const lots = ((lotRows ?? []) as LotRow[]).map(lotFromRow);
  applyLotBonuses(entities, lots, Date.now());
  lotsOf.set(entities, lots);
  // Halle de guilde : les ailes profitent aux membres présents (ou au joueur seul et sa loge).
  const guilds = await guildsP;
  guildsOf.set(entities, guilds);
  for (const e of entities.values()) {
    const g = e.isLord ? undefined : guildOf(e, guilds);
    if (g) e.state = { ...e.state, hall: activeWings(g, Date.now()) };
  }
  return entities;
}

// ---------------------------------------------------------------------------
// Lots du chantier (D1 à D4)
// ---------------------------------------------------------------------------

interface LotRow {
  stage: number;
  owner: string;
  alliance_id: number | null;
  user_id: string | null;
  target: number;
  progress: number;
  members: Record<string, { share: number; given: number }>;
  closes_at: string | null;
  finished_at: string | null;
  master: boolean;
  master_choice: string | null;
  master_from: string | null;
}

interface Lot {
  stage: number;
  owner: string;
  allianceId: number | null;
  userId: string | null;
  target: number;
  progress: number;
  members: Record<string, { share: number; given: number }>;
  closesAt: number | null;
  finishedAt: number | null;
  master: boolean;
  masterChoice: MasterBonusKind | null;
  masterFrom: number | null;
}

function lotFromRow(r: LotRow): Lot {
  const choice = r.master_choice && r.master_choice in MASTER_BONUSES ? (r.master_choice as MasterBonusKind) : null;
  return {
    stage: Number(r.stage),
    owner: r.owner,
    allianceId: r.alliance_id === null ? null : Number(r.alliance_id),
    userId: r.user_id,
    target: Number(r.target),
    progress: Number(r.progress),
    members: r.members ?? {},
    closesAt: r.closes_at ? ms(r.closes_at) : null,
    finishedAt: r.finished_at ? ms(r.finished_at) : null,
    master: !!r.master,
    masterChoice: choice,
    masterFrom: r.master_from ? ms(r.master_from) : null,
  };
}

/** Lots chargés avec les participants (même requête). */
const lotsOf = new WeakMap<Map<string, Entity>, Lot[]>();

/** Bonus effectif du maître d'œuvre : le choix, ou la production au bout d'une heure sans choix. */
function masterBonusOf(l: Lot, now: number): { kind: MasterBonusKind; from: number; until: number } | null {
  if (!l.master || l.finishedAt === null) return null;
  const kind = l.masterChoice ?? (now >= l.finishedAt + MASTER_CHOICE_MS ? "production" : null);
  if (!kind) return null;
  const from = l.masterFrom ?? l.finishedAt + MASTER_CHOICE_MS;
  return { kind, from, until: from + MASTER_BONUS_MS };
}

function applyLotBonuses(entities: Map<string, Entity>, lots: Lot[], now: number) {
  for (const l of lots) {
    if (l.finishedAt === null) continue;
    const bonus = masterBonusOf(l, now);
    for (const [uid, m] of Object.entries(l.members)) {
      const e = entities.get(uid);
      if (!e || e.isLord) continue;
      let state = e.state;
      if (m.given >= LOT_PRIME_SHARE * m.share) state = { ...state, lotBonusUntilStage: Math.max(state.lotBonusUntilStage ?? 0, l.stage + 2) };
      if (bonus && bonus.until > now && (!state.masterBonus || state.masterBonus.until < bonus.until)) state = { ...state, masterBonus: bonus };
      e.state = state;
    }
  }
}

function lotOwnerOf(e: Entity): string {
  return e.allianceId !== null ? `a:${e.allianceId}` : `p:${e.id}`;
}

/**
 * À l'ouverture d'une étape, chaque alliance (ou joueur seul) reçoit un lot égal à la somme des parts
 * de ses membres actifs, mesurées tout de suite. Un joueur qui arrive en cours d'étape rejoint le lot de son alliance.
 * Renvoie true si quelque chose a été créé.
 */
async function ensureLots(admin: SupabaseClient, seasonId: number, worksite: WorksiteView, entities: Map<string, Entity>, me: Entity, world: WorldState, now: number): Promise<boolean> {
  if (worksite.stage >= STAGES.length) return false;
  const lots = (lotsOf.get(entities) ?? []).filter((l) => l.stage === worksite.stage);
  const inLot = new Set(lots.flatMap((l) => Object.keys(l.members)));
  const joiners = lots.length === 0 ? activeHumans(entities, now) : me.isLord || inLot.has(me.id) ? [] : [me];
  if (joiners.length === 0) return false;
  await Promise.all(
    joiners.map((e) =>
      admin.rpc("join_lot", {
        p_season: seasonId,
        p_stage: worksite.stage,
        p_owner: lotOwnerOf(e),
        p_alliance: e.allianceId,
        p_user: e.id,
        p_share: shareSize(advance(e.state, now, world), world, now, worksite.stage),
      }),
    ),
  );
  return true;
}

/** Ce que le joueur voit des lots : ceux de l'étape en cours, et ceux de l'étape d'avant encore ouverts. */
function lotsView(lots: Lot[], me: Entity, entities: Map<string, Entity>, allianceNames: Map<number, string>, stage: number, now: number): LotView[] {
  return lots
    .filter((l) => l.stage === stage || (l.stage === stage - 1 && l.finishedAt === null && (l.closesAt ?? 0) > now))
    .map((l) => {
      const mine = l.members[me.id];
      const bonus = masterBonusOf(l, now);
      return {
        stage: l.stage,
        owner: l.owner,
        name: l.allianceId !== null ? (allianceNames.get(l.allianceId) ?? "Alliance") : (entities.get(l.userId ?? "")?.name ?? "Joueur"),
        solo: l.allianceId === null,
        target: l.target,
        progress: l.progress,
        members: Object.keys(l.members).length,
        finishedAt: l.finishedAt,
        closesAt: l.closesAt,
        master: l.master,
        masterChoice: bonus?.kind ?? null,
        masterUntil: bonus?.until ?? null,
        canChoose: l.master && !!mine && l.masterChoice === null && l.finishedAt !== null && now < l.finishedAt + MASTER_CHOICE_MS,
        mine: !!mine,
        myShare: mine?.share,
        myGiven: mine?.given,
      };
    })
    .sort((a, b) => b.stage - a.stage || Number(b.mine) - Number(a.mine) || b.progress / b.target - a.progress / a.target);
}

/** B6 : récompenses versées une fois quand une étape s'achève (écus du beffroi légendaire). */
async function stageRewards(admin: SupabaseClient, seasonId: number, before: number, after: number) {
  for (let i = before; i < Math.min(after, STAGES.length); i++) {
    const ecus = STAGES[i].bonus.donorEcus ?? 0;
    if (ecus > 0) await admin.rpc("reward_donors", { p_season: seasonId, p_amount: ecus });
  }
}

/** B10 : heure (UTC) à partir de laquelle part le résumé quotidien. */
const DAILY_SUMMARY_HOUR_UTC = 18;
let dailyChecked = "";

/**
 * B10 : résumé quotidien, envoyé une fois par jour aux joueurs qui ont activé les notifications.
 * La première requête après 18 h UTC le réserve (une seule y parvient) puis l'envoie après la réponse.
 */
async function maybeDailySummary(admin: SupabaseClient, seasonId: number, entities: Map<string, Entity>, worksite: WorksiteView, now: number) {
  if (new Date(now).getUTCHours() < DAILY_SUMMARY_HOUR_UTC) return;
  const today = new Date(now).toISOString().slice(0, 10);
  // Chaque serveur ne tente sa chance qu'une fois par jour.
  if (dailyChecked === today) return;
  dailyChecked = today;
  await admin.from("app_secrets").upsert({ key: "daily_summary", value: "" }, { onConflict: "key", ignoreDuplicates: true });
  const { data: claimed } = await admin.from("app_secrets").update({ value: today }).eq("key", "daily_summary").lt("value", today).select("key");
  if (!claimed || claimed.length === 0) return;
  // B12 : production du jour de chaque joueur (hors bonus passagers), pour la meilleure progression.
  const world = worldFrom(worksite);
  const rates = [...entities.values()]
    .filter((e) => !e.isLord)
    .map((e) => ({ season_id: seasonId, user_id: e.id, day: today, rate: productionPerSecond(advance(e.state, now, world), world, stagesDoneAt(world, now)) }));
  if (rates.length) await admin.from("rate_history").upsert(rates, { onConflict: "season_id,user_id,day", ignoreDuplicates: true });
  const [{ data: subs }, { data: raids }] = await Promise.all([
    admin.from("push_subscriptions").select("user_id"),
    admin.from("chronicle").select("actor_id, target_id, details").eq("season_id", seasonId).eq("kind", "raid").gt("created_at", iso(now - 86_400_000)),
  ]);
  const ids = new Set((subs ?? []).map((r) => r.user_id as string));
  const lots = lotsOf.get(entities) ?? [];
  const stagePct = worksite.stage < STAGES.length ? Math.floor((worksite.progress / Math.max(1, worksite.target)) * 100) : 100;
  const messages = new Map<string, PushMessage>();
  for (const id of ids) {
    const e = entities.get(id);
    if (!e || e.isLord) continue;
    const mine = (raids ?? []).filter((r) => r.target_id === id);
    const lost = mine.filter((r) => (r.details as { success?: boolean }).success);
    const stolen = lost.reduce((a, r) => a + Number((r.details as { stolen?: number }).stolen ?? 0), 0);
    const won = (raids ?? []).filter((r) => r.actor_id === id && (r.details as { success?: boolean }).success).length;
    const lot = lots.find((l) => l.stage === worksite.stage && l.members[id]);
    const parts = [
      lost.length ? `${lost.length} raid${lost.length > 1 ? "s" : ""} subi${lost.length > 1 ? "s" : ""} (${Math.floor(stolen).toLocaleString("fr-FR")} pierres)` : "aucun raid réussi contre toi",
      mine.length - lost.length > 0 ? `${mine.length - lost.length} repoussé${mine.length - lost.length > 1 ? "s" : ""}` : null,
      won ? `${won} pillage${won > 1 ? "s" : ""} réussi${won > 1 ? "s" : ""}` : null,
      worksite.stage < STAGES.length ? `chantier à ${stagePct} %${lot ? `, ton lot à ${Math.floor((lot.progress / Math.max(1, lot.target)) * 100)} %` : ""}` : "beffroi achevé",
    ].filter(Boolean);
    messages.set(id, { title: "📜 Ta journée à Beffroi", body: `Dernières 24 h : ${parts.join(", ")}.`, tag: "daily" });
  }
  notifyEach(admin, messages);
}

/** Verse un don aux lots du joueur ; annonce un lot fini et le maître d'œuvre. */
async function giveToLots(admin: SupabaseClient, seasonId: number, me: Entity, stage: number, amount: number, entities: Map<string, Entity>, allianceNames: Map<number, string>): Promise<string | null> {
  let message: string | null = null;
  for (const st of [stage, stage - 1]) {
    if (st < 0) continue;
    const { data } = await admin.rpc("add_to_lot", { p_season: seasonId, p_stage: st, p_user: me.id, p_amount: amount, p_lot_bonus_ecus: LOT_ECUS });
    const r = data as { owner: string; finished: boolean; master: boolean } | null;
    if (!r?.finished) continue;
    const lot = (lotsOf.get(entities) ?? []).find((l) => l.stage === st && l.owner === r.owner);
    const name = me.allianceId !== null && r.owner === `a:${me.allianceId}` ? (allianceNames.get(me.allianceId) ?? "Ton alliance") : me.name;
    await addChronicle(admin, seasonId, { kind: "lot", actor_id: me.id, details: { stage: st, name, master: r.master } });
    const members = Object.keys(lot?.members ?? { [me.id]: null }).filter((id) => id !== me.id);
    if (members.length) {
      notify(admin, members, {
        title: r.master ? "👑 Maître d'œuvre !" : "🏗️ Lot fini",
        body: r.master ? `Votre lot de « ${STAGES[st]?.name} » est le premier fini. Choisissez votre bonus dans l'onglet du chantier.` : `Votre lot de « ${STAGES[st]?.name} » est fini.`,
        tag: "lot",
      });
    }
    message = r.master
      ? `👑 Lot fini, et le premier de l'étape : maître d'œuvre ! Choisis le bonus de 24 h dans l'onglet du chantier.`
      : `🏗️ Lot fini ! Ceux qui ont versé au moins 25 % de leur part gagnent +10 % de production jusqu'à la fin de l'étape suivante et ${LOT_ECUS} écus.`;
  }
  return message;
}

/** Maître d'œuvre de chaque étape : nom du premier lot fini. */
function mastersView(lots: Lot[], entities: Map<string, Entity>, allianceNames: Map<number, string>): Record<number, string> {
  const out: Record<number, string> = {};
  for (const l of lots) if (l.master) out[l.stage] = l.allianceId !== null ? (allianceNames.get(l.allianceId) ?? "Alliance") : (entities.get(l.userId ?? "")?.name ?? "Joueur");
  return out;
}

/** Niveau médian de chaque type chez les vrais joueurs : celui des seigneurs, de la garnison neutre et des événements. */
function medianLevels(entities: Map<string, Entity>): Levels {
  const humans = [...entities.values()].filter((e) => !e.isLord);
  const out: Levels = {};
  for (const id of RESEARCHABLE) {
    const m = Math.floor(median(humans.map((e) => e.state.levels?.[id] ?? 0)));
    if (m > 0) out[id] = m;
  }
  return out;
}

/** Taille d'un domaine pour la règle des cibles trop petites : valeur de l'armée (troupes et fortifications) et production. */
function sizeOf(state: PlayerState, rate: number): { army: number; rate: number } {
  return { army: armyValue(cleanArmy({ ...troopsHere(state), ...state.defenses })), rate };
}

/** T4 : taille d'un attaquant, toute son armée comptée (domaine, routes, renforts postés chez ses alliés) pour qu'un petit détachement ne lève pas l'interdiction. */
function attackerSizeOf(id: string, state: PlayerState, entities: Map<string, Entity>, rate: number): { army: number; rate: number } {
  const home = sizeOf(state, rate).army;
  const roads = (state.marches ?? []).reduce((a, m) => a + armyValue(m.troops), 0);
  const abroad = [...entities.values()].reduce((a, e) => (e.id === id ? a : a + armyValue((e.state.stationed?.[id] ?? {}) as Army)), 0);
  return { army: home + roads + abroad, rate };
}

/** Taille des étapes passée au chantier : seule compte celle de l'étape qui s'ouvre (audit A9). */
let stageSizes: number[] = STAGES.map(() => STAGE_MIN_SIZE);

function activeHumans(entities: Map<string, Entity>, now: number): Entity[] {
  return [...entities.values()].filter((e) => !e.isLord && now - e.lastSeen < ACTIVE_WINDOW_DAYS * 86_400_000);
}

/** Production de base d'un seigneur : médiane des vrais joueurs × son caractère. */
function lordRates(entities: Map<string, Entity>, world: WorldState, now: number): Map<string, number> {
  // Joueurs actifs : vus dans la fenêtre d'activité du chantier.
  const rates = activeHumans(entities, now).map((e) => productionPerSecond(e.state, world, stagesDoneAt(world, now))).sort((a, b) => a - b);
  // Au passage, on retient la taille d'une étape qui s'ouvrirait maintenant.
  stageSizes = STAGES.map((_, i) => stageSize(rates, stageHours(i)));
  const mid = median(rates);
  // Les seigneurs faciles suivent le quart le plus faible des joueurs, pour que les petits aient une cible.
  const low = rates.length === 0 ? 0 : rates[Math.floor((rates.length - 1) * 0.25)];
  const out = new Map<string, number>();
  for (const l of LORDS) out.set(l.id, Math.max(LORD_MIN_RATE, l.difficulty === 1 ? low : mid) * l.rateFactor * LORD_RATE_SCALE);
  return out;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return 0;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

/** Valeur des troupes de chaque vrai joueur. */
function humanArmies(entities: Map<string, Entity>): number[] {
  return [...entities.values()].filter((e) => !e.isLord).map((e) => armyValue(cleanArmy({ ...e.state.troops })));
}

/** Valeur médiane des troupes des vrais joueurs : l'étalon de la forteresse et des seigneurs faciles. */
function troopBudget(entities: Map<string, Entity>): number {
  return Math.max(LORD_MIN_BUDGET, median(humanArmies(entities)));
}

/**
 * Étalon de chaque niveau de seigneur :
 * - faciles : médiane de tous les joueurs (les petits peuvent toujours piller) ;
 * - moyens : médiane des seuls joueurs qui ont une armée ;
 * - difficiles et redoutables : au moins une part de l'armée du plus fort, pour rester une menace.
 */
function lordBudgets(entities: Map<string, Entity>): Record<1 | 2 | 3 | 4, number> {
  const all = humanArmies(entities);
  const easy = Math.max(LORD_MIN_BUDGET, median(all));
  const medium = Math.max(easy, median(all.filter((v) => v > 0)));
  const strong = Math.max(medium, Math.max(0, ...all) * STRONG_LORD_TOP_SHARE);
  return { 1: easy, 2: medium, 3: strong, 4: strong };
}

/** Armée des seigneurs : elle suit les vrais joueurs, selon leur niveau et leur caractère. */
/**
 * Armées des seigneurs. L'attaque (leurs raids) suit les armées des joueurs.
 * La défense vaut une part de leur coffre selon leur niveau (au moins la même part de 2 h de production),
 * pour qu'un raid gagné rapporte à la mesure de ce qu'il coûte.
 */
function lordArmies(entities: Map<string, Entity>, world?: WorldState, now?: number, flat?: Map<string, number>): Map<string, { attack: Army; defense: Army }> {
  const budgets = lordBudgets(entities);
  const out = new Map<string, { attack: Army; defense: Army }>();
  for (const l of LORDS) {
    const taste = LORD_ARMY[l.key];
    const total = budgets[l.difficulty] * taste.power;
    const attack = armyFromBudget(total * taste.troopShare, taste.troops);
    const e = entities.get(l.id);
    let defenseBudget = total;
    if (e && world && now !== undefined && flat) {
      const rate = flat.get(l.id) ?? LORD_MIN_RATE;
      const coffer = advanceEntity(e, now, world, flat).stone;
      const share = LORD_DEFENSE_SHARE[l.difficulty];
      defenseBudget = Math.max(LORD_MIN_BUDGET, share * Math.max(coffer, rate * LORD_DEFENSE_FLOOR_SECONDS));
    }
    const troops = armyFromBudget(defenseBudget * taste.troopShare, taste.troops);
    const forts = armyFromBudget(defenseBudget * (1 - taste.troopShare), taste.forts);
    out.set(l.id, { attack, defense: { ...troops, ...forts, garde: GUARDS_PER_DOMAIN } });
  }
  return out;
}

function advanceEntity(e: Entity, now: number, world: WorldState, flat: Map<string, number>): PlayerState {
  if (!e.isLord) return advance(e.state, now, world);
  // Coffre d'un seigneur plafonné à 12 h de sa production.
  const rate = flat.get(e.id) ?? LORD_MIN_RATE;
  const s = advance(e.state, now, world, { flatRate: rate });
  const cap = rate * LORD_COFFER_SECONDS;
  return s.stone > cap ? { ...s, stone: cap } : s;
}

function currentRate(e: Entity, state: PlayerState, now: number, world: WorldState, flat: Map<string, number>): number {
  return rateAt(state, world, now, e.isLord ? { flatRate: flat.get(e.id) ?? LORD_MIN_RATE } : {});
}

function jitter(hours: number): number {
  return hours * 3_600_000 * (0.7 + Math.random() * 0.6);
}

async function addChronicle(admin: SupabaseClient, seasonId: number, entry: { kind: string; actor_id: string; target_id?: string | null; details: Record<string, unknown> }) {
  await admin.from("chronicle").insert({ season_id: seasonId, ...entry });
}

/** Les seigneurs jouent les actions qu'ils ont en retard. Renvoie true si quelque chose a changé. */
async function tickLords(admin: SupabaseClient, season: SeasonView, entities: Map<string, Entity>, worksite: WorksiteView, now: number): Promise<boolean> {
  const world = worldFrom(worksite);
  const flat = lordRates(entities, world, now);
  const armies = lordArmies(entities);
  let changed = false;

  for (const lord of LORDS) {
    const me = entities.get(lord.id);
    if (!me) continue;
    const state = advanceEntity(me, now, world, flat);

    // Première visite de la saison : on planifie ses actions.
    if (me.nextRaidAt === null && me.nextContribAt === null) {
      const extra = {
        next_raid_at: lord.raidEveryHours ? iso(now + jitter(lord.raidEveryHours)) : iso(now + 365 * 86_400_000),
        next_contrib_at: lord.contribution ? iso(now + jitter(lord.contribution.everyHours)) : iso(now + 365 * 86_400_000),
      };
      await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, state, extra), p_touch: false, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
      changed = true;
      continue;
    }

    // Don au chantier (Prieure d'Aubeval).
    if (lord.contribution && me.nextContribAt !== null && me.nextContribAt <= now) {
      // Jamais plus d'un quart de l'étape en cours, et rien une fois le beffroi achevé.
      const room = worksite.stage < STAGES.length ? worksite.target * LORD_GIFT_MAX_SHARE : 0;
      const amount = Math.floor(Math.min(state.stone * lord.contribution.share, room));
      const r = amount >= 1 ? contribute(state, amount) : null;
      const next = r?.ok ? r.value : state;
      const { data } = await admin.rpc("commit_state", {
        p_season: season.id,
        p_state: toJson(me, next, { next_contrib_at: iso(now + jitter(lord.contribution.everyHours)) }),
        p_touch: false,
        p_contribution: r?.ok ? amount : 0,
        p_stage_bases: stageSizes,
        p_active_window_days: ACTIVE_WINDOW_DAYS,
        p_action: r?.ok ? "contribute" : null,
        p_details: r?.ok ? { amount } : null,
      });
      if ((data as { ok?: boolean } | null)?.ok && r?.ok) {
        await addChronicle(admin, season.id, { kind: "gift", actor_id: lord.id, details: { amount } });
        const after = (data as { worksite?: WorksiteRow }).worksite;
        if (after) await stageRewards(admin, season.id, worksite.stage, Number(after.stage));
      }
      changed = true;
      continue; // une action par visite
    }

    // Raid. Les seigneurs les plus forts ne frappent que ceux qui les ont attaqués.
    if (lord.raidEveryHours && me.nextRaidAt !== null && me.nextRaidAt <= now) {
      const nextRaid = { next_raid_at: iso(now + jitter(lord.raidEveryHours)) };
      const army = armies.get(lord.id)!;
      const attackers = lord.retaliateOnly ? await recentAttackers(admin, season.id, lord.id, Math.max(now - REVENGE_MS, state.lastRaidAt)) : null;
      const candidates = [...entities.values()]
        .filter((e) => !e.isLord && (attackers ? attackers.has(e.id) : now - e.lastSeen < LORD_TARGET_RECENT_MS))
        .map((e) => {
          const s = advanceEntity(e, now, world, flat);
          const rate = currentRate(e, s, now, world, flat);
          return { e, s, rate, loot: lootOf(s.stone, rate, false, { stagesDone: stagesDoneAt(world, now) }) };
        })
        .filter((c) => !raidBlocker(state, c.s, { now, attackerId: lord.id, victimId: c.e.id, victimRate: c.rate, attackerIsLord: true, allowRepeat: lord.retaliateOnly, attackerArmy: army.attack }))
        .sort((a, b) => b.loot - a.loot);
      // T6 : de préférence un joueur à moins de 8 cases ; le plus riche le plus souvent, mais pas toujours.
      const positions = await loadPositions(admin, season.id, entities);
      const home = positions.get(lord.id);
      const near = home ? candidates.filter((c) => { const p = positions.get(c.e.id); return !!p && mapDistance(home, p) <= LORD_TARGET_RADIUS; }) : [];
      const pool = near.length > 0 ? near : candidates;
      const pick = pool.length > 0 ? pool[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * pool.length)] : null;
      if (pick) {
        // A10 : l'armée du seigneur est taillée sur la défense de sa cible, pour une chance d'environ un tiers.
        const shaped = raidArmies(state, pick.s, { now, victimId: pick.e.id, attackerArmy: army.attack, stagesDone: stagesDoneAt(world, now) });
        const sized = armyForChance(army.attack, shaped.defense, LORD_RAID_CHANCE, shaped.opts);
        const ctx = { now, attackerId: lord.id, victimId: pick.e.id, victimRate: pick.rate, attackerIsLord: true, allowRepeat: lord.retaliateOnly, attackerArmy: armySize(sized) > 0 ? sized : army.attack, stagesDone: stagesDoneAt(world, now) };
        // T6 : l'armée du seigneur part de sa case, à vitesse 1 ; le combat se jouera à l'arrivée.
        if (!raidBlocker(state, pick.s, ctx) && (state.marches ?? []).length < MAX_MARCHES) {
          const from = home;
          const to = positions.get(pick.e.id);
          const outMs = travelMs({ milicien: 1 }, from && to ? mapDistance(from, to) : MAP_SPAWN_RADIUS);
          const march: March = {
            id: `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
            kind: "raid",
            target: pick.e.id,
            troops: ctx.attackerArmy,
            departAt: now,
            arriveAt: now + outMs,
            status: "out",
            returnAt: 0,
            // E6 : le défenseur voit le nom s'il a un niveau d'espionnage au moins égal à celui du seigneur.
            revealed: wingLevel(pick.s.hall, "guet") >= 2 || spyLevelOf(pick.e) >= spyLevelOf(me),
            warned: false,
            loot: 0,
            ransom: 0,
          };
          await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, { ...state, marches: [...(state.marches ?? []), march], lastRaidAt: now, lastRaidTarget: pick.e.id }, nextRaid), p_touch: false, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
          changed = true;
          continue;
        }
      }
      await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, state, nextRaid), p_touch: false, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
      changed = true;
    }
  }
  return changed;
}

/** Joueurs qui ont attaqué ce seigneur depuis `since` (réussite ou non). */
async function recentAttackers(admin: SupabaseClient, seasonId: number, lordId: string, since: number): Promise<Set<string>> {
  const { data } = await admin
    .from("chronicle")
    .select("actor_id")
    .eq("season_id", seasonId)
    .eq("kind", "raid")
    .eq("target_id", lordId)
    .gt("created_at", iso(since));
  return new Set((data ?? []).map((r) => r.actor_id as string));
}

async function loadChronicle(admin: SupabaseClient, seasonId: number, entities: Map<string, Entity>, viewer = ""): Promise<ChronicleEntry[]> {
  const { data } = await admin
    .from("chronicle")
    .select("id, kind, actor_id, target_id, details, created_at")
    .eq("season_id", seasonId)
    .order("created_at", { ascending: false })
    .limit(40);
  const name = (id: string | null) => (id ? (entities.get(id)?.name ?? "Un inconnu") : "");
  // E5 : un espion surpris sans être reconnu reste anonyme, sauf pour son maître.
  const hidden = (r: { kind: unknown; actor_id: unknown; details: unknown }) => (r.kind === "spy" || r.kind === "sabotage") && (r.details as { named?: boolean } | null)?.named === false && r.actor_id !== viewer;
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    at: Date.parse(r.created_at as string),
    kind: r.kind as ChronicleEntry["kind"],
    actorId: hidden(r) ? null : (r.actor_id as string | null),
    actorName: hidden(r) ? "Un espion inconnu" : name(r.actor_id as string | null),
    targetId: r.target_id as string | null,
    targetName: name(r.target_id as string | null),
    details: (r.details ?? {}) as ChronicleEntry["details"],
  }));
}

/** Clé des rapports d'espion portant sur la forteresse. */
const FORTRESS_INTEL = "fortress";


// ---------------------------------------------------------------------------
// Guerres d'alliances et forteresse
// ---------------------------------------------------------------------------

interface WarRow {
  id: number;
  alliance_a: number;
  alliance_b: number;
  starts_at: string;
  ends_at: string;
  score_a: number;
  score_b: number;
}

interface FortressRow {
  holder: number | null;
  capturedAt: number;
  garrison: Record<string, Record<string, number>> | null;
  version: number;
}

interface Conflicts {
  wars: WarRow[];
  fortress: FortressRow;
}

/** Clôt les guerres terminées, puis charge les guerres en cours et la forteresse. */
async function loadConflicts(admin: SupabaseClient, seasonId: number, now: number): Promise<Conflicts> {
  // Les trois lectures partent ensemble ; les guerres finies sont réglées à part (rare).
  const [{ data: ended }, { data: wars }, fortRes] = await Promise.all([
    admin.from("wars").select("id").eq("season_id", seasonId).eq("settled", false).lte("ends_at", iso(now)),
    admin.from("wars").select("*").eq("season_id", seasonId).eq("settled", false).gt("ends_at", iso(now)),
    admin.from("fortresses").select("holder, garrison, version, captured_at").eq("season_id", seasonId).maybeSingle(),
  ]);
  for (const w of ended ?? []) await admin.rpc("settle_war", { p_war: w.id });
  let fort = fortRes.data;
  if (!fort) {
    await admin.from("fortresses").upsert({ season_id: seasonId }, { onConflict: "season_id", ignoreDuplicates: true });
    ({ data: fort } = await admin.from("fortresses").select("holder, garrison, version, captured_at").eq("season_id", seasonId).maybeSingle());
  }
  return {
    wars: ((wars ?? []) as WarRow[]).map((w) => ({ ...w, id: Number(w.id), alliance_a: Number(w.alliance_a), alliance_b: Number(w.alliance_b) })),
    fortress: { holder: fort?.holder != null ? Number(fort.holder) : null, capturedAt: ms(fort?.captured_at as string | null), garrison: (fort?.garrison as FortressRow["garrison"]) ?? {}, version: Number(fort?.version ?? 0) },
  };
}

/** Guerre en cours entre deux alliances (une guerre déclarée ne commence que 2 h plus tard). */
function warBetween(wars: WarRow[], a: number | null, b: number | null, now: number): WarRow | undefined {
  if (a === null || b === null || a === b) return undefined;
  return wars.find((w) => ms(w.starts_at) <= now && ((w.alliance_a === a && w.alliance_b === b) || (w.alliance_a === b && w.alliance_b === a)));
}

function warOf(wars: WarRow[], alliance: number | null): WarRow | undefined {
  if (alliance === null) return undefined;
  return wars.find((w) => w.alliance_a === alliance || w.alliance_b === alliance);
}

function garrisonOf(f: FortressRow): PlayerState["stationed"] {
  return Object.fromEntries(
    Object.entries(f.garrison ?? {})
      .map(([owner, g]) => [owner, armyCounts(g, UNIT_IDS)] as const)
      .filter(([, g]) => Object.keys(g).length > 0),
  );
}

/**
 * Défenseurs de la forteresse. Libre, elle est gardée par une garnison neutre (murs et gardes).
 * Une fois prise, seules les troupes que les membres de l'alliance y envoient la défendent :
 * sans garnison, le premier venu la prend.
 */
/** A13 : murs d'une forteresse tenue, 25 % de leur valeur neutre à la prise, +25 % toutes les 2 h, 200 % au plus. */
export function heldWallsFactor(capturedAt: number, now: number): number {
  const held = Math.max(0, now - capturedAt);
  return Math.min(FORTRESS_WALLS_MAX, FORTRESS_WALLS_START + FORTRESS_WALLS_STEP * Math.floor(held / FORTRESS_WALLS_STEP_MS));
}

function fortressDefense(f: FortressRow, entities: Map<string, Entity>, now = Date.now()): Army {
  const neutral = troopBudget(entities) * FORTRESS_WALLS_POWER;
  const army: Army =
    f.holder === null
      ? { ...armyFromBudget(neutral, FORTRESS_WALLS), garde: GUARDS_PER_DOMAIN }
      : armyFromBudget(neutral * heldWallsFactor(f.capturedAt, now), FORTRESS_WALLS);
  for (const g of Object.values(garrisonOf(f))) {
    for (const [id, n] of Object.entries(g) as [UnitId, number][]) army[id] = (army[id] ?? 0) + n;
  }
  return army;
}

/** Niveaux des défenseurs : ceux de la garnison neutre, ou le meilleur niveau parmi les membres qui y ont posté ce type. */
function fortressLevels(f: FortressRow, entities: Map<string, Entity>): Levels {
  if (f.holder === null) return medianLevels(entities);
  const out: Levels = {};
  for (const [owner, group] of Object.entries(garrisonOf(f))) {
    const lv = entities.get(owner)?.state.levels ?? {};
    for (const id of Object.keys(group) as UnitId[]) out[id] = Math.max(out[id] ?? 0, lv[id] ?? 0);
  }
  return out;
}

function fortressBlocker(me: Entity, state: PlayerState, f: FortressRow, now: number, army?: Army): string | null {
  if (me.allianceId === null) return "Rejoins une alliance pour assiéger la forteresse.";
  if (f.holder === me.allianceId) return "Ton alliance tient déjà la forteresse.";
  if (inCurfew(state, now)) return "Tu es en couvre-feu : pas d'attaque pendant ta plage.";
  // A13 : 30 minutes sans assaut après une prise, le temps de poster une garnison.
  if (f.holder !== null && now < f.capturedAt + FORTRESS_TRUCE_MS) return `La forteresse vient de changer de mains : pas d'assaut avant ${new Date(f.capturedAt + FORTRESS_TRUCE_MS).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}.`;
  if (!army && now - state.lastRaidAt < RAID_COOLDOWN_MS) return "Tes troupes se reposent encore.";
  if (armySize(army ?? attackArmy(state)) === 0) return "Il te faut des troupes pour l'assaut.";
  return null;
}

/** Écrit l'état d'un joueur et la forteresse ensemble (version de la forteresse vérifiée). */
async function applyFortress(admin: SupabaseClient, seasonId: number, f: FortressRow, e: Entity, state: PlayerState, holder: number | null, garrison: PlayerState["stationed"], captured: boolean, act: string, details: Record<string, unknown>): Promise<"ok" | "conflict"> {
  const { data, error } = await admin.rpc("apply_fortress", { p_season: seasonId, p_state: toJson(e, state), p_version: f.version, p_holder: holder, p_garrison: garrison, p_captured: captured, p_action: act, p_details: details });
  if (error?.message.includes("beffroi_conflict") || (data as { conflict?: boolean } | null)?.conflict) return "conflict";
  if (error) throw new Error(`Forteresse : ${error.message}`);
  return "ok";
}

/** Une garnison vue comme un domaine qui n'aurait que des renforts (pour réutiliser les règles des renforts). */
function garrisonHost(f: FortressRow, now: number): PlayerState {
  return { ...newPlayerState(now), stationed: garrisonOf(f) };
}

async function runConflictAction(
  admin: SupabaseClient,
  seasonId: number,
  me: Entity,
  current: PlayerState,
  entities: Map<string, Entity>,
  conflicts: Conflicts,
  allianceNames: Map<number, string>,
  action: Extract<GameAction, { type: "war_declare" | "fortress_attack" | "fortress_station" | "fortress_recall" }>,
  now: number,
): Promise<"conflict" | { error?: string; message?: string; state?: PlayerState }> {
  const f = conflicts.fortress;
  const writeFortress = async (state: PlayerState, holder: number | null, garrison: PlayerState["stationed"], captured: boolean, act: string, details: Record<string, unknown>) => {
    const { data, error } = await admin.rpc("apply_fortress", {
      p_season: seasonId,
      p_state: toJson(me, state),
      p_version: f.version,
      p_holder: holder,
      p_garrison: garrison,
      p_captured: captured,
      p_action: act,
      p_details: details,
    });
    if (error?.message.includes("beffroi_conflict") || (data as { conflict?: boolean } | null)?.conflict) return "conflict" as const;
    if (error) throw new Error(`Forteresse : ${error.message}`);
    return "ok" as const;
  };
  switch (action.type) {
    case "war_declare": {
      const target = Number(action.alliance);
      if (me.allianceId === null) return { error: "Il faut une alliance pour déclarer la guerre." };
      if (target === me.allianceId || !allianceNames.has(target)) return { error: "Alliance inconnue." };
      if (warOf(conflicts.wars, me.allianceId)) return { error: "Ton alliance est déjà en guerre." };
      if (warOf(conflicts.wars, target)) return { error: `${allianceNames.get(target)} est déjà en guerre.` };
      const { data, error } = await admin
        .from("wars")
        .insert({ season_id: seasonId, alliance_a: me.allianceId, alliance_b: target, starts_at: iso(now + WAR_DELAY_MS), ends_at: iso(now + WAR_DELAY_MS + WAR_MS) })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Guerre impossible : ${error?.message}`);
      await addChronicle(admin, seasonId, { kind: "war", actor_id: me.id, details: { phase: "start", war: data.id, a: me.allianceId, b: target } });
      notify(admin, [...entities.values()].filter((e) => !e.isLord && e.allianceId === target).map((e) => e.id), {
        title: "⚔️ Guerre déclarée !",
        body: `${allianceNames.get(me.allianceId) ?? "Une alliance"} vous déclare la guerre : elle commence dans 2 h et dure 24 h.`,
        tag: "war",
      });
      return { message: `⚔️ Guerre déclarée à ${allianceNames.get(target)} : elle commence dans 2 h et dure 24 h. Pas de bouclier entre vous.` };
    }
    case "fortress_attack": {
      // T6 : l'assaut voyage jusqu'à la case de la forteresse ; les 30 minutes sans assaut se vérifient à l'arrivée.
      const wanted = ((action as { troops?: Record<string, number> }).troops ?? current.troops) as Army;
      const sending = sendTroops(current, wanted);
      if (!sending.ok) return { error: sending.error };
      const early = fortressBlocker(me, current, f, now, sending.value.sent);
      if (early && !early.startsWith("La forteresse vient de changer")) return { error: early };
      const outMs = await travelToFortress(admin, seasonId, entities, me.id, sending.value.sent);
      const march: March = { id: marchId(), kind: "fortress", target: "fortress", troops: sending.value.sent, departAt: now, arriveAt: now + outMs, status: "out", returnAt: 0, revealed: true, warned: true, loot: 0, ransom: 0 };
      const sent = { ...sending.value.state, marches: [...(current.marches ?? []), march], lastRaidAt: now, shieldUntil: 0 };
      if ((await writeStates(admin, seasonId, [{ e: me, state: sent }], "fortress_march", { arriveAt: march.arriveAt })) === "conflict") return "conflict";
      return { state: sent, message: `🏰 Ton armée marche sur la ${FORTRESS_NAME} : arrivée dans ${Math.round(outMs / 60_000)} min.` };
    }
    case "fortress_station": {
      if (me.allianceId === null || f.holder !== me.allianceId) return { error: "Seule l'alliance qui tient la forteresse peut y poster des troupes." };
      const sending = sendTroops(current, { [String(action.unit)]: Number(action.qty) } as Army);
      if (!sending.ok) return { error: sending.error };
      const outMs = await travelToFortress(admin, seasonId, entities, me.id, sending.value.sent);
      const march: March = { id: marchId(), kind: "station", target: "fortress", troops: sending.value.sent, departAt: now, arriveAt: now + outMs, status: "out", returnAt: 0, revealed: true, warned: true, loot: 0, ransom: 0 };
      const sent = { ...sending.value.state, marches: [...(current.marches ?? []), march] };
      if ((await writeStates(admin, seasonId, [{ e: me, state: sent }], "fortress_station", { unit: action.unit, qty: action.qty })) === "conflict") return "conflict";
      return { state: sent, message: `🏰 Garnison en route : arrivée dans ${Math.round(outMs / 60_000)} min.` };
    }
    case "fortress_recall": {
      const garrison = garrisonOf(f);
      const group = garrison[me.id];
      if (!group || Object.keys(group).length === 0) return { error: "Tu n'as pas de troupes là-bas." };
      if ((current.marches ?? []).length >= MAX_MARCHES) return { error: `${MAX_MARCHES} armées en route au plus.` };
      const outMs = await travelToFortress(admin, seasonId, entities, me.id, group as Army);
      const march: March = { id: marchId(), kind: "station", target: "fortress", troops: { ...group } as Army, departAt: now - outMs, arriveAt: now, status: "back", returnAt: now + outMs, revealed: true, warned: true, loot: 0, ransom: 0, outcome: "recalled" };
      const rest = { ...garrison };
      delete rest[me.id];
      const owner = { ...current, marches: [...(current.marches ?? []), march] };
      if ((await writeFortress(owner, f.holder, rest, false, "fortress_recall", {})) === "conflict") return "conflict";
      return { state: owner, message: `Tes troupes quittent la forteresse : retour dans ${Math.round(outMs / 60_000)} min.` };
    }
  }
}

function fortressView(me: Entity, state: PlayerState, f: FortressRow, entities: Map<string, Entity>, names: Map<number, string>, now: number, intelUntil: number | null): FortressView {
  const defense = fortressDefense(f, entities, now);
  const mine = f.holder !== null && f.holder === me.allianceId;
  const known = mine || (intelUntil !== null && intelUntil > now);
  const seen = known ? defense : fuzzyArmy(defense);
  const garrison = garrisonOf(f);
  return {
    name: FORTRESS_NAME,
    holderId: f.holder,
    holderName: f.holder !== null ? (names.get(f.holder) ?? null) : null,
    mine,
    army: seen as Record<string, number>,
    exact: known,
    intelUntil: !mine && known ? intelUntil : null,
    chance: vagueChance(estimateChance(attackArmy(state), defense, { attackerLevels: state.levels, defenderLevels: fortressLevels(f, entities) }), known),
    blocker: fortressBlocker(me, state, f, now),
    garrison: mine ? Object.entries(garrison).map(([id, troops]) => ({ id, name: entities.get(id)?.name ?? "Inconnu", troops: troops as Record<string, number> })) : [],
    myGarrison: (garrison[me.id] ?? {}) as Record<string, number>,
  };
}

// ---------------------------------------------------------------------------
// Événements : caravane marchande et colosse
// ---------------------------------------------------------------------------

/** Effets des derniers événements, recopiés dans chaque état chargé (une seule saison active à la fois). */
let currentEventMods: NonNullable<PlayerState["eventMods"]> = [];
const COMBAT_EVENTS: readonly EventKind[] = ["caravane", "colosse"];

interface EventRow {
  id: number;
  kind: EventKind;
  starts_at: string;
  ends_at: string;
  army: Army;
  army_start: Army;
  pool: number;
  prize: number;
  attackers: Record<string, number>;
  version: number;
  data: EventData;
}

/** V7 à V9 : données des événements posés sur la carte. */
interface BanditCamp {
  id: string;
  owner: string;
  pos: [number, number];
  army: Army;
  winner: string | null;
}
interface EventData {
  pos?: [number, number];
  camps?: BanditCamp[];
  holder?: { owner: string; march: string } | null;
  /** V10, V11 : armée qui attaque le convoi ou le beffroi, chemin du convoi, issue du combat commun. */
  enemy?: Army;
  path?: { from: [number, number]; to: [number, number] };
  resolved?: boolean;
  outcome?: "won" | "lost" | "left";
  /** V12 : budget commun, armées inscrites, podium. */
  budget?: number;
  entries?: Record<string, Army>;
  podium?: string[];
}
const LOCAL_EVENTS: readonly EventKind[] = ["filon", "bandits", "tresor", "convoi", "siege"];
/** V10 à V12 : événements qui se règlent d'un seul coup pour tout le monde. */
const GROUP_EVENTS: readonly EventKind[] = ["convoi", "siege", "tournoi"];

/** Moment du combat commun : mi-parcours pour le convoi, fin de l'événement sinon. */
function battleAt(e: EventRow): number {
  const start = ms(e.starts_at);
  const end = ms(e.ends_at);
  return e.kind === "convoi" ? start + (end - start) / 2 : end;
}

const EVENT_INFO: Record<EventKind, { name: string; description: string }> = {
  foire: { name: "La grande foire", description: "Les marchands envahissent la place : les savoirs coûtent 20 % de moins et les ateliers 10 % de moins pendant 2 heures." },
  fete: { name: "Fête des bâtisseurs", description: "Pendant 2 heures, chaque pierre versée au chantier compte double pour tes paliers de don et pour le lot de ton alliance." },
  etoiles: { name: "Pluie d'étoiles", description: "Pendant 1 heure, les veines d'or apparaissent trois fois plus souvent. Garde l'œil ouvert !" },
  treve: { name: "Trêve des cloches", description: "Les cloches sonnent la paix : aucune armée ne part pendant 2 heures (raids, renforts, forteresse), et tout le monde produit 25 % de plus." },
  lune: { name: "La lune rouge", description: "Tous les seigneurs pillards lancent un raid en même temps. Chaque raid repoussé te rapporte une rançon de 30 % de la valeur de l'armée du seigneur." },
  brouillard: { name: "Le brouillard", description: "Pendant 2 heures, aucune alerte d'approche, les chances sont masquées sans espion, et l'espion coûte moitié prix." },
  filon: { name: "Le filon géant", description: "Une mine s'ouvre sur la carte pendant 2 heures. Poste-y une armée : elle ne se bat pas et extrait 3 minutes de ta production par tranche de 10 minutes sur place, 30 minutes au plus." },
  bandits: { name: "Les camps de bandits", description: "Pendant 3 heures, un camp de bandits se dresse près de chaque joueur actif, défendu par 30 % de son armée. Le premier qui le vide emporte 40 minutes de la production du joueur le plus proche." },
  tresor: { name: "Le trésor enfoui", description: "Une case est révélée pendant 90 minutes. Les armées qui y arrivent se battent dans l'ordre d'arrivée ; celle qui tient la case à la fin emporte 4 heures de la production médiane." },
  marchand: { name: "Le marchand ambulant", description: "Pendant 1 heure, il vend un bonus au choix pour 30 minutes de ta production. Un seul achat par passage." },
  caravane: {
    name: "Caravane marchande",
    description: "Elle traverse la région chargée de pierre. Un assaut par joueur, contre une escorte qui vaut 60 % de ton armée ; une victoire rapporte 45 minutes de ta production.",
  },
  colosse: {
    name: "Le Colosse de Grisemont",
    description: "Une armée immense qui ne se reforme pas. Chaque assaut rapporte 2 fois la valeur des pertes infligées ; s'il tombe, chaque joueur qui l'a touché reçoit 15 minutes de sa production.",
  },
  convoi: { name: "Le convoi royal", description: "Un convoi traverse la carte et tombera dans une embuscade à mi-chemin. Poste des troupes au point d'embuscade avant : si le convoi passe, chaque escorte reçoit 45 minutes de sa production. Les troupes perdues reviennent à 60 % de l'infirmerie." },
  siege: { name: "Le siège du beffroi", description: "Une armée marche sur le beffroi et frappe dans 3 heures. Poste des troupes au centre de la carte : victoire, 1 heure de production par défenseur ; défense battue, l'étape en cours perd 10 % de sa pierre. Sans défenseur, l'armée repart sans rien détruire." },
  tournoi: { name: "Le tournoi", description: "Compose une armée avec le budget fourni, sans toucher à tes troupes. Tableau à élimination à la fin de l'heure, sans pertes : 2 h, 1 h et 30 min de production pour le podium." },
};

interface EventState {
  active: EventRow | null;
  /** Niveaux de l'escorte ou du colosse (médiane des joueurs). */
  levels: Levels;
  /** Arrivée du prochain événement quand aucun n'est en cours. */
  nextAt: number;
  nextKind: EventKind;
}

function eventRow(r: Record<string, unknown>): EventRow {
  return {
    id: Number(r.id),
    kind: r.kind as EventKind,
    starts_at: r.starts_at as string,
    ends_at: r.ends_at as string,
    army: (r.army ?? {}) as Army,
    army_start: (r.army_start ?? {}) as Army,
    pool: Number(r.pool ?? 0),
    prize: Number(r.prize ?? 0),
    attackers: (r.attackers ?? {}) as Record<string, number>,
    version: Number(r.version ?? 0),
    data: (r.data ?? {}) as EventData,
  };
}

const EVENT_NOTICES: Record<EventKind, { title: string; body: string }> = {
  caravane: { title: "🐪 Une caravane marchande arrive !", body: "Une heure pour la piller, un assaut par joueur." },
  colosse: { title: "🗿 Le Colosse de Grisemont est apparu !", body: "Six heures pour l'abattre à plusieurs." },
  foire: { title: "🎪 La grande foire ouvre !", body: "Savoirs à −20 % et ateliers à −10 % pendant 2 heures." },
  fete: { title: "🎉 Fête des bâtisseurs !", body: "Tes dons comptent double pour les paliers et les lots pendant 2 heures." },
  etoiles: { title: "🌠 Pluie d'étoiles !", body: "Les veines d'or apparaissent trois fois plus souvent pendant 1 heure." },
  treve: { title: "🔔 Trêve des cloches", body: "Aucune armée ne part pendant 2 heures, et tout le monde produit 25 % de plus." },
  lune: { title: "🌕 La lune rouge se lève !", body: "Tous les seigneurs pillards attaquent en même temps. Chaque raid repoussé rapporte une rançon." },
  brouillard: { title: "🌫️ Le brouillard tombe", body: "Pas d'alerte d'approche, chances masquées sans espion, espion à moitié prix pendant 2 heures." },
  filon: { title: "⛏️ Un filon géant s'ouvre !", body: "Poste une armée sur la mine : elle extrait de la pierre sans combattre." },
  bandits: { title: "🏕️ Des bandits campent près de chez vous !", body: "Un camp par joueur actif. Le premier à le vider emporte le butin." },
  tresor: { title: "💰 Un trésor enfoui est révélé !", body: "90 minutes pour tenir la case. Les armées s'y battent dans l'ordre d'arrivée." },
  marchand: { title: "🧺 Le marchand ambulant est là", body: "Un bonus au choix pour 30 minutes de ta production, pendant 1 heure." },
  convoi: { title: "👑 Le convoi royal se met en route !", body: "Poste des troupes au point d'embuscade avant qu'il n'y arrive." },
  siege: { title: "🏰 Une armée marche sur le beffroi !", body: "Trois heures pour poster des défenseurs au centre de la carte." },
  tournoi: { title: "🏆 Le tournoi est ouvert !", body: "Une heure pour s'inscrire avec le budget fourni. Pas de pertes." },
};

/** Annonce l'événement suivant 15 minutes avant ; la table garantit qu'une seule requête prévient tout le monde. */
async function announceNext(admin: SupabaseClient, seasonId: number, afterEvent: number, kind: EventKind) {
  const { error } = await admin.from("event_notices").insert({ season_id: seasonId, after_event: afterEvent, kind });
  if (error) return;
  const n = EVENT_NOTICES[kind];
  notify(admin, "all", { title: `Dans 15 minutes : ${n.title.replace(/ !$/, "")}`, body: n.body, tag: "event-notice" });
}

/** Clôt les événements finis, lance le suivant quand la pause est passée, et renvoie celui en cours. */
async function loadEvent(admin: SupabaseClient, seasonId: number, now: number, entities: Map<string, Entity>, world: WorldState, flat: Map<string, number>): Promise<EventState> {
  const state = await loadEventInner(admin, seasonId, now, entities, world, flat);
  // Les effets des derniers événements suivent chaque état chargé (foire, fête, trêve…).
  const { data: recent } = await admin.from("events").select("kind, starts_at, ends_at").eq("season_id", seasonId).order("ends_at", { ascending: false }).limit(3);
  currentEventMods = (recent ?? [])
    .filter((r) => !COMBAT_EVENTS.includes(r.kind as EventKind))
    .map((r) => ({ kind: r.kind as EventKind, from: ms(r.starts_at as string), until: ms(r.ends_at as string) }));
  for (const e of entities.values()) e.state = { ...e.state, eventMods: currentEventMods };
  return state;
}

async function loadEventInner(admin: SupabaseClient, seasonId: number, now: number, entities: Map<string, Entity>, world: WorldState, flat: Map<string, number>): Promise<EventState> {
  const { data: open } = await admin.from("events").select("*").eq("season_id", seasonId).eq("settled", false);
  const online = [...entities.values()].filter((x) => !x.isLord && now - x.lastSeen < ONLINE_WINDOW_MS).length;
  for (const raw of open ?? []) {
    const e = eventRow(raw);
    // V10 à V12 : l'événement reste ouvert tant que le combat commun n'est pas réglé.
    const finished = (ms(e.ends_at) <= now || (e.kind === "colosse" && armySize(e.army) === 0)) && !(GROUP_EVENTS.includes(e.kind) && !e.data.resolved);
    const next = drawNextEvent(e.kind, e.id * 7919 + seasonId, online);
    if (!finished) return { active: e, levels: medianLevels(entities), nextAt: ms(e.ends_at) + EVENT_GAP_MS, nextKind: next };
    if (COMBAT_EVENTS.includes(e.kind)) await admin.rpc("settle_event_v2", { p_event: e.id, p_bonus: killBonus(e, entities, now, world, flat) });
    else await admin.from("events").update({ settled: true }).eq("id", e.id).eq("settled", false);
  }
  const { data: last } = await admin.from("events").select("id, kind, ends_at").eq("season_id", seasonId).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  const nextAt = last ? ms(last.ends_at as string) + EVENT_GAP_MS : now;
  // Le tirage est figé à l'annonce : ce qui a été annoncé est ce qui arrive.
  const { data: notice } = last && now >= nextAt - EVENT_NOTICE_MS ? await admin.from("event_notices").select("kind").eq("season_id", seasonId).eq("after_event", Number(last.id)).maybeSingle() : { data: null };
  const nextKind: EventKind = notice ? (notice.kind as EventKind) : last ? drawNextEvent(last.kind as string, Number(last.id) * 7919 + seasonId, online) : "caravane";
  const humans = [...entities.values()].filter((e) => !e.isLord);
  if (last && !notice && now >= nextAt - EVENT_NOTICE_MS && now < nextAt) void announceNext(admin, seasonId, Number(last.id), nextKind);
  if (now < nextAt || humans.length === 0) return { active: null, levels: {}, nextAt, nextKind };

  let army: Army = {};
  let prize = 0;
  const duration = EVENT_DURATIONS_MS[nextKind];
  if (nextKind === "caravane") {
    army = armyFromBudget(troopBudget(entities) * CARAVAN_ESCORT_POWER, CARAVAN_ESCORT);
    prize = Math.floor(humans.reduce((sum, e) => sum + currentRate(e, advance(e.state, now, world), now, world, flat), 0) * CARAVAN_PRIZE_SECONDS);
  } else if (nextKind === "colosse") {
    const total = humanArmies(entities).reduce((a, b) => a + b, 0);
    army = armyFromBudget(Math.max(total * COLOSSUS_POWER, troopBudget(entities) * 3), COLOSSUS_ARMY);
    prize = Math.floor(armyValue(army) * COLOSSUS_BOUNTY);
  }
  // L'index unique empêche deux événements simultanés si deux joueurs arrivent en même temps.
  // A14, A15 : plus de chargement ni de prime communs (pool 0) ; `prize` n'est plus qu'une indication.
  let data: EventData = nextKind === "tournoi" ? { budget: Math.floor(troopBudget(entities)), entries: {} } : {};
  if (LOCAL_EVENTS.includes(nextKind)) {
    const positions = await loadPositions(admin, seasonId, entities);
    const players = [...positions.entries()].filter(([id]) => !LORDS.some((l) => l.id === id)).map(([, p]) => p);
    const seed = Math.floor(now / 1000);
    const activeTotal = activeHumans(entities, now).reduce((sum, e) => sum + armyValue(attackArmy(advance(e.state, now, world))), 0);
    if (nextKind === "convoi") {
      const path = caravanPath(seed);
      data = { path: { from: [path.from[0], path.from[1]], to: [path.to[0], path.to[1]] }, pos: [Math.round((path.from[0] + path.to[0]) / 2), Math.round((path.from[1] + path.to[1]) / 2)], enemy: armyFromBudget(Math.max(activeTotal * CONVOY_ATTACK_SHARE, 1), CARAVAN_ESCORT) };
    } else if (nextKind === "siege") {
      data = { pos: [BELFRY_POS[0], BELFRY_POS[1]], enemy: armyFromBudget(Math.max(activeTotal * SIEGE_ATTACK_SHARE, 1), COLOSSUS_ARMY) };
    } else if (nextKind === "bandits") {
      const taken: MapPos[] = [...fixedPlaces(), ...positions.values()];
      const camps: BanditCamp[] = [];
      for (const e of activeHumans(entities, now)) {
        const home = positions.get(e.id);
        if (!home) continue;
        const spot = banditSpot(home, taken, seed + camps.length);
        if (!spot) continue;
        taken.push(spot);
        const value = armyValue(attackArmy(advance(e.state, now, world))) * BANDIT_ARMY_SHARE;
        camps.push({ id: `c${camps.length}`, owner: e.id, pos: [spot[0], spot[1]], army: armyFromBudget(Math.max(value, 1), CARAVAN_ESCORT), winner: null });
      }
      data = { camps };
    } else {
      const p = colossusPos(seed, players);
      data = { pos: [p[0], p[1]], ...(nextKind === "tresor" ? { holder: null } : {}) };
    }
  }
  const { error: insertError } = await admin.from("events").insert({ season_id: seasonId, kind: nextKind, ends_at: iso(now + duration), army, army_start: army, pool: 0, prize, data });
  // Seul celui qui a vraiment créé l'événement prévient tout le monde.
  if (!insertError) {
    notify(admin, "all", { ...EVENT_NOTICES[nextKind], tag: "event" });
    // V13 : tous les seigneurs pillards se mettent en route maintenant.
    if (nextKind === "lune") {
      const raiders = [...entities.values()].filter((e) => e.lord?.raidEveryHours && !e.lord.retaliateOnly).map((e) => e.id);
      if (raiders.length) await admin.from("player_states").update({ next_raid_at: iso(now) }).eq("season_id", seasonId).in("user_id", raiders);
    }
  }
  const { data: created } = await admin.from("events").select("*").eq("season_id", seasonId).eq("settled", false).maybeSingle();
  if (!created) return { active: null, levels: {}, nextAt: now + EVENT_GAP_MS, nextKind };
  const e = eventRow(created);
  return { active: e, levels: medianLevels(entities), nextAt: ms(e.ends_at) + EVENT_GAP_MS, nextKind: drawNextEvent(e.kind, e.id * 7919 + seasonId, online) };
}

/** Défenseurs qu'affronte un assaut : l'escorte entière de la caravane, ou ce qu'il reste du colosse. */
/** A14 : l'escorte de chaque joueur vaut 60 % de la valeur de sa propre armée. */
function caravanEscort(state: PlayerState): Army {
  return armyFromBudget(armyValue(attackArmy(state)) * CARAVAN_ESCORT_POWER, CARAVAN_ESCORT);
}

function eventDefense(e: EventRow, state: PlayerState): Army {
  return e.kind === "caravane" ? caravanEscort(state) : e.army;
}

/** A15 : colosse abattu, 15 minutes de production pour chaque joueur qui l'a touché. */
function killBonus(e: EventRow, entities: Map<string, Entity>, now: number, world: WorldState, flat: Map<string, number>): Record<string, number> {
  if (e.kind !== "colosse") return {};
  const out: Record<string, number> = {};
  for (const id of Object.keys(e.attackers)) {
    const ent = entities.get(id);
    if (!ent) continue;
    out[id] = Math.floor(currentRate(ent, advance(ent.state, now, world), now, world, flat) * COLOSSUS_KILL_SECONDS);
  }
  return out;
}

function eventBlocker(state: PlayerState, e: EventRow, meId: string, now: number): string | null {
  if (!COMBAT_EVENTS.includes(e.kind)) return "Cet événement ne se combat pas.";
  if (e.kind === "caravane" && meId in e.attackers) return "Tu as déjà attaqué cette caravane.";
  if ((state.marches ?? []).some((m) => m.target === `event:${e.id}` && m.status === "out")) return "Une de tes armées y va déjà.";
  void now;
  if (armySize(attackArmy(state)) === 0) return "Il te faut des troupes pour attaquer.";
  return null;
}

async function runEventAttack(admin: SupabaseClient, seasonId: number, me: Entity, current: PlayerState, ev: EventState, now: number, rate: number, march?: March): Promise<"conflict" | { error?: string; state?: PlayerState; message?: string; settle?: number }> {
  const e = ev.active;
  if (!e) return { error: "Aucun événement en cours." };
  // T6 : une armée arrivée se bat avec ce qu'elle a emmené ; l'escorte de la caravane est taillée sur elle.
  const fighter: PlayerState = march ? { ...current, troops: march.troops as PlayerState["troops"], stationed: {} } : current;
  const blocked = march ? (e.kind === "caravane" && me.id in e.attackers ? "Tu as déjà attaqué cette caravane." : null) : eventBlocker(current, e, me.id, now);
  if (blocked) return { error: blocked };
  const fight = battle(attackArmy(fighter), eventDefense(e, fighter), Math.random, { attackerLevels: current.levels, defenderLevels: ev.levels });
  const mine = splitTroopLosses(fighter, fight.attackerLost);
  let after: PlayerState = march ? current : { ...current, troops: mine.troops, stationed: mine.stationed, lastRaidAt: now };
  const attackers = { ...e.attackers };
  let army = e.army;
  const pool = e.pool;
  let message: string;
  let taken = 0;
  if (e.kind === "caravane") {
    // A14 : sa propre escorte, et 45 minutes de sa propre production en cas de victoire.
    taken = fight.success ? Math.floor(rate * CARAVAN_PRIZE_SECONDS) : 0;
    after = { ...after, stone: after.stone + taken };
    attackers[me.id] = taken;
    message = fight.success
      ? `🐪 Caravane pillée : +${Math.round(taken).toLocaleString("fr-FR")} pierres ! Tes pertes : ${describeArmy(fight.attackerLost)}.`
      : `🐪 L'escorte de la caravane t'a repoussé. Tes pertes : ${describeArmy(fight.attackerLost)}.`;
  } else {
    const dealt = armyValue(fight.defenderLost);
    army = fight.defenderLeft;
    attackers[me.id] = (attackers[me.id] ?? 0) + dealt;
    // A15 : prime immédiate de 2 fois les pertes infligées (sauf colosse lancé avant cette règle, à prime commune).
    taken = e.pool > 0 ? 0 : Math.floor(dealt * COLOSSUS_BOUNTY);
    after = { ...after, stone: after.stone + taken };
    message =
      armySize(army) === 0
        ? e.pool > 0
          ? `🗿 Le Colosse est abattu ! La prime de ${Math.round(pool).toLocaleString("fr-FR")} pierres est partagée selon les pertes infligées.`
          : `🗿 Le Colosse est abattu ! +${Math.round(taken).toLocaleString("fr-FR")} pierres de prime, et chaque joueur qui l'a touché reçoit 15 minutes de sa production.`
        : `🗿 Tu as fauché ${describeArmy(fight.defenderLost) || "personne"}${taken > 0 ? ` : +${Math.round(taken).toLocaleString("fr-FR")} pierres de prime` : ""}. Tes pertes : ${describeArmy(fight.attackerLost)}.`;
  }
  if (march) {
    // Les survivants et la prime rentrent par la route.
    const back: March = { ...march, troops: cleanArmy(mine.troops as Army), status: "back", returnAt: now + (march.arriveAt - march.departAt), loot: taken, outcome: fight.success || e.kind === "colosse" ? "won" : "lost" };
    const keep = armySize(back.troops) > 0 || taken > 0;
    after = addWounded({ ...current, stone: current.stone, marches: (current.marches ?? []).flatMap((x) => (x.id === march.id ? (keep ? [back] : []) : [x])) }, woundedOf(fight.attackerLost, fight.success ? WOUNDED_WINNER : WOUNDED_ATTACKER_BEATEN), now);
  }
  const { data, error } = await admin.rpc("apply_event", {
    p_season: seasonId,
    p_state: toJson(me, after),
    p_event: e.id,
    p_version: e.version,
    p_army: army,
    p_pool: pool,
    p_attackers: attackers,
    p_action: "event_attack",
    p_details: { event: e.kind, success: fight.success, attackerLost: fight.attackerLost, defenderLost: fight.defenderLost },
  });
  if (error?.message.includes("beffroi_conflict") || (data as { conflict?: boolean } | null)?.conflict) return "conflict";
  if (error) throw new Error(`Événement : ${error.message}`);
  await addChronicle(admin, seasonId, {
    kind: "event",
    actor_id: me.id,
    details: {
      phase: "attack",
      event: e.kind,
      eventId: e.id,
      success: fight.success,
      stolen: taken,
      dealt: e.kind === "colosse" ? armyValue(fight.defenderLost) : 0,
      attackerLost: fight.attackerLost,
      defenderLost: fight.defenderLost,
    },
  });
  const finished = e.kind === "colosse" && armySize(army) === 0;
  return { state: after, message, settle: finished ? e.id : undefined };
}

function eventView(meId: string, state: PlayerState, ev: EventState, now: number, rate: number, positions?: Map<string, MapPos>, names?: Map<string, string>, entities?: Map<string, Entity>, priceRate = rate): EventView | null {
  const view = eventViewInner(meId, state, ev, now, rate, priceRate);
  const e = ev.active;
  if (view && e && GROUP_EVENTS.includes(e.kind)) {
    const nameOf = (id: string) => (id === meId ? "toi" : (names?.get(id) ?? "un joueur"));
    if (e.kind === "tournoi") {
      const entries = e.data.entries ?? {};
      return { ...view, battleAt: battleAt(e), resolved: !!e.data.resolved, budget: e.data.budget ?? 0, entries: Object.keys(entries).length, myEntry: (entries[meId] as Record<string, number> | undefined) ?? null, podium: (e.data.podium ?? []).map(nameOf) };
    }
    const posted = entities ? postedOn(e, entities) : [];
    const defenders = sumArmies(posted.map((p) => p.m.troops));
    const enemy = e.data.enemy ?? {};
    return {
      ...view,
      ...(e.data.pos ? { pos: e.data.pos } : {}),
      ...(e.data.path ? { path: e.data.path } : {}),
      army: enemy as Record<string, number>,
      battleAt: battleAt(e),
      resolved: !!e.data.resolved,
      outcome: e.data.outcome ?? null,
      posters: new Set(posted.map((p) => p.e.id)).size,
      myPosted: (state.marches ?? []).some((m) => m.target === groupTarget(e) && m.status !== "back"),
      defense: defenders as Record<string, number>,
      chance: armySize(defenders) > 0 ? 1 - estimateChance(enemy, defenders, { attackerLevels: ev.levels, defenderLevels: ev.levels }) : 0,
    };
  }
  if (view && e && LOCAL_EVENTS.includes(e.kind)) {
    const nameOf = (id: string) => (id === meId ? "toi" : (names?.get(id) ?? "un joueur"));
    return {
      ...view,
      ...(e.data.pos ? { pos: e.data.pos } : {}),
      ...(e.data.camps
        ? { camps: [...e.data.camps].sort((a, b) => Number(b.owner === meId) - Number(a.owner === meId)).map((c) => ({ id: c.id, pos: c.pos, army: c.army as Record<string, number>, winner: c.winner ? nameOf(c.winner) : null, mine: c.owner === meId })) }
        : {}),
      ...(e.kind === "tresor" ? { holder: e.data.holder ? nameOf(e.data.holder.owner) : null } : {}),
    };
  }
  if (!view || !e || !positions || !COMBAT_EVENTS.includes(e.kind)) return view;
  const p = eventPosAt(e, positions, now);
  return { ...view, pos: [p[0], p[1]], ...(e.kind === "caravane" ? { path: (({ from, to }) => ({ from: [from[0], from[1]] as [number, number], to: [to[0], to[1]] as [number, number] }))(caravanPath(e.id)) } : {}) };
}

function eventViewInner(meId: string, state: PlayerState, ev: EventState, now: number, rate: number, priceRate = rate): EventView | null {
  const e = ev.active;
  if (!e) {
    const info = EVENT_INFO[ev.nextKind];
    return { id: 0, kind: ev.nextKind, ...info, active: false, startsAt: ev.nextAt, endsAt: ev.nextAt, army: {}, armyLeft: 1, pool: 0, prize: 0, mine: 0, attackers: 0, chance: 0, take: 0, blocker: null };
  }
  if (!COMBAT_EVENTS.includes(e.kind)) {
    // Événements sans combat : leur effet passe par l'état de chacun (foire, fête, étoiles, trêve) ou par l'achat au marchand.
    return {
      id: e.id,
      kind: e.kind,
      ...EVENT_INFO[e.kind],
      active: true,
      startsAt: ms(e.starts_at),
      endsAt: ms(e.ends_at),
      army: {},
      armyLeft: 0,
      pool: 0,
      prize: 0,
      mine: 0,
      attackers: 0,
      chance: 0,
      take: 0,
      blocker: null,
      ...(e.kind === "marchand" ? { merchantPrice: Math.ceil(priceRate * MERCHANT_PRICE_SECONDS), merchantBought: state.merchantEvent === e.id } : {}),
    };
  }
  const defense = eventDefense(e, state);
  const startValue = armyValue(e.army_start);
  const totalDealt = Object.values(e.attackers).reduce((a, b) => a + b, 0);
  let take: number;
  if (e.kind === "caravane") take = Math.floor(rate * CARAVAN_PRIZE_SECONDS);
  else take = armyValue(battle(attackArmy(state), defense, seededRng(0xc0105), { attackerLevels: state.levels, defenderLevels: ev.levels }).defenderLost);
  return {
    id: e.id,
    kind: e.kind,
    ...EVENT_INFO[e.kind],
    active: true,
    startsAt: ms(e.starts_at),
    endsAt: ms(e.ends_at),
    army: defense as Record<string, number>,
    armyLeft: startValue > 0 ? armyValue(defense) / startValue : 0,
    pool: e.pool,
    prize: e.prize,
    mine: e.kind === "caravane" ? (e.attackers[meId] ?? 0) : totalDealt > 0 ? (e.attackers[meId] ?? 0) / totalDealt : 0,
    attackers: Object.keys(e.attackers).length,
    chance: estimateChance(attackArmy(state), defense, { attackerLevels: state.levels, defenderLevels: ev.levels }),
    take,
    blocker: eventBlocker(state, e, meId, now),
  };
}

function warView(me: Entity, wars: WarRow[], names: Map<number, string>): WarView | null {
  const w = warOf(wars, me.allianceId);
  if (!w) return null;
  const meA = w.alliance_a === me.allianceId;
  const enemyId = meA ? w.alliance_b : w.alliance_a;
  return { id: w.id, enemyId, enemyName: names.get(enemyId) ?? "?", myScore: meA ? w.score_a : w.score_b, enemyScore: meA ? w.score_b : w.score_a, startsAt: ms(w.starts_at), endsAt: ms(w.ends_at) };
}

/**
 * Chance affichée. Elle est toujours calculée sur l'armée réelle (une estimation sur l'armée arrondie
 * peut se tromper du tout au tout) ; sans espion, on ne montre qu'une fourchette de 10 %, jamais 0 ou 100 %
 * si l'issue n'est pas certaine.
 */
function vagueChance(chance: number, exact: boolean): number {
  if (exact || chance <= 0 || chance >= 1) return chance;
  return Math.min(0.9, Math.max(0.1, Math.round(chance * 10) / 10));
}

function isAllied(a: Entity, b: Entity): boolean {
  return a.allianceId !== null && a.allianceId === b.allianceId && a.id !== b.id;
}

/** Mon alliance, mes invitations, mes troupes chez les alliés et leurs renforts chez moi. */
async function loadAllianceNames(admin: SupabaseClient, seasonId: number): Promise<Map<number, string>> {
  const { data } = await admin.from("alliances").select("id, name").eq("season_id", seasonId);
  return new Map((data ?? []).map((r) => [Number(r.id), r.name as string]));
}

async function allianceInfo(admin: SupabaseClient, seasonId: number, me: Entity, myState: PlayerState, entities: Map<string, Entity>, names: Map<number, string>) {
  const name = (id: string) => entities.get(id)?.name ?? "Inconnu";
  let alliance: AllianceView | null = null;
  if (me.allianceId !== null && names.has(me.allianceId)) {
    const members = [...entities.values()].filter((e) => e.allianceId === me.allianceId).map((e) => ({ id: e.id, name: e.name }));
    alliance = { id: me.allianceId, name: names.get(me.allianceId)!, members };
  }
  const { data: inv } = await admin
    .from("alliance_invites")
    .select("alliance_id, inviter_id, alliances(name)")
    .eq("season_id", seasonId)
    .eq("invitee_id", me.id);
  const invites: InviteView[] = ((inv ?? []) as unknown as { alliance_id: number; inviter_id: string; alliances: { name: string } | null }[]).map((r) => ({
    allianceId: Number(r.alliance_id),
    allianceName: r.alliances?.name ?? "?",
    inviterName: name(r.inviter_id),
  }));
  const abroad: GarrisonAbroad[] = [...entities.values()]
    .filter((e) => e.id !== me.id && e.state.stationed[me.id])
    .map((e) => ({ id: e.id, name: e.name, troops: e.state.stationed[me.id] as Record<string, number> }));
  const reinforcements: GarrisonAbroad[] = Object.entries(myState.stationed).map(([owner, troops]) => ({ id: owner, name: name(owner), troops: troops as Record<string, number> }));
  return { alliance, invites, abroad, reinforcements };
}

type AllianceAction = Extract<GameAction, { type: `alliance_${string}` | "reinforce" | "recall" }>;
/** V6 : actions qui font partir une armée, interdites pendant la trêve. */
const ARMY_ACTIONS = new Set(["raid", "reinforce", "fortress_attack", "fortress_station", "event_attack"]);
const CONFLICT_ACTIONS = new Set(["war_declare", "fortress_attack", "fortress_station", "fortress_recall"]);
const ALLIANCE_ACTIONS = new Set(["alliance_create", "alliance_invite", "alliance_accept", "alliance_decline", "alliance_leave", "reinforce", "recall"]);

/** Écrit plusieurs états ensemble (le premier est celui du joueur). */
async function writeStates(admin: SupabaseClient, seasonId: number, list: { e: Entity; state: PlayerState }[], action: string, details: Record<string, unknown>): Promise<"ok" | "conflict"> {
  const { data, error } = await admin.rpc("apply_states", {
    p_season: seasonId,
    p_states: list.map(({ e, state }) => toJson(e, state)),
    p_action: action,
    p_details: details,
  });
  if (error?.message.includes("beffroi_conflict") || (data as { conflict?: boolean } | null)?.conflict) return "conflict";
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  return "ok";
}

/** Rend toutes les troupes postées entre `me` et ses alliés (départ d'une alliance). */
function unwindGarrisons(me: Entity, myState: PlayerState, entities: Map<string, Entity>, advanceOf: (e: Entity) => PlayerState) {
  let mine = myState;
  const others: { e: Entity; state: PlayerState }[] = [];
  for (const e of entities.values()) {
    if (e.id === me.id || e.isLord) continue;
    let theirs = advanceOf(e);
    let touched = false;
    if (theirs.stationed[me.id]) {
      const r = recallReinforcements(mine, theirs, me.id);
      if (r.ok) ({ owner: mine, host: theirs } = r.value);
      touched = true;
    }
    if (mine.stationed[e.id]) {
      const r = recallReinforcements(theirs, mine, e.id);
      if (r.ok) ({ owner: theirs, host: mine } = r.value);
      touched = true;
    }
    if (touched) others.push({ e, state: theirs });
  }
  return { mine, others };
}

async function runAllianceAction(
  admin: SupabaseClient,
  seasonId: number,
  me: Entity,
  current: PlayerState,
  entities: Map<string, Entity>,
  action: AllianceAction,
  advanceOf: (e: Entity) => PlayerState,
): Promise<"conflict" | { error?: string; message?: string; state?: PlayerState }> {
  const members = (id: number) => [...entities.values()].filter((e) => e.allianceId === id);
  switch (action.type) {
    case "alliance_create": {
      const name = String(action.name ?? "").trim().replace(/\s+/g, " ");
      if (me.allianceId !== null) return { error: "Tu fais déjà partie d'une alliance." };
      if (name.length < 2 || name.length > 30) return { error: "Le nom doit faire entre 2 et 30 caractères." };
      const { data, error } = await admin.from("alliances").insert({ season_id: seasonId, name, chief_id: me.id }).select("id").single();
      if (error || !data) throw new Error(`Alliance impossible : ${error?.message}`);
      await admin.from("player_states").update({ alliance_id: data.id }).eq("season_id", seasonId).eq("user_id", me.id);
      await admin.from("alliance_invites").delete().eq("season_id", seasonId).eq("invitee_id", me.id);
      return { message: `🤝 L'alliance « ${name} » est fondée. Invite tes amis depuis la liste des joueurs.` };
    }
    case "alliance_invite": {
      const target = entities.get(String(action.target));
      if (me.allianceId === null) return { error: "Fonde d'abord une alliance." };
      if (!target || target.isLord || target.id === me.id) return { error: "Joueur inconnu." };
      if (target.allianceId !== null) return { error: `${target.name} fait déjà partie d'une alliance.` };
      if (members(me.allianceId).length >= MAX_ALLIANCE_SIZE) return { error: `Une alliance compte ${MAX_ALLIANCE_SIZE} membres au plus.` };
      await admin
        .from("alliance_invites")
        .upsert({ season_id: seasonId, alliance_id: me.allianceId, invitee_id: target.id, inviter_id: me.id }, { onConflict: "alliance_id,invitee_id", ignoreDuplicates: true });
      return { message: `✉️ Invitation envoyée à ${target.name}.` };
    }
    case "alliance_accept": {
      const id = Number(action.alliance);
      if (me.allianceId !== null) return { error: "Quitte d'abord ton alliance actuelle." };
      const { data: inv } = await admin.from("alliance_invites").select("id").eq("alliance_id", id).eq("invitee_id", me.id).maybeSingle();
      if (!inv) return { error: "Cette invitation n'existe plus." };
      if (members(id).length >= MAX_ALLIANCE_SIZE) return { error: "Cette alliance est déjà au complet." };
      await admin.from("player_states").update({ alliance_id: id }).eq("season_id", seasonId).eq("user_id", me.id);
      await admin.from("alliance_invites").delete().eq("season_id", seasonId).eq("invitee_id", me.id);
      return { message: "🤝 Bienvenue dans l'alliance !" };
    }
    case "alliance_decline": {
      await admin.from("alliance_invites").delete().eq("alliance_id", Number(action.alliance)).eq("invitee_id", me.id);
      return {};
    }
    case "alliance_leave": {
      if (me.allianceId === null) return { error: "Tu n'as pas d'alliance." };
      const { data: fort } = await admin.from("fortresses").select("garrison").eq("season_id", seasonId).maybeSingle();
      if ((fort?.garrison as Record<string, unknown> | null)?.[me.id]) return { error: "Rappelle d'abord tes troupes de la forteresse." };
      if ((guildsOf.get(entities) ?? []).some((g) => g.garrison[me.id])) return { error: "Rappelle d'abord tes troupes de la halle." };
      const { mine, others } = unwindGarrisons(me, current, entities, advanceOf);
      if (others.length > 0 && (await writeStates(admin, seasonId, [{ e: me, state: mine }, ...others], "alliance_leave", {})) === "conflict") return "conflict";
      const left = me.allianceId;
      await admin.from("player_states").update({ alliance_id: null }).eq("season_id", seasonId).eq("user_id", me.id);
      if (members(left).length <= 1) await admin.from("alliances").delete().eq("id", left);
      return { message: "Tu as quitté l'alliance. Les troupes postées sont rentrées chez elles.", state: mine };
    }
    case "reinforce": {
      const host = entities.get(String(action.target));
      if (!host || !isAllied(me, host)) return { error: "On n'envoie des renforts qu'à un allié." };
      // T6 : les renforts voyagent comme une armée.
      const sending = sendTroops(current, { [String(action.unit)]: Number(action.qty) } as Army);
      if (!sending.ok) return { error: sending.error };
      const outMs = await travelBetween(admin, seasonId, entities, me.id, host.id, sending.value.sent, armySpeedBonus(current, true));
      const march: March = { id: marchId(), kind: "reinforce", target: host.id, troops: sending.value.sent, departAt: Date.now(), arriveAt: Date.now() + outMs, status: "out", returnAt: 0, revealed: true, warned: true, loot: 0, ransom: 0 };
      const sender = { ...sending.value.state, marches: [...(current.marches ?? []), march] };
      if ((await writeStates(admin, seasonId, [{ e: me, state: sender }], "reinforce", { target: host.id, unit: action.unit, qty: action.qty })) === "conflict") return "conflict";
      return { message: `🛡️ Renforts en route vers ${host.name} : arrivée dans ${Math.round(outMs / 60_000)} min.`, state: sender };
    }
    case "recall": {
      const host = entities.get(String(action.host));
      if (!host) return { error: "Domaine inconnu." };
      const hostState = advanceOf(host);
      const group = hostState.stationed?.[me.id];
      if (!group || Object.keys(group).length === 0) return { error: "Tu n'as pas de troupes là-bas." };
      if ((current.marches ?? []).length >= MAX_MARCHES) return { error: `${MAX_MARCHES} armées en route au plus.` };
      // T6 : elles quittent l'allié tout de suite et rentrent par la route.
      const outMs = await travelBetween(admin, seasonId, entities, host.id, me.id, group as Army, armySpeedBonus(current, true));
      const now = Date.now();
      const march: March = { id: marchId(), kind: "reinforce", target: host.id, troops: { ...group } as Army, departAt: now - outMs, arriveAt: now, status: "back", returnAt: now + outMs, revealed: true, warned: true, loot: 0, ransom: 0, outcome: "recalled" };
      const stationed = { ...hostState.stationed };
      delete stationed[me.id];
      const owner = { ...current, marches: [...(current.marches ?? []), march] };
      if ((await writeStates(admin, seasonId, [{ e: me, state: owner }, { e: host, state: { ...hostState, stationed } }], "recall", { host: host.id })) === "conflict") return "conflict";
      return { message: `Tes troupes quittent ${host.name} : retour dans ${Math.round(outMs / 60_000)} min.`, state: owner };
    }
  }
}

function rivalsFor(
  me: Entity,
  myState: PlayerState,
  entities: Map<string, Entity>,
  world: WorldState,
  flat: Map<string, number>,
  now: number,
  intel: Map<string, Intel>,
  allianceNames: Map<number, string>,
  wars: WarRow[],
): RivalView[] {
  const armies = lordArmies(entities, world, now, flat);
  const myRate = currentRate(me, myState, now, world, flat);
  const mySize = attackerSizeOf(me.id, myState, entities, myRate);
  return [...entities.values()]
    .filter((e) => e.id !== me.id)
    .map((e) => {
      const s = advanceEntity(e, now, world, flat);
      const rate = currentRate(e, s, now, world, flat);
      const revenge = hasRevenge(myState, e.id, now);
      const allied = isAllied(me, e);
      const atWar = !!warBetween(wars, me.allianceId, e.allianceId, now);
      const ctx = {
        now,
        attackerId: me.id,
        victimId: e.id,
        victimRate: rate,
        stagesDone: stagesDoneAt(world, now),
        allied,
        atWar,
        defenderArmy: e.isLord ? armies.get(e.id)?.defense : undefined,
        attackerRate: myRate,
        relativeSize: e.isLord ? undefined : relativeSize(sizeOf(s, rate), mySize),
      };
      const fight = raidArmies(myState, s, ctx);
      // E2 : sans rapport, l'armée n'est qu'un ordre de grandeur. Alliés et seigneurs faciles restent à découvert.
      const report = intel.get(e.id);
      const intelUntil = report && report.until > now ? report.until : 0;
      const open = allied || (e.isLord && e.lord?.difficulty === 1);
      const gap = open ? Infinity : intelUntil > 0 ? report!.gap : -Infinity;
      const seesArmy = gap >= -1;
      const seesStock = e.isLord ? gap >= 1 : gap >= 2;
      const seesMoves = !e.isLord && !allied && gap >= 1;
      const seesInner = !e.isLord && !allied && gap >= 3;
      // E4 : la fausse rumeur trompe tout le monde, sauf un rapport à +2 ou plus ; un rapport falsifié brouille les chiffres.
      const rumored = !open && gap < 2 ? rumorArmy(s, fight.defense, now) : fight.defense;
      const rumorUnmasked = !open && gap >= 2 && !!s.rumor && s.rumor.until > now;
      const noisy = !open && intelUntil > 0 && report!.noise === true;
      const jitter = (n: number, what: string) => (noisy ? Math.max(0, Math.round(n * noiseFactor(report!.until, what))) : n);
      const shown = noisy ? (Object.fromEntries(Object.entries(rumored).map(([id, n]) => [id, jitter(n ?? 0, id)])) as Army) : rumored;
      const seen = seesArmy ? shown : {};
      const stone = jitter(s.stone, "stone");
      const fair = e.isLord ? 1 : fairness(ctx.relativeSize, revenge);
      const loot = lootOf(stone, rate, revenge, { lord: e.isLord, cap: e.isLord ? undefined : myRate * PVP_LOOT_CAP_SECONDS, factor: fair, stagesDone: stagesDoneAt(world, now), extraSecured: extraSecured(s, now), securedFactor: (s.granaryCutUntil ?? 0) > now ? 0.5 : 1 });
      // Rançon attendue en cas de victoire : la défense, abattue.
      const ransom = e.isLord || !seesStock ? 0 : ransomOf(fight.defense as Army, fair);
      const exact = estimateChance(fight.attack, shown, fight.opts);
      const fog = eventActive(myState, "brouillard", now);
      const names = (key: string) => (key === "fortress" ? FORTRESS_NAME : key.startsWith("hall:") ? "une halle" : key.includes(":") ? "un événement" : (entities.get(key)?.name ?? "?"));
      return {
        ransom,
        fairness: fair,
        ...(open ? {} : { spyGap: intelUntil > 0 ? report!.gap : null }),
        ...(seesArmy ? {} : { armyHint: armyHint(rumored, fight.attack), ...(fog ? {} : { chanceWord: chanceWord(exact) }) }),
        ...(rumorUnmasked ? { rumorUnmasked: true } : {}),
        ...(seesStock && (s.granaryCutUntil ?? 0) > now ? { granaryCut: true } : {}),
        stoneKnown: seesStock,
        ...(seesMoves
          ? {
              moves: (s.marches ?? []).map((m) => ({ target: names(m.target), troops: m.troops as Record<string, number>, status: m.status, arriveAt: m.arriveAt, returnAt: m.returnAt })),
              guests: troopsHere({ ...s, troops: {} }) as Record<string, number>,
            }
          : {}),
        ...(seesInner
          ? { levels: s.levels as Record<string, number>, spyLevel: s.spyLevel ?? 0, researchQueue: s.research.map((r) => ({ id: r.id, endsAt: r.endsAt })), wounded: (s.wounded ?? {}) as Record<string, number>, healAt: s.healAt, curfewStart: s.curfew?.start ?? null }
          : {}),
        lootCap: e.isLord ? undefined : myRate * PVP_LOOT_CAP_SECONDS,
        lootSafe: extraSecured(s, now) || undefined,
        id: e.id,
        name: e.name,
        isLord: e.isLord,
        blazon: e.lord?.blazon,
        temper: e.lord?.temper,
        difficulty: e.lord?.difficulty,
        retaliateOnly: e.lord?.retaliateOnly,
        stone: seesStock ? stone : 0,
        stoneAt: now,
        rate,
        loot: seesStock ? loot : 0,
        intelUntil,
        allied,
        atWar,
        allianceName: e.allianceId !== null ? (allianceNames.get(e.allianceId) ?? null) : null,
        army: seen as Record<string, number>,
        // E2 : sans rapport qui montre l'armée, la chance n'est qu'un mot (-1 ici).
        chance: seesArmy ? exact : -1,
        shieldUntil: s.shieldUntil,
        burnedUntil: s.burnedUntil,
        totalPlundered: s.totalPlundered,
        lastSeen: e.isLord ? undefined : e.lastSeen,
        curfew: e.isLord ? undefined : inCurfew(s, now),
        revenge,
        blocker: raidBlocker(myState, s, ctx),
        ...(e.isLord || allied
          ? {}
          : {
              academy: s.academy,
              researching: s.research.length > 0,
              sabotageBlocker: sabotageBlocker(s, now, myState),
              sabotageBlockers: { academie: sabotageBlocker(s, now, myState, "academie"), grenier: sabotageBlocker(s, now, myState, "grenier"), guet: sabotageBlocker(s, now, myState, "guet") },
              sabotageCost: sabotageCost(myState, s, world, now),
              moleUntil: (myState.moles ?? []).find((m) => m.target === e.id && m.until > now)?.until ?? 0,
              molePrice: moleCost(baseRate(myState, world, now)),
            }),
      };
    })
    .sort((a, b) => Number(a.isLord) - Number(b.isLord) || (a.difficulty ?? 0) - (b.difficulty ?? 0) || b.loot - a.loot);
}

/** Quêtes d'accueil qui se lisent dans la base plutôt que dans l'état. */
async function questFlagsFromDb(admin: SupabaseClient, seasonId: number, userId: string, state: PlayerState): Promise<PlayerState> {
  const id = state.quest !== null ? QUESTS[state.quest]?.id : undefined;
  if (id === "lord") {
    const easy = LORDS.filter((l) => l.difficulty === 1).map((l) => l.id);
    const { data } = await admin.from("chronicle").select("details").eq("season_id", seasonId).eq("kind", "raid").eq("actor_id", userId).in("target_id", easy).limit(20);
    if ((data ?? []).some((r) => (r.details as { success?: boolean } | null)?.success)) return flagQuest(state, "lord");
  }
  if (id === "push") {
    const { count } = await admin.from("push_subscriptions").select("endpoint", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) > 0) return flagQuest(state, "push");
  }
  return state;
}

/** Absence au-delà de laquelle on résume ce qui s'est passé. */
const AWAY_MS = 30 * 60_000;

/** B3 : résumé de l'absence, d'après les compteurs du dernier passage, la chronique et le chantier. */
async function awaySummary(admin: SupabaseClient, seasonId: number, me: Entity, state: PlayerState, worksite: WorksiteView, entities: Map<string, Entity>, now: number): Promise<AwaySummary | undefined> {
  const seen = me.state.seen;
  if (!seen || now - me.lastSeen < AWAY_MS) return undefined;
  const { data } = await admin
    .from("chronicle")
    .select("kind, actor_id, details")
    .eq("season_id", seasonId)
    .eq("target_id", me.id)
    .in("kind", ["raid", "sabotage"])
    .gt("created_at", iso(me.lastSeen))
    .order("created_at", { ascending: true })
    .limit(50);
  const rows = (data ?? []) as { kind: string; actor_id: string; details: ChronicleEntry["details"] }[];
  const nameOf = (id: string) => entities.get(id)?.name ?? "Quelqu'un";
  const raids = rows.filter((r) => r.kind === "raid");
  const troopsOnly = (army: Record<string, number> | undefined) =>
    Object.fromEntries(Object.entries(army ?? {}).filter(([id, n]) => n > 0 && (UNIT_IDS as readonly string[]).concat(DEFENSE_IDS as readonly string[]).includes(id)));
  const research = Object.entries(state.levels ?? {})
    .map(([id, n]) => ({ id, levels: (n ?? 0) - (seen.levels[id as CombatantId] ?? 0) }))
    .filter((r) => r.levels > 0);
  return {
    since: me.lastSeen,
    produced: Math.max(0, state.totalProduced - seen.produced),
    tithe: Math.max(0, state.totalContributed - seen.contributed),
    raidsLost: raids.filter((r) => r.details.success).map((r) => ({ by: nameOf(r.actor_id), stolen: r.details.stolen ?? 0, troops: troopsOnly(r.details.defenderLost), buildings: r.details.destroyed ?? {} })),
    raidsRepelled: raids.filter((r) => !r.details.success).map((r) => nameOf(r.actor_id)),
    sabotages: rows.filter((r) => r.kind === "sabotage").map((r) => ({ by: nameOf(r.actor_id), success: !!r.details.success })),
    research,
    stages: worksite.stageCompletedAt.map((at, i) => (at > me.lastSeen && at <= now ? i : -1)).filter((i) => i >= 0),
  };
}

function chronicleDetails(r: RaidReport, chance: number) {
  return { success: r.success, chance, rounds: r.rounds, stolen: r.stolen, ransom: r.ransom, allyShares: r.allyShares, destroyed: r.destroyed, attackerLost: r.attackerLost, defenderLost: r.defenderLost, revenge: r.revenge, log: r.log };
}

/** « 3 miliciens, 1 chevalier » */
function describeArmy(army: Army): string {
  const parts = (Object.entries(army) as [string, number][])
    .filter(([, n]) => n > 0)
    .map(([id, n]) => {
      const c = COMBATANTS.get(id);
      return `${n} ${(n > 1 ? c?.plural : c?.name)?.toLowerCase() ?? id}`;
    });
  return parts.length ? parts.join(", ") : "aucune perte";
}

interface Outcome {
  state: PlayerState;
  contribution?: number;
  log?: { action: string; details: Record<string, unknown> };
  message?: string;
}

function applySimpleAction(state: PlayerState, action: GameAction, now: number, world: WorldState, eventId?: number): Result<Outcome> {
  switch (action.type) {
    case "sync":
      // Le joueur est là : on programme sa prochaine veine d'or si besoin.
      return { ok: true, value: { state: scheduleVein(state, now) } };
    case "vein": {
      const r = catchVein(state, now, world);
      if (!r.ok) return r;
      const o = r.value.outcome;
      return {
        ok: true,
        value: {
          state: r.value.state,
          log: { action: "vein", details: o.kind === "rain" ? { kind: o.kind, stone: Math.floor(o.stone) } : { kind: o.kind } },
          message: o.kind === "frenzy" ? "✨ Frénésie ! Ta production est doublée pendant 30 secondes." : `✨ Pluie de pierre : +${Math.floor(o.stone).toLocaleString("fr-FR")} pierres.`,
        },
      };
    }
    case "click": {
      const r = applyClicks(state, Number(action.count), now, world);
      if (r.paused && !(state.clickPausedUntil > now)) {
        return { ok: true, value: { state: r.state, log: { action: "click_pause", details: { requested: Number(action.count) } } } };
      }
      return { ok: true, value: { state: r.state } };
    }
    case "buy": {
      if (!GENERATOR_IDS.includes(action.generator as GeneratorId)) return { ok: false, error: "Bâtiment inconnu." };
      const r = buyGenerator(state, action.generator as GeneratorId, Number(action.qty));
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "buy", details: { generator: action.generator, qty: action.qty } } } } : r;
    }
    case "rebuild": {
      if (!GENERATOR_IDS.includes(action.generator as GeneratorId)) return { ok: false, error: "Bâtiment inconnu." };
      const r = rebuildRuin(state, action.generator as GeneratorId);
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "rebuild", details: { generator: action.generator } } } } : r;
    }
    case "army": {
      const kind = action.kind === "defense" ? "defense" : "unit";
      const r = buyArmy(state, kind, String(action.id), Number(action.qty));
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "army", details: { kind, id: action.id, qty: action.qty } } } } : r;
    }
    case "research": {
      const r = startResearch(state, String(action.id), now, stagesDoneAt(world, now), baseRate(state, world, now));
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "research", details: { id: action.id, level: queuedLevel(state, action.id as ResearchId) + 1 } } } } : r;
    }
    case "curfew": {
      const r = setCurfew(state, action.start === null ? null : Number(action.start), now);
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "curfew", details: { start: action.start } } } } : r;
    }
    case "march_recall": {
      const r = recallMarch(state, String(action.id), now, rateAt(state, world, now));
      return r.ok ? { ok: true, value: { state: r.value, message: "🏳️ Ton armée fait demi-tour.", log: { action: "march_recall", details: { id: action.id } } } } : r;
    }
    case "merchant": {
      if (!eventId) return { ok: false, error: "Le marchand n'est pas là." };
      const r = buyFromMerchant(state, String(action.choice), eventId, now, world);
      return r.ok
        ? { ok: true, value: { state: r.value, message: `🧺 Marché conclu : ${MERCHANT_OFFERS[action.choice as MerchantChoice].label.toLowerCase()}.`, log: { action: "merchant", details: { choice: action.choice } } } }
        : r;
    }
    case "tithe": {
      const r = setTithe(state, Number(action.percent));
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "tithe", details: { percent: action.percent } } } } : r;
    }
    case "academy": {
      const r = buyAcademy(state);
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "academy", details: { level: r.value.academy } } } } : r;
    }
    case "upgrade": {
      const r = buyUpgrade(state, String(action.upgrade));
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "upgrade", details: { upgrade: action.upgrade } } } } : r;
    }
    case "contribute": {
      const r = contribute(state, Number(action.amount));
      if (!r.ok) return r;
      const given = r.value.totalContributed - state.totalContributed;
      return { ok: true, value: { state: r.value, contribution: given, log: { action: "contribute", details: { amount: given } } } };
    }
    default:
      return { ok: false, error: "Action inconnue." };
  }
}

export type ActionResult = { ok: true; snapshot: GameSnapshot; message?: string } | { ok: false; error: string; snapshot?: GameSnapshot };

/** Exécute une intention du joueur et renvoie l'état qui fait foi. */
export async function runAction(admin: SupabaseClient, userId: string, action: GameAction): Promise<ActionResult> {
  const season = await getActiveSeason(admin);
  const wantsChronicle = ["sync", "raid", "spy", "event_attack", "sabotage"].includes(action.type);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let [worksite, entities] = await Promise.all([loadWorksite(admin, season.id), loadEntities(admin, season.id, userId)]);
    if (action.type === "sync" && attempt === 0) await maybeDailySummary(admin, season.id, entities, worksite, Date.now()).catch((e) => console.error("résumé", e));
    if (action.type === "sync" && attempt === 0 && (await tickLords(admin, season, entities, worksite, Date.now()))) {
      [worksite, entities] = await Promise.all([loadWorksite(admin, season.id), loadEntities(admin, season.id, userId)]);
    }
    let me = entities.get(userId);
    if (!me) throw new Error("Joueur introuvable.");

    const now = Date.now();
    const world = worldFrom(worksite);
    // Lots de l'étape : créés à son ouverture, ou on y inscrit le joueur qui arrive en cours d'étape.
    if (await ensureLots(admin, season.id, worksite, entities, me, world, now)) {
      entities = await loadEntities(admin, season.id, userId);
      me = entities.get(userId) ?? me;
    }
    const flat = lordRates(entities, world, now);
    let [conflicts, events, allianceNames] = await Promise.all([
      loadConflicts(admin, season.id, now),
      loadEvent(admin, season.id, now, entities, world, flat),
      loadAllianceNames(admin, season.id),
    ]);
    // T4 : échéances des armées en route (alertes, arrivées, retours), une à la fois, puis on relit.
    let settled = 0;
    let marchConflict = false;
    while (settled < 8) {
      const r = await settleMarches(admin, season.id, entities, world, flat, conflicts.wars, now, conflicts.fortress, allianceNames, events);
      if (r === "none") break;
      if (r === "conflict") {
        marchConflict = true;
        break;
      }
      settled++;
      entities = await loadEntities(admin, season.id, userId);
      for (const e of entities.values()) e.state = { ...e.state, eventMods: currentEventMods };
    }
    if (marchConflict) continue;
    if (settled > 0) {
      me = entities.get(userId) ?? me;
      if (settled) conflicts = await loadConflicts(admin, season.id, now);
    }
    // La part de chantier de l'étape en cours s'ouvre la première fois qu'on voit le joueur pendant l'étape.
    const stageAtLoad = worksite.stage;
    const myLotShare = (lotsOf.get(entities) ?? []).find((l) => l.stage === worksite.stage && l.members[userId])?.members[userId]?.share;
    const opened = openShare(advance(me.state, now, world), worksite.stage, world, now, myLotShare);
    // Quêtes du jour : nouveau tirage à 4 h UTC.
    const dailyCtx = dailyContextOf(me, opened, entities, worksite.stage);
    const current: PlayerState = { ...opened, daily: rollDaily(opened.daily, now, seedOf(userId, dailyDay(now)), dailyCtx) };
    let finalState = current;
    let ecus = me.ecus;
    let away: AwaySummary | undefined;
    let questDone: { done: number | null; ecus: number } | null = null;
    let error: string | null = null;
    let message: string | undefined;

    if (ARMY_ACTIONS.has(action.type) && eventActive(current, "treve", now)) {
      error = "Trêve des cloches : aucune armée ne part.";
    } else if (action.type === "event_attack") {
      // T6 : l'armée marche vers la caravane (sa position au départ) ou le colosse.
      const e = events.active;
      const local = e && LOCAL_EVENTS.includes(e.kind) ? localTarget(e, String(action.camp ?? ""), me.id, current, now) : null;
      const target = local && "target" in local ? local.target : e ? `event:${e.id}` : "";
      const blocked = !e
        ? "Aucun événement en cours."
        : local && "error" in local
          ? local.error
          : !local && !COMBAT_EVENTS.includes(e.kind)
            ? "Cet événement ne se combat pas."
            : e.kind === "caravane" && me.id in e.attackers
              ? "Tu as déjà attaqué cette caravane."
              : (current.marches ?? []).some((m) => m.target === target && m.status !== "back")
                ? "Une de tes armées y va déjà."
                : null;
      const sending = blocked ? null : sendTroops(current, (action.troops ?? current.troops) as Army);
      if (blocked) error = blocked;
      else if (sending && !sending.ok) error = sending.error;
      else if (sending && sending.ok && e) {
        const positions = await loadPositions(admin, season.id, entities);
        const from = positions.get(me.id);
        const dest = local && "pos" in local ? local.pos : eventPosAt(e, positions, now);
        const outMs = travelMs(sending.value.sent, from ? mapDistance(from, dest) : MAP_SPAWN_RADIUS, armySpeedBonus(current));
        const march: March = { id: marchId(), kind: "event", target, troops: sending.value.sent, departAt: now, arriveAt: now + outMs, status: "out", returnAt: 0, revealed: true, warned: true, loot: 0, ransom: 0 };
        finalState = { ...sending.value.state, marches: [...(current.marches ?? []), march], lastRaidAt: now };
        const { data, error: rpcError } = await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, finalState, {}), p_touch: true, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: "event_march", p_details: { event: e.id } });
        if (rpcError) throw new Error(`Départ impossible : ${rpcError.message}`);
        if ((data as { conflict?: boolean } | null)?.conflict) continue;
        message = `${EVENT_ICON[e.kind]} Ton armée marche vers ${EVENT_PLACE[e.kind]} : arrivée dans ${Math.round(outMs / 60_000)} min.`;
        entities = await loadEntities(admin, season.id, userId);
      }
      events = await loadEvent(admin, season.id, now, entities, world, flat);
    } else if (action.type === "daily") {
      const counts = await loadDailyCounts(admin, season.id, userId, now);
      const op = String(action.op);
      const index = Number(action.index);
      const rate = currentRate(me, current, now, world, flat);
      const r =
        op === "claim"
          ? claimDaily(current, index, counts, levelSum(current), rate)
          : op === "swap"
            ? swapDaily(current, index, seedOf(userId, dailyDay(now)), dailyCtx)
            : op === "chest"
              ? openChest(current, now)
              : ({ ok: false, error: "Action inconnue." } as const);
      if (!r.ok) error = r.error;
      else {
        finalState = "state" in r.value ? r.value.state : r.value;
        if (op === "claim" && "reward" in r.value) message = `📜 Quête du jour accomplie : +${Math.floor(r.value.reward).toLocaleString("fr-FR")} pierres.`;
        if (op === "chest" && "bonus" in r.value) message = `🎁 Coffre ouvert : +${Math.round(r.value.bonus * 100)} % de production pendant 4 heures.`;
        if (op === "swap") message = "🔄 Quête échangée.";
        const { data } = await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, finalState, {}), p_touch: true, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: `daily_${op}`, p_details: { index } });
        if ((data as { conflict?: boolean } | null)?.conflict) continue;
      }
    } else if (action.type === "tournament_join") {
      // V12 : l'armée du tournoi est fictive ; mes troupes ne bougent pas.
      const e = events.active;
      const entry = e ? tourneyEntry(e, action.troops, now) : { error: "Aucun tournoi en cours." };
      if ("error" in entry) error = entry.error;
      else if (e) {
        const again = !!e.data.entries?.[me.id];
        const { error: rpcError } = await admin.rpc("apply_event_data", { p_season: season.id, p_states: [toJson(me, current, {})], p_event: e.id, p_version: e.version, p_data: { ...e.data, entries: { ...(e.data.entries ?? {}), [me.id]: entry.army } }, p_attackers: null });
        if (rpcError?.message.includes("beffroi_conflict")) continue;
        if (rpcError) throw new Error(`Inscription impossible : ${rpcError.message}`);
        if (!again) await admin.from("action_log").insert({ user_id: me.id, season_id: season.id, action: "tournament_join", details: { event: e.id } });
        message = again ? "🏆 Ton armée de tournoi est modifiée." : "🏆 Tu es inscrit au tournoi. Résultats à la fin de l'heure.";
        entities = await loadEntities(admin, season.id, userId);
        events = await loadEvent(admin, season.id, now, entities, world, flat);
      }
    } else if (action.type === "hall") {
      const self = me;
      const commit = async (state: PlayerState, act: string, details: Record<string, unknown>) => {
        const { data, error: rpcError } = await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(self, state, {}), p_touch: true, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: act, p_details: details });
        if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);
        if ((data as { conflict?: boolean } | null)?.conflict) return "conflict" as const;
        // L'enregistrement suivant (remboursement) part de la nouvelle version.
        self.version += 1;
        return "ok" as const;
      };
      const r = await runHallAction(admin, season.id, self, current, entities, action, world, now, commit, conflicts.wars);
      if (r === "conflict") continue;
      if (r.error) error = r.error;
      message = r.message;
      if (r.state) finalState = r.state;
      entities = await loadEntities(admin, season.id, userId);
      finalState = { ...finalState, hall: entities.get(userId)?.state.hall };
    } else if (CONFLICT_ACTIONS.has(action.type)) {
      const r = await runConflictAction(admin, season.id, me, current, entities, conflicts, allianceNames, action as Parameters<typeof runConflictAction>[7], now);
      if (r === "conflict") continue;
      if (r.error) error = r.error;
      message = r.message;
      if (r.state) finalState = r.state;
      entities = await loadEntities(admin, season.id, userId);
      conflicts = await loadConflicts(admin, season.id, now);
      // Prendre la forteresse donne tout de suite le bonus.
      finalState = { ...finalState, fortress: entities.get(userId)?.state.fortress, catchUp: entities.get(userId)?.state.catchUp };
    } else if (ALLIANCE_ACTIONS.has(action.type)) {
      const r = await runAllianceAction(admin, season.id, me, current, entities, action as AllianceAction, (e) => advanceEntity(e, now, world, flat));
      if (r === "conflict") continue;
      if (r.error) error = r.error;
      message = r.message;
      if (r.state) finalState = r.state;
      entities = await loadEntities(admin, season.id, userId);
    } else if (action.type === "master_choice") {
      const choice = String(action.choice);
      const lot = (lotsOf.get(entities) ?? []).find((l) => l.master && l.members[userId] && l.masterChoice === null && l.finishedAt !== null && now < l.finishedAt + MASTER_CHOICE_MS);
      if (!(choice in MASTER_BONUSES)) error = "Bonus inconnu.";
      else if (!lot) error = "Ton lot n'a pas de bonus à choisir.";
      else {
        await admin.from("stage_lots").update({ master_choice: choice, master_from: iso(now) }).eq("season_id", season.id).eq("stage", lot.stage).eq("owner", lot.owner).is("master_choice", null);
        entities = await loadEntities(admin, season.id, userId);
        finalState = { ...finalState, masterBonus: entities.get(userId)?.state.masterBonus };
        message = `👑 Bonus choisi pour 24 h : ${MASTER_BONUSES[choice as MasterBonusKind].label}.`;
      }
    } else if (action.type === "sabotage") {
      const target = entities.get(String(action.target));
      const aim: SabotageAim = action.aim === "grenier" || action.aim === "guet" ? action.aim : "academie";
      const targetState = target ? advanceEntity(target, now, world, flat) : null;
      const cost = targetState ? sabotageCost(current, targetState, world, now) : 0;
      if (!target || !targetState || target.id === me.id || target.isLord) error = "Cible inconnue.";
      else if (isAllied(me, target)) error = "On ne sabote pas un allié.";
      else if (current.stone < cost) error = `Il faut ${Math.ceil(cost).toLocaleString("fr-FR")} pierres pour payer un saboteur.`;
      else error = sabotageBlocker(targetState, now, current, aim);
      if (!error && target && targetState) {
        const gap = spyLevelOf(me) - defenseSpyLevel(target, now);
        const success = Math.random() < sabotageChance(gap);
        // E5 : un sabotage raté est toujours repéré ; réussi, il l'est selon le risque d'un espion.
        const positions = await loadPositions(admin, season.id, entities);
        const from = positions.get(me.id);
        const to = positions.get(target.id);
        const spotted = !success || Math.random() < spyRisk(gap, from && to ? mapDistance(from, to) : MAP_SPAWN_RADIUS);
        const named = spotted && defenseSpyLevel(target, now) >= spyLevelOf(me) - 1;
        const mine = { ...current, stone: current.stone - cost };
        const list = success ? [{ e: me, state: mine }, { e: target, state: applySabotage(targetState, now, aim) }] : [{ e: me, state: mine }];
        if ((await writeStates(admin, season.id, list, "sabotage", { target: target.id, cost, success, aim, spotted })) === "conflict") continue;
        finalState = mine;
        await addChronicle(admin, season.id, { kind: "sabotage", actor_id: me.id, target_id: target.id, details: { success, aim, spotted, named } });
        const what = aim === "grenier" ? "ton grenier" : aim === "guet" ? "ton guet" : "ton académie";
        const effect = aim === "grenier" ? "Pendant 2 h, seule la moitié de ton stock est à l'abri." : aim === "guet" ? "Pendant 1 h, aucune alerte d'approche." : "Un niveau perdu et ta recherche prend du retard.";
        const by = named ? ` C'était un saboteur de ${me.name}.` : spotted ? " Son maître reste inconnu." : "";
        notify(admin, [target.id], success
          ? { title: `🧨 On a saboté ${what}`, body: `${effect}${by}`, tag: "sabotage" }
          : { title: "🧨 Saboteur arrêté", body: `Il visait ${what}.${by}`, tag: "sabotage" });
        const done = aim === "grenier" ? `le grenier de ${target.name} ne met plus que la moitié à l'abri pendant 2 h` : aim === "guet" ? `le guet de ${target.name} est aveugle pendant 1 h` : `l'académie de ${target.name} perd un niveau et sa recherche prend du retard`;
        message = success
          ? `🧨 Sabotage réussi : ${done}.${spotted ? " Ton saboteur a pourtant été vu en repartant." : ""}`
          : `🧨 Ton saboteur a été pris dans le domaine de ${target.name}.`;
      } else {
        const { data } = await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, current, {}), p_touch: true, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
        if ((data as { conflict?: boolean } | null)?.conflict) continue;
      }
    } else if (action.type === "spy") {
      // E3 : l'espion part sur la route ; le rapport arrive avec lui.
      const r = await sendSpy(admin, season.id, me, current, entities, conflicts.fortress, String(action.target), world, now);
      if ("error" in r) error = r.error;
      const next = "error" in r ? current : r.state;
      const { data, error: rpcError } = await admin.rpc("commit_state", {
        p_season: season.id,
        p_state: toJson(me, next, {}),
        p_touch: true,
        p_contribution: 0,
        p_stage_bases: stageSizes,
        p_active_window_days: ACTIVE_WINDOW_DAYS,
        p_action: "error" in r ? null : "spy",
        p_details: "error" in r ? null : { target: String(action.target), cost: r.cost },
      });
      if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);
      if ((data as { conflict?: boolean } | null)?.conflict) continue;
      if (!("error" in r)) {
        finalState = next;
        message = r.message;
      }
    } else if (action.type === "mole") {
      // E4 : la taupe s'installe tout de suite ; elle peut être démasquée dès son arrivée.
      const r = await placeMole(admin, season.id, me, current, entities, String(action.target), world, now);
      if ("error" in r) error = r.error;
      const next = "error" in r ? current : r.state;
      const { data, error: rpcError } = await admin.rpc("commit_state", {
        p_season: season.id,
        p_state: toJson(me, next, {}),
        p_touch: true,
        p_contribution: 0,
        p_stage_bases: stageSizes,
        p_active_window_days: ACTIVE_WINDOW_DAYS,
        p_action: "error" in r ? null : "mole",
        p_details: "error" in r ? null : { target: String(action.target), cost: r.cost, caught: r.caught },
      });
      if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);
      if ((data as { conflict?: boolean } | null)?.conflict) continue;
      if (!("error" in r)) {
        finalState = next;
        message = r.message;
        if (r.caught) await moleCaught(admin, season.id, me, r.target, now);
      }
    } else if (action.type === "counter" || action.type === "rumor") {
      // E4 : contre-espionnage (6 h) et fausse rumeur (2 h), payés en minutes de production de base.
      const base = baseRate(current, world, now);
      const r = action.type === "counter" ? buyCounter(current, base, now) : buyRumor(current, String(action.mode), base, now);
      const next = r.ok ? r.value : current;
      if (!r.ok) error = r.error;
      const { data, error: rpcError } = await admin.rpc("commit_state", {
        p_season: season.id,
        p_state: toJson(me, next, {}),
        p_touch: true,
        p_contribution: 0,
        p_stage_bases: stageSizes,
        p_active_window_days: ACTIVE_WINDOW_DAYS,
        p_action: r.ok ? action.type : null,
        p_details: r.ok ? { cost: current.stone - next.stone, ...(action.type === "rumor" ? { mode: String(action.mode) } : {}) } : null,
      });
      if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);
      if ((data as { conflict?: boolean } | null)?.conflict) continue;
      if (r.ok) {
        finalState = next;
        message = action.type === "counter"
          ? "🛡️ Contre-espionnage en place pour 6 h : quiconque agit contre toi perd deux crans, et ses espions repérés rapportent des chiffres faussés."
          : `🗣️ La rumeur court pour 2 h : on te croit ${String(action.mode) === "fort" ? "deux fois plus fort" : "deux fois plus faible"} que tu ne l'es.`;
      }
    } else if (action.type === "raid") {
      // T3 : l'armée choisie part sur la route ; le combat se jouera à l'arrivée.
      const victim = entities.get(String(action.target));
      if (!victim) {
        error = "Cible inconnue.";
      } else {
        const wanted = (action.troops && typeof action.troops === "object" ? action.troops : current.troops) as Army;
        const sending = sendTroops(current, wanted);
        if (!sending.ok) {
          error = sending.error;
        } else {
          const sent = sending.value.sent;
          const victimState = advanceEntity(victim, now, world, flat);
          const myRate = currentRate(me, current, now, world, flat);
          const vRate = currentRate(victim, victimState, now, world, flat);
          const blocked = raidBlocker(current, victimState, {
            now,
            attackerId: me.id,
            victimId: victim.id,
            victimRate: vRate,
            stagesDone: stagesDoneAt(world, now),
            defenderArmy: victim.isLord ? lordArmies(entities, world, now, flat).get(victim.id)?.defense : undefined,
            allied: isAllied(me, victim),
            atWar: !!warBetween(conflicts.wars, me.allianceId, victim.allianceId, now),
            attackerRate: myRate,
            relativeSize: victim.isLord ? undefined : relativeSize(sizeOf(victimState, vRate), attackerSizeOf(me.id, current, entities, myRate)),
            attackerArmy: sent,
            marching: true,
          });
          if (blocked) {
            error = blocked;
          } else {
            const positions = await loadPositions(admin, season.id, entities);
            const from = positions.get(me.id);
            const to = positions.get(victim.id);
            const distance = from && to ? mapDistance(from, to) : MAP_SPAWN_RADIUS;
            const outMs = travelMs(sent, distance, armySpeedBonus(current));
            const guet = victim.isLord ? 0 : wingLevel(victimState.hall, "guet");
            const fogged = eventActive(current, "brouillard", now);
            const march: March = {
              id: `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
              kind: "raid",
              target: victim.id,
              troops: sent,
              departAt: now,
              arriveAt: now + outMs,
              status: "out",
              returnAt: 0,
              // Halle : le guet niveau 2 donne toujours le nom de l'attaquant.
              revealed: guet >= 2 || spyLevelOf(victim) >= spyLevelOf(me),
              // Contre un seigneur, personne à prévenir ; le guet niveau 1 prévient dès le départ.
              // E4 : un guet saboté ne voit rien partir.
              warned: victim.isLord || (guet >= 1 && !fogged && (victimState.blindUntil ?? 0) <= now),
              loot: 0,
              ransom: 0,
            };
            finalState = {
              ...sending.value.state,
              marches: [...(current.marches ?? []), march],
              lastRaidAt: now,
              lastRaidTarget: victim.id,
              shieldUntil: 0, // partir en raid fait tomber son propre bouclier
            };
            const { data, error: rpcError } = await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, finalState, {}), p_touch: true, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: "march", p_details: { target: victim.id, troops: sent, arriveAt: march.arriveAt } });
            if (rpcError) throw new Error(`Départ impossible : ${rpcError.message}`);
            if ((data as { conflict?: boolean } | null)?.conflict) continue;
            message = `🏇 Ton armée part vers ${victim.name} : arrivée dans ${Math.round(outMs / 60_000)} min, retour ${Math.round(outMs / 60_000)} min plus tard.`;
            if (!victim.isLord && march.warned) {
              const from = march.revealed ? ` de ${me.name}` : "";
              notify(admin, [victim.id], { title: "🔭 Le guet a vu partir une armée !", body: `Une armée${from} arrive vers ${new Date(march.arriveAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}.`, tag: "march" });
            }
            entities = await loadEntities(admin, season.id, userId);
          }
        }
      }
      if (error) {
        // Raid refusé : on enregistre quand même l'avancement de la production.
        const { data } = await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, current, {}), p_touch: true, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
        if ((data as { conflict?: boolean } | null)?.conflict) continue;
      }
    } else {
      const outcome = applySimpleAction(current, action, now, world, events.active?.kind === "marchand" ? events.active.id : undefined);
      if (outcome.ok) finalState = outcome.value.state;
      else error = outcome.error;
      if (outcome.ok && outcome.value.message) message = outcome.value.message;
      // La dîme prélevée par la production est versée au chantier à chaque enregistrement.
      const paid = payTithe(finalState);
      finalState = paid.state;
      // H2 : une part de la dîme part à la halle (ou à la loge) ; elle ne compte pas pour le beffroi.
      const myGuild = guildOf(me, guildsOf.get(entities) ?? []);
      const toHall = myGuild ? Math.floor(paid.paid * (finalState.hallTithe ?? HALL_TITHE_DEFAULT)) : 0;
      if (toHall > 0) finalState = { ...finalState, totalContributed: finalState.totalContributed - toHall };
      const contribution = (outcome.ok ? (outcome.value.contribution ?? 0) : 0) + paid.paid - toHall;
      // V4 : pendant la fête des bâtisseurs, les dons comptent double pour les paliers et les lots.
      const feast = eventActive(finalState, "fete", now) ? FEAST_GIFT_FACTOR : 1;
      const gift = recordGift(finalState, contribution * feast);
      finalState = gift.state;
      // Accueil guidé : quêtes lues dans la base (seigneur facile pillé, notifications), puis validation.
      if (action.type === "sync" && finalState.quest !== null) finalState = await questFlagsFromDb(admin, season.id, userId, finalState);
      const quest = claimQuest(finalState, world, now, { alliance: me.allianceId !== null });
      if (quest.done !== null) {
        finalState = quest.state;
        questDone = quest;
      }
      if (action.type === "sync") away = await awaySummary(admin, season.id, me, finalState, worksite, entities, now);
      finalState = { ...finalState, seen: { produced: finalState.totalProduced, contributed: finalState.totalContributed, levels: finalState.levels } };
      const { data, error: rpcError } = await admin.rpc("commit_state", {
        p_season: season.id,
        p_state: toJson(me, finalState, {}),
        p_touch: true,
        p_contribution: contribution,
        p_stage_bases: stageSizes,
        p_active_window_days: ACTIVE_WINDOW_DAYS,
        p_action: outcome.ok ? (outcome.value.log?.action ?? null) : null,
        p_details: outcome.ok ? (outcome.value.log?.details ?? null) : null,
      });
      if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);
      const result = data as { ok: boolean; conflict?: boolean; worksite?: WorksiteRow };
      if (!result.ok && result.conflict) continue;
      if (result.worksite) worksite = worksiteFromRow(result.worksite);
      await stageRewards(admin, season.id, stageAtLoad, worksite.stage);
      if (contribution > 0) await recordContribution(season.id, userId, finalState.totalContributed);
      if (toHall > 0 && myGuild) await giveToGuild(admin, myGuild, userId, toHall, guildRate(myGuild.allianceId, me, entities, world, now), entities);
      if (action.type === "sync" && (await absorbLodge(admin, me, entities, world, now))) message = "🏛️ Ta loge est versée dans la halle de ton alliance (la moitié de ce que tu lui avais donné).";
      if (contribution > 0) {
        // Le don compte aussi pour le lot du joueur, et pour celui de l'étape d'avant s'il est encore ouvert.
        const lotMessage = await giveToLots(admin, season.id, me, stageAtLoad, contribution * feast, entities, allianceNames);
        if (lotMessage) message = lotMessage;
      }
      if (questDone?.done != null) {
        if (questDone.ecus > 0) {
          const { data: total } = await admin.rpc("add_ecus", { p_user: userId, p_amount: questDone.ecus });
          ecus = Number(total ?? ecus + questDone.ecus);
        }
        message = `📜 Quête accomplie : ${QUESTS[questDone.done].label}. Récompense : 5 minutes de production${questDone.ecus ? ` et ${questDone.ecus} écus` : ""}.`;
      }
      if (gift.tiers > 0) {
        const { data: total } = await admin.rpc("add_ecus", { p_user: userId, p_amount: gift.ecus });
        ecus = Number(total ?? ecus + gift.ecus);
        message = `🎖️ Palier de don atteint : +${gift.tiers * DONOR_TIER_BONUS * 100} % de production jusqu'à la fin de la saison et ${gift.ecus} écus.`;
      }
    }

    const meNow = entities.get(userId) ?? me;
    // Les dernières lectures partent ensemble (les noms d'alliance ne changent qu'avec une action d'alliance).
    const namesP = ALLIANCE_ACTIONS.has(action.type) || CONFLICT_ACTIONS.has(action.type) ? loadAllianceNames(admin, season.id) : Promise.resolve(allianceNames);
    const [intel, names, info, chronicle, hall, positions, dailyCounts, chiefs] = await Promise.all([
      loadIntelFor(admin, season.id, meNow.allianceId === null ? [userId] : [...entities.values()].filter((e) => !e.isLord && e.allianceId === meNow.allianceId).map((e) => e.id), now),
      namesP,
      namesP.then((n) => allianceInfo(admin, season.id, meNow, finalState, entities, n)),
      wantsChronicle ? loadChronicle(admin, season.id, entities, userId) : Promise.resolve(undefined),
      loadHall(admin),
      loadPositions(admin, season.id, entities),
      loadDailyCounts(admin, season.id, userId, now),
      meNow.allianceId !== null ? loadChiefs(admin, season.id) : Promise.resolve(new Map<number, string | null>()),
    ]);
    const titles = titlesFrom(hall);
    allianceNames = names;
    const snapshot: GameSnapshot = {
      serverNow: now,
      userId,
      username: me.name,
      state: finalState,
      worksite,
      season,
      rivals: rivalsFor(meNow, finalState, entities, worldFrom(worksite), flat, now, intel, allianceNames, conflicts.wars).map((r) => (titles.has(r.id) ? { ...r, titles: titles.get(r.id) } : r)),
      myTitles: titles.get(userId) ?? [],
      ecus,
      ...(away ? { away } : {}),
      lots: lotsView(lotsOf.get(entities) ?? [], meNow, entities, allianceNames, worksite.stage, now),
      masters: mastersView(lotsOf.get(entities) ?? [], entities, allianceNames),
      ...info,
      alliances: [...allianceNames].map(([id, name]) => ({ id, name, size: [...entities.values()].filter((e) => e.allianceId === id).length })),
      war: warView(meNow, conflicts.wars, allianceNames),
      event: eventView(userId, finalState, events, now, currentRate(meNow, finalState, now, worldFrom(worksite), flat), positions, new Map([...entities.values()].map((x) => [x.id, x.name])), entities, baseRate(finalState, worldFrom(worksite), now)),
      fortress: fortressView(meNow, finalState, conflicts.fortress, entities, allianceNames, now, intel.get(FORTRESS_INTEL)?.until ?? null),
      chronicle,
      map: { ...mapView(positions), halls: guildPlaces(entities, names) },
      incoming: incomingFor(userId, entities, now),
      daily: dailyView(finalState, dailyCounts, now),
      guild: guildView(meNow, finalState, entities, chiefs, worldFrom(worksite), now, conflicts.wars, names, intel),
    };
    return error ? { ok: false, error, snapshot } : { ok: true, snapshot, message };
  }
  return { ok: false, error: "Trop d'actions simultanées, réessaie." };
}

// ---------------------------------------------------------------------------
// T2 à T5 : armées en route
// ---------------------------------------------------------------------------

function cleanMarches(raw: unknown): March[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === "object" && typeof m.id === "string" && typeof m.target === "string")
    .map((m) => ({
      id: String(m.id),
      // Toutes les sortes d'armées doivent survivre à la relecture (sinon une marche d'événement redevient un raid).
      kind: (["reinforce", "fortress", "station", "event", "hall_station", "hall_siege"].includes(m.kind) ? m.kind : "raid") as March["kind"],
      target: String(m.target),
      troops: armyCounts(m.troops ?? {}, UNIT_IDS) as Army,
      departAt: Number(m.departAt) || 0,
      arriveAt: Number(m.arriveAt) || 0,
      status: (m.status === "back" || m.status === "camp" ? m.status : "out") as March["status"],
      returnAt: Number(m.returnAt) || 0,
      revealed: m.revealed === true,
      warned: m.warned === true,
      ...(m.hidden === true ? { hidden: true } : {}),
      ...((WING_IDS as string[]).includes(m.wing) ? { wing: m.wing as WingId } : {}),
      loot: Math.max(0, Number(m.loot) || 0),
      ransom: Math.max(0, Number(m.ransom) || 0),
      ...(["won", "lost", "turned", "recalled"].includes(m.outcome) ? { outcome: m.outcome } : {}),
    }));
}

/** Prochaine échéance d'une armée : alerte à mi-chemin, arrivée, ou retour. */
function marchDue(m: March): number {
  if (m.status === "back" || m.status === "camp") return m.returnAt;
  return m.warned ? m.arriveAt : m.departAt + (m.arriveAt - m.departAt) / 2;
}

/**
 * Le serveur ne tourne que quand quelqu'un joue : chaque requête règle les échéances passées de toutes les armées,
 * dans l'ordre, avec leur heure comme horodatage. Renvoie "conflict" si un autre joueur a écrit entre-temps.
 */
async function settleMarches(
  admin: SupabaseClient,
  seasonId: number,
  entities: Map<string, Entity>,
  world: WorldState,
  flat: Map<string, number>,
  wars: WarRow[],
  now: number,
  fortress: FortressRow,
  names: Map<number, string>,
  events: EventState,
): Promise<"none" | "changed" | "conflict"> {
  const group = await resolveGroupEvent(admin, seasonId, entities, world, flat, events, now);
  if (group !== "none") return group;
  // E3 : les espions arrivés livrent leur rapport, un à la fois.
  const spy = [...entities.values()]
    .flatMap((e) => (e.state.spies ?? []).map((sp) => ({ e, sp })))
    .filter((x) => x.sp.arriveAt <= now)
    .sort((a, b) => a.sp.arriveAt - b.sp.arriveAt)[0];
  if (spy) return settleSpy(admin, seasonId, spy.e, spy.sp, entities, fortress, names);
  const mole = await settleMoles(admin, seasonId, entities, now);
  if (mole !== "none") return mole;
  const due = [...entities.values()]
    .flatMap((e) => (e.state.marches ?? []).map((m) => ({ e, m, at: marchDue(m) })))
    .filter((d) => d.at <= now)
    .sort((a, b) => a.at - b.at);
  if (due.length === 0) {
    // V6 : la trêve fait rentrer les armées encore à l'aller.
    const truce = [...entities.values()].find((e) => (e.state.marches ?? []).some((m) => m.status === "out") && eventActive(e.state, "treve", now));
    if (!truce) return "none";
    const state = { ...truce.state, marches: (truce.state.marches ?? []).map((m) => (m.status === "out" ? { ...m, status: "back" as const, returnAt: now + (now - m.departAt), outcome: "recalled" as const } : m)) };
    const { data } = await admin.rpc("commit_state", { p_season: seasonId, p_state: toJson(truce, state), p_touch: false, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
    return (data as { conflict?: boolean } | null)?.conflict ? "conflict" : "changed";
  }
  const { e: owner, m, at } = due[0];
  const replace = (state: PlayerState, next: March | null): PlayerState => ({
    ...state,
    marches: (state.marches ?? []).flatMap((x) => (x.id === m.id ? (next ? [next] : []) : [x])),
  });
  const commit = async (e: Entity, state: PlayerState) => {
    const { data } = await admin.rpc("commit_state", { p_season: seasonId, p_state: toJson(e, state), p_touch: false, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
    return (data as { conflict?: boolean } | null)?.conflict ? ("conflict" as const) : ("changed" as const);
  };
  const outMs = m.arriveAt - m.departAt;
  const victim = entities.get(m.target);

  if (m.status === "camp") {
    // V8, V9 : fin de l'événement, l'armée postée rentre avec ce qu'elle a gagné.
    const s = advanceEntity(owner, at, world, flat);
    const rate = currentRate(owner, s, at, world, flat);
    let loot = 0;
    if (m.target.startsWith("mine:")) loot = mineReward(m, at, rate);
    if (m.target.startsWith("treasure:")) loot = Math.floor(medianRate(entities, at, world, flat) * TREASURE_PRIZE_SECONDS);
    const r = await commit(owner, replace(owner.state, { ...m, status: "back", loot: m.loot + loot, returnAt: at + outMs, outcome: "won" }));
    if (r === "changed" && loot > 0 && !owner.isLord) {
      notify(admin, [owner.id], { title: m.target.startsWith("mine:") ? "⛏️ Le filon est épuisé" : "💰 Le trésor est à toi !", body: `Ton armée rentre avec ${loot.toLocaleString("fr-FR")} pierres.`, tag: "event" });
    }
    return r;
  }

  if (m.status === "back") {
    // Retour : survivants, butin et rançon rendus au domaine.
    const s = advanceEntity(owner, now, world, flat);
    // Un seigneur n'a pas de troupes à loger : seul le butin rentre au coffre.
    const landed = owner.isLord
      ? { ...s, stone: s.stone + m.loot, totalPlundered: s.totalPlundered + m.loot, marches: (s.marches ?? []).filter((x) => x.id !== m.id) }
      : landMarch(s, m.id);
    const r = await commit(owner, landed);
    if (r === "changed" && !owner.isLord && (m.loot > 0 || m.ransom > 0)) {
      notify(admin, [owner.id], { title: "🏇 Ton armée est rentrée", body: `Elle rapporte ${Math.floor(m.loot + m.ransom).toLocaleString("fr-FR")} pierres.`, tag: "march" });
    }
    return r;
  }

  if (m.kind === "event" && !m.target.startsWith("event:")) {
    const ev = events.active;
    const [what, idRaw, campId] = m.target.split(":");
    const turned = () => commit(owner, replace(owner.state, { ...m, status: "back", returnAt: m.arriveAt + outMs, outcome: "turned" }));
    if (!ev || String(ev.id) !== idRaw || ms(ev.ends_at) <= at) return turned();
    const endsAt = ms(ev.ends_at);
    const write = async (states: { e: Entity; state: PlayerState }[], data: EventData) => {
      const { error } = await admin.rpc("apply_event_data", { p_season: seasonId, p_states: states.map((x) => toJson(x.e, x.state)), p_event: ev.id, p_version: ev.version, p_data: data, p_attackers: null });
      if (error?.message.includes("beffroi_conflict")) return "conflict" as const;
      if (error) throw new Error(`Événement : ${error.message}`);
      return "changed" as const;
    };
    const survivorsOf = (army: Army, lost: Army) => cleanArmy(Object.fromEntries((Object.entries(army) as [string, number][]).map(([id, n]) => [id, n - ((lost as Record<string, number>)[id] ?? 0)])) as Army);
    const aState = advanceEntity(owner, at, world, flat);
    if (what === "convoy" || what === "siege") {
      // V10, V11 : l'armée attend le combat commun sur place.
      if (ev.data.resolved || at >= battleAt(ev)) return turned();
      return commit(owner, replace(owner.state, { ...m, status: "camp", returnAt: battleAt(ev) + 6 * 3_600_000 }));
    }
    if (what === "mine") {
      // V9 : l'armée s'installe sur le filon jusqu'à la fin, sans combattre.
      return commit(owner, replace(owner.state, { ...m, status: "camp", returnAt: endsAt }));
    }
    if (what === "camp") {
      const camps = ev.data.camps ?? [];
      const c = camps.find((x) => x.id === campId);
      if (!c || c.winner) return turned();
      const fight = battle(m.troops, c.army, Math.random, { attackerLevels: aState.levels, defenderLevels: events.levels });
      const near = entities.get(c.owner);
      const prize = fight.success && near ? Math.floor(currentRate(near, advanceEntity(near, at, world, flat), at, world, flat) * BANDIT_PRIZE_SECONDS) : 0;
      const survivors = survivorsOf(m.troops, fight.attackerLost);
      const back: March = { ...m, troops: survivors, status: "back", returnAt: at + outMs, loot: prize, outcome: fight.success ? "won" : "lost" };
      const healed = addWounded(aState, woundedOf(fight.attackerLost, fight.success ? WOUNDED_WINNER : WOUNDED_ATTACKER_BEATEN), at);
      const next = camps.map((x) => (x.id === c.id ? { ...x, army: fight.success ? {} : fight.defenderLeft, winner: fight.success ? owner.id : null } : x));
      const r = await write([{ e: owner, state: replace(healed, armySize(survivors) > 0 || prize > 0 ? back : null) }], { ...ev.data, camps: next });
      if (r === "changed" && !owner.isLord) {
        notify(admin, [owner.id], fight.success
          ? { title: "🏕️ Camp de bandits vidé !", body: `Ton armée rapporte ${prize.toLocaleString("fr-FR")} pierres au retour.`, tag: "event" }
          : { title: "🏕️ Les bandits ont tenu", body: "Tes survivants rentrent.", tag: "event" });
      }
      return r;
    }
    if (what === "treasure") {
      // V8 : la case revient à qui la tient ; chaque arrivée défie le détenteur.
      if (inCurfew(aState, at)) return turned();
      const holder = ev.data.holder ?? null;
      const holderEntity = holder ? entities.get(holder.owner) : undefined;
      const holderMarch = holderEntity?.state.marches?.find((x) => x.id === holder?.march && x.status === "camp");
      if (!holder || !holderEntity || !holderMarch || holderEntity.id === owner.id) {
        return write([{ e: owner, state: replace(owner.state, { ...m, status: "camp", returnAt: endsAt }) }], { ...ev.data, holder: { owner: owner.id, march: m.id } });
      }
      const hState = advanceEntity(holderEntity, at, world, flat);
      const fight = battle(m.troops, holderMarch.troops, Math.random, { attackerLevels: aState.levels, defenderLevels: hState.levels });
      const mine = survivorsOf(m.troops, fight.attackerLost);
      const theirs = survivorsOf(holderMarch.troops, fight.defenderLost);
      const hOut = holderMarch.arriveAt - holderMarch.departAt;
      const meNext: March = fight.success ? { ...m, troops: mine, status: "camp", returnAt: endsAt } : { ...m, troops: mine, status: "back", returnAt: at + outMs, outcome: "lost" };
      const themNext: March = fight.success ? { ...holderMarch, troops: theirs, status: "back", returnAt: at + hOut, outcome: "lost" } : { ...holderMarch, troops: theirs };
      const keepMe = armySize(mine) > 0;
      const keepThem = armySize(theirs) > 0;
      const states = [
        { e: owner, state: replace(addWounded(aState, woundedOf(fight.attackerLost, fight.success ? WOUNDED_WINNER : WOUNDED_ATTACKER_BEATEN), at), keepMe ? meNext : null) },
        { e: holderEntity, state: { ...addWounded(hState, woundedOf(fight.defenderLost, fight.success ? WOUNDED_DEFENDER_BEATEN : WOUNDED_WINNER), at), marches: (hState.marches ?? []).flatMap((x) => (x.id === holderMarch.id ? (keepThem ? [themNext] : []) : [x])) } },
      ];
      const newHolder = fight.success && keepMe ? { owner: owner.id, march: m.id } : !fight.success && keepThem ? holder : null;
      const r = await write(states, { ...ev.data, holder: newHolder });
      if (r === "changed") {
        notify(admin, [holderEntity.id], fight.success ? { title: "💰 Le trésor t'échappe !", body: `${owner.name} a chassé ton armée.`, tag: "event" } : { title: "💰 Tu tiens le trésor", body: `Ton armée a repoussé ${owner.name}.`, tag: "event" });
      }
      return r;
    }
    return turned();
  }

  if (m.kind === "event") {
    // T6 : l'assaut se joue à l'arrivée, si l'événement est encore là.
    const ev = events.active;
    if (!ev || `event:${ev.id}` !== m.target || ms(ev.ends_at) <= at) return commit(owner, replace(owner.state, { ...m, status: "back", returnAt: m.arriveAt + outMs, outcome: "turned" }));
    const aState = advanceEntity(owner, at, world, flat);
    const r = await runEventAttack(admin, seasonId, owner, aState, events, at, currentRate(owner, aState, at, world, flat), m);
    if (r === "conflict") return "conflict";
    if (r.error) return commit(owner, replace(owner.state, { ...m, status: "back", returnAt: m.arriveAt + outMs, outcome: "turned" }));
    if (r.settle !== undefined) {
      const { data: killed } = await admin.from("events").select("*").eq("id", r.settle).maybeSingle();
      await admin.rpc("settle_event_v2", { p_event: r.settle, p_bonus: killed ? killBonus(eventRow(killed), entities, at, world, flat) : {} });
    }
    if (r.message && !owner.isLord) notify(admin, [owner.id], { title: ev.kind === "caravane" ? "🐪 Caravane" : "🗿 Colosse", body: r.message.replace(/^\S+\s/, ""), tag: "event" });
    return "changed";
  }

  if (m.kind === "hall_station" || m.kind === "hall_siege") return settleHallMarch(admin, seasonId, owner, m, at, entities, world, flat, wars, names, replace, commit);

  if (m.kind === "station") {
    // T6 : la garnison n'entre que si son alliance tient encore la forteresse.
    if (owner.allianceId === null || fortress.holder !== owner.allianceId) return commit(owner, replace(owner.state, { ...m, status: "back", returnAt: m.arriveAt + outMs, outcome: "turned" }));
    const garrison = { ...garrisonOf(fortress) };
    const group = { ...(garrison[owner.id] ?? {}) } as Record<string, number>;
    for (const [u, n] of Object.entries(m.troops) as [string, number][]) if (n > 0) group[u] = (group[u] ?? 0) + n;
    garrison[owner.id] = group as PlayerState["troops"];
    const r = await applyFortress(admin, seasonId, fortress, owner, replace(owner.state, null), fortress.holder, garrison, false, "fortress_station", {});
    return r === "conflict" ? "conflict" : "changed";
  }

  if (m.kind === "fortress") {
    // T6 : l'assaut se joue à l'arrivée, contre la garnison présente.
    const aState = advanceEntity(owner, at, world, flat);
    const blocked = fortressBlocker(owner, aState, fortress, at, m.troops);
    if (blocked) return commit(owner, replace(owner.state, { ...m, status: "back", returnAt: m.arriveAt + outMs, outcome: "turned" }));
    const defense = fortressDefense(fortress, entities, at);
    const levels = { attackerLevels: aState.levels, defenderLevels: fortressLevels(fortress, entities) };
    const chance = estimateChance(m.troops, defense, levels);
    const fight = battle(m.troops, defense, Math.random, levels);
    const theirs = splitTroopLosses(garrisonHost(fortress, at), fight.defenderLost);
    const survivors = cleanArmy(Object.fromEntries((Object.entries(m.troops) as [string, number][]).map(([id, n]) => [id, n - ((fight.attackerLost as Record<string, number>)[id] ?? 0)])) as Army);
    const healed = addWounded(aState, woundedOf(fight.attackerLost, fight.success ? WOUNDED_WINNER : WOUNDED_ATTACKER_BEATEN), at);
    const back: March = { ...m, troops: survivors, status: "back", returnAt: at + outMs, outcome: fight.success ? "won" : "lost" };
    const after = replace(healed, armySize(survivors) > 0 ? back : null);
    const details = { success: fight.success, chance, rounds: fight.rounds, alliance: owner.allianceId, attackerLost: fight.attackerLost, defenderLost: fight.defenderLost, log: fight.log };
    const r = await applyFortress(admin, seasonId, fortress, owner, after, fight.success ? owner.allianceId : fortress.holder, fight.success ? {} : theirs.stationed, fight.success, "fortress_attack", details);
    if (r === "conflict") return "conflict";
    if (fortress.holder !== null) {
      const defenders = [...entities.values()].filter((e) => !e.isLord && e.allianceId === fortress.holder).map((e) => e.id);
      notify(admin, defenders, fight.success
        ? { title: "🏰 La forteresse est tombée !", body: `${owner.name} l'a prise pour ${names.get(owner.allianceId!) ?? "son alliance"}.`, tag: "fortress" }
        : { title: "🏰 La forteresse a tenu", body: `${owner.name} s'est brisé sur vos murs.`, tag: "fortress" });
    }
    notify(admin, [owner.id], fight.success
      ? { title: "🏰 Forteresse prise !", body: `La ${FORTRESS_NAME} est à ton alliance. Envoie vite une garnison.`, tag: "fortress" }
      : { title: "🏰 Assaut repoussé", body: `La ${FORTRESS_NAME} a tenu. Tes survivants rentrent.`, tag: "fortress" });
    return "changed";
  }

  if (m.kind === "reinforce") {
    // T6 : les renforts ne défendent l'allié qu'une fois arrivés ; s'il n'est plus allié, ils rentrent.
    const turnBack = { ...m, status: "back" as const, warned: true, returnAt: m.arriveAt + outMs, outcome: "turned" as const };
    if (!victim || !isAllied(owner, victim)) return commit(owner, replace(owner.state, turnBack));
    const host = advanceEntity(victim, at, world, flat);
    const group = { ...(host.stationed?.[owner.id] ?? {}) } as Record<string, number>;
    for (const [u, n] of Object.entries(m.troops) as [string, number][]) if (n > 0) group[u] = (group[u] ?? 0) + n;
    const written = await writeStates(admin, seasonId, [
      { e: owner, state: replace(owner.state, null) },
      { e: victim, state: { ...host, stationed: { ...host.stationed, [owner.id]: group as PlayerState["troops"] } } },
    ], "reinforce_arrive", { owner: owner.id, host: victim.id });
    return written === "conflict" ? "conflict" : "changed";
  }

  if (!m.warned) {
    // T5 : alerte à mi-chemin ; V14 : pas d'alerte dans le brouillard.
    // E4 : un guet saboté laisse passer l'armée sans alerte, comme le brouillard.
    const fog = eventActive(owner.state, "brouillard", at) || (!!victim && !victim.isLord && (victim.state.blindUntil ?? 0) > at);
    const r = await commit(owner, replace(owner.state, { ...m, warned: true, ...(fog ? { revealed: false, hidden: true } : {}) }));
    if (r === "changed" && victim && !victim.isLord && !fog) {
      const from = m.revealed ? ` de ${owner.name}` : "";
      notify(admin, [victim.id], { title: "⚠️ Une armée approche !", body: `Une armée${from} arrive vers ${new Date(m.arriveAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}.`, tag: "march" });
    }
    return r;
  }

  // Arrivée : le combat se joue contre la défense présente à cet instant.
  const turn = (outcome: March["outcome"]) => ({ ...m, status: "back" as const, returnAt: m.arriveAt + outMs, outcome });
  if (!victim) return commit(owner, replace(owner.state, turn("turned")));
  const aState = advanceEntity(owner, at, world, flat);
  const vState = advanceEntity(victim, at, world, flat);
  const aRate = currentRate(owner, aState, at, world, flat);
  const vRate = currentRate(victim, vState, at, world, flat);
  const ctx = {
    now: at,
    attackerId: owner.id,
    victimId: victim.id,
    victimRate: vRate,
    stagesDone: stagesDoneAt(world, at),
    defenderArmy: victim.isLord ? lordArmies(entities, world, at, flat).get(victim.id)?.defense : undefined,
    allied: isAllied(owner, victim),
    atWar: !!warBetween(wars, owner.allianceId, victim.allianceId, at),
    attackerRate: aRate,
    relativeSize: victim.isLord || owner.isLord ? undefined : relativeSize(sizeOf(vState, vRate), attackerSizeOf(owner.id, aState, entities, aRate)),
    attackerArmy: m.troops,
    attackerIsLord: owner.isLord,
    marching: true,
    allowRepeat: true,
  };
  const armies = raidArmies(aState, vState, ctx);
  const chance = estimateChance(armies.attack, armies.defense, armies.opts);
  const fight = resolveRaid(aState, vState, { ...ctx, rng: Math.random });
  if (!fight.ok) return commit(owner, replace(owner.state, turn("turned")));
  const rep = fight.value.report;
  // V13 : un seigneur repoussé sous la lune rouge laisse une rançon au défenseur.
  const moonRansom = owner.isLord && !rep.success && eventActive(vState, "lune", at) ? Math.floor(armyValue(m.troops) * RED_MOON_RANSOM) : 0;
  if (moonRansom > 0) fight.value.victim = { ...fight.value.victim, stone: fight.value.victim.stone + moonRansom };
  const survivors = cleanArmy(Object.fromEntries((Object.entries(m.troops) as [string, number][]).map(([id, n]) => [id, n - ((rep.attackerLost as Record<string, number>)[id] ?? 0)])) as Army);
  const back: March = { ...m, troops: survivors, status: "back", returnAt: at + outMs, loot: rep.stolen, ransom: rep.ransom, outcome: rep.success ? "won" : "lost" };
  const attackerAfter = replace(fight.value.attacker, armySize(survivors) > 0 || back.loot + back.ransom > 0 ? back : null);
  const { data, error: rpcError } = await admin.rpc("apply_raid_group", {
    p_season: seasonId,
    p_attacker: toJson(owner, attackerAfter),
    p_victim: toJson(victim, fight.value.victim),
    p_allies: [],
    p_attacker_touch: false,
    p_chronicle: chronicleDetails(rep, chance),
  });
  if (rpcError?.message.includes("beffroi_conflict") || (data as { conflict?: boolean } | null)?.conflict) return "conflict";
  if (rpcError) throw new Error(`Raid impossible : ${rpcError.message}`);
  const war = warBetween(wars, owner.allianceId, victim.allianceId, at);
  if (war && rep.stolen > 0) await admin.rpc("add_war_score", { p_war: war.id, p_alliance: owner.allianceId, p_amount: rep.stolen });
  if (!victim.isLord) {
    notify(admin, [victim.id], rep.success
      ? { title: "⚔️ Tu as été pillé !", body: `${owner.name} t'a volé ${Math.floor(rep.stolen).toLocaleString("fr-FR")} pierres.`, tag: "raid" }
      : { title: "🛡️ Raid repoussé", body: `Tes défenses ont repoussé ${owner.name}${moonRansom ? ` : ${moonRansom.toLocaleString("fr-FR")} pierres de rançon` : ""}.`, tag: "raid" });
  }
  if (!owner.isLord) {
    notify(admin, [owner.id], rep.success
      ? { title: "⚔️ Raid réussi", body: `Contre ${victim.name} : ${Math.floor(rep.stolen + rep.ransom).toLocaleString("fr-FR")} pierres rapportées au retour.`, tag: "raid" }
      : { title: "💀 Raid repoussé", body: `${victim.name} a tenu. Tes survivants rentrent.`, tag: "raid" });
  }
  return "changed";
}

function marchId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const EVENT_ICON: Partial<Record<EventKind, string>> = { caravane: "🐪", colosse: "🗿", filon: "⛏️", bandits: "🏕️", tresor: "💰", convoi: "👑", siege: "🏰" };
const EVENT_PLACE: Partial<Record<EventKind, string>> = { caravane: "la caravane", colosse: "le colosse", filon: "le filon", bandits: "le camp de bandits", tresor: "le trésor", convoi: "le point d'embuscade", siege: "le beffroi" };

/** V10, V11 : cible des armées postées sur le convoi ou au beffroi. */
function groupTarget(e: EventRow): string {
  return `${e.kind === "convoi" ? "convoy" : "siege"}:${e.id}`;
}

/** Armées postées sur le convoi ou au beffroi, avec leur propriétaire. */
function postedOn(e: EventRow, entities: Map<string, Entity>): { e: Entity; m: March }[] {
  const target = groupTarget(e);
  return [...entities.values()].flatMap((x) => (x.state.marches ?? []).filter((m) => m.target === target && m.status === "camp").map((m) => ({ e: x, m })));
}

function sumArmies(armies: Army[]): Army {
  const out: Record<string, number> = {};
  for (const a of armies) for (const [id, n] of Object.entries(a) as [string, number][]) out[id] = (out[id] ?? 0) + n;
  return cleanArmy(out as Army);
}

/** V12 : inscription au tournoi, armée composée avec le budget commun. */
function tourneyEntry(e: EventRow, wanted: unknown, now: number): { army: Army } | { error: string } {
  if (e.kind !== "tournoi") return { error: "Aucun tournoi en cours." };
  if (e.data.resolved || now >= battleAt(e)) return { error: "Le tournoi est terminé." };
  const army: Record<string, number> = {};
  for (const u of UNITS) {
    const n = Math.floor(Number((wanted as Record<string, unknown> | null)?.[u.id] ?? 0));
    if (n > 0) army[u.id] = n;
  }
  if (armySize(army as Army) === 0) return { error: "Compose une armée pour t'inscrire." };
  if (armyValue(army as Army) > (e.data.budget ?? 0)) return { error: "Ton armée dépasse le budget du tournoi." };
  return { army: army as Army };
}

/** V10 à V12 : le combat commun se joue une fois, à son heure ; les gains suivent les armées. */
async function resolveGroupEvent(
  admin: SupabaseClient,
  seasonId: number,
  entities: Map<string, Entity>,
  world: WorldState,
  flat: Map<string, number>,
  events: EventState,
  now: number,
): Promise<"none" | "changed" | "conflict"> {
  const ev = events.active;
  if (!ev || !GROUP_EVENTS.includes(ev.kind) || ev.data.resolved || now < battleAt(ev)) return "none";
  const at = battleAt(ev);
  const write = async (states: { e: Entity; state: PlayerState }[], data: EventData) => {
    const { error } = await admin.rpc("apply_event_data", { p_season: seasonId, p_states: states.map((x) => toJson(x.e, x.state)), p_event: ev.id, p_version: ev.version, p_data: data, p_attackers: null });
    if (error?.message.includes("beffroi_conflict")) return "conflict" as const;
    if (error) throw new Error(`Événement : ${error.message}`);
    ev.data = data;
    ev.version++;
    return "changed" as const;
  };
  const rateOf = (x: Entity, s: PlayerState) => currentRate(x, s, at, world, flat);

  if (ev.kind === "tournoi") {
    const entries = ev.data.entries ?? {};
    const podium = Object.keys(entries).length >= 2 ? tourneyPodium(entries, ev.id * 31 + seasonId) : [];
    const states = podium.flatMap((id, i) => {
      const x = entities.get(id);
      if (!x) return [];
      const s = advanceEntity(x, at, world, flat);
      return [{ e: x, state: { ...s, stone: s.stone + Math.floor(rateOf(x, s) * TOURNEY_PRIZES_SECONDS[i]) } }];
    });
    const r = await write(states, { ...ev.data, resolved: true, podium });
    if (r === "changed") {
      const names = podium.map((id) => entities.get(id)?.name ?? "?");
      if (podium.length) notify(admin, Object.keys(entries), { title: `🏆 ${names[0]} remporte le tournoi !`, body: names.length > 1 ? `Podium : ${names.join(", ")}.` : "", tag: "event" });
      else if (Object.keys(entries).length) notify(admin, Object.keys(entries), { title: "🏆 Tournoi annulé", body: "Pas assez d'inscrits cette fois.", tag: "event" });
    }
    return r;
  }

  const posted = postedOn(ev, entities);
  const defenders = sumArmies(posted.map((p) => p.m.troops));
  const fight = armySize(defenders) > 0 ? battle(ev.data.enemy ?? {}, defenders, Math.random, { attackerLevels: events.levels, defenderLevels: events.levels }) : null;
  const won = !!fight && !fight.success;
  // Siège sans défenseur : l'armée repart sans rien détruire ; la perte ne frappe qu'une défense tentée et battue.
  const outcome: "won" | "lost" | "left" = !fight ? "left" : won ? "won" : "lost";
  const pseudo = { troops: {}, stationed: Object.fromEntries(posted.map((p) => [p.m.id, { ...p.m.troops }])) } as unknown as PlayerState;
  const lostBy = fight ? splitTroopLosses(pseudo, fight.defenderLost).byOwner : {};
  const share = ev.kind === "convoi" ? CONVOY_WOUNDED : won ? WOUNDED_WINNER : WOUNDED_DEFENDER_BEATEN;
  const prizeSeconds = ev.kind === "convoi" ? CONVOY_PRIZE_SECONDS : SIEGE_PRIZE_SECONDS;
  const byEntity = new Map<string, { e: Entity; state: PlayerState }>();
  for (const { e: x, m } of posted) {
    const cur = byEntity.get(x.id)?.state ?? advanceEntity(x, at, world, flat);
    const lost = lostBy[m.id] ?? {};
    const survivors = cleanArmy(Object.fromEntries((Object.entries(m.troops) as [string, number][]).map(([id, n]) => [id, n - ((lost as Record<string, number>)[id] ?? 0)])) as Army);
    const prize = won ? Math.floor(rateOf(x, cur) * prizeSeconds) : 0;
    const back: March = { ...m, troops: survivors, status: "back", returnAt: at + (m.arriveAt - m.departAt), loot: m.loot + prize, outcome: won ? "won" : "lost" };
    const healed = addWounded(cur, woundedOf(lost, share), at);
    const keep = armySize(survivors) > 0 || prize > 0;
    byEntity.set(x.id, { e: x, state: { ...healed, marches: (healed.marches ?? []).flatMap((y) => (y.id === m.id ? (keep ? [back] : []) : [y])) } });
  }
  const r = await write([...byEntity.values()], { ...ev.data, resolved: true, outcome });
  if (r !== "changed") return r;
  if (ev.kind === "siege" && outcome === "lost") await admin.rpc("siege_damage", { p_season: seasonId, p_share: SIEGE_STAGE_LOSS, p_stages: STAGES.length });
  const ids = [...byEntity.keys()];
  if (ev.kind === "convoi") {
    if (ids.length) notify(admin, ids, won ? { title: "👑 Le convoi est passé !", body: "Ton escorte rentre avec 45 minutes de ta production.", tag: "event" } : { title: "👑 Le convoi est tombé", body: "L'embuscade a eu raison de l'escorte. Tes blessés passent par l'infirmerie.", tag: "event" });
  } else if (outcome !== "left") {
    notify(admin, won ? ids : "all", won ? { title: "🏰 Le beffroi a tenu !", body: "Tes défenseurs rentrent avec 1 heure de ta production.", tag: "event" } : { title: "🏰 Le beffroi a souffert du siège", body: "L'étape en cours perd 10 % de sa pierre.", tag: "event" });
  }
  return r;
}

/** V7 à V9 : où va l'armée envoyée sur un événement posé sur la carte. */
function localTarget(e: EventRow, camp: string, meId: string, state: PlayerState, now: number): { target: string; pos: MapPos } | { error: string } {
  if (e.kind === "bandits") {
    const c = (e.data.camps ?? []).find((x) => x.id === camp) ?? (e.data.camps ?? []).find((x) => x.owner === meId && !x.winner);
    if (!c) return { error: "Aucun camp de bandits à attaquer." };
    if (c.winner) return { error: "Ce camp a déjà été vidé." };
    return { target: `camp:${e.id}:${c.id}`, pos: c.pos };
  }
  if (e.kind === "convoi" || e.kind === "siege") {
    if (e.data.resolved || now >= battleAt(e)) return { error: e.kind === "convoi" ? "Le convoi est déjà passé." : "Le siège est terminé." };
    if (!e.data.pos) return { error: "Événement introuvable sur la carte." };
    return { target: groupTarget(e), pos: e.data.pos };
  }
  if (e.kind === "tresor" && inCurfew(state, now)) return { error: "Tu es en couvre-feu : pas de combat pour le trésor." };
  if (!e.data.pos) return { error: "Événement introuvable sur la carte." };
  return { target: `${e.kind === "filon" ? "mine" : "treasure"}:${e.id}`, pos: e.data.pos };
}

/** Production médiane des joueurs (prix du trésor). */
function medianRate(entities: Map<string, Entity>, now: number, world: WorldState, flat: Map<string, number>): number {
  const rates = [...entities.values()].filter((e) => !e.isLord).map((e) => currentRate(e, advance(e.state, now, world), now, world, flat)).sort((a, b) => a - b);
  return rates.length ? rates[Math.floor(rates.length / 2)] : 0;
}

/** T6 : position d'un événement de combat sur la carte à l'instant t. */
function eventPosAt(e: EventRow, positions: Map<string, MapPos>, t: number): MapPos {
  if (e.kind === "caravane") return caravanPos(e.id, ms(e.starts_at), ms(e.ends_at), t);
  const players = [...positions.entries()].filter(([id]) => !LORDS.some((l) => l.id === id)).map(([, p]) => p);
  return colossusPos(e.id, players);
}

async function travelToFortress(admin: SupabaseClient, seasonId: number, entities: Map<string, Entity>, fromId: string, army: Army): Promise<number> {
  const positions = await loadPositions(admin, seasonId, entities);
  const a = positions.get(fromId);
  const owner = entities.get(fromId);
  return travelMs(army, a ? mapDistance(a, FORTRESS_POS) : MAP_SPAWN_RADIUS, owner ? armySpeedBonus(owner.state) : 0);
}

/** Durée de l'aller entre deux lieux de la carte pour une armée donnée. */
async function travelBetween(admin: SupabaseClient, seasonId: number, entities: Map<string, Entity>, fromId: string, toId: string, army: Army, speedBonus = 0): Promise<number> {
  const positions = await loadPositions(admin, seasonId, entities);
  const a = positions.get(fromId);
  const b = positions.get(toId);
  return travelMs(army, a && b ? mapDistance(a, b) : MAP_SPAWN_RADIUS, speedBonus);
}

/** T5 : armées qui approchent de mon domaine (passé la mi-chemin). */
function incomingFor(meId: string, entities: Map<string, Entity>, now: number): IncomingView[] {
  return [...entities.values()].flatMap((e) =>
    (e.state.marches ?? [])
      .filter((m) => m.kind === "raid" && m.target === meId && m.status === "out" && m.warned && !m.hidden && m.arriveAt > now)
      .map((m) => ({ id: m.id, arriveAt: m.arriveAt, from: m.revealed ? e.name : null, ...(wingLevel(entities.get(meId)?.state.hall, "guet") >= 3 ? { troops: m.troops } : {}) })),
  );
}

// ---------------------------------------------------------------------------
// T1 : carte du royaume
// ---------------------------------------------------------------------------

let positionsCache: { seasonId: number; byId: Map<string, MapPos> } | null = null;

/** Positions de tous les lieux de la saison ; place les joueurs qui n'en ont pas encore. */
async function loadPositions(admin: SupabaseClient, seasonId: number, entities: Map<string, Entity>): Promise<Map<string, MapPos>> {
  const missing = () => [...entities.values()].filter((e) => !e.lord && !e.isLord && !positionsCache?.byId.has(e.id));
  if (!positionsCache || positionsCache.seasonId !== seasonId || missing().length > 0) {
    const { data } = await admin.from("map_positions").select("user_id, x, y").eq("season_id", seasonId);
    const byId = new Map<string, MapPos>((data ?? []).map((r) => [r.user_id as string, [Number(r.x), Number(r.y)] as MapPos]));
    positionsCache = { seasonId, byId };
    for (const e of missing()) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const spot = pickSpawn([...fixedPlaces(), ...positionsCache.byId.values()]);
        if (!spot) break;
        const { error } = await admin.from("map_positions").insert({ season_id: seasonId, user_id: e.id, x: spot[0], y: spot[1] });
        if (!error) {
          positionsCache.byId.set(e.id, spot);
          break;
        }
        // Case prise entre-temps, ou joueur déjà placé par une autre requête : on relit.
        const { data: again } = await admin.from("map_positions").select("user_id, x, y").eq("season_id", seasonId);
        for (const r of again ?? []) positionsCache.byId.set(r.user_id as string, [Number(r.x), Number(r.y)]);
        if (positionsCache.byId.has(e.id)) break;
      }
    }
  }
  const out = new Map(positionsCache.byId);
  for (const e of entities.values()) if (e.lord) out.set(e.id, LORD_POSITIONS[e.lord.key]);
  return out;
}

function mapView(positions: Map<string, MapPos>): MapView {
  return {
    size: MAP_SIZE,
    belfry: BELFRY_POS,
    fortress: FORTRESS_POS,
    places: Object.fromEntries([...positions].map(([id, p]) => [id, [p[0], p[1]] as [number, number]])),
  };
}

/** Classements de la saison : contributeurs au chantier et pillards (seigneurs exclus). */
// ---------------------------------------------------------------------------
// Classements et panthéon
// ---------------------------------------------------------------------------

/** Classements d'une saison dans toutes les catégories, arrêtés à `until` (fin de saison ou maintenant). */
async function seasonStandings(admin: SupabaseClient, seasonId: number, until: number): Promise<Standing[]> {
  const [{ data: players }, { data: events }, { data: captures }, { data: wars }, { data: alliances }, { data: repelled }, { data: history }] = await Promise.all([
    admin.from("player_states").select("user_id, total_contributed, total_plundered, total_produced, profiles(username, is_bot)").eq("season_id", seasonId),
    admin.from("events").select("kind, attackers").eq("season_id", seasonId),
    admin.from("chronicle").select("created_at, details").eq("season_id", seasonId).eq("kind", "fortress").order("created_at", { ascending: true }),
    admin.from("wars").select("winner").eq("season_id", seasonId).eq("settled", true).not("winner", "is", null),
    admin.from("alliances").select("id, name").eq("season_id", seasonId),
    admin.from("chronicle").select("target_id").eq("season_id", seasonId).eq("kind", "raid").eq("details->>success", "false").lte("created_at", iso(until)),
    admin.from("rate_history").select("user_id, day, rate").eq("season_id", seasonId).order("day", { ascending: true }),
  ]);
  type Row = { user_id: string; total_contributed: number; total_plundered: number; total_produced: number; profiles: { username: string; is_bot: boolean } | null };
  const humans = ((players ?? []) as unknown as Row[]).filter((r) => r.profiles && !r.profiles.is_bot);
  const names = new Map(humans.map((r) => [r.user_id, r.profiles!.username]));
  const allianceNames = new Map((alliances ?? []).map((a) => [String(a.id), a.name as string]));
  // B12 : catégories relatives, pour que les petits joueurs puissent gagner un titre.
  const real = humans.filter((r) => Number(r.total_produced ?? 0) >= HALL_MIN_PRODUCED);
  const progress = new Map<string, number>();
  const day7 = new Date(until - 7 * 86_400_000).toISOString().slice(0, 10);
  const byUser = new Map<string, { day: string; rate: number }[]>();
  for (const h of (history ?? []) as { user_id: string; day: string; rate: number }[]) byUser.set(h.user_id, [...(byUser.get(h.user_id) ?? []), { day: h.day, rate: Number(h.rate) }]);
  for (const [id, list] of byUser) {
    // Production d'il y a 7 jours (ou la plus ancienne relevée), comparée à la dernière.
    const past = [...list].reverse().find((h) => h.day <= day7) ?? list[0];
    const last = list[list.length - 1];
    if (past && last && past.rate > 0 && last.day > past.day) progress.set(id, last.rate / past.rate);
  }
  const totals: Record<HallCategory, Map<string, number>> = {
    generous: new Map(real.map((r) => [r.user_id, (Number(r.total_contributed ?? 0) / Number(r.total_produced)) * 100])),
    plunderer: new Map(humans.map((r) => [r.user_id, Number(r.total_plundered ?? 0)])),
    progress,
    colossus: new Map(),
    defender: new Map(),
    fortress: new Map(),
    war: new Map(),
  };
  for (const r of (repelled ?? []) as { target_id: string | null }[]) if (r.target_id) totals.defender.set(r.target_id, (totals.defender.get(r.target_id) ?? 0) + 1);
  for (const e of events ?? []) {
    if (e.kind !== "colosse") continue;
    for (const [id, v] of Object.entries((e.attackers ?? {}) as Record<string, number>)) totals.colossus.set(id, (totals.colossus.get(id) ?? 0) + Number(v));
  }
  // Temps de garde de la forteresse : d'une prise réussie à la suivante (ou à la fin).
  const held = ((captures ?? []) as { created_at: string; details: { success?: boolean; alliance?: number } }[]).filter((c) => c.details?.success && c.details.alliance != null);
  held.forEach((c, i) => {
    const from = ms(c.created_at);
    const to = Math.min(until, i + 1 < held.length ? ms(held[i + 1].created_at) : until);
    const id = String(c.details.alliance);
    if (to > from) totals.fortress.set(id, (totals.fortress.get(id) ?? 0) + (to - from));
  });
  for (const w of wars ?? []) totals.war.set(String(w.winner), (totals.war.get(String(w.winner)) ?? 0) + 1);

  return HALL.map((h) => ({
    category: h.id,
    rows: [...totals[h.id]]
      .filter(([id, v]) => v > 0 && (h.alliance ? allianceNames.has(id) : names.has(id)))
      .map(([id, value]) => ({ id, name: (h.alliance ? allianceNames.get(id) : names.get(id)) ?? "?", value }))
      .sort((a, b) => b.value - a.value),
  }));
}

/** Fige le podium des saisons terminées qui ne l'ont pas encore été. */
async function closeEndedSeasons(admin: SupabaseClient, now: number): Promise<void> {
  const { data: ended } = await admin.from("seasons").select("id, ends_at").eq("hall_closed", false).lte("ends_at", iso(now));
  for (const season of ended ?? []) {
    const standings = await seasonStandings(admin, Number(season.id), ms(season.ends_at as string));
    const rows = standings.flatMap((st) =>
      st.rows.slice(0, HALL_PODIUM).map((r, i) => ({
        season_id: season.id,
        category: st.category,
        rank: i + 1,
        user_id: HALL.find((h) => h.id === st.category)?.alliance ? null : r.id,
        name: r.name,
        value: r.value,
      })),
    );
    if (rows.length > 0) await admin.from("season_hall").upsert(rows, { onConflict: "season_id,category,rank", ignoreDuplicates: true });
    // Seul l'appel qui ferme la saison paie le podium, pour ne jamais payer deux fois.
    const { data: claimed } = await admin.from("seasons").update({ hall_closed: true }).eq("id", season.id).eq("hall_closed", false).select("id");
    if (!claimed?.length) continue;
    for (const r of rows) {
      const prize = HALL.find((h) => h.id === r.category)?.ecus?.[r.rank - 1];
      if (prize && r.user_id) await admin.rpc("add_ecus", { p_user: r.user_id, p_amount: prize });
    }
  }
}

/** Panthéon, gardé en mémoire une minute (il ne change qu'en fin de saison). */
let hallCache: { hall: SeasonHall[]; until: number } | null = null;

async function loadHall(admin: SupabaseClient): Promise<SeasonHall[]> {
  const now = Date.now();
  if (hallCache && hallCache.until > now) return hallCache.hall;
  await closeEndedSeasons(admin, now);
  const { data } = await admin.from("season_hall").select("season_id, category, rank, user_id, name, value, seasons(number, ends_at)").order("season_id", { ascending: false }).order("rank");
  type Row = { season_id: number; category: HallCategory; rank: number; user_id: string | null; name: string; value: number; seasons: { number: number; ends_at: string } | null };
  const bySeason = new Map<number, SeasonHall>();
  for (const r of (data ?? []) as unknown as Row[]) {
    let h = bySeason.get(r.season_id);
    if (!h) {
      h = { season: r.seasons?.number ?? 0, endsAt: ms(r.seasons?.ends_at), podiums: HALL.map((c) => ({ category: c.id, rows: [] })) };
      bySeason.set(r.season_id, h);
    }
    h.podiums.find((p) => p.category === r.category)?.rows.push({ id: r.user_id ?? "", name: r.name, value: Number(r.value) });
  }
  const hall = [...bySeason.values()].sort((a, b) => b.season - a.season);
  hallCache = { hall, until: now + 60_000 };
  return hall;
}

/** Titres gagnés à la dernière saison terminée : joueur → « 🏗️ Grand bâtisseur (saison 0) ». */
function titlesFrom(hall: SeasonHall[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const last = hall[0];
  if (!last) return out;
  for (const p of last.podiums) {
    const def = HALL.find((h) => h.id === p.category);
    const first = p.rows[0];
    if (!def || def.alliance || !first?.id) continue;
    out.set(first.id, [...(out.get(first.id) ?? []), `${def.icon} ${def.title} (saison ${last.season})`]);
  }
  return out;
}

export async function getLeaderboards(admin: SupabaseClient, limit = 20): Promise<Leaderboards> {
  const season = await getActiveSeason(admin);
  const [standings, hall] = await Promise.all([seasonStandings(admin, season.id, Date.now()), loadHall(admin)]);
  const rowsOf = (c: HallCategory) => standings.find((st) => st.category === c)?.rows ?? [];
  const toBoard = (rows: { id: string; name: string; value: number }[]): LeaderboardRow[] => rows.slice(0, limit).map((r) => ({ userId: r.id, username: r.name, total: r.value }));
  return {
    plunderers: toBoard(rowsOf("plunderer")),
    standings: standings.map((st) => ({ ...st, rows: st.rows.slice(0, limit) })),
    hall,
    seasonEndsAt: season.endsAt,
  };
}


// ---------------------------------------------------------------------------
// Quêtes du jour
// ---------------------------------------------------------------------------

function cleanDaily(raw: unknown): DailyState | null {
  const d = raw as Partial<DailyState> | null | undefined;
  if (!d || typeof d !== "object" || !Number.isInteger(d.day) || !Array.isArray(d.quests)) return null;
  const quests = d.quests
    .filter((q) => DAILY_QUESTS.some((x) => x.id === q?.id))
    .map((q) => ({ id: q.id, goal: Math.max(1, Number(q.goal) || 1), claimed: !!q.claimed }));
  return { day: Number(d.day), quests, swapped: !!d.swapped, chest: !!d.chest, streak: Math.max(0, Number(d.streak) || 0), lastFull: Number.isInteger(d.lastFull) ? Number(d.lastFull) : null, levels: Number(d.levels) || 0 };
}

function levelSum(state: PlayerState): number {
  return Object.values(state.levels ?? {}).reduce<number>((a, b) => a + (Number(b) || 0), 0);
}

function dailyContextOf(me: Entity, state: PlayerState, entities: Map<string, Entity>, stage: number): DailyContext {
  return {
    shareSize: stage < STAGES.length && state.share?.stage === stage ? state.share.size : null,
    troops: armySize(attackArmy(state)),
    allies: me.allianceId === null ? 0 : [...entities.values()].filter((e) => !e.isLord && e.id !== me.id && e.allianceId === me.allianceId).length,
    upgradesLeft: UPGRADES.filter((u) => !state.upgrades.includes(u.id)).length,
    levels: levelSum(state),
    spyLevel: state.spyLevel ?? 0,
  };
}

async function loadDailyCounts(admin: SupabaseClient, seasonId: number, userId: string, now: number): Promise<DailyCounts> {
  const { data, error } = await admin.rpc("daily_counts", { p_season: seasonId, p_user: userId, p_since: iso(dailyStart(dailyDay(now))), p_lords: LORDS.map((l) => l.id) });
  if (error || !data) return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0])) as DailyCounts;
}

function dailyView(state: PlayerState, counts: DailyCounts, _now: number): DailyView | undefined {
  const d = state.daily;
  if (!d) return undefined;
  const levels = levelSum(state);
  const quests = d.quests.map((q) => {
    const def = DAILY_QUESTS.find((x) => x.id === q.id)!;
    return { id: q.id, icon: def.icon, label: q.id === "don" ? `Verse ${q.goal.toLocaleString("fr-FR")} pierres au chantier` : def.label, family: def.family, progress: dailyProgress(d, q, counts, levels), goal: q.goal, claimed: q.claimed };
  });
  const next = Math.min(DAILY_STREAK_MAX, d.lastFull === d.day - 1 ? d.streak + 1 : 1);
  return {
    quests,
    swapped: d.swapped,
    chest: d.chest,
    streak: d.streak,
    chestBonus: d.chest ? (state.dailyBoost ?? 0) : chestBonus(next),
    boostUntil: state.dailyBoostUntil ?? 0,
    resetAt: dailyStart(d.day + 1),
  };
}

// ---------------------------------------------------------------------------
// Halle de guilde (H1 à H6)
// ---------------------------------------------------------------------------

interface Guild {
  id: number;
  allianceId: number | null;
  userId: string | null;
  pos: MapPos;
  stage: number;
  progress: number;
  cost: number;
  received: number;
  gifts: Record<string, number>;
  wings: Wings;
  /** H5 : troupes postées par les membres, ailes hors service (jusqu'à), protection après un assaut. */
  garrison: PlayerState["stationed"];
  disabled: Partial<Record<WingId, number>>;
  immuneUntil: number;
  version: number;
}

/** Halles chargées avec les participants (même requête). */
const guildsOf = new WeakMap<Map<string, Entity>, Guild[]>();

async function loadGuilds(admin: SupabaseClient, seasonId: number): Promise<Guild[]> {
  const { data } = await admin.from("guild_halls").select("*").eq("season_id", seasonId);
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    allianceId: r.alliance_id === null ? null : Number(r.alliance_id),
    userId: (r.user_id as string | null) ?? null,
    pos: [Number(r.x), Number(r.y)] as MapPos,
    stage: Number(r.stage),
    progress: Number(r.progress),
    cost: Number(r.cost),
    received: Number(r.received),
    gifts: Object.fromEntries(Object.entries((r.gifts as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Number(v) || 0])),
    wings: cleanWings(r.wings),
    garrison: Object.fromEntries(
      Object.entries((r.garrison as Record<string, Record<string, number>>) ?? {})
        .map(([owner, g]) => [owner, armyCounts(g, UNIT_IDS)] as const)
        .filter(([, g]) => Object.keys(g).length > 0),
    ),
    disabled: Object.fromEntries(Object.entries((r.disabled as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Number(v) || 0])) as Partial<Record<WingId, number>>,
    immuneUntil: Number(r.immune_until ?? 0),
    version: Number(r.version ?? 0),
  }));
}

/** Ailes en service : une aile mise à bas par un assaut ne compte plus pendant 24 h. */
function activeWings(g: Guild, now: number): Wings {
  return Object.fromEntries(Object.entries(g.wings).filter(([id]) => !((g.disabled[id as WingId] ?? 0) > now))) as Wings;
}

/** H5 : défense de la halle, murs (10 % de la pierre reçue, comme ceux de la forteresse) et garnison. */
function hallDefense(g: Guild): Army {
  const army: Army = armyFromBudget(g.received * HALL_WALLS_SHARE, FORTRESS_WALLS);
  for (const group of Object.values(g.garrison)) for (const [id, n] of Object.entries(group) as [UnitId, number][]) army[id] = (army[id] ?? 0) + n;
  return army;
}

function hallLevels(g: Guild, entities: Map<string, Entity>): Levels {
  const out: Levels = {};
  for (const [owner, group] of Object.entries(g.garrison)) {
    const lv = entities.get(owner)?.state.levels ?? {};
    for (const id of Object.keys(group) as UnitId[]) out[id] = Math.max(out[id] ?? 0, lv[id] ?? 0);
  }
  return out;
}

/** Taille d'une alliance : armée et production de tous ses membres (pour l'équité et la rançon). */
function allianceSize(allianceId: number, entities: Map<string, Entity>, world: WorldState, now: number): { army: number; rate: number } {
  return [...entities.values()]
    .filter((e) => !e.isLord && e.allianceId === allianceId)
    .reduce((acc, e) => {
      const sz = attackerSizeOf(e.id, e.state, entities, rateAt(e.state, world, now));
      return { army: acc.army + sz.army, rate: acc.rate + sz.rate };
    }, { army: 0, rate: 0 });
}

function hallSiegeBlocker(me: Entity, state: PlayerState, g: Guild, wars: WarRow[], now: number, army?: Army): string | null {
  if (g.allianceId === null) return "Une loge ne s'assiège pas.";
  if (g.stage < 0) return "Cette halle n'est pas encore fondée.";
  if (me.allianceId === null) return "Rejoins une alliance pour assiéger une halle.";
  if (g.allianceId === me.allianceId) return "C'est la halle de ton alliance.";
  if (!warBetween(wars, me.allianceId, g.allianceId, now)) return "On n'assiège une halle qu'en guerre contre son alliance.";
  if (g.immuneUntil > now) return `Cette halle a déjà subi un assaut : à l'abri jusqu'à ${new Date(g.immuneUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}.`;
  if (eventActive(state, "treve", now)) return "Trêve des cloches : aucune armée ne part.";
  if (inCurfew(state, now)) return "Tu es en couvre-feu : pas d'attaque pendant ta plage.";
  if (armySize(army ?? attackArmy(state)) === 0) return "Il te faut des troupes pour l'assaut.";
  return null;
}

async function applyHall(admin: SupabaseClient, seasonId: number, g: Guild, states: { e: Entity; state: PlayerState }[], garrison: PlayerState["stationed"], disabled: Guild["disabled"], immuneUntil: number, act: string, details: Record<string, unknown>): Promise<"ok" | "conflict"> {
  const { data, error } = await admin.rpc("apply_hall", { p_season: seasonId, p_states: states.map((x) => toJson(x.e, x.state)), p_hall: g.id, p_version: g.version, p_garrison: garrison, p_disabled: disabled, p_immune_until: immuneUntil, p_action: act, p_details: details });
  if (error?.message.includes("beffroi_conflict") || (data as { conflict?: boolean } | null)?.conflict) return "conflict";
  if (error) throw new Error(`Halle : ${error.message}`);
  return "ok";
}

async function travelToHall(admin: SupabaseClient, seasonId: number, entities: Map<string, Entity>, fromId: string, g: Guild, army: Army): Promise<number> {
  const positions = await loadPositions(admin, seasonId, entities);
  const a = positions.get(fromId);
  const owner = entities.get(fromId);
  return travelMs(army, a ? mapDistance(a, g.pos) : MAP_SPAWN_RADIUS, owner ? armySpeedBonus(owner.state) : 0);
}

/** H5 : arrivée d'une garnison ou d'un assaut à une halle. */
async function settleHallMarch(
  admin: SupabaseClient,
  seasonId: number,
  owner: Entity,
  m: March,
  at: number,
  entities: Map<string, Entity>,
  world: WorldState,
  flat: Map<string, number>,
  wars: WarRow[],
  names: Map<number, string>,
  replace: (state: PlayerState, next: March | null) => PlayerState,
  commit: (e: Entity, state: PlayerState) => Promise<"changed" | "conflict">,
): Promise<"changed" | "conflict"> {
  const outMs = m.arriveAt - m.departAt;
  const g = (guildsOf.get(entities) ?? []).find((x) => `hall:${x.id}` === m.target);
  const turned = () => commit(owner, replace(owner.state, { ...m, status: "back", returnAt: m.arriveAt + outMs, outcome: "turned" }));
  if (!g) return turned();
  if (m.kind === "hall_station") {
    if (owner.allianceId === null || g.allianceId !== owner.allianceId) return turned();
    const garrison = { ...g.garrison };
    const group = { ...(garrison[owner.id] ?? {}) } as Record<string, number>;
    for (const [u, n] of Object.entries(m.troops) as [string, number][]) if (n > 0) group[u] = (group[u] ?? 0) + n;
    garrison[owner.id] = group as PlayerState["troops"];
    const r = await applyHall(admin, seasonId, g, [{ e: owner, state: replace(owner.state, null) }], garrison, g.disabled, g.immuneUntil, "hall_station", {});
    return r === "conflict" ? "conflict" : "changed";
  }
  // Assaut : il se joue à l'arrivée contre les murs et la garnison présents.
  const aState = advanceEntity(owner, at, world, flat);
  if (hallSiegeBlocker(owner, aState, g, wars, at, m.troops)) return turned();
  const defense = hallDefense(g);
  const levels = { attackerLevels: aState.levels, defenderLevels: hallLevels(g, entities) };
  const chance = estimateChance(m.troops, defense, levels);
  const fight = battle(m.troops, defense, Math.random, levels);
  // Garnison : pertes au prorata ; les blessés des défenseurs se relèvent sur place.
  const theirs = splitTroopLosses({ ...newPlayerState(at), stationed: g.garrison }, fight.defenderLost);
  const garrison = theirs.stationed;
  for (const [ownerId, lost] of Object.entries(theirs.byOwner)) {
    const back = woundedOf(lost, fight.success ? WOUNDED_DEFENDER_BEATEN : WOUNDED_WINNER);
    if (Object.keys(back).length === 0) continue;
    const group = { ...(garrison[ownerId] ?? {}) } as Record<string, number>;
    for (const [u, n] of Object.entries(back) as [string, number][]) group[u] = (group[u] ?? 0) + n;
    garrison[ownerId] = group as PlayerState["troops"];
  }
  // Rançon et équité comme entre joueurs, la taille relative se calculant entre les deux alliances.
  const relative = relativeSize(allianceSize(g.allianceId!, entities, world, at), allianceSize(owner.allianceId!, entities, world, at));
  const ransom = fight.success ? ransomOf(Object.fromEntries(Object.entries(fight.defenderLost).filter(([id]) => (UNIT_IDS as string[]).includes(id))) as Army, fairness(relative, false)) : 0;
  const survivors = cleanArmy(Object.fromEntries((Object.entries(m.troops) as [string, number][]).map(([id, n]) => [id, n - ((fight.attackerLost as Record<string, number>)[id] ?? 0)])) as Army);
  const healed = addWounded(aState, woundedOf(fight.attackerLost, fight.success ? WOUNDED_WINNER : WOUNDED_ATTACKER_BEATEN), at);
  const back: March = { ...m, troops: survivors, status: "back", returnAt: at + outMs, ransom: m.ransom + ransom, outcome: fight.success ? "won" : "lost" };
  const after = replace(healed, armySize(survivors) > 0 ? back : null);
  // L'aile visée, ou à défaut la plus haute encore en service.
  const live = activeWings(g, at);
  const wanted = m.wing && (live[m.wing] ?? 0) > 0 ? m.wing : (Object.entries(live).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as WingId | undefined);
  const disabled = fight.success && wanted ? { ...g.disabled, [wanted]: at + HALL_WING_DOWN_MS } : g.disabled;
  const immune = fight.success ? at + HALL_SIEGE_IMMUNITY_MS : g.immuneUntil;
  const details = { success: fight.success, chance, rounds: fight.rounds, alliance: owner.allianceId, target: g.allianceId, wing: fight.success ? wanted ?? null : null, ransom, attackerLost: fight.attackerLost, defenderLost: fight.defenderLost, log: fight.log };
  const r = await applyHall(admin, seasonId, g, [{ e: owner, state: after }], garrison, disabled, immune, "hall_siege", details);
  if (r === "conflict") return "conflict";
  const wingName = wanted ? WINGS.find((w) => w.id === wanted)?.name : null;
  const defenders = [...entities.values()].filter((e) => !e.isLord && e.allianceId === g.allianceId).map((e) => e.id);
  notify(admin, defenders, fight.success
    ? { title: "🏛️ La halle a cédé !", body: `${owner.name} (${names.get(owner.allianceId!) ?? "l'ennemi"}) a mis ${wingName ? `l'aile « ${wingName} »` : "une aile"} hors service pour 24 h.`, tag: "hall" }
    : { title: "🏛️ La halle a tenu", body: `${owner.name} s'est brisé sur vos murs.`, tag: "hall" });
  notify(admin, [owner.id], fight.success
    ? { title: "🏛️ Halle prise d'assaut", body: `${wingName ? `L'aile « ${wingName} »` : "Une aile"} est hors service pour 24 h.${ransom > 0 ? ` Rançon : ${ransom.toLocaleString("fr-FR")} pierres.` : ""}`, tag: "hall" }
    : { title: "🏛️ Assaut repoussé", body: "La halle a tenu. Tes survivants rentrent.", tag: "hall" });
  return "changed";
}

/** La halle qui profite à un joueur : celle de son alliance, ou sa loge s'il est seul. */
function guildOf(e: Entity, guilds: Guild[]): Guild | undefined {
  return e.allianceId !== null ? guilds.find((g) => g.allianceId === e.allianceId) : guilds.find((g) => g.userId === e.id);
}

/** Niveaux d'aile gratuits : un par étape du beffroi dont l'alliance (ou le joueur) a été maître d'œuvre. */
function masterLevelsOf(g: Guild, lots: Lot[]): number {
  const key = g.allianceId !== null ? `a:${g.allianceId}` : `p:${g.userId}`;
  return lots.filter((l) => l.master && l.finishedAt !== null && l.owner === key).length;
}

/** Production cumulée (par seconde) des membres d'une halle. */
function guildRate(allianceId: number | null, me: Entity, entities: Map<string, Entity>, world: WorldState, now: number): number {
  const members = allianceId === null ? [me] : [...entities.values()].filter((e) => !e.isLord && e.allianceId === allianceId);
  // Prix : production de base, sans élan ni autres coups de pouce passagers.
  return members.reduce((s, e) => s + baseRate(e.state, world, now), 0);
}

async function loadChiefs(admin: SupabaseClient, seasonId: number): Promise<Map<number, string | null>> {
  const { data } = await admin.from("alliances").select("id, chief_id").eq("season_id", seasonId);
  return new Map((data ?? []).map((r) => [Number(r.id), (r.chief_id as string | null) ?? null]));
}

/** Le chef : celui qui a fondé l'alliance, ou à défaut (parti, ou alliance plus ancienne) le plus gros producteur. */
function chiefOf(allianceId: number, chiefs: Map<number, string | null>, entities: Map<string, Entity>): string | null {
  const members = [...entities.values()].filter((e) => !e.isLord && e.allianceId === allianceId);
  const c = chiefs.get(allianceId);
  if (c && members.some((m) => m.id === c)) return c;
  return members.sort((a, b) => b.state.totalProduced - a.state.totalProduced)[0]?.id ?? null;
}

/** Verse de la pierre à une halle ; prévient les membres si une étape se termine. */
async function giveToGuild(admin: SupabaseClient, g: Guild, userId: string, amount: number, perSecond: number, entities: Map<string, Entity>): Promise<number> {
  if (!(amount >= 1)) return 0;
  const lodge = g.allianceId === null;
  const { data } = await admin.rpc("hall_give", { p_hall: g.id, p_user: userId, p_amount: Math.floor(amount), p_per_second: perSecond, p_max_stage: maxStages(lodge) });
  const r = data as { ok?: boolean; stage?: number; completed?: number } | null;
  const done = Number(r?.completed ?? 0);
  if (done > 0) {
    const to = lodge ? [g.userId!] : [...entities.values()].filter((e) => !e.isLord && e.allianceId === g.allianceId).map((e) => e.id);
    const stage = Number(r?.stage ?? 0);
    const founded = g.stage < 0;
    const levels = founded ? stage : done;
    notify(admin, to, {
      title: founded ? (lodge ? "🏛️ Ta loge est fondée" : "🏛️ La halle est fondée !") : lodge ? "🏛️ Ta loge grandit" : "🏛️ La halle grandit",
      body: levels > 0 ? `Étape ${stage} terminée : ${levels > 1 ? `${levels} niveaux` : "un niveau"} d'aile à placer.` : "Prochaine étape : un premier niveau d'aile.",
      tag: "hall",
    });
  }
  return done;
}

/** H6 : un joueur qui a rejoint une alliance dotée d'une halle y verse la moitié de sa loge, qui disparaît. */
async function absorbLodge(admin: SupabaseClient, me: Entity, entities: Map<string, Entity>, world: WorldState, now: number): Promise<boolean> {
  const guilds = guildsOf.get(entities) ?? [];
  const lodge = guilds.find((g) => g.userId === me.id);
  const hall = me.allianceId !== null ? guilds.find((g) => g.allianceId === me.allianceId) : undefined;
  if (!lodge || !hall) return false;
  const { error } = await admin.from("guild_halls").delete().eq("id", lodge.id);
  if (error) return false;
  await giveToGuild(admin, hall, me.id, Math.floor(lodge.received / 2), guildRate(hall.allianceId, me, entities, world, now), entities);
  return true;
}

type HallAction = Extract<GameAction, { type: "hall" }>;

async function runHallAction(
  admin: SupabaseClient,
  seasonId: number,
  me: Entity,
  current: PlayerState,
  entities: Map<string, Entity>,
  action: HallAction,
  world: WorldState,
  now: number,
  commit: (state: PlayerState, act: string, details: Record<string, unknown>) => Promise<"ok" | "conflict">,
  wars: WarRow[],
): Promise<"conflict" | { error?: string; message?: string; state?: PlayerState }> {
  const guilds = guildsOf.get(entities) ?? [];
  const mine = guildOf(me, guilds);
  const lodge = me.allianceId === null;
  const chiefs = lodge ? new Map<number, string | null>() : await loadChiefs(admin, seasonId);
  const isChief = lodge || chiefOf(me.allianceId!, chiefs, entities) === me.id;
  const perSecond = guildRate(me.allianceId, me, entities, world, now);
  switch (action.op) {
    case "found": {
      // La fondation se finance en commun : on ouvre le chantier (étape « -1 ») et chacun y verse, dîme comprise.
      if (mine) return { error: lodge ? "Tu as déjà une loge." : "Ton alliance a déjà sa halle." };
      if (!isChief) return { error: "Seul le chef de l'alliance ouvre le chantier de la halle." };
      const cost = Math.max(1, Math.ceil(HALL_FOUND_HOURS * perSecond * 3600));
      const positions = await loadPositions(admin, seasonId, entities);
      const home = positions.get(me.id);
      if (!home) return { error: "Ton domaine n'est pas encore sur la carte." };
      const members = lodge ? [home] : [...entities.values()].filter((e) => !e.isLord && e.allianceId === me.allianceId).flatMap((e): MapPos[] => { const p = positions.get(e.id); return p ? [p] : []; });
      const taken = [...fixedPlaces(), ...positions.values(), ...guilds.map((g) => g.pos)];
      const spot = hallSpots(home, members, taken)[0];
      if (!spot) return { error: "Aucune case libre près de ton domaine." };
      const { error } = await admin.from("guild_halls").insert({
        season_id: seasonId,
        alliance_id: lodge ? null : me.allianceId,
        user_id: lodge ? me.id : null,
        x: spot[0],
        y: spot[1],
        stage: -1,
        cost,
      });
      if (error) return { error: "Le chantier n'a pas pu être ouvert, réessaie." };
      if (!lodge) {
        await addChronicle(admin, seasonId, { kind: "hall", actor_id: me.id, details: { alliance: me.allianceId } });
        const others = [...entities.values()].filter((e) => !e.isLord && e.allianceId === me.allianceId && e.id !== me.id).map((e) => e.id);
        notify(admin, others, { title: "🏛️ Chantier de la halle ouvert", body: `${me.name} a ouvert le chantier de la halle : versez ensemble ${cost.toLocaleString("fr-FR")} pierres pour la fonder.`, tag: "hall" });
      }
      return { message: `🏛️ Chantier ouvert : ${cost.toLocaleString("fr-FR")} pierres à réunir pour fonder ${lodge ? "ta loge" : "la halle"}${lodge ? "" : ", à verser ensemble (dons et part de dîme)"}.` };
    }
    case "give": {
      if (!mine) return { error: lodge ? "Fonde d'abord ta loge." : "Ton alliance n'a pas encore de halle." };
      const amount = Math.floor(Number(action.amount));
      if (!Number.isFinite(amount) || amount < 1) return { error: "Montant invalide." };
      if (amount > current.stone) return { error: "Tu n'as pas autant de pierre." };
      const paid = { ...current, stone: current.stone - amount };
      if ((await commit(paid, "hall_give", { amount })) === "conflict") return "conflict";
      const done = await giveToGuild(admin, mine, me.id, amount, perSecond, entities);
      const founding = mine.stage < 0;
      return {
        message: done > 0 ? (founding ? `🏛️ Versé ! ${lodge ? "Ta loge" : "La halle"} est fondée.` : "🏛️ Versé ! Étape terminée : un niveau d'aile à placer.") : `🏛️ ${amount.toLocaleString("fr-FR")} pierres versées à ${lodge ? "ta loge" : "la halle"} (${((Math.min(mine.cost, mine.progress + amount) / Math.max(1, mine.cost)) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} % de ${founding ? "la fondation" : "l'étape"}).`,
        state: paid,
      };
    }
    case "tithe": {
      const percent = Number(action.percent);
      if (!Number.isInteger(percent) || percent < 0 || percent > HALL_TITHE_MAX * 100 || percent % 5 !== 0) return { error: "Part invalide." };
      const next = { ...current, hallTithe: percent / 100 };
      if ((await commit(next, "hall_tithe", { percent })) === "conflict") return "conflict";
      return { message: `⛪ ${percent} % de ta dîme ira à ${lodge ? "ta loge" : "la halle"}, le reste au beffroi.`, state: next };
    }
    case "station": {
      if (!mine || lodge) return { error: "Seule une halle d'alliance reçoit une garnison." };
      if (mine.stage < 0) return { error: "Fondez d'abord la halle." };
      const sending = sendTroops(current, { [String(action.unit)]: Number(action.qty) } as Army);
      if (!sending.ok) return { error: sending.error };
      const outMs = await travelToHall(admin, seasonId, entities, me.id, mine, sending.value.sent);
      const march: March = { id: marchId(), kind: "hall_station", target: `hall:${mine.id}`, troops: sending.value.sent, departAt: now, arriveAt: now + outMs, status: "out", returnAt: 0, revealed: true, warned: true, loot: 0, ransom: 0 };
      const sent = { ...sending.value.state, marches: [...(current.marches ?? []), march] };
      if ((await commit(sent, "hall_station_march", { unit: action.unit, qty: action.qty })) === "conflict") return "conflict";
      return { state: sent, message: `🏛️ Garnison en route vers la halle : arrivée dans ${Math.round(outMs / 60_000)} min.` };
    }
    case "recall": {
      const g = guilds.find((x) => x.garrison[me.id]);
      const group = g?.garrison[me.id];
      if (!g || !group || Object.keys(group).length === 0) return { error: "Tu n'as pas de troupes à la halle." };
      if ((current.marches ?? []).length >= MAX_MARCHES) return { error: `${MAX_MARCHES} armées en route au plus.` };
      const outMs = await travelToHall(admin, seasonId, entities, me.id, g, group as Army);
      const march: March = { id: marchId(), kind: "hall_station", target: `hall:${g.id}`, troops: { ...group } as Army, departAt: now - outMs, arriveAt: now, status: "back", returnAt: now + outMs, revealed: true, warned: true, loot: 0, ransom: 0, outcome: "recalled" };
      const rest = { ...g.garrison };
      delete rest[me.id];
      const owner = { ...current, marches: [...(current.marches ?? []), march] };
      if ((await applyHall(admin, seasonId, g, [{ e: me, state: owner }], rest, g.disabled, g.immuneUntil, "hall_recall", {})) === "conflict") return "conflict";
      me.version += 1;
      return { state: owner, message: `Tes troupes quittent la halle : retour dans ${Math.round(outMs / 60_000)} min.` };
    }
    case "siege": {
      const g = guilds.find((x) => x.id === Number(action.hall));
      if (!g) return { error: "Halle inconnue." };
      const wanted = (action.troops ?? current.troops) as Army;
      const sending = sendTroops(current, wanted);
      if (!sending.ok) return { error: sending.error };
      const early = hallSiegeBlocker(me, current, g, wars, now, sending.value.sent);
      if (early) return { error: early };
      const wing = (WING_IDS as string[]).includes(String(action.wing)) ? (String(action.wing) as WingId) : undefined;
      const outMs = await travelToHall(admin, seasonId, entities, me.id, g, sending.value.sent);
      const march: March = { id: marchId(), kind: "hall_siege", target: `hall:${g.id}`, troops: sending.value.sent, departAt: now, arriveAt: now + outMs, status: "out", returnAt: 0, revealed: true, warned: true, loot: 0, ransom: 0, ...(wing ? { wing } : {}) };
      const sent = { ...sending.value.state, marches: [...(current.marches ?? []), march], lastRaidAt: now, shieldUntil: 0 };
      if ((await commit(sent, "hall_siege_march", { hall: g.id, wing: wing ?? null, arriveAt: march.arriveAt })) === "conflict") return "conflict";
      const defenders = [...entities.values()].filter((e) => !e.isLord && e.allianceId === g.allianceId).map((e) => e.id);
      notify(admin, defenders, { title: "🏛️ La halle est menacée !", body: `Une armée de ${me.name} marche sur votre halle, arrivée vers ${new Date(march.arriveAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}. Postez une garnison !`, tag: "hall" });
      return { state: sent, message: `🏛️ Ton armée marche sur la halle : arrivée dans ${Math.round(outMs / 60_000)} min.` };
    }
    case "place": {
      if (!mine) return { error: "Pas de halle." };
      if (!isChief) return { error: "Seul le chef place les niveaux d'aile. Propose ton choix dans le canal d'alliance." };
      const wing = String(action.wing) as WingId;
      const available = foundedLevels(mine.stage) + masterLevelsOf(mine, lotsOf.get(entities) ?? []);
      const blocked = wingBlocker(mine.wings, wing, available, lodge);
      if (blocked) return { error: blocked };
      const { data } = await admin.rpc("hall_place", { p_hall: mine.id, p_wing: wing, p_available: available, p_max_kinds: lodge ? LODGE_MAX_WINGS : WING_IDS.length });
      if (!data) return { error: "Impossible de placer ce niveau, réessaie." };
      const def = WINGS.find((w) => w.id === wing)!;
      return { message: `${def.icon} ${def.name} niveau ${wingLevel(mine.wings, wing) + 1} : ${def.levels[wingLevel(mine.wings, wing)]}.` };
    }
  }
  return { error: "Action inconnue." };
}

function guildPlaces(entities: Map<string, Entity>, names: Map<number, string>): HallPlace[] {
  return (guildsOf.get(entities) ?? []).map((g) => ({
    id: g.id,
    name: g.allianceId !== null ? `Halle · ${names.get(g.allianceId) ?? "alliance"}` : `Loge de ${entities.get(g.userId ?? "")?.name ?? "?"}`,
    allianceId: g.allianceId,
    pos: [g.pos[0], g.pos[1]],
    stage: g.stage,
    lodge: g.allianceId === null,
  }));
}

function guildView(me: Entity, state: PlayerState, entities: Map<string, Entity>, chiefs: Map<number, string | null>, world: WorldState, now: number, wars: WarRow[], names: Map<number, string>, intel: Map<string, Intel> = new Map()): HallView {
  const guilds = guildsOf.get(entities) ?? [];
  const g = guildOf(me, guilds);
  const lodge = me.allianceId === null;
  const chiefId = lodge ? me.id : chiefOf(me.allianceId!, chiefs, entities);
  const masterLevels = g ? masterLevelsOf(g, lotsOf.get(entities) ?? []) : 0;
  return {
    lodge,
    chief: chiefId === me.id,
    chiefName: chiefId ? (entities.get(chiefId)?.name ?? null) : null,
    foundCost: Math.ceil(HALL_FOUND_HOURS * guildRate(me.allianceId, me, entities, world, now) * 3600),
    dormantLodge: !lodge && guilds.some((x) => x.userId === me.id),
    hall: g
      ? {
          pos: [g.pos[0], g.pos[1]],
          stage: g.stage,
          maxStages: maxStages(g.allianceId === null),
          progress: g.progress,
          cost: g.cost,
          received: g.received,
          gifts: Object.entries(g.gifts)
            .map(([id, amount]) => ({ id, name: entities.get(id)?.name ?? "Ancien membre", amount }))
            .sort((a, b) => b.amount - a.amount),
          wings: g.wings,
          available: foundedLevels(g.stage) + masterLevels,
          placed: placedLevels(g.wings),
          masterLevels,
          garrison: Object.entries(g.garrison).map(([id, troops]) => ({ id, name: entities.get(id)?.name ?? "?", troops })),
          walls: armyFromBudget(g.received * HALL_WALLS_SHARE, FORTRESS_WALLS),
          disabled: Object.fromEntries(Object.entries(g.disabled).filter(([, until]) => (until ?? 0) > now)),
          immuneUntil: g.immuneUntil,
        }
      : null,
    targets: me.allianceId === null
      ? []
      : guilds
          .filter((x) => x.allianceId !== null && x.allianceId !== me.allianceId && warBetween(wars, me.allianceId, x.allianceId, now))
          .map((x) => ({
            id: x.id,
            name: names.get(x.allianceId!) ?? "Alliance",
            wings: activeWings(x, now),
            chance: vagueChance(estimateChance(attackArmy(state), hallDefense(x), { attackerLevels: state.levels, defenderLevels: hallLevels(x, entities) }), (intel.get(`hall:${x.id}`)?.until ?? 0) > now),
            intelUntil: intel.get(`hall:${x.id}`)?.until ?? 0,
            blocker: hallSiegeBlocker(me, state, x, wars, now),
            immuneUntil: x.immuneUntil,
          })),
  };
}

// ---------------------------------------------------------------------------
// Espionnage (E1 à E5) : niveau, trajet de l'espion, reconnaissance
// ---------------------------------------------------------------------------

function cleanSpies(raw: unknown): SpyMission[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === "object" && typeof m.id === "string" && typeof m.target === "string")
    .map((m) => ({ id: String(m.id), kind: "recon" as const, target: String(m.target), departAt: Number(m.departAt) || 0, arriveAt: Number(m.arriveAt) || 0, distance: Math.max(0, Number(m.distance) || 0) }));
}

/** Alertes de taupe gardées dans le journal. */
const SPY_LOG_MAX = 20;

/** Niveaux d'aile gagnés par le chantier : un à la fondation, puis un par étape terminée. */
function foundedLevels(stage: number): number {
  return stage < 0 ? 0 : stage + 1;
}

function cleanMoles(raw: unknown): Mole[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === "object" && typeof m.id === "string" && typeof m.target === "string")
    .map((m) => ({ id: String(m.id), target: String(m.target), until: Number(m.until) || 0, distance: Math.max(0, Number(m.distance) || 0), seen: Array.isArray(m.seen) ? m.seen.map(String).slice(-30) : [], shielded: !!m.shielded, curfew: !!m.curfew }));
}

/** Niveau d'espionnage : celui de la recherche, ou un niveau fixe pour un seigneur. */
function spyLevelOf(e: Entity): number {
  if (e.lord) return LORD_SPY_LEVEL[e.lord.difficulty as 1 | 2 | 3 | 4] ?? 0;
  if (e.isLord) return 0;
  return Math.max(0, e.state.spyLevel ?? 0);
}

/** Niveau d'une alliance : le plus haut de ses membres. */
function allianceSpyLevel(allianceId: number | null, entities: Map<string, Entity>): number {
  if (allianceId === null) return 0;
  return Math.max(0, ...[...entities.values()].filter((e) => !e.isLord && e.allianceId === allianceId).map(spyLevelOf));
}

interface Intel {
  until: number;
  /** Écart de niveau au moment du rapport (anciens rapports : 0, l'armée exacte). */
  gap: number;
  /** E4 : rapport falsifié par le contre-espionnage de la cible. */
  noise?: boolean;
}

/** Rapports encore valables de moi et de mes alliés : cible → meilleur rapport. */
async function loadIntelFor(admin: SupabaseClient, seasonId: number, spyIds: string[], now: number): Promise<Map<string, Intel>> {
  const { data } = await admin
    .from("spy_reports")
    .select("target_id, target_key, gap, noise, expires_at")
    .eq("season_id", seasonId)
    .in("spy_id", spyIds)
    .gt("expires_at", iso(now));
  const out = new Map<string, Intel>();
  for (const r of data ?? []) {
    const key = (r.target_key as string | null) ?? (r.target_id as string | null) ?? FORTRESS_INTEL;
    const gap = r.gap === null || r.gap === undefined ? 0 : Number(r.gap);
    const until = ms(r.expires_at as string);
    const prev = out.get(key);
    // Le rapport le plus détaillé l'emporte ; à détail égal, le plus récent.
    if (!prev || gap > prev.gap || (gap === prev.gap && until > prev.until)) out.set(key, { until, gap, noise: r.noise === true });
  }
  return out;
}

/** Ce que voit l'espion : l'écart de niveau avec la cible (joueur, seigneur, forteresse ou halle). */
function targetSpyLevel(key: string, entities: Map<string, Entity>, fortress: FortressRow): number {
  if (key === FORTRESS_INTEL) return allianceSpyLevel(fortress.holder, entities);
  if (key.startsWith("hall:")) {
    const g = (guildsOf.get(entities) ?? []).find((x) => `hall:${x.id}` === key);
    return g?.allianceId != null ? allianceSpyLevel(g.allianceId, entities) : 0;
  }
  const e = entities.get(key);
  return e ? defenseSpyLevel(e, Date.now()) : 0;
}

/** E4 : niveau opposé à qui agit contre soi ; le contre-espionnage y ajoute 2. */
function defenseSpyLevel(e: Entity, now: number): number {
  return spyLevelOf(e) + (!e.isLord && counterActive(e.state, now) ? COUNTER_GAP : 0);
}

/** E4 : facteur de falsification d'un rapport (0,7 à 1,3), stable pour un même rapport. */
function noiseFactor(seed: number, what: string): number {
  let h = Math.floor(seed) ^ 0x9e3779b9;
  for (const c of what) h = Math.imul(h ^ c.charCodeAt(0), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return 0.7 + 0.6 * ((h >>> 0) / 0xffffffff);
}

function spyTargetName(key: string, entities: Map<string, Entity>, names: Map<number, string>): string {
  if (key === FORTRESS_INTEL) return `la ${FORTRESS_NAME}`;
  if (key.startsWith("hall:")) {
    const g = (guildsOf.get(entities) ?? []).find((x) => `hall:${x.id}` === key);
    return g?.allianceId != null ? `la halle de ${names.get(g.allianceId) ?? "l'alliance"}` : "une halle";
  }
  return entities.get(key)?.name ?? "la cible";
}

/** Joueurs prévenus quand un espion est surpris chez eux. */
function spyVictims(key: string, entities: Map<string, Entity>, fortress: FortressRow): string[] {
  const members = (a: number | null) => (a === null ? [] : [...entities.values()].filter((e) => !e.isLord && e.allianceId === a).map((e) => e.id));
  if (key === FORTRESS_INTEL) return members(fortress.holder);
  if (key.startsWith("hall:")) return members((guildsOf.get(entities) ?? []).find((x) => `hall:${x.id}` === key)?.allianceId ?? null);
  const e = entities.get(key);
  return e && !e.isLord ? [e.id] : [];
}

/** E5 : trois espions repérés chez la même cible en 24 h, et ils n'y entrent plus pendant 6 h. Renvoie la fin de l'interdiction. */
async function spyBanUntil(admin: SupabaseClient, seasonId: number, spyId: string, key: string, now: number): Promise<number> {
  const { data } = await admin
    .from("chronicle")
    .select("created_at")
    .eq("season_id", seasonId)
    .eq("kind", "spy")
    .eq("actor_id", spyId)
    .eq("details->>key", key)
    .gt("created_at", iso(now - SPY_BAN_WINDOW_MS))
    .order("created_at", { ascending: false })
    .limit(SPY_BAN_COUNT);
  if ((data ?? []).length < SPY_BAN_COUNT) return 0;
  const until = ms(data![0].created_at as string) + SPY_BAN_MS;
  return until > now ? until : 0;
}

/** E3 : envoie un espion en reconnaissance. */
async function sendSpy(
  admin: SupabaseClient,
  seasonId: number,
  me: Entity,
  current: PlayerState,
  entities: Map<string, Entity>,
  fortress: FortressRow,
  key: string,
  world: WorldState,
  now: number,
): Promise<{ error: string } | { state: PlayerState; message: string; cost: number }> {
  const guilds = guildsOf.get(entities) ?? [];
  const hall = key.startsWith("hall:") ? guilds.find((g) => `hall:${g.id}` === key) : undefined;
  const target = key === FORTRESS_INTEL || key.startsWith("hall:") ? undefined : entities.get(key);
  if (key === FORTRESS_INTEL) {
    if (me.allianceId !== null && fortress.holder === me.allianceId) return { error: "Ton alliance tient déjà la forteresse." };
  } else if (key.startsWith("hall:")) {
    if (!hall || hall.allianceId === null) return { error: "Halle inconnue." };
    if (hall.allianceId === me.allianceId) return { error: "C'est la halle de ton alliance." };
  } else if (!target || target.id === me.id) return { error: "Cible inconnue." };
  else if (isAllied(me, target)) return { error: "On n'espionne pas un allié." };
  if ((current.spies ?? []).length >= SPY_MAX_ACTIVE) return { error: `${SPY_MAX_ACTIVE} espions en route au plus.` };
  if ((current.spies ?? []).some((sp) => sp.target === key)) return { error: "Un de tes espions y va déjà." };
  const cost = spyCost(current, world, now);
  if (current.stone < cost) return { error: `Il faut ${Math.ceil(cost).toLocaleString("fr-FR")} pierres pour payer un espion.` };
  const ban = await spyBanUntil(admin, seasonId, me.id, key, now);
  if (ban > now) return { error: `Trop de tes espions ont été surpris là-bas : on les y attend jusqu'à ${new Date(ban).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}.` };
  const positions = await loadPositions(admin, seasonId, entities);
  const from = positions.get(me.id);
  const to = key === FORTRESS_INTEL ? FORTRESS_POS : hall ? hall.pos : positions.get(key);
  const distance = from && to ? mapDistance(from, to) : MAP_SPAWN_RADIUS;
  const travel = spyTravelMs(distance);
  const mission: SpyMission = { id: marchId(), kind: "recon", target: key, departAt: now, arriveAt: now + travel, distance };
  return {
    cost,
    state: { ...current, stone: current.stone - cost, spies: [...(current.spies ?? []), mission] },
    message: `🕵️ Ton espion part : arrivée dans ${Math.max(1, Math.round(travel / 60_000))} min. Le rapport te parviendra à son arrivée.`,
  };
}

/** E4 : pose une taupe chez un joueur (aussitôt, jet de repérage à demi-risque). */
async function placeMole(
  admin: SupabaseClient,
  seasonId: number,
  me: Entity,
  current: PlayerState,
  entities: Map<string, Entity>,
  key: string,
  world: WorldState,
  now: number,
): Promise<{ error: string } | { state: PlayerState; message: string; cost: number; caught: boolean; target: Entity }> {
  const target = entities.get(key);
  if (!target || target.id === me.id || target.isLord) return { error: "Une taupe ne se pose que chez un autre joueur." };
  if (isAllied(me, target)) return { error: "On n'espionne pas un allié." };
  const moles = (current.moles ?? []).filter((m) => m.until > now);
  if (moles.length >= MOLE_MAX) return { error: `${MOLE_MAX} taupes actives au plus.` };
  if (moles.some((m) => m.target === key)) return { error: "Tu as déjà une taupe chez lui." };
  const gap = spyLevelOf(me) - defenseSpyLevel(target, now);
  if (gap < MOLE_MIN_GAP) return { error: "Il faut un niveau d'espionnage au moins un cran au-dessus du sien pour poser une taupe." };
  const cost = moleCost(baseRate(current, world, now));
  if (current.stone < cost) return { error: `Il faut ${Math.ceil(cost).toLocaleString("fr-FR")} pierres pour poser une taupe.` };
  const ban = await spyBanUntil(admin, seasonId, me.id, key, now);
  if (ban > now) return { error: "Trop de tes espions ont été surpris là-bas : on les y attend encore." };
  const positions = await loadPositions(admin, seasonId, entities);
  const from = positions.get(me.id);
  const to = positions.get(key);
  const distance = from && to ? mapDistance(from, to) : MAP_SPAWN_RADIUS;
  const caught = Math.random() < spyRisk(gap, distance) / 2;
  const paid = { ...current, stone: current.stone - cost, moles };
  if (caught) return { cost, caught, target, state: paid, message: `🐀 Ta taupe a été démasquée en s'installant chez ${target.name}.` };
  const t = target.state;
  const mole: Mole = { id: marchId(), target: key, until: now + MOLE_MS, distance, seen: (t.marches ?? []).map((m) => m.id), shielded: t.shieldUntil > now, curfew: inCurfew(t, now) };
  return { cost, caught, target, state: { ...paid, moles: [...moles, mole] }, message: `🐀 Ta taupe est en place chez ${target.name} pour 2 h : elle te préviendra de ses départs d'armée, de son bouclier et de son couvre-feu.` };
}

/** E4 : une taupe repérée ; la cible est prévenue comme pour un espion. */
async function moleCaught(admin: SupabaseClient, seasonId: number, owner: Entity, target: Entity, now: number) {
  const named = defenseSpyLevel(target, now) >= spyLevelOf(owner) - 1;
  await addChronicle(admin, seasonId, { kind: "spy", actor_id: owner.id, target_id: target.id, details: { key: target.id, named, mole: true } });
  notify(admin, [target.id], { title: "🐀 Une taupe démasquée chez toi", body: named ? `Elle travaillait pour ${owner.name}.` : "Son maître reste inconnu.", tag: "spy" });
}

/** E4 : les taupes observent leur cible ; une alerte à la fois, et un jet de repérage à demi-risque par alerte. */
async function settleMoles(admin: SupabaseClient, seasonId: number, entities: Map<string, Entity>, now: number): Promise<"none" | "changed" | "conflict"> {
  for (const owner of entities.values()) {
    for (const mo of owner.state.moles ?? []) {
      const target = entities.get(mo.target);
      const log: string[] = [];
      let next: Mole | null = mo;
      if (!target || mo.until <= now) {
        next = null;
        log.push(`🐀 Ta taupe chez ${target?.name ?? "ta cible"} a fini sa mission.`);
      } else {
        const t = target.state;
        const fresh = (t.marches ?? []).filter((m) => m.status === "out" && !mo.seen.includes(m.id) && m.kind !== "reinforce" && m.kind !== "station" && m.kind !== "hall_station");
        for (const m of fresh) {
          const sent = armyValue(m.troops);
          const stayed = armyValue(cleanArmy(troopsHere(t)));
          const share = Math.round((100 * sent) / Math.max(1, sent + stayed));
          const dest = m.target === "fortress" ? FORTRESS_NAME : m.target.startsWith("hall:") ? "une halle" : m.target.includes(":") ? "un événement" : (entities.get(m.target)?.name ?? "un domaine");
          log.push(`🐀 ${target.name} fait partir une armée vers ${dest} : environ ${share} % de ses troupes, ${100 - share} % restent au domaine.`);
        }
        const shielded = t.shieldUntil > now;
        if (mo.shielded && !shielded) log.push(`🐀 ${target.name} n'a plus de bouclier.`);
        const curfew = inCurfew(t, now);
        if (curfew !== mo.curfew) log.push(curfew ? `🐀 ${target.name} entre en couvre-feu.` : `🐀 ${target.name} sort du couvre-feu.`);
        if (fresh.length === 0 && shielded === mo.shielded && curfew === mo.curfew) continue;
        next = { ...mo, seen: [...mo.seen, ...fresh.map((m) => m.id)].slice(-30), shielded, curfew };
        const gap = spyLevelOf(owner) - defenseSpyLevel(target, now);
        if (log.some(() => Math.random() < spyRisk(gap, mo.distance) / 2)) {
          next = null;
          log.push(`🐀 Ta taupe chez ${target.name} a été démasquée.`);
        }
      }
      const moles = (owner.state.moles ?? []).flatMap((x) => (x.id === mo.id ? (next ? [next] : []) : [x]));
      const spyLog = [...(owner.state.spyLog ?? []), ...log.map((text) => ({ at: now, text }))].slice(-SPY_LOG_MAX);
      const { data } = await admin.rpc("commit_state", { p_season: seasonId, p_state: toJson(owner, { ...owner.state, moles, spyLog }), p_touch: false, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
      if ((data as { conflict?: boolean } | null)?.conflict) return "conflict";
      const alerts = log.filter((x) => !x.includes("a fini sa mission"));
      if (alerts.length > 0) notify(admin, [owner.id], { title: "🐀 Ta taupe a parlé", body: alerts.join(" "), tag: "spy" });
      if (target && !next && mo.until > now) await moleCaught(admin, seasonId, owner, target, now);
      return "changed";
    }
  }
  return "none";
}

/** E3 à E5 : un espion arrive. Il peut être repéré ; le rapport est livré dans tous les cas. */
async function settleSpy(
  admin: SupabaseClient,
  seasonId: number,
  owner: Entity,
  sp: SpyMission,
  entities: Map<string, Entity>,
  fortress: FortressRow,
  names: Map<number, string>,
): Promise<"changed" | "conflict"> {
  const state = { ...owner.state, spies: (owner.state.spies ?? []).filter((x) => x.id !== sp.id) };
  const { data } = await admin.rpc("commit_state", { p_season: seasonId, p_state: toJson(owner, state), p_touch: false, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
  if ((data as { conflict?: boolean } | null)?.conflict) return "conflict";
  const mine = spyLevelOf(owner);
  const theirs = targetSpyLevel(sp.target, entities, fortress);
  const gap = mine - theirs;
  const caught = Math.random() < spyRisk(gap, sp.distance);
  const entity = entities.get(sp.target);
  // E4 : un espion repéré chez qui fait du contre-espionnage rapporte des chiffres faussés.
  const noise = caught && !!entity && !entity.isLord && counterActive(entity.state, sp.arriveAt);
  await admin.from("spy_reports").insert({
    season_id: seasonId,
    spy_id: owner.id,
    target_id: entity ? entity.id : null,
    target_key: sp.target,
    gap,
    noise,
    expires_at: iso(sp.arriveAt + SPY_INTEL_MS),
  });
  const where = spyTargetName(sp.target, entities, names);
  if (caught) {
    // E5 : la cible voit le nom du maître si son niveau est au moins celui de l'espion, moins 1.
    const named = theirs >= mine - 1;
    await addChronicle(admin, seasonId, {
      kind: "spy",
      actor_id: owner.id,
      target_id: entity && !entity.isLord ? entity.id : null,
      details: { key: sp.target, named, ...(sp.target === FORTRESS_INTEL ? { fortress: true } : {}), ...(sp.target.startsWith("hall:") ? { hall: where } : {}) },
    });
    notify(admin, spyVictims(sp.target, entities, fortress), {
      title: "🕵️ Un espion a été surpris chez toi",
      body: named ? `C'était un espion de ${owner.name}.` : "Son maître reste inconnu : ton niveau d'espionnage est trop bas pour le reconnaître.",
      tag: "spy",
    });
  }
  const depth = gap <= -2 ? "il n'a presque rien vu" : gap <= 0 ? "il a vu l'armée présente" : gap === 1 ? "il a vu l'armée et ses mouvements" : gap === 2 ? "il a vu l'armée, ses mouvements et le stock exposé" : "il a tout vu, jusqu'à la Forge";
  notify(admin, [owner.id], { title: caught ? "🕵️ Espion repéré, mais rapport livré" : "🕵️ Rapport d'espion", body: `Chez ${where}, ${depth}. Rapport valable 1 h, partagé avec ton alliance.`, tag: "spy" });
  return "changed";
}

/** E2 : ordre de grandeur d'une armée, comparé à la sienne. */
function armyHint(theirs: Army, mine: Army): "bien plus faible" | "comparable" | "plus forte" | "écrasante" {
  const a = armyValue(cleanArmy({ ...theirs, garde: 0 } as Army));
  const b = Math.max(1, armyValue(mine));
  const r = a / b;
  return r < 0.5 ? "bien plus faible" : r <= 1.5 ? "comparable" : r <= 3 ? "plus forte" : "écrasante";
}

/** E2 : la chance en un mot. */
function chanceWord(chance: number): "favorable" | "incertaine" | "risquée" {
  return chance >= 0.65 ? "favorable" : chance >= 0.35 ? "incertaine" : "risquée";
}
