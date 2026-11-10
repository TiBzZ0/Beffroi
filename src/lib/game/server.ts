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
  EVENT_GAP_MS,
  CARAVAN_MS,
  CARAVAN_PRIZE_SECONDS,
  CARAVAN_TAKE,
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
  type UnitId,
  GUARDS_PER_DOMAIN,
  COMBATANTS,
  SEASON_DAYS,
  STAGE_BASES,
  STAGES,
  DEFENSE_IDS,
  UNIT_IDS,
  type GeneratorId,
  type LordDef,
} from "./config";
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
  rebuildRuin,
  resolveRaid,
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
  type GameAction,
  type GameSnapshot,
  type LeaderboardRow,
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
} from "./types";
import { armyFromBudget, armySize, armyValue, battle, cleanArmy, estimateChance, seededRng, type Army } from "./battle";
import { recordContribution, topContributors } from "@/lib/redis";

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
  profiles: { username: string; display_name: string | null; is_bot: boolean } | null;
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

function toEntity(row: PlayerRow): Entity {
  const lord = LORD_BY_ID.get(row.user_id);
  return {
    id: row.user_id,
    name: lord?.name ?? row.profiles?.display_name ?? row.profiles?.username ?? "Inconnu",
    isLord: !!lord || !!row.profiles?.is_bot,
    lord,
    version: row.version,
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
  const { data, error } = await admin.rpc("ensure_active_season", { p_days: SEASON_DAYS, p_first_stage_base: STAGE_BASES[0] });
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
    admin.from("player_states").select("*, profiles(username, display_name, is_bot)").eq("season_id", seasonId);
  const fortP = admin.from("fortresses").select("holder").eq("season_id", seasonId).maybeSingle();
  let { data, error } = await select();
  if (error) throw new Error(`Joueurs introuvables : ${error.message}`);
  const present = new Set((data ?? []).map((r) => (r as PlayerRow).user_id));
  const missing = [userId, ...LORDS.map((l) => l.id)].filter((id) => !present.has(id));
  if (missing.length > 0) {
    const now = iso(Date.now());
    await admin.from("player_states").upsert(
      missing.map((id) => ({ user_id: id, season_id: seasonId, last_update: now, last_click_at: now, last_seen: now })),
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
  return entities;
}

/** Production de base d'un seigneur : médiane des vrais joueurs × son caractère. */
function lordRates(entities: Map<string, Entity>, world: WorldState, now: number): Map<string, number> {
  const rates = [...entities.values()]
    .filter((e) => !e.isLord)
    .map((e) => productionPerSecond(e.state, world, stagesDoneAt(world, now)))
    .sort((a, b) => a - b);
  const median = rates.length === 0 ? 0 : rates.length % 2 ? rates[(rates.length - 1) / 2] : (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2;
  const out = new Map<string, number>();
  for (const l of LORDS) out.set(l.id, Math.max(LORD_MIN_RATE, median) * l.rateFactor);
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
function lordArmies(entities: Map<string, Entity>): Map<string, { attack: Army; defense: Army }> {
  const budgets = lordBudgets(entities);
  const out = new Map<string, { attack: Army; defense: Army }>();
  for (const l of LORDS) {
    const taste = LORD_ARMY[l.key];
    const total = budgets[l.difficulty] * taste.power;
    const attack = armyFromBudget(total * taste.troopShare, taste.troops);
    const forts = armyFromBudget(total * (1 - taste.troopShare), taste.forts);
    out.set(l.id, { attack, defense: { ...attack, ...forts, garde: GUARDS_PER_DOMAIN } });
  }
  return out;
}

function advanceEntity(e: Entity, now: number, world: WorldState, flat: Map<string, number>): PlayerState {
  return advance(e.state, now, world, e.isLord ? { flatRate: flat.get(e.id) ?? LORD_MIN_RATE } : {});
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
      await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, state, extra), p_touch: false, p_contribution: 0, p_stage_bases: STAGE_BASES, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
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
        p_stage_bases: STAGE_BASES,
        p_active_window_days: ACTIVE_WINDOW_DAYS,
        p_action: r?.ok ? "contribute" : null,
        p_details: r?.ok ? { amount } : null,
      });
      if ((data as { ok?: boolean } | null)?.ok && r?.ok) {
        await addChronicle(admin, season.id, { kind: "gift", actor_id: lord.id, details: { amount } });
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
          return { e, s, rate, loot: lootOf(s.stone, rate, false) };
        })
        .filter((c) => !raidBlocker(state, c.s, { now, attackerId: lord.id, victimId: c.e.id, victimRate: c.rate, attackerIsLord: true, allowRepeat: lord.retaliateOnly, attackerArmy: army.attack }))
        .sort((a, b) => b.loot - a.loot);
      // Le plus riche le plus souvent, mais pas toujours.
      const pick = candidates.length > 0 ? candidates[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * candidates.length)] : null;
      if (pick) {
        const ctx = { now, attackerId: lord.id, victimId: pick.e.id, victimRate: pick.rate, attackerIsLord: true, allowRepeat: lord.retaliateOnly, attackerArmy: army.attack };
        const armiesNow = raidArmies(state, pick.s, ctx);
        const chance = estimateChance(armiesNow.attack, armiesNow.defense, { attackBonus: armiesNow.attackBonus });
        const r = resolveRaid(state, pick.s, { ...ctx, rng: Math.random });
        if (r.ok) {
          await admin.rpc("apply_raid", {
            p_season: season.id,
            p_attacker: toJson(me, r.value.attacker, nextRaid),
            p_victim: toJson(pick.e, r.value.victim),
            p_attacker_touch: false,
            p_chronicle: chronicleDetails(r.value.report, chance),
          });
          changed = true;
          continue;
        }
      }
      await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, state, nextRaid), p_touch: false, p_contribution: 0, p_stage_bases: STAGE_BASES, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
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
  ends_at: string;
  score_a: number;
  score_b: number;
}

interface FortressRow {
  holder: number | null;
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
    admin.from("fortresses").select("holder, garrison, version").eq("season_id", seasonId).maybeSingle(),
  ]);
  for (const w of ended ?? []) await admin.rpc("settle_war", { p_war: w.id });
  let fort = fortRes.data;
  if (!fort) {
    await admin.from("fortresses").upsert({ season_id: seasonId }, { onConflict: "season_id", ignoreDuplicates: true });
    ({ data: fort } = await admin.from("fortresses").select("holder, garrison, version").eq("season_id", seasonId).maybeSingle());
  }
  return {
    wars: ((wars ?? []) as WarRow[]).map((w) => ({ ...w, id: Number(w.id), alliance_a: Number(w.alliance_a), alliance_b: Number(w.alliance_b) })),
    fortress: { holder: fort?.holder != null ? Number(fort.holder) : null, garrison: (fort?.garrison as FortressRow["garrison"]) ?? {}, version: Number(fort?.version ?? 0) },
  };
}

function warBetween(wars: WarRow[], a: number | null, b: number | null): WarRow | undefined {
  if (a === null || b === null || a === b) return undefined;
  return wars.find((w) => (w.alliance_a === a && w.alliance_b === b) || (w.alliance_a === b && w.alliance_b === a));
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
function fortressDefense(f: FortressRow, entities: Map<string, Entity>): Army {
  const army: Army = f.holder === null ? { ...armyFromBudget(troopBudget(entities) * FORTRESS_WALLS_POWER, FORTRESS_WALLS), garde: GUARDS_PER_DOMAIN } : {};
  for (const g of Object.values(garrisonOf(f))) {
    for (const [id, n] of Object.entries(g) as [UnitId, number][]) army[id] = (army[id] ?? 0) + n;
  }
  return army;
}

function fortressBlocker(me: Entity, state: PlayerState, f: FortressRow, now: number): string | null {
  if (me.allianceId === null) return "Rejoins une alliance pour assiéger la forteresse.";
  if (f.holder === me.allianceId) return "Ton alliance tient déjà la forteresse.";
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
        .insert({ season_id: seasonId, alliance_a: me.allianceId, alliance_b: target, ends_at: iso(now + WAR_MS) })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Guerre impossible : ${error?.message}`);
      await addChronicle(admin, seasonId, { kind: "war", actor_id: me.id, details: { phase: "start", war: data.id, a: me.allianceId, b: target } });
      return { message: `⚔️ Guerre déclarée à ${allianceNames.get(target)} pour 24 h ! Ni pause ni bouclier entre vous.` };
    }
    case "fortress_attack": {
      const blocked = fortressBlocker(me, current, f, now);
      if (blocked) return { error: blocked };
      const defense = fortressDefense(f, entities);
      const chance = estimateChance(attackArmy(current), defense);
      const fight = battle(attackArmy(current), defense, Math.random);
      const mine = splitTroopLosses(current, fight.attackerLost);
      const theirs = splitTroopLosses(garrisonHost(f, now), fight.defenderLost);
      const after: PlayerState = { ...current, troops: mine.troops, stationed: mine.stationed, lastRaidAt: now, shieldUntil: 0 };
      const details = { success: fight.success, chance, rounds: fight.rounds, alliance: me.allianceId, attackerLost: fight.attackerLost, defenderLost: fight.defenderLost };
      const r = await writeFortress(after, fight.success ? me.allianceId : f.holder, fight.success ? {} : theirs.stationed, fight.success, "fortress_attack", details);
      if (r === "conflict") return "conflict";
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
  const defense = fortressDefense(f, entities);
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
    chance: vagueChance(estimateChance(attackArmy(state), defense), known),
    blocker: fortressBlocker(me, state, f, now),
    garrison: mine ? Object.entries(garrison).map(([id, troops]) => ({ id, name: entities.get(id)?.name ?? "Inconnu", troops: troops as Record<string, number> })) : [],
    myGarrison: (garrison[me.id] ?? {}) as Record<string, number>,
  };
}

// ---------------------------------------------------------------------------
// Événements : caravane marchande et colosse
// ---------------------------------------------------------------------------

type EventKind = "caravane" | "colosse";

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
  caravane: {
    name: "Caravane marchande",
    description: "Elle traverse la région chargée de pierre. Un assaut par joueur ; chaque victoire emporte une part du chargement.",
  },
  colosse: {
    name: "Le Colosse de Grisemont",
    description: "Une armée immense qui ne se reforme pas. Abattez-la à plusieurs : la prime est partagée selon les pertes infligées.",
  },
};

interface EventState {
  active: EventRow | null;
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

/** Clôt les événements finis, lance le suivant quand la pause est passée, et renvoie celui en cours. */
async function loadEvent(admin: SupabaseClient, seasonId: number, now: number, entities: Map<string, Entity>, world: WorldState, flat: Map<string, number>): Promise<EventState> {
  const { data: open } = await admin.from("events").select("*").eq("season_id", seasonId).eq("settled", false);
  for (const raw of open ?? []) {
    const e = eventRow(raw);
    const finished = ms(e.ends_at) <= now || (e.kind === "caravane" && e.pool <= 0) || (e.kind === "colosse" && armySize(e.army) === 0);
    if (!finished) return { active: e, nextAt: ms(e.ends_at), nextKind: e.kind === "caravane" ? "colosse" : "caravane" };
    await admin.rpc("settle_event", { p_event: e.id });
  }
  const { data: last } = await admin.from("events").select("kind, ends_at").eq("season_id", seasonId).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  const nextKind: EventKind = last?.kind === "caravane" ? "colosse" : "caravane";
  const nextAt = last ? ms(last.ends_at as string) + EVENT_GAP_MS : now;
  const humans = [...entities.values()].filter((e) => !e.isLord);
  if (now < nextAt || humans.length === 0) return { active: null, nextAt, nextKind };

  let army: Army;
  let prize: number;
  let duration: number;
  if (nextKind === "caravane") {
    army = armyFromBudget(troopBudget(entities) * CARAVAN_ESCORT_POWER, CARAVAN_ESCORT);
    prize = Math.floor(humans.reduce((sum, e) => sum + currentRate(e, advance(e.state, now, world), now, world, flat), 0) * CARAVAN_PRIZE_SECONDS);
    duration = CARAVAN_MS;
  } else {
    const total = humanArmies(entities).reduce((a, b) => a + b, 0);
    army = armyFromBudget(Math.max(total * COLOSSUS_POWER, troopBudget(entities) * 3), COLOSSUS_ARMY);
    prize = Math.floor(armyValue(army) * COLOSSUS_BOUNTY);
    duration = COLOSSUS_MS;
  }
  // L'index unique empêche deux événements simultanés si deux joueurs arrivent en même temps.
  await admin.from("events").insert({ season_id: seasonId, kind: nextKind, ends_at: iso(now + duration), army, army_start: army, pool: prize, prize });
  const { data: created } = await admin.from("events").select("*").eq("season_id", seasonId).eq("settled", false).maybeSingle();
  if (!created) return { active: null, nextAt: now + EVENT_GAP_MS, nextKind };
  const e = eventRow(created);
  return { active: e, nextAt: ms(e.ends_at), nextKind };
}

/** Défenseurs qu'affronte un assaut : l'escorte entière de la caravane, ou ce qu'il reste du colosse. */
function eventDefense(e: EventRow): Army {
  return e.kind === "caravane" ? e.army_start : e.army;
}

function eventBlocker(state: PlayerState, e: EventRow, meId: string, now: number): string | null {
  if (e.kind === "caravane" && meId in e.attackers) return "Tu as déjà attaqué cette caravane.";
  if (e.kind === "caravane" && e.pool <= 0) return "La caravane est vide.";
  if (now - state.lastRaidAt < RAID_COOLDOWN_MS) return "Tes troupes se reposent encore.";
  if (armySize(attackArmy(state)) === 0) return "Il te faut des troupes pour attaquer.";
  return null;
}

async function runEventAttack(admin: SupabaseClient, seasonId: number, me: Entity, current: PlayerState, ev: EventState, now: number): Promise<"conflict" | { error?: string; state?: PlayerState; message?: string; settle?: number }> {
  const e = ev.active;
  if (!e) return { error: "Aucun événement en cours." };
  const blocked = eventBlocker(current, e, me.id, now);
  if (blocked) return { error: blocked };
  const fight = battle(attackArmy(current), eventDefense(e), Math.random);
  const mine = splitTroopLosses(current, fight.attackerLost);
  let after: PlayerState = { ...current, troops: mine.troops, stationed: mine.stationed, lastRaidAt: now };
  const attackers = { ...e.attackers };
  let army = e.army;
  let pool = e.pool;
  let message: string;
  if (e.kind === "caravane") {
    const take = fight.success ? Math.floor(Math.min(pool, e.prize * CARAVAN_TAKE)) : 0;
    pool -= take;
    after = { ...after, stone: after.stone + take };
    attackers[me.id] = take;
    message = fight.success
      ? `🐪 Caravane pillée : +${Math.round(take).toLocaleString("fr-FR")} pierres ! Tes pertes : ${describeArmy(fight.attackerLost)}.`
      : `🐪 L'escorte de la caravane t'a repoussé. Tes pertes : ${describeArmy(fight.attackerLost)}.`;
  } else {
    const dealt = armyValue(fight.defenderLost);
    army = fight.defenderLeft;
    attackers[me.id] = (attackers[me.id] ?? 0) + dealt;
    message =
      armySize(army) === 0
        ? `🗿 Le Colosse est abattu ! La prime de ${Math.round(pool).toLocaleString("fr-FR")} pierres est partagée selon les pertes infligées.`
        : `🗿 Tu as fauché ${describeArmy(fight.defenderLost) || "personne"}. Tes pertes : ${describeArmy(fight.attackerLost)}.`;
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
      stolen: e.pool - pool,
      dealt: e.kind === "colosse" ? armyValue(fight.defenderLost) : 0,
      attackerLost: fight.attackerLost,
      defenderLost: fight.defenderLost,
    },
  });
  const finished = (e.kind === "caravane" && pool <= 0) || (e.kind === "colosse" && armySize(army) === 0);
  return { state: after, message, settle: finished ? e.id : undefined };
}

function eventView(meId: string, state: PlayerState, ev: EventState, now: number): EventView | null {
  const e = ev.active;
  if (!e) {
    const info = EVENT_INFO[ev.nextKind];
    return { id: 0, kind: ev.nextKind, ...info, active: false, startsAt: ev.nextAt, endsAt: ev.nextAt, army: {}, armyLeft: 1, pool: 0, prize: 0, mine: 0, attackers: 0, chance: 0, take: 0, blocker: null };
  }
  const defense = eventDefense(e);
  const startValue = armyValue(e.army_start);
  const totalDealt = Object.values(e.attackers).reduce((a, b) => a + b, 0);
  let take: number;
  if (e.kind === "caravane") take = Math.floor(Math.min(e.pool, e.prize * CARAVAN_TAKE));
  else take = armyValue(battle(attackArmy(state), defense, seededRng(0xc0105)).defenderLost);
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
    chance: estimateChance(attackArmy(state), defense),
    take,
    blocker: eventBlocker(state, e, meId, now),
  };
}

function warView(me: Entity, wars: WarRow[], names: Map<number, string>): WarView | null {
  const w = warOf(wars, me.allianceId);
  if (!w) return null;
  const meA = w.alliance_a === me.allianceId;
  const enemyId = meA ? w.alliance_b : w.alliance_a;
  return { id: w.id, enemyId, enemyName: names.get(enemyId) ?? "?", myScore: meA ? w.score_a : w.score_b, enemyScore: meA ? w.score_b : w.score_a, endsAt: ms(w.ends_at) };
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
  const armies = lordArmies(entities);
  return [...entities.values()]
    .filter((e) => e.id !== me.id)
    .map((e) => {
      const s = advanceEntity(e, now, world, flat);
      const rate = currentRate(e, s, now, world, flat);
      const revenge = hasRevenge(myState, e.id, now);
      const allied = isAllied(me, e);
      const atWar = !!warBetween(wars, me.allianceId, e.allianceId);
      const ctx = { now, attackerId: me.id, victimId: e.id, victimRate: rate, allied, atWar, defenderArmy: e.isLord ? armies.get(e.id)?.defense : undefined };
      const fight = raidArmies(myState, s, ctx);
      const intelUntil = intel.get(e.id) ?? 0;
      const seen = intelUntil > now || allied ? fight.defense : fuzzyArmy(fight.defense);
      const loot = lootOf(s.stone, rate, revenge);
      return {
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
        chance: vagueChance(estimateChance(fight.attack, fight.defense, { attackBonus: fight.attackBonus }), intelUntil > now || allied),
        shieldUntil: s.shieldUntil,
        burnedUntil: s.burnedUntil,
        totalPlundered: s.totalPlundered,
        lastSeen: e.isLord ? undefined : e.lastSeen,
        revenge,
        blocker: raidBlocker(myState, s, ctx),
      };
    })
    .sort((a, b) => Number(a.isLord) - Number(b.isLord) || (a.difficulty ?? 0) - (b.difficulty ?? 0) || b.loot - a.loot);
}

function chronicleDetails(r: RaidReport, chance: number) {
  return { success: r.success, chance, rounds: r.rounds, stolen: r.stolen, allyShares: r.allyShares, destroyed: r.destroyed, attackerLost: r.attackerLost, defenderLost: r.defenderLost, revenge: r.revenge };
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
}

function applySimpleAction(state: PlayerState, action: GameAction, now: number, world: WorldState): Result<Outcome> {
  switch (action.type) {
    case "sync":
      return { ok: true, value: { state } };
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
  const wantsChronicle = action.type === "sync" || action.type === "raid" || action.type === "spy" || action.type === "event_attack";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let [worksite, entities] = await Promise.all([loadWorksite(admin, season.id), loadEntities(admin, season.id, userId)]);
    if (action.type === "sync" && attempt === 0 && (await tickLords(admin, season, entities, worksite, Date.now()))) {
      [worksite, entities] = await Promise.all([loadWorksite(admin, season.id), loadEntities(admin, season.id, userId)]);
    }
    const me = entities.get(userId);
    if (!me) throw new Error("Joueur introuvable.");

    const now = Date.now();
    const world = worldFrom(worksite);
    const flat = lordRates(entities, world, now);
    let [conflicts, events, allianceNames] = await Promise.all([
      loadConflicts(admin, season.id, now),
      loadEvent(admin, season.id, now, entities, world, flat),
      loadAllianceNames(admin, season.id),
    ]);
    const current = advance(me.state, now, world);
    let finalState = current;
    let error: string | null = null;
    let message: string | undefined;

    if (action.type === "event_attack") {
      const r = await runEventAttack(admin, season.id, me, current, events, now);
      if (r === "conflict") continue;
      if (r.error) error = r.error;
      message = r.message;
      if (r.state) finalState = r.state;
      if (r.settle !== undefined) {
        // Colosse abattu : la prime vient d'être versée, on relit l'état qui fait foi.
        await admin.rpc("settle_event", { p_event: r.settle });
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
        p_stage_bases: STAGE_BASES,
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
        const defense = target.isLord ? (lordArmies(entities).get(target.id)?.defense ?? {}) : raidArmies(current, targetState, { victimId: target.id, now }).defense;
        const caught = Math.random() < spyDetectChance(defense);
        if (caught) await addChronicle(admin, season.id, { kind: "spy", actor_id: me.id, target_id: target.id, details: {} });
        message = caught
          ? `🕵️ Ton espion a vu l'armée de ${target.name}, mais il a été repéré en repartant.`
          : `🕵️ Ton espion est revenu sans être vu : l'armée de ${target.name} est révélée pendant 1 h.`;
      }
    } else if (action.type === "raid") {
      const victim = entities.get(String(action.target));
      if (!victim) {
        error = "Cible inconnue.";
      } else {
        const victimState = advanceEntity(victim, now, world, flat);
        const ctx = {
          now,
          attackerId: me.id,
          victimId: victim.id,
          victimRate: currentRate(victim, victimState, now, world, flat),
          defenderArmy: victim.isLord ? lordArmies(entities).get(victim.id)?.defense : undefined,
          allied: isAllied(me, victim),
          atWar: !!warBetween(conflicts.wars, me.allianceId, victim.allianceId),
        };
        const armiesNow = raidArmies(current, victimState, ctx);
        const chance = estimateChance(armiesNow.attack, armiesNow.defense, { attackBonus: armiesNow.attackBonus });
        const r = resolveRaid(current, victimState, { ...ctx, rng: Math.random });
        if (!r.ok) {
          error = r.error;
        } else {
          const allies = Object.entries(r.value.report.allyShares).flatMap(([id, share]) => {
            const e = entities.get(id);
            if (!e) return [];
            const s = advanceEntity(e, now, world, flat);
            return [toJson(e, { ...s, stone: s.stone + share, totalPlundered: s.totalPlundered + share })];
          });
          const { data, error: rpcError } = await admin.rpc("apply_raid_group", {
            p_season: season.id,
            p_attacker: toJson(me, r.value.attacker),
            p_victim: toJson(victim, r.value.victim),
            p_allies: allies,
            p_attacker_touch: true,
            p_chronicle: chronicleDetails(r.value.report, chance),
          });
          if (rpcError?.message.includes("beffroi_conflict") || (data as { conflict?: boolean } | null)?.conflict) continue;
          if (rpcError) throw new Error(`Raid impossible : ${rpcError.message}`);
          const war = warBetween(conflicts.wars, me.allianceId, victim.allianceId);
          if (war && r.value.report.stolen > 0) {
            await admin.rpc("add_war_score", { p_war: war.id, p_alliance: me.allianceId, p_amount: r.value.report.stolen });
            conflicts = await loadConflicts(admin, season.id, now);
          }
          me.version = (data as { version: number }).version;
          finalState = r.value.attacker;
          const rep = r.value.report;
          const lost = Object.values(rep.destroyed).reduce((a, b) => a + (b ?? 0), 0);
          const fallen = describeArmy(rep.attackerLost);
          const shared = Object.entries(rep.allyShares)
            .map(([id, n]) => `${Math.floor(n).toLocaleString("fr-FR")} pour ${entities.get(id)?.name ?? "un allié"}`)
            .join(", ");
          message = rep.success
            ? `Raid réussi contre ${victim.name} : ${Math.floor(rep.stolen).toLocaleString("fr-FR")} pierres pillées${shared ? ` (dont ${shared})` : ""}${lost ? `, ${lost} bâtiment${lost > 1 ? "s" : ""} en ruine` : ""}. Tes pertes : ${fallen}.`
            : `${victim.name} a repoussé ton raid en ${rep.rounds} round${rep.rounds > 1 ? "s" : ""}. Tes pertes : ${fallen}.`;
          entities = await loadEntities(admin, season.id, userId);
        }
      }
      if (error) {
        // Raid refusé : on enregistre quand même l'avancement de la production.
        const { data } = await admin.rpc("commit_state", { p_season: season.id, p_state: toJson(me, current, {}), p_touch: true, p_contribution: 0, p_stage_bases: STAGE_BASES, p_active_window_days: ACTIVE_WINDOW_DAYS, p_action: null, p_details: null });
        if ((data as { conflict?: boolean } | null)?.conflict) continue;
      }
    } else {
      const outcome = applySimpleAction(current, action, now, world);
      if (outcome.ok) finalState = outcome.value.state;
      else error = outcome.error;
      const contribution = outcome.ok ? (outcome.value.contribution ?? 0) : 0;
      const { data, error: rpcError } = await admin.rpc("commit_state", {
        p_season: season.id,
        p_state: toJson(me, finalState, {}),
        p_touch: true,
        p_contribution: contribution,
        p_stage_bases: STAGE_BASES,
        p_active_window_days: ACTIVE_WINDOW_DAYS,
        p_action: outcome.ok ? (outcome.value.log?.action ?? null) : null,
        p_details: outcome.ok ? (outcome.value.log?.details ?? null) : null,
      });
      if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);
      const result = data as { ok: boolean; conflict?: boolean; worksite?: WorksiteRow };
      if (!result.ok && result.conflict) continue;
      if (result.worksite) worksite = worksiteFromRow(result.worksite);
      if (contribution > 0) await recordContribution(season.id, userId, finalState.totalContributed);
    }

    const meNow = entities.get(userId) ?? me;
    // Les dernières lectures partent ensemble (les noms d'alliance ne changent qu'avec une action d'alliance).
    const namesP = ALLIANCE_ACTIONS.has(action.type) || CONFLICT_ACTIONS.has(action.type) ? loadAllianceNames(admin, season.id) : Promise.resolve(allianceNames);
    const [intel, names, info, chronicle] = await Promise.all([
      loadIntel(admin, season.id, userId, now),
      namesP,
      namesP.then((n) => allianceInfo(admin, season.id, meNow, finalState, entities, n)),
      wantsChronicle ? loadChronicle(admin, season.id, entities) : Promise.resolve(undefined),
    ]);
    allianceNames = names;
    const snapshot: GameSnapshot = {
      serverNow: now,
      userId,
      username: me.name,
      state: finalState,
      worksite,
      season,
      rivals: rivalsFor(meNow, finalState, entities, worldFrom(worksite), flat, now, intel, allianceNames, conflicts.wars),
      ...info,
      alliances: [...allianceNames].map(([id, name]) => ({ id, name, size: [...entities.values()].filter((e) => e.allianceId === id).length })),
      war: warView(meNow, conflicts.wars, allianceNames),
      event: eventView(userId, finalState, events, now),
      fortress: fortressView(meNow, finalState, conflicts.fortress, entities, allianceNames, now, intel.get(FORTRESS_INTEL) ?? null),
      chronicle,
    };
    return error ? { ok: false, error, snapshot } : { ok: true, snapshot, message };
  }
  return { ok: false, error: "Trop d'actions simultanées, réessaie." };
}

/** Classements de la saison : contributeurs au chantier et pillards (seigneurs exclus). */
export async function getLeaderboards(admin: SupabaseClient, limit = 20): Promise<Leaderboards> {
  const season = await getActiveSeason(admin);
  const { data } = await admin
    .from("player_states")
    .select("user_id, total_contributed, total_plundered, profiles(username, is_bot)")
    .eq("season_id", season.id);
  type Row = { user_id: string; total_contributed: number; total_plundered: number; profiles: { username: string; is_bot: boolean } | null };
  const humans = ((data ?? []) as unknown as Row[]).filter((r) => r.profiles && !r.profiles.is_bot);
  const names = new Map(humans.map((r) => [r.user_id, r.profiles!.username]));

  let contributors: { userId: string; total: number }[] | null = await topContributors(season.id, limit);
  contributors = (contributors ?? humans.map((r) => ({ userId: r.user_id, total: Number(r.total_contributed) })))
    .filter((r) => names.has(r.userId) && r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
  const plunderers = humans
    .map((r) => ({ userId: r.user_id, total: Number(r.total_plundered ?? 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  const withNames = (rows: { userId: string; total: number }[]): LeaderboardRow[] => rows.map((r) => ({ ...r, username: names.get(r.userId) ?? "Inconnu" }));
  return { contributors: withNames(contributors), plunderers: withNames(plunderers) };
}

