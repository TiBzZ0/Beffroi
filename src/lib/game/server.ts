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
  REVENGE_MS,
  SPY_INTEL_MS,
  MAX_ALLIANCE_SIZE,
  GUARDS_PER_DOMAIN,
  COMBATANTS,
  SEASON_DAYS,
  STAGE_BASES,
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
  recallReinforcements,
  sendReinforcements,
  spyDetectChance,

  productionPerSecond,
  raidArmies,
  raidBlocker,
  armyWorth,
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
} from "./types";
import { armyFromBudget, estimateChance, type Army } from "./battle";
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

export async function getActiveSeason(admin: SupabaseClient): Promise<SeasonView> {
  const { data, error } = await admin.rpc("ensure_active_season", { p_days: SEASON_DAYS, p_first_stage_base: STAGE_BASES[0] });
  if (error || !data) throw new Error(`Saison introuvable : ${error?.message}`);
  return toSeason(Array.isArray(data) ? data[0] : data);
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
  return new Map((data as PlayerRow[]).map((r) => [r.user_id, toEntity(r)]));
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

/** Armée des seigneurs : elle suit la médiane des vrais joueurs, selon leur caractère. */
function lordArmies(entities: Map<string, Entity>): Map<string, { attack: Army; defense: Army }> {
  const humans = [...entities.values()].filter((e) => !e.isLord);
  const budget = Math.max(LORD_MIN_BUDGET, median(humans.map((e) => armyWorth(e.state))));
  const out = new Map<string, { attack: Army; defense: Army }>();
  for (const l of LORDS) {
    const taste = LORD_ARMY[l.key];
    const attack = armyFromBudget(budget * taste.attack, taste.troops);
    const forts = armyFromBudget(budget * taste.defense, taste.forts);
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
      const amount = Math.floor(state.stone * lord.contribution.share);
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
    .limit(20);
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

/** Rapports d'espion encore valables : cible → fin de validité. */
async function loadIntel(admin: SupabaseClient, seasonId: number, spyId: string, now: number): Promise<Map<string, number>> {
  const { data } = await admin
    .from("spy_reports")
    .select("target_id, expires_at")
    .eq("season_id", seasonId)
    .eq("spy_id", spyId)
    .gt("expires_at", iso(now));
  const out = new Map<string, number>();
  for (const r of data ?? []) out.set(r.target_id as string, Math.max(out.get(r.target_id as string) ?? 0, ms(r.expires_at as string)));
  return out;
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
): RivalView[] {
  const armies = lordArmies(entities);
  return [...entities.values()]
    .filter((e) => e.id !== me.id)
    .map((e) => {
      const s = advanceEntity(e, now, world, flat);
      const rate = currentRate(e, s, now, world, flat);
      const revenge = hasRevenge(myState, e.id, now);
      const allied = isAllied(me, e);
      const ctx = { now, attackerId: me.id, victimId: e.id, victimRate: rate, allied, defenderArmy: e.isLord ? armies.get(e.id)?.defense : undefined };
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
        allianceName: e.allianceId !== null ? (allianceNames.get(e.allianceId) ?? null) : null,
        army: seen as Record<string, number>,
        chance: estimateChance(fight.attack, seen, { attackBonus: fight.attackBonus }),
        shieldUntil: s.shieldUntil,
        burnedUntil: s.burnedUntil,
        totalPlundered: s.totalPlundered,
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
  const wantsChronicle = action.type === "sync" || action.type === "raid" || action.type === "spy";

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
    const current = advance(me.state, now, world);
    let finalState = current;
    let error: string | null = null;
    let message: string | undefined;

    if (ALLIANCE_ACTIONS.has(action.type)) {
      const r = await runAllianceAction(admin, season.id, me, current, entities, action as AllianceAction, (e) => advanceEntity(e, now, world, flat));
      if (r === "conflict") continue;
      if (r.error) error = r.error;
      message = r.message;
      if (r.state) finalState = r.state;
      entities = await loadEntities(admin, season.id, userId);
    } else if (action.type === "spy") {
      const target = entities.get(String(action.target));
      const cost = spyCost(current, world, now);
      if (!target || target.id === me.id) error = "Cible inconnue.";
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
        p_details: error ? null : { target: target!.id, cost },
      });
      if (rpcError) throw new Error(`Enregistrement impossible : ${rpcError.message}`);
      if ((data as { conflict?: boolean } | null)?.conflict) continue;
      if (!error && target) {
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

    const [intel, allianceNames] = await Promise.all([loadIntel(admin, season.id, userId, now), loadAllianceNames(admin, season.id)]);
    const snapshot: GameSnapshot = {
      serverNow: now,
      userId,
      username: me.name,
      state: finalState,
      worksite,
      season,
      rivals: rivalsFor(entities.get(userId) ?? me, finalState, entities, worldFrom(worksite), flat, now, intel, allianceNames),
      ...(await allianceInfo(admin, season.id, entities.get(userId) ?? me, finalState, entities, allianceNames)),
      chronicle: wantsChronicle ? await loadChronicle(admin, season.id, entities) : undefined,
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

