// Sonde de santé (healthcheck Docker, supervision) : répond sans toucher à Supabase.
export function GET() {
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
