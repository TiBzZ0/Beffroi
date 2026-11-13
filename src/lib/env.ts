// Variables d'environnement. On accepte les noms posés par les intégrations Vercel
// (Supabase et Upstash via le Marketplace) comme les noms « manuels ».

function first(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => v && v.length > 0);
}

export const SUPABASE_URL = first(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "";

export const SUPABASE_PUBLIC_KEY =
  first(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ?? "";

/**
 * « Mot de passe oublié » par e-mail : seulement si le Supabase utilisé sait envoyer des e-mails (SMTP).
 * Le Supabase auto-hébergé n'en a pas : sans `NEXT_PUBLIC_PASSWORD_RESET=1`, on renvoie vers l'admin.
 */
export const PASSWORD_RESET_ENABLED = process.env.NEXT_PUBLIC_PASSWORD_RESET === "1";

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
