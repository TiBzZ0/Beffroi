import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { runAction } from "@/lib/game/server";
import type { ActionResponse, GameAction } from "@/lib/game/types";
import { rateLimit } from "@/lib/redis";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

// Point d'entrée unique du jeu. Le client n'envoie que des intentions
// (« acheter un atelier »), jamais de valeurs (« j'ai 5 000 pierres »).

const ACTIONS = new Set(["sync", "click", "buy", "upgrade", "contribute", "raid", "rebuild"]);

/** Empreinte de l'adresse IP (jamais stockée en clair), pour interdire les raids entre comptes d'une même connexion. */
async function ipHash(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(`beffroi:${ip}`).digest("hex").slice(0, 16);
}

function json(body: ActionResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function handle(action: GameAction) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Non connecté." }, 401);
  if (!(await rateLimit("action", user.id))) return json({ ok: false, error: "Doucement, messire ! Trop de requêtes." }, 429);
  try {
    const result = await runAction(createAdminClient(), user.id, action, await ipHash());
    return json(result, result.ok || result.snapshot ? 200 : 409);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "Erreur du serveur." }, 500);
  }
}

export async function GET() {
  return handle({ type: "sync" });
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
  return handle(body as GameAction);
}
