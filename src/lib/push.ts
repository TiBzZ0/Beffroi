import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import webpush from "web-push";

// Notifications push. Les clés VAPID sont créées par le serveur à la première utilisation et
// rangées dans la table `app_secrets` (lisible par la seule clé de service) : la clé privée ne
// quitte jamais le serveur et n'est dans aucun fichier du dépôt.

export interface PushMessage {
  title: string;
  body: string;
  /** Une notification du même tag remplace la précédente. */
  tag?: string;
}

const SUBJECT = "https://github.com/TiBzZ0/Beffroi";
let keys: { publicKey: string; privateKey: string } | null = null;

export async function vapidKeys(admin: SupabaseClient): Promise<{ publicKey: string; privateKey: string }> {
  if (keys) return keys;
  const read = async () => {
    const { data } = await admin.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
    const m = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
    return m.get("vapid_public") && m.get("vapid_private") ? { publicKey: m.get("vapid_public")!, privateKey: m.get("vapid_private")! } : null;
  };
  let found = await read();
  if (!found) {
    const fresh = webpush.generateVAPIDKeys();
    // Si deux serveurs génèrent en même temps, le premier gagne et tout le monde relit ses clés.
    await admin.from("app_secrets").upsert(
      [
        { key: "vapid_public", value: fresh.publicKey },
        { key: "vapid_private", value: fresh.privateKey },
      ],
      { onConflict: "key", ignoreDuplicates: true },
    );
    found = await read();
  }
  if (!found) throw new Error("Clés de notification introuvables.");
  keys = found;
  return found;
}

async function send(admin: SupabaseClient, userIds: string[] | "all", msg: PushMessage): Promise<void> {
  if (userIds !== "all" && userIds.length === 0) return;
  let query = admin.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (userIds !== "all") query = query.in("user_id", userIds);
  const { data: subs } = await query;
  if (!subs || subs.length === 0) return;
  const { publicKey, privateKey } = await vapidKeys(admin);
  const payload = JSON.stringify(msg);
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } }, payload, {
          vapidDetails: { subject: SUBJECT, publicKey, privateKey },
          TTL: 3600,
        });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint as string);
      }
    }),
  );
  if (dead.length > 0) await admin.from("push_subscriptions").delete().in("endpoint", dead);
}

/** Envoie une notification après la réponse, sans la retarder ; une erreur d'envoi ne casse jamais le jeu. */
export function notify(admin: SupabaseClient, userIds: string[] | "all", msg: PushMessage): void {
  const task = () => send(admin, userIds, msg).catch((e) => console.error("push", e));
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Envoie à chacun son propre message (résumé quotidien), après la réponse. */
export function notifyEach(admin: SupabaseClient, messages: Map<string, PushMessage>): void {
  const task = async () => {
    for (const [id, msg] of messages) await send(admin, [id], msg).catch((e) => console.error("push", e));
  };
  try {
    after(task);
  } catch {
    void task();
  }
}
