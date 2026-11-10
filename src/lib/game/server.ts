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
  TOWER_REVEAL_CHANCE,
  TOWER_REVEAL_MAX,
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
} from "./config";
import { fixedPlaces, pickSpawn } from "./map";
import { pickNextEvent } from "./events";
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
  spyDetectChance,

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
  military?: { levels?: Record<string, number>; research?: { id: string; endsAt: number }[] | { id: string; endsAt: number } | null; academy?: number; sabotageImmuneUntil?: number; ruinImmuneUntil?: number; elanUntil?: number; tithe?: number; titheOwed?: number; titheSet?: boolean; share?: StageShare | null; donorTiers?: number; curfew?: Curfew | null; seen?: PlayerState["seen"] | null; veinAt?: number; frenzyUntil?: number; quest?: number | null; questFlags?: string[]; wounded?: Record<string, number>; healAt?: number; marches?: unknown; boostProdUntil?: number; boostSafeUntil?: number; merchantEvent?: number } | null;
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
      research: [row.military?.research ?? []].flat().map((r) => ({ id: r.id as CombatantId, endsAt: Number(r.endsAt) })),
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
    military: { levels: state.levels, research: state.research, academy: state.academy, sabotageImmuneUntil: state.sabotageImmuneUntil, ruinImmuneUntil: state.ruinImmuneUntil, elanUntil: state.elanUntil, tithe: state.tithe, titheOwed: state.titheOwed, titheSet: state.titheSet, share: state.share, donorTiers: state.donorTiers, curfew: state.curfew, seen: state.seen ?? null, veinAt: state.veinAt, frenzyUntil: state.frenzyUntil, quest: state.quest, questFlags: state.questFlags, wounded: state.wounded, healAt: state.healAt, marches: state.marches ?? [], boostProdUntil: state.boostProdUntil, boostSafeUntil: state.boostSafeUntil, merchantEvent: state.merchantEvent },
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
        p_share: shareSize(advance(e.state, now, world), world, now),
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
  const size = stageSize(rates);
  stageSizes = STAGES.map(() => size);
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
      // Le plus riche le plus souvent, mais pas toujours.
      const pick = candidates.length > 0 ? candidates[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * candidates.length)] : null;
      if (pick) {
        // A10 : l'armée du seigneur est taillée sur la défense de sa cible, pour une chance d'environ un tiers.
        const shaped = raidArmies(state, pick.s, { now, victimId: pick.e.id, attackerArmy: army.attack, stagesDone: stagesDoneAt(world, now) });
        const sized = armyForChance(army.attack, shaped.defense, LORD_RAID_CHANCE, shaped.opts);
        const ctx = { now, attackerId: lord.id, victimId: pick.e.id, victimRate: pick.rate, attackerIsLord: true, allowRepeat: lord.retaliateOnly, attackerArmy: armySize(sized) > 0 ? sized : army.attack, stagesDone: stagesDoneAt(world, now) };
        const armiesNow = raidArmies(state, pick.s, ctx);
        const chance = estimateChance(armiesNow.attack, armiesNow.defense, armiesNow.opts);
        const r = resolveRaid(state, pick.s, { ...ctx, rng: Math.random });
        if (r.ok) {
          await admin.rpc("apply_raid", {
            p_season: season.id,
            p_attacker: toJson(me, r.value.attacker, nextRaid),
            p_victim: toJson(pick.e, r.value.victim),
            p_attacker_touch: false,
            p_chronicle: chronicleDetails(r.value.report, chance),
          });
          notify(admin, [pick.e.id], r.value.report.success
            ? { title: `${lord.blazon} ${lord.name} t'a pillé !`, body: `${Math.floor(r.value.report.stolen).toLocaleString("fr-FR")} pierres envolées.`, tag: "raid" }
            : { title: "🛡️ Raid repoussé", body: `Tes défenses ont repoussé ${lord.name}.`, tag: "raid" });
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

async function loadChronicle(admin: SupabaseClient, seasonId: number, entities: Map<string, Entity>): Promise<ChronicleEntry[]> {
  const { data } = await admin
    .from("chronicle")
    .select("id, kind, actor_id, target_id, details, created_at")
    .eq("season_id", seasonId)
    .order("created_at", { ascending: false })
    .limit(40);
  const name = (id: string | null) => (id ? (entities.get(id)?.name ?? "Un inconnu") : "");
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    at: Date.parse(r.created_at as string),
    kind: r.kind as ChronicleEntry["kind"],
    actorId: r.actor_id as string | null,
    actorName: name(r.actor_id as string | null),
    targetId: r.target_id as string | null,
    targetName: name(r.target_id as string | null),
    details: (r.details ?? {}) as ChronicleEntry["details"],
  }));
}

/** Clé des rapports d'espion portant sur la forteresse. */
const FORTRESS_INTEL = "fortress";

/** Rapports d'espion encore valables : cible → fin de validité. */
async function loadIntel(admin: SupabaseClient, seasonId: number, spyId: string, now: number): Promise<Map<string, number>> {
  const { data } = await admin
    .from("spy_reports")
    .select("target_id, expires_at")
    .eq("season_id", seasonId)
    .eq("spy_id", spyId)
    .gt("expires_at", iso(now));
  const out = new Map<string, number>();
  for (const r of data ?? []) {
    // Sans cible : rapport sur la forteresse.
    const key = (r.target_id as string | null) ?? FORTRESS_INTEL;
    out.set(key, Math.max(out.get(key) ?? 0, ms(r.expires_at as string)));
  }
  return out;
}

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

function fortressBlocker(me: Entity, state: PlayerState, f: FortressRow, now: number): string | null {
  if (me.allianceId === null) return "Rejoins une alliance pour assiéger la forteresse.";
  if (f.holder === me.allianceId) return "Ton alliance tient déjà la forteresse.";
  if (inCurfew(state, now)) return "Tu es en couvre-feu : pas d'attaque pendant ta plage.";
  // A13 : 30 minutes sans assaut après une prise, le temps de poster une garnison.
  if (f.holder !== null && now < f.capturedAt + FORTRESS_TRUCE_MS) return `La forteresse vient de changer de mains : pas d'assaut avant ${new Date(f.capturedAt + FORTRESS_TRUCE_MS).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}.`;
  if (now - state.lastRaidAt < RAID_COOLDOWN_MS) return "Tes troupes se reposent encore.";
  if (armySize(attackArmy(state)) === 0) return "Il te faut des troupes pour l'assaut.";
  return null;
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
      const blocked = fortressBlocker(me, current, f, now);
      if (blocked) return { error: blocked };
      const defense = fortressDefense(f, entities, now);
      const levels = { attackerLevels: current.levels, defenderLevels: fortressLevels(f, entities) };
      const chance = estimateChance(attackArmy(current), defense, levels);
      const fight = battle(attackArmy(current), defense, Math.random, levels);
      const mine = splitTroopLosses(current, fight.attackerLost);
      const theirs = splitTroopLosses(garrisonHost(f, now), fight.defenderLost);
      // Infirmerie : une part de ses propres troupes tombées revient dans 30 minutes.
      const healed = addWounded(current, woundedOf(mine.byOwner[""] ?? {}, fight.success ? WOUNDED_WINNER : WOUNDED_ATTACKER_BEATEN), now);
      const after: PlayerState = { ...healed, troops: mine.troops, stationed: mine.stationed, lastRaidAt: now, shieldUntil: 0 };
      const details = { success: fight.success, chance, rounds: fight.rounds, alliance: me.allianceId, attackerLost: fight.attackerLost, defenderLost: fight.defenderLost, log: fight.log };
      const r = await writeFortress(after, fight.success ? me.allianceId : f.holder, fight.success ? {} : theirs.stationed, fight.success, "fortress_attack", details);
      if (r === "conflict") return "conflict";
      if (f.holder !== null) {
        const defenders = [...entities.values()].filter((e) => !e.isLord && e.allianceId === f.holder).map((e) => e.id);
        notify(admin, defenders, fight.success
          ? { title: "🏰 La forteresse est tombée !", body: `${me.name} l'a prise pour ${allianceNames.get(me.allianceId!) ?? "son alliance"}.`, tag: "fortress" }
          : { title: "🏰 La forteresse a tenu", body: `${me.name} s'est brisé sur vos murs.`, tag: "fortress" });
      }
      return {
        state: after,
        message: fight.success
          ? `🏰 La ${FORTRESS_NAME} est à ${allianceNames.get(me.allianceId!) ?? "ton alliance"} ! +20 % de production pour toute l'alliance. Envoie vite une garnison.`
          : `La ${FORTRESS_NAME} a tenu bon. Tes pertes : ${describeArmy(fight.attackerLost)}.`,
      };
    }
    case "fortress_station": {
      if (me.allianceId === null || f.holder !== me.allianceId) return { error: "Seule l'alliance qui tient la forteresse peut y poster des troupes." };
      const r = sendReinforcements(current, garrisonHost(f, now), me.id, String(action.unit), Number(action.qty));
      if (!r.ok) return { error: r.error };
      if ((await writeFortress(r.value.sender, f.holder, r.value.host.stationed, false, "fortress_station", { unit: action.unit, qty: action.qty })) === "conflict") return "conflict";
      return { state: r.value.sender, message: "🏰 Troupes postées dans la forteresse." };
    }
    case "fortress_recall": {
      const r = recallReinforcements(current, garrisonHost(f, now), me.id);
      if (!r.ok) return { error: r.error };
      if ((await writeFortress(r.value.owner, f.holder, r.value.host.stationed, false, "fortress_recall", {})) === "conflict") return "conflict";
      return { state: r.value.owner, message: "Tes troupes quittent la forteresse." };
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
}

const EVENT_INFO: Record<EventKind, { name: string; description: string }> = {
  foire: { name: "La grande foire", description: "Les marchands envahissent la place : les savoirs coûtent 20 % de moins et les ateliers 10 % de moins pendant 2 heures." },
  fete: { name: "Fête des bâtisseurs", description: "Pendant 2 heures, chaque pierre versée au chantier compte double pour tes paliers de don et pour le lot de ton alliance." },
  etoiles: { name: "Pluie d'étoiles", description: "Pendant 1 heure, les veines d'or apparaissent trois fois plus souvent. Garde l'œil ouvert !" },
  treve: { name: "Trêve des cloches", description: "Les cloches sonnent la paix : aucune armée ne part pendant 2 heures (raids, renforts, forteresse), et tout le monde produit 25 % de plus." },
  marchand: { name: "Le marchand ambulant", description: "Pendant 1 heure, il vend un bonus au choix pour 30 minutes de ta production. Un seul achat par passage." },
  caravane: {
    name: "Caravane marchande",
    description: "Elle traverse la région chargée de pierre. Un assaut par joueur, contre une escorte qui vaut 60 % de ton armée ; une victoire rapporte 45 minutes de ta production.",
  },
  colosse: {
    name: "Le Colosse de Grisemont",
    description: "Une armée immense qui ne se reforme pas. Chaque assaut rapporte 2 fois la valeur des pertes infligées ; s'il tombe, chaque joueur qui l'a touché reçoit 15 minutes de sa production.",
  },
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
  };
}

const EVENT_NOTICES: Record<EventKind, { title: string; body: string }> = {
  caravane: { title: "🐪 Une caravane marchande arrive !", body: "Une heure pour la piller, un assaut par joueur." },
  colosse: { title: "🗿 Le Colosse de Grisemont est apparu !", body: "Six heures pour l'abattre à plusieurs." },
  foire: { title: "🎪 La grande foire ouvre !", body: "Savoirs à −20 % et ateliers à −10 % pendant 2 heures." },
  fete: { title: "🎉 Fête des bâtisseurs !", body: "Tes dons comptent double pour les paliers et les lots pendant 2 heures." },
  etoiles: { title: "🌠 Pluie d'étoiles !", body: "Les veines d'or apparaissent trois fois plus souvent pendant 1 heure." },
  treve: { title: "🔔 Trêve des cloches", body: "Aucune armée ne part pendant 2 heures, et tout le monde produit 25 % de plus." },
  marchand: { title: "🧺 Le marchand ambulant est là", body: "Un bonus au choix pour 30 minutes de ta production, pendant 1 heure." },
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
  for (const raw of open ?? []) {
    const e = eventRow(raw);
    const finished = ms(e.ends_at) <= now || (e.kind === "colosse" && armySize(e.army) === 0);
    const next = pickNextEvent(e.kind, e.id * 7919 + seasonId);
    if (!finished) return { active: e, levels: medianLevels(entities), nextAt: ms(e.ends_at) + EVENT_GAP_MS, nextKind: next };
    if (COMBAT_EVENTS.includes(e.kind)) await admin.rpc("settle_event_v2", { p_event: e.id, p_bonus: killBonus(e, entities, now, world, flat) });
    else await admin.from("events").update({ settled: true }).eq("id", e.id).eq("settled", false);
  }
  const { data: last } = await admin.from("events").select("id, kind, ends_at").eq("season_id", seasonId).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  const nextKind: EventKind = last ? pickNextEvent(last.kind as string, Number(last.id) * 7919 + seasonId) : "caravane";
  const nextAt = last ? ms(last.ends_at as string) + EVENT_GAP_MS : now;
  const humans = [...entities.values()].filter((e) => !e.isLord);
  if (last && now >= nextAt - EVENT_NOTICE_MS && now < nextAt) void announceNext(admin, seasonId, Number(last.id), nextKind);
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
  const { error: insertError } = await admin.from("events").insert({ season_id: seasonId, kind: nextKind, ends_at: iso(now + duration), army, army_start: army, pool: 0, prize });
  // Seul celui qui a vraiment créé l'événement prévient tout le monde.
  if (!insertError) notify(admin, "all", { ...EVENT_NOTICES[nextKind], tag: "event" });
  const { data: created } = await admin.from("events").select("*").eq("season_id", seasonId).eq("settled", false).maybeSingle();
  if (!created) return { active: null, levels: {}, nextAt: now + EVENT_GAP_MS, nextKind };
  const e = eventRow(created);
  return { active: e, levels: medianLevels(entities), nextAt: ms(e.ends_at) + EVENT_GAP_MS, nextKind: pickNextEvent(e.kind, e.id * 7919 + seasonId) };
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
  if (now - state.lastRaidAt < RAID_COOLDOWN_MS) return "Tes troupes se reposent encore.";
  if (armySize(attackArmy(state)) === 0) return "Il te faut des troupes pour attaquer.";
  return null;
}

async function runEventAttack(admin: SupabaseClient, seasonId: number, me: Entity, current: PlayerState, ev: EventState, now: number, rate: number): Promise<"conflict" | { error?: string; state?: PlayerState; message?: string; settle?: number }> {
  const e = ev.active;
  if (!e) return { error: "Aucun événement en cours." };
  const blocked = eventBlocker(current, e, me.id, now);
  if (blocked) return { error: blocked };
  const fight = battle(attackArmy(current), eventDefense(e, current), Math.random, { attackerLevels: current.levels, defenderLevels: ev.levels });
  const mine = splitTroopLosses(current, fight.attackerLost);
  let after: PlayerState = { ...current, troops: mine.troops, stationed: mine.stationed, lastRaidAt: now };
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

function eventView(meId: string, state: PlayerState, ev: EventState, now: number, rate: number): EventView | null {
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
      ...(e.kind === "marchand" ? { merchantPrice: Math.ceil(rate * MERCHANT_PRICE_SECONDS), merchantBought: state.merchantEvent === e.id } : {}),
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
      const { data, error } = await admin.from("alliances").insert({ season_id: seasonId, name }).select("id").single();
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
      const r = sendReinforcements(current, advanceOf(host), me.id, String(action.unit), Number(action.qty));
      if (!r.ok) return { error: r.error };
      if ((await writeStates(admin, seasonId, [{ e: me, state: r.value.sender }, { e: host, state: r.value.host }], "reinforce", { target: host.id, unit: action.unit, qty: action.qty })) === "conflict") return "conflict";
      return { message: `🛡️ Renforts envoyés chez ${host.name} : ils défendront et attaqueront avec lui.`, state: r.value.sender };
    }
    case "recall": {
      const host = entities.get(String(action.host));
      if (!host) return { error: "Domaine inconnu." };
      const r = recallReinforcements(current, advanceOf(host), me.id);
      if (!r.ok) return { error: r.error };
      if ((await writeStates(admin, seasonId, [{ e: me, state: r.value.owner }, { e: host, state: r.value.host }], "recall", { host: host.id })) === "conflict") return "conflict";
      return { message: `Tes troupes rentrent de chez ${host.name}.`, state: r.value.owner };
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
  intel: Map<string, number>,
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
      const intelUntil = intel.get(e.id) ?? 0;
      const seen = intelUntil > now || allied ? fight.defense : fuzzyArmy(fight.defense);
      const fair = e.isLord ? 1 : fairness(ctx.relativeSize, revenge);
      const loot = lootOf(s.stone, rate, revenge, { lord: e.isLord, cap: e.isLord ? undefined : myRate * PVP_LOOT_CAP_SECONDS, factor: fair, stagesDone: stagesDoneAt(world, now), extraSecured: extraSecured(s, now) });
      // Rançon attendue en cas de victoire : la défense qu'on voit, abattue.
      const ransom = e.isLord ? 0 : ransomOf(seen as Army, fair);
      return {
        ransom,
        fairness: fair,
        lootCap: e.isLord ? undefined : myRate * PVP_LOOT_CAP_SECONDS,
        lootSafe: extraSecured(s, now) || undefined,
        id: e.id,
        name: e.name,
        isLord: e.isLord,
        blazon: e.lord?.blazon,
        temper: e.lord?.temper,
        difficulty: e.lord?.difficulty,
        retaliateOnly: e.lord?.retaliateOnly,
        stone: s.stone,
        stoneAt: now,
        rate,
        loot,
        intelUntil,
        allied,
        atWar,
        allianceName: e.allianceId !== null ? (allianceNames.get(e.allianceId) ?? null) : null,
        army: seen as Record<string, number>,
        chance: vagueChance(estimateChance(fight.attack, fight.defense, fight.opts), intelUntil > now || allied),
        shieldUntil: s.shieldUntil,
        burnedUntil: s.burnedUntil,
        totalPlundered: s.totalPlundered,
        lastSeen: e.isLord ? undefined : e.lastSeen,
        curfew: e.isLord ? undefined : inCurfew(s, now),
        revenge,
        blocker: raidBlocker(myState, s, ctx),
        ...(e.isLord || allied ? {} : { academy: s.academy, researching: s.research.length > 0, sabotageBlocker: sabotageBlocker(s, now, myState), sabotageCost: sabotageCost(myState, s, world, now) }),
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
      const r = startResearch(state, String(action.id), now, stagesDoneAt(world, now));
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "research", details: { id: action.id, level: queuedLevel(state, action.id as CombatantId) + 1 } } } } : r;
    }
    case "curfew": {
      const r = setCurfew(state, action.start === null ? null : Number(action.start), now);
      return r.ok ? { ok: true, value: { state: r.value, log: { action: "curfew", details: { start: action.start } } } } : r;
    }
    case "march_recall": {
      const r = recallMarch(state, String(action.id), now);
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
      const r = await settleMarches(admin, season.id, entities, world, flat, conflicts.wars, now);
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
    const current = openShare(advance(me.state, now, world), worksite.stage, world, now, myLotShare);
    let finalState = current;
    let ecus = me.ecus;
    let away: AwaySummary | undefined;
    let questDone: { done: number | null; ecus: number } | null = null;
    let error: string | null = null;
    let message: string | undefined;

    if (ARMY_ACTIONS.has(action.type) && eventActive(current, "treve", now)) {
      error = "Trêve des cloches : aucune armée ne part.";
    } else if (action.type === "event_attack") {
      const r = await runEventAttack(admin, season.id, me, current, events, now, currentRate(me, current, now, world, flat));
      if (r === "conflict") continue;
      if (r.error) error = r.error;
      message = r.message;
      if (r.state) finalState = r.state;
      if (r.settle !== undefined) {
        // Colosse abattu : 15 minutes de production pour chaque joueur qui l'a touché, puis on relit l'état qui fait foi.
        const { data: killed } = await admin.from("events").select("*").eq("id", r.settle).maybeSingle();
        await admin.rpc("settle_event_v2", { p_event: r.settle, p_bonus: killed ? killBonus(eventRow(killed), entities, now, world, flat) : {} });
        entities = await loadEntities(admin, season.id, userId);
        const fresh = entities.get(userId);
        if (fresh) finalState = advance(fresh.state, now, world);
      }
      events = await loadEvent(admin, season.id, now, entities, world, flat);
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
      const targetState = target ? advanceEntity(target, now, world, flat) : null;
      const cost = targetState ? sabotageCost(current, targetState, world, now) : 0;
      if (!target || !targetState || target.id === me.id || target.isLord) error = "Cible inconnue.";
      else if (isAllied(me, target)) error = "On ne sabote pas un allié.";
      else if (current.stone < cost) error = `Il faut ${Math.ceil(cost).toLocaleString("fr-FR")} pierres pour payer un saboteur.`;
      else error = sabotageBlocker(targetState, now, current);
      if (!error && target && targetState) {
        const success = Math.random() < sabotageChance(defenseArmy(targetState));
        const mine = { ...current, stone: current.stone - cost };
        const list = success ? [{ e: me, state: mine }, { e: target, state: applySabotage(targetState, now) }] : [{ e: me, state: mine }];
        if ((await writeStates(admin, season.id, list, "sabotage", { target: target.id, cost, success })) === "conflict") continue;
        finalState = mine;
        await addChronicle(admin, season.id, { kind: "sabotage", actor_id: me.id, target_id: target.id, details: { success } });
        notify(admin, [target.id], success
          ? { title: "🧨 Ton académie a été sabotée", body: "Un niveau perdu et ta recherche prend du retard.", tag: "sabotage" }
          : { title: "🧨 Saboteur arrêté", body: `${me.name} a été pris en train de saboter ton académie.`, tag: "sabotage" });
        message = success
          ? `🧨 Sabotage réussi : l'académie de ${target.name} perd un niveau et sa recherche prend du retard.`
          : `🧨 Ton saboteur a été pris dans le domaine de ${target.name}.`;
      } else {
        const { data } = await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, current, {}), p_touch: true, p_contribution: 0, p_stage_bases: stageSizes, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
        if ((data as { conflict?: boolean } | null)?.conflict) continue;
      }
    } else if (action.type === "spy") {
      const onFortress = String(action.target) === FORTRESS_INTEL;
      const target = onFortress ? undefined : entities.get(String(action.target));
      const cost = spyCost(current, world, now);
      if (onFortress && me.allianceId !== null && conflicts.fortress.holder === me.allianceId) error = "Ton alliance tient déjà la forteresse.";
      else if (!onFortress && (!target || target.id === me.id)) error = "Cible inconnue.";
      else if (current.stone < cost) error = `Il faut ${Math.ceil(cost).toLocaleString("fr-FR")} pierres pour payer un espion.`;
      const next = error ? current : { ...current, stone: current.stone - cost };
      const { data, error: rpcError } = await admin.rpc("commit_state", {
        p_season: season.id,
        p_state: toJson(me, next, {}),
        p_touch: true,
        p_contribution: 0,
        p_stage_bases: stageSizes,
        p_active_window_days: ACTIVE_WINDOW_DAYS,
        p_action: error ? null : "spy",
        p_details: error ? null : { target: onFortress ? FORTRESS_INTEL : target!.id, cost },
      });
      if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);
      if ((data as { conflict?: boolean } | null)?.conflict) continue;
      if (!error && onFortress) {
        finalState = next;
        await admin.from("spy_reports").insert({ season_id: season.id, spy_id: me.id, target_id: null, expires_at: iso(now + SPY_INTEL_MS) });
        const caught = Math.random() < spyDetectChance(fortressDefense(conflicts.fortress, entities));
        if (caught) await addChronicle(admin, season.id, { kind: "spy", actor_id: me.id, target_id: null, details: { fortress: true } });
        message = caught
          ? `🕵️ Ton espion a vu les défenses de la ${FORTRESS_NAME}, mais il a été repéré en repartant.`
          : `🕵️ Ton espion est revenu sans être vu : les défenses de la ${FORTRESS_NAME} sont révélées pendant 1 h.`;
      } else if (!error && target) {
        finalState = next;
        await admin.from("spy_reports").insert({ season_id: season.id, spy_id: me.id, target_id: target.id, expires_at: iso(now + SPY_INTEL_MS) });
        const targetState = advanceEntity(target, now, world, flat);
        const defense = target.isLord ? (lordArmies(entities, world, now, flat).get(target.id)?.defense ?? {}) : raidArmies(current, targetState, { victimId: target.id, now }).defense;
        const caught = Math.random() < spyDetectChance(defense);
        if (caught) await addChronicle(admin, season.id, { kind: "spy", actor_id: me.id, target_id: target.id, details: {} });
        message = caught
          ? `🕵️ Ton espion a vu l'armée de ${target.name}, mais il a été repéré en repartant.`
          : `🕵️ Ton espion est revenu sans être vu : l'armée de ${target.name} est révélée pendant 1 h.`;
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
            const outMs = travelMs(sent, distance);
            const towers = Number((victimState.defenses as Record<string, number>).tour ?? 0);
            const march: March = {
              id: `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
              kind: "raid",
              target: victim.id,
              troops: sent,
              departAt: now,
              arriveAt: now + outMs,
              status: "out",
              returnAt: 0,
              revealed: Math.random() < Math.min(TOWER_REVEAL_MAX, TOWER_REVEAL_CHANCE * towers),
              // Contre un seigneur, personne à prévenir.
              warned: victim.isLord,
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
      const contribution = (outcome.ok ? (outcome.value.contribution ?? 0) : 0) + paid.paid;
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
    const [intel, names, info, chronicle, hall, positions] = await Promise.all([
      loadIntel(admin, season.id, userId, now),
      namesP,
      namesP.then((n) => allianceInfo(admin, season.id, meNow, finalState, entities, n)),
      wantsChronicle ? loadChronicle(admin, season.id, entities) : Promise.resolve(undefined),
      loadHall(admin),
      loadPositions(admin, season.id, entities),
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
      event: eventView(userId, finalState, events, now, currentRate(meNow, finalState, now, worldFrom(worksite), flat)),
      fortress: fortressView(meNow, finalState, conflicts.fortress, entities, allianceNames, now, intel.get(FORTRESS_INTEL) ?? null),
      chronicle,
      map: mapView(positions),
      incoming: incomingFor(userId, entities, now),
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
      kind: "raid" as const,
      target: String(m.target),
      troops: armyCounts(m.troops ?? {}, UNIT_IDS) as Army,
      departAt: Number(m.departAt) || 0,
      arriveAt: Number(m.arriveAt) || 0,
      status: m.status === "back" ? ("back" as const) : ("out" as const),
      returnAt: Number(m.returnAt) || 0,
      revealed: m.revealed === true,
      warned: m.warned === true,
      loot: Math.max(0, Number(m.loot) || 0),
      ransom: Math.max(0, Number(m.ransom) || 0),
      ...(["won", "lost", "turned", "recalled"].includes(m.outcome) ? { outcome: m.outcome } : {}),
    }));
}

/** Prochaine échéance d'une armée : alerte à mi-chemin, arrivée, ou retour. */
function marchDue(m: March): number {
  if (m.status === "back") return m.returnAt;
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
): Promise<"none" | "changed" | "conflict"> {
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

  if (m.status === "back") {
    // Retour : survivants, butin et rançon rendus au domaine.
    const landed = landMarch(advanceEntity(owner, now, world, flat), m.id);
    const r = await commit(owner, landed);
    if (r === "changed" && !owner.isLord && (m.loot > 0 || m.ransom > 0)) {
      notify(admin, [owner.id], { title: "🏇 Ton armée est rentrée", body: `Elle rapporte ${Math.floor(m.loot + m.ransom).toLocaleString("fr-FR")} pierres.`, tag: "march" });
    }
    return r;
  }

  if (!m.warned) {
    // T5 : alerte à mi-chemin.
    const r = await commit(owner, replace(owner.state, { ...m, warned: true }));
    if (r === "changed" && victim && !victim.isLord) {
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
    relativeSize: victim.isLord ? undefined : relativeSize(sizeOf(vState, vRate), attackerSizeOf(owner.id, aState, entities, aRate)),
    attackerArmy: m.troops,
    marching: true,
    allowRepeat: true,
  };
  const armies = raidArmies(aState, vState, ctx);
  const chance = estimateChance(armies.attack, armies.defense, armies.opts);
  const fight = resolveRaid(aState, vState, { ...ctx, rng: Math.random });
  if (!fight.ok) return commit(owner, replace(owner.state, turn("turned")));
  const rep = fight.value.report;
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
      : { title: "🛡️ Raid repoussé", body: `Tes défenses ont repoussé ${owner.name}.`, tag: "raid" });
  }
  if (!owner.isLord) {
    notify(admin, [owner.id], rep.success
      ? { title: "⚔️ Raid réussi", body: `Contre ${victim.name} : ${Math.floor(rep.stolen + rep.ransom).toLocaleString("fr-FR")} pierres rapportées au retour.`, tag: "raid" }
      : { title: "💀 Raid repoussé", body: `${victim.name} a tenu. Tes survivants rentrent.`, tag: "raid" });
  }
  return "changed";
}

/** T5 : armées qui approchent de mon domaine (passé la mi-chemin). */
function incomingFor(meId: string, entities: Map<string, Entity>, now: number): IncomingView[] {
  return [...entities.values()].flatMap((e) =>
    (e.state.marches ?? [])
      .filter((m) => m.target === meId && m.status === "out" && m.warned && m.arriveAt > now)
      .map((m) => ({ id: m.id, arriveAt: m.arriveAt, from: m.revealed ? e.name : null })),
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

