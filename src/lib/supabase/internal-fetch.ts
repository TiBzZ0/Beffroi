import { SUPABASE_URL } from "../env";

// Côté serveur, Supabase est joignable par le réseau Docker interne (quelques ms) au lieu
// de l'adresse publique (des centaines de ms par appel). On ne change pas l'URL donnée aux
// clients Supabase : le nom du cookie de session en dépend. On réécrit seulement chaque requête.
const INTERNAL = (process.env.SUPABASE_INTERNAL_URL ?? "").replace(/\/+$/, "");
const PUBLIC = SUPABASE_URL.replace(/\/+$/, "");

export const internalFetch: typeof fetch | undefined =
  INTERNAL && PUBLIC && INTERNAL !== PUBLIC
    ? (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.startsWith(PUBLIC)) return fetch(input, init);
        const next = INTERNAL + url.slice(PUBLIC.length);
        return input instanceof Request ? fetch(new Request(next, input), init) : fetch(next, init);
      }
    : undefined;

/** Options à passer aux clients Supabase côté serveur. */
export const serverGlobal = internalFetch ? { global: { fetch: internalFetch } } : {};
