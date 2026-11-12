// Sonde de santé pour l'hébergeur (Railway) : répond sans toucher à Supabase.
export function GET() {
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
