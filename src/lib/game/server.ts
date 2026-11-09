import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_WINDOW_DAYS, GENERATOR_IDS, SEASON_DAYS, STAGE_BASES, type GeneratorId } from "./config";
import {
  advance,
  applyClicks,
  buyGenerator,
  buyUpgrade,
  contribute,
  newPlayerState,
  type PlayerState,
  type Result,
} from "./engine";
import { worksiteFromRow, worldFrom, type GameAction, type GameSnapshot, type LeaderboardRow, type SeasonView, type WorksiteView } from "./types";
import { recordContribution, topContributors } from "@/lib/redis";

// Toute la logique qui fait foi : charger l'état, le recalculer, appliquer l'intention
// du joueur, puis enregistrer (verrouillage optimiste, avec quelques nouvelles tentatives).

const MAX_ATTEMPTS = 4;

interface PlayerRow {
  stone: number;
  generators: Record<string, number>;
  upgrades: string[];
  total_produced: number;
  total_contributed: number;
  total_clicks: number;
  last_update: string;
  last_click_at: string;
  version: number;
}

interface WorksiteRow {
  stage: number;
  progress: number;
  target: number;
  total: number;
  active_players: number;
  stage_completed_at: string[] | null;
}

function toSeason(row: { id: number; number: number; starts_at: string; ends_at: string }): SeasonView {
  return { id: row.id, number: row.number, startsAt: Date.parse(row.starts_at), endsAt: Date.parse(row.ends_at) };
}

const toWorksite = worksiteFromRow;

function toState(row: PlayerRow): PlayerState {
  const generators: PlayerState["generators"] = {};
  for (const id of GENERATOR_IDS) {
    const n = Number(row.generators?.[id] ?? 0);
    if (n > 0) generators[id] = n;
  }
  return {
    stone: Number(row.stone),
    generators,
    upgrades: Array.isArray(row.upgrades) ? row.upgrades : [],
    totalProduced: Number(row.total_produced),
    totalContributed: Number(row.total_contributed),
    totalClicks: Number(row.total_clicks),
    lastUpdate: Date.parse(row.last_update),
    lastClickAt: Date.parse(row.last_click_at),
  };
}

export async function getActiveSeason(admin: SupabaseClient): Promise<SeasonView> {
  const { data, error } = await admin.rpc("ensure_active_season", { p_days: SEASON_DAYS, p_first_stage_base: STAGE_BASES[0] });
  if (error || !data) throw new Error(`Saison introuvable : ${error?.message}`);
  return toSeason(Array.isArray(data) ? data[0] : data);
}

async function loadWorksite(admin: SupabaseClient, seasonId: number): Promise<WorksiteView> {
  const { data, error } = await admin.from("worksites").select("*").eq("season_id", seasonId).single();
  if (error || !data) throw new Error(`Chantier introuvable : ${error?.message}`);
  return toWorksite(data as WorksiteRow);
}

async function loadPlayer(admin: SupabaseClient, userId: string, seasonId: number): Promise<{ state: PlayerState; version: number }> {
  const select = () => admin.from("player_states").select("*").eq("user_id", userId).eq("season_id", seasonId).maybeSingle();
  let { data } = await select();
  if (!data) {
    const now = new Date().toISOString();
    await admin
      .from("player_states")
      .upsert({ user_id: userId, season_id: seasonId, last_update: now, last_click_at: now, last_seen: now }, { onConflict: "user_id,season_id", ignoreDuplicates: true });
    ({ data } = await select());
  }
  if (!data) {
    const s = newPlayerState(Date.now());
    return { state: s, version: 0 };
  }
  return { state: toState(data as PlayerRow), version: (data as PlayerRow).version };
}

async function loadUsername(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
  return (data?.username as string | undefined) ?? "Inconnu";
}

interface Outcome {
  state: PlayerState;
  contribution?: number;
  log?: { action: string; details: Record<string, unknown> };
  message?: string;
}

function applyAction(state: PlayerState, action: GameAction, now: number, worksite: WorksiteView): Result<Outcome> {
  const world = worldFrom(worksite);
  switch (action.type) {
    case "sync":
      return { ok: true, value: { state } };
    case "click": {
      const { state: next } = applyClicks(state, Number(action.count), now, world);
      return { ok: true, value: { state: next } };
    }
    case "buy": {
      if (!GENERATOR_IDS.includes(action.generator as GeneratorId)) return { ok: false, error: "Bâtiment inconnu." };
      const r = buyGenerator(state, action.generator as GeneratorId, Number(action.qty));
      if (!r.ok) return r;
      return { ok: true, value: { state: r.value, log: { action: "buy", details: { generator: action.generator, qty: action.qty } } } };
    }
    case "upgrade": {
      const r = buyUpgrade(state, String(action.upgrade));
      if (!r.ok) return r;
      return { ok: true, value: { state: r.value, log: { action: "upgrade", details: { upgrade: action.upgrade } } } };
    }
    case "contribute": {
      const r = contribute(state, Number(action.amount));
      if (!r.ok) return r;
      const given = r.value.totalContributed - state.totalContributed;
      return {
        ok: true,
        value: { state: r.value, contribution: given, log: { action: "contribute", details: { amount: given } } },
      };
    }
    default:
      return { ok: false, error: "Action inconnue." };
  }
}

export type ActionResult = { ok: true; snapshot: GameSnapshot } | { ok: false; error: string; snapshot?: GameSnapshot };

/** Exécute une intention du joueur et renvoie l'état qui fait foi. */
export async function runAction(admin: SupabaseClient, userId: string, action: GameAction): Promise<ActionResult> {
  const season = await getActiveSeason(admin);
  const usernamePromise = loadUsername(admin, userId);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [worksite, player] = await Promise.all([loadWorksite(admin, season.id), loadPlayer(admin, userId, season.id)]);
    const now = Date.now();
    const current = advance(player.state, now, worldFrom(worksite));
    const outcome = applyAction(current, action, now, worksite);
    const base = outcome.ok ? outcome.value : { state: current };

    const { data, error } = await admin.rpc("commit_player_state", {
      p_user: userId,
      p_season: season.id,
      p_expected_version: player.version,
      p_stone: base.state.stone,
      p_generators: base.state.generators,
      p_upgrades: base.state.upgrades,
      p_total_produced: base.state.totalProduced,
      p_total_contributed: base.state.totalContributed,
      p_total_clicks: base.state.totalClicks,
      p_last_update: new Date(base.state.lastUpdate).toISOString(),
      p_last_click_at: new Date(base.state.lastClickAt).toISOString(),
      p_contribution: outcome.ok ? (outcome.value.contribution ?? 0) : 0,
      p_stage_bases: STAGE_BASES,
      p_active_window_days: ACTIVE_WINDOW_DAYS,
      p_action: outcome.ok ? (outcome.value.log?.action ?? null) : null,
      p_details: outcome.ok ? (outcome.value.log?.details ?? null) : null,
    });
    if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
    const result = data as { ok: boolean; conflict?: boolean; worksite?: WorksiteRow };
    if (!result.ok && result.conflict) continue;

    const snapshot: GameSnapshot = {
      serverNow: now,
      username: await usernamePromise,
      state: base.state,
      worksite: result.worksite ? toWorksite(result.worksite) : worksite,
      season,
    };
    if (outcome.ok && outcome.value.contribution) {
      await recordContribution(season.id, userId, base.state.totalContributed);
    }
    return outcome.ok ? { ok: true, snapshot } : { ok: false, error: outcome.error, snapshot };
  }
  return { ok: false, error: "Trop d'actions simultanées, réessaie." };
}

/** Classement des contributeurs au chantier (Redis si disponible, sinon Postgres). */
export async function getLeaderboard(admin: SupabaseClient, limit = 20): Promise<LeaderboardRow[]> {
  const season = await getActiveSeason(admin);
  let rows = await topContributors(season.id, limit);
  if (!rows) {
    const { data } = await admin
      .from("player_states")
      .select("user_id, total_contributed")
      .eq("season_id", season.id)
      .gt("total_contributed", 0)
      .order("total_contributed", { ascending: false })
      .limit(limit);
    rows = (data ?? []).map((r) => ({ userId: r.user_id as string, total: Number(r.total_contributed) }));
  }
  if (rows.length === 0) return [];
  const { data: profiles } = await admin.from("profiles").select("id, username").in("id", rows.map((r) => r.userId));
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.username as string]));
  return rows.map((r) => ({ ...r, username: names.get(r.userId) ?? "Inconnu" }));
}
