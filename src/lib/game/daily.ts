// Quêtes du jour : tirage, progression, récompenses, coffre et série.
import { DAILY_CHEST_BASE, DAILY_CHEST_MS, DAILY_CHEST_STEP, DAILY_FAMILIES, DAILY_QUESTS, DAILY_RESET_HOUR_UTC, DAILY_REWARD_SECONDS, DAILY_STREAK_MAX, UPGRADES, type DailyQuestId } from "./config";
import type { Result } from "./engine";

export interface DailyQuest {
  id: DailyQuestId;
  goal: number;
  claimed: boolean;
}

export interface DailyState {
  /** Numéro du jour (changement à 4 h UTC). */
  day: number;
  quests: DailyQuest[];
  swapped: boolean;
  chest: boolean;
  /** Jours complets d'affilée (1 à 5), et dernier jour complet. */
  streak: number;
  lastFull: number | null;
  /** Somme des niveaux de recherche au tirage (pour « termine une recherche »). */
  levels: number;
}

/** Compteurs du jour, relevés par le serveur. */
export type DailyCounts = Partial<Record<"don" | "ateliers" | "savoir" | "seigneur" | "repousser" | "renforts" | "veines" | "evenement" | "message" | "espion", number>>;

/** Ce qui rend une quête possible pour ce joueur. */
export interface DailyContext {
  shareSize: number | null;
  troops: number;
  allies: number;
  upgradesLeft: number;
  levels: number;
  /** E4 : niveau d'espionnage (la quête « reconnaissance » le demande). */
  spyLevel?: number;
}

const DAY_MS = 86_400_000;
const OFFSET = DAILY_RESET_HOUR_UTC * 3_600_000;

export function dailyDay(now: number): number {
  return Math.floor((now - OFFSET) / DAY_MS);
}

export function dailyStart(day: number): number {
  return day * DAY_MS + OFFSET;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(userId: string, day: number): number {
  let h = 2166136261 ^ day;
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 16777619);
  return h >>> 0;
}

function feasible(id: DailyQuestId, ctx: DailyContext): boolean {
  if (id === "don") return ctx.shareSize !== null && ctx.shareSize > 0;
  if (id === "savoir") return ctx.upgradesLeft > 0;
  if (id === "seigneur") return ctx.troops > 0;
  if (id === "renforts") return ctx.allies > 0;
  if (id === "espion") return (ctx.spyLevel ?? 0) >= 1;
  return true;
}

function goalOf(id: DailyQuestId, ctx: DailyContext): number {
  if (id === "don") return Math.max(1, Math.ceil((ctx.shareSize ?? 0) / 4));
  return (DAILY_QUESTS.find((q) => q.id === id) as { goal?: number } | undefined)?.goal ?? 1;
}

function pick(family: string, ctx: DailyContext, r: () => number, exclude: DailyQuestId[] = []): DailyQuestId | null {
  const pool = DAILY_QUESTS.filter((q) => q.family === family && !exclude.includes(q.id) && feasible(q.id, ctx)).map((q) => q.id);
  return pool.length ? pool[Math.floor(r() * pool.length)] : null;
}

/** Nouveau jour : nouvelles quêtes ; chaque jour manqué fait perdre un cran de série. */
export function rollDaily(prev: DailyState | null | undefined, now: number, seed: number, ctx: DailyContext): DailyState {
  const day = dailyDay(now);
  if (prev && prev.day === day) return prev;
  let streak = prev?.streak ?? 0;
  let lastFull = prev?.lastFull ?? null;
  // Jours manqués : un cran de moins chacun ; on note la perte pour ne pas la compter deux fois.
  if (lastFull !== null && lastFull < day - 1) {
    streak = Math.max(0, streak - (day - 1 - lastFull));
    lastFull = day - 1;
  }
  const r = rng(seed);
  const quests = DAILY_FAMILIES.flatMap((f) => {
    const id = pick(f, ctx, r);
    return id ? [{ id, goal: goalOf(id, ctx), claimed: false }] : [];
  });
  return { day, quests, swapped: false, chest: false, streak, lastFull, levels: ctx.levels };
}

export function dailyProgress(d: DailyState, q: DailyQuest, counts: DailyCounts, levels: number): number {
  const n = q.id === "recherche" ? Math.max(0, levels - d.levels) : (counts[q.id] ?? 0);
  return Math.min(q.goal, n);
}

/** Bonus du coffre pour une série donnée. */
export function chestBonus(streak: number): number {
  return DAILY_CHEST_BASE + DAILY_CHEST_STEP * (Math.min(DAILY_STREAK_MAX, Math.max(1, streak)) - 1);
}

export interface DailyHolder {
  stone: number;
  totalProduced: number;
  daily?: DailyState | null;
  dailyBoostUntil?: number;
  dailyBoost?: number;
}

export function claimDaily<S extends DailyHolder>(state: S, index: number, counts: DailyCounts, levels: number, rate: number): Result<{ state: S; reward: number }> {
  const d = state.daily;
  const q = d?.quests[index];
  if (!d || !q) return { ok: false, error: "Quête inconnue." };
  if (q.claimed) return { ok: false, error: "Récompense déjà prise." };
  if (dailyProgress(d, q, counts, levels) < q.goal) return { ok: false, error: "Quête pas encore accomplie." };
  const reward = Math.floor(rate * DAILY_REWARD_SECONDS);
  const quests = d.quests.map((x, i) => (i === index ? { ...x, claimed: true } : x));
  return { ok: true, value: { reward, state: { ...state, stone: state.stone + reward, totalProduced: state.totalProduced + reward, daily: { ...d, quests } } } };
}

export function swapDaily<S extends DailyHolder>(state: S, index: number, seed: number, ctx: DailyContext): Result<S> {
  const d = state.daily;
  const q = d?.quests[index];
  if (!d || !q) return { ok: false, error: "Quête inconnue." };
  if (d.swapped) return { ok: false, error: "Tu as déjà échangé une quête aujourd'hui." };
  if (q.claimed) return { ok: false, error: "Cette quête est déjà accomplie." };
  const family = DAILY_QUESTS.find((x) => x.id === q.id)?.family ?? "";
  const id = pick(family, ctx, rng(seed ^ 0x5eed), d.quests.map((x) => x.id));
  if (!id) return { ok: false, error: "Aucune autre quête de cette famille pour toi aujourd'hui." };
  const quests = d.quests.map((x, i) => (i === index ? { id, goal: goalOf(id, ctx), claimed: false } : x));
  return { ok: true, value: { ...state, daily: { ...d, quests, swapped: true } } };
}

export function openChest<S extends DailyHolder>(state: S, now: number): Result<{ state: S; bonus: number }> {
  const d = state.daily;
  if (!d || d.quests.length === 0) return { ok: false, error: "Pas de quêtes aujourd'hui." };
  if (d.chest) return { ok: false, error: "Coffre déjà ouvert." };
  if (!d.quests.every((q) => q.claimed)) return { ok: false, error: "Termine d'abord les trois quêtes." };
  const streak = Math.min(DAILY_STREAK_MAX, d.lastFull === d.day - 1 ? d.streak + 1 : 1);
  const bonus = chestBonus(streak);
  return { ok: true, value: { bonus, state: { ...state, dailyBoostUntil: now + DAILY_CHEST_MS, dailyBoost: bonus, daily: { ...d, chest: true, streak, lastFull: d.day } } } };
}

export const UPGRADE_COUNT = UPGRADES.length;
