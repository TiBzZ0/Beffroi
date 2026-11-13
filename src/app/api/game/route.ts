import { NextResponse } from "next/server";
import { runAction } from "@/lib/game/server";
import type { ActionResponse, GameAction } from "@/lib/game/types";
import { rateLimit } from "@/lib/redis";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

// Point d'entrée unique du jeu. Le client n'envoie que des intentions
// (« acheter un atelier »), jamais de valeurs (« j'ai 5 000 pierres »).

const ACTIONS = new Set(["sync", "click", "buy", "upgrade", "contribute", "raid", "rebuild", "army", "spy", "mole", "counter", "rumor", "alliance_create", "alliance_invite", "alliance_accept", "alliance_decline", "alliance_leave", "reinforce", "recall", "war_declare", "fortress_attack", "fortress_station", "fortress_recall", "event_attack", "research", "research_cancel", "legacy_buy", "inbox_read", "academy", "sabotage", "tithe", "curfew", "vein", "master_choice", "merchant", "march_recall", "tournament_join", "daily", "hall", "lineage_buy", "lineage_respec"]);

function json(body: ActionResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function handle(action: GameAction, request?: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Non connecté." }, 401);
  if (!(await rateLimit("action", user.id))) return json({ ok: false, error: "Doucement, messire ! Trop de requêtes." }, 429);
  try {
    const ip = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || undefined;
    const result = await runAction(createAdminClient(), user.id, action, ip);
    return json(result, result.ok || result.snapshot ? 200 : 409);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Erreur du serveur." }, 500);
  }
}

export async function GET(request: Request) {
  return handle({ type: "sync" }, request);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Requête invalide." }, 400);
  }
  if (!body || typeof body !== "object" || !ACTIONS.has((body as { type?: string }).type ?? "")) {
    return json({ ok: false, error: "Action inconnue." }, 400);
  }
  return handle(body as GameAction, request);
}
