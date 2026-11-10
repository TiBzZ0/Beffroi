import { NextResponse } from "next/server";
import { postChat, reactChat, readChat, type ChatChannel } from "@/lib/game/chat";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

// B11 : lecture, envoi et réactions des messages (canal général ou d'alliance).

const channelOf = (v: unknown): ChatChannel => (v === "alliance" ? "alliance" : "general");

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const channel = channelOf(new URL(req.url).searchParams.get("channel"));
  return NextResponse.json(await readChat(createAdminClient(), user.id, channel));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { channel?: string; body?: unknown; id?: unknown; emoji?: unknown } | null;
  const admin = createAdminClient();
  const error =
    typeof body?.id === "number" && typeof body.emoji === "string"
      ? await reactChat(admin, user.id, body.id, body.emoji)
      : typeof body?.body === "string"
        ? await postChat(admin, user.id, channelOf(body.channel), body.body)
        : "Requête invalide.";
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json(await readChat(admin, user.id, channelOf(body?.channel)));
}
