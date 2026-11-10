// B11 : messages courts entre joueurs. Un canal général, et un canal par alliance.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveSeason } from "./server";
import { CHAT_COOLDOWN_MS, CHAT_HISTORY, CHAT_MAX_LENGTH, CHAT_REACTIONS, type ChatChannel, type ChatView } from "./chat-config";

export type { ChatChannel } from "./chat-config";

async function channelKey(admin: SupabaseClient, seasonId: number, userId: string, channel: ChatChannel): Promise<string | null> {
  if (channel === "general") return "general";
  const { data } = await admin.from("player_states").select("alliance_id").eq("season_id", seasonId).eq("user_id", userId).maybeSingle();
  return data?.alliance_id ? `a:${data.alliance_id}` : null;
}

export async function readChat(admin: SupabaseClient, userId: string, channel: ChatChannel): Promise<ChatView> {
  const season = await getActiveSeason(admin);
  const key = await channelKey(admin, season.id, userId, channel);
  if (!key) return { channel, available: false, messages: [] };
  const { data } = await admin
    .from("chat_messages")
    .select("id, user_id, body, reactions, created_at, profiles(username, display_name)")
    .eq("season_id", season.id)
    .eq("channel", key)
    .order("id", { ascending: false })
    .limit(CHAT_HISTORY);
  type Row = { id: number; user_id: string; body: string; reactions: Record<string, string[]> | null; created_at: string; profiles: { username: string; display_name: string | null } | null };
  const messages = ((data ?? []) as unknown as Row[])
    .map((r) => ({
      id: Number(r.id),
      at: Date.parse(r.created_at),
      userId: r.user_id,
      name: r.profiles?.display_name ?? r.profiles?.username ?? "Inconnu",
      body: r.body,
      reactions: r.reactions ?? {},
    }))
    .reverse();
  return { channel, available: true, messages };
}

export async function postChat(admin: SupabaseClient, userId: string, channel: ChatChannel, raw: string): Promise<string | null> {
  const body = raw.replace(/\s+/g, " ").trim();
  if (!body) return "Message vide.";
  if (body.length > CHAT_MAX_LENGTH) return `${CHAT_MAX_LENGTH} caractères au plus.`;
  const season = await getActiveSeason(admin);
  const key = await channelKey(admin, season.id, userId, channel);
  if (!key) return "Tu n'as pas d'alliance.";
  const { data: last } = await admin.from("chat_messages").select("created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - Date.parse(last.created_at as string) < CHAT_COOLDOWN_MS) return "Doucement, un message toutes les 3 secondes.";
  const { error } = await admin.from("chat_messages").insert({ season_id: season.id, channel: key, user_id: userId, body });
  return error ? "Envoi impossible." : null;
}

export async function reactChat(admin: SupabaseClient, userId: string, id: number, emoji: string): Promise<string | null> {
  if (!(CHAT_REACTIONS as readonly string[]).includes(emoji)) return "Réaction inconnue.";
  const season = await getActiveSeason(admin);
  const { data: msg } = await admin.from("chat_messages").select("channel, season_id").eq("id", id).maybeSingle();
  if (!msg || Number(msg.season_id) !== season.id) return "Message introuvable.";
  // On ne réagit qu'aux messages d'un canal qu'on peut lire.
  if (msg.channel !== "general" && msg.channel !== (await channelKey(admin, season.id, userId, "alliance"))) return "Message introuvable.";
  const { error } = await admin.rpc("toggle_reaction", { p_id: id, p_user: userId, p_emoji: emoji });
  return error ? "Réaction impossible." : null;
}
