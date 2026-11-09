// Variables d'environnement. On accepte les noms posés par les intégrations Vercel
// (Supabase et Upstash via le Marketplace) comme les noms « manuels ».

function first(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => v && v.length > 0);
}

export const SUPABASE_URL = first(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "";

export const SUPABASE_PUBLIC_KEY =
  first(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ?? "";

export function supabaseConfigured(): boolean {
  return SUPABASE_URL !== "" && SUPABASE_PUBLIC_KEY !== "";
}

/** Clé secrète (serveur uniquement). */
export function supabaseSecretKey(): string {
  const key = first(process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error("SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) manquante.");
  return key;
}

export function upstashConfig(): { url: string; token: string } | null {
  const url = first(process.env.UPSTASH_REDIS_REST_URL, process.env.KV_REST_API_URL);
  const token = first(process.env.UPSTASH_REDIS_REST_TOKEN, process.env.KV_REST_API_TOKEN);
  return url && token ? { url, token } : null;
}
