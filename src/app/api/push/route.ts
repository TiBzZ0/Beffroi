import { NextResponse } from "next/server";
import { vapidKeys } from "@/lib/push";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

// Abonnement aux notifications : le navigateur demande la clé publique, puis envoie son abonnement.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { publicKey } = await vapidKeys(createAdminClient());
  return NextResponse.json({ publicKey });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  const endpoint = body?.endpoint;
  if (!endpoint || !endpoint.startsWith("https://") || endpoint.length > 1000 || !body?.keys?.p256dh || !body.keys.auth) {
    return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
  }
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ endpoint, user_id: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) await createAdminClient().from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
