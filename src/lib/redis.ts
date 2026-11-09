import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { upstashConfig } from "@/lib/env";

// Upstash Redis est optionnel en développement : sans configuration, la limitation
// de débit est désactivée et le classement est lu directement dans Postgres.

const cfg = upstashConfig();
export const redis: Redis | null = cfg ? new Redis({ url: cfg.url, token: cfg.token }) : null;

const actionLimiter = redis
  ? new Ratelimit({ redis, prefix: "beffroi:rl:action", limiter: Ratelimit.slidingWindow(40, "10 s") })
  : null;
const authLimiter = redis
  ? new Ratelimit({ redis, prefix: "beffroi:rl:auth", limiter: Ratelimit.slidingWindow(10, "1 m") })
  : null;

/** true si la requête est autorisée. */
export async function rateLimit(kind: "action" | "auth", key: string): Promise<boolean> {
  const limiter = kind === "action" ? actionLimiter : authLimiter;
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch {
    return true; // Redis indisponible : on ne bloque pas le jeu.
  }
}

export function leaderboardKey(seasonId: number): string {
  return `beffroi:s${seasonId}:contrib`;
}

/** Met à jour le total de contribution d'un joueur dans le classement Redis. */
export async function recordContribution(seasonId: number, userId: string, total: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.zadd(leaderboardKey(seasonId), { score: total, member: userId });
  } catch {
    // Le classement Postgres sert de repli.
  }
}

export async function topContributors(seasonId: number, limit: number): Promise<{ userId: string; total: number }[] | null> {
  if (!redis) return null;
  try {
    const raw = await redis.zrange<(string | number)[]>(leaderboardKey(seasonId), 0, limit - 1, { rev: true, withScores: true });
    if (raw.length === 0) return null;
    const rows: { userId: string; total: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) rows.push({ userId: String(raw[i]), total: Number(raw[i + 1]) });
    return rows;
  } catch {
    return null;
  }
}
