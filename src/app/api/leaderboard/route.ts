import { NextResponse } from "next/server";
import { getLeaderboards } from "@/lib/game/server";
import { rateLimit } from "@/lib/redis";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!(await rateLimit("action", user.id))) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  try {
    const boards = await getLeaderboards(createAdminClient());
    return NextResponse.json(boards, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erreur du serveur." }, { status: 500 });
  }
}
