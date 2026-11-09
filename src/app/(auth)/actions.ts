"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/redis";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  info?: string;
  fields?: Record<string, string>;
}

const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
}

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Échappe les jokers de LIKE pour une recherche exacte insensible à la casse. */
function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function findUserIdByUsername(username: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").ilike("username", likeExact(username)).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

function translate(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Identifiants incorrects.";
  if (/email not confirmed/i.test(message)) return "Confirme d'abord ton e-mail (regarde ta boîte de réception).";
  if (/already registered|already been registered/i.test(message)) return "Cet e-mail a déjà un compte.";
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return "Mot de passe trop faible (8 caractères minimum).";
  if (/rate limit|too many/i.test(message)) return "Trop de tentatives, réessaie dans quelques minutes.";
  return "Une erreur est survenue, réessaie.";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fields = { identifier };
  if (!identifier || !password) return { error: "Renseigne ton e-mail (ou pseudo) et ton mot de passe.", fields };
  if (!(await rateLimit("auth", `login:${await clientIp()}`))) return { error: "Trop de tentatives, réessaie dans une minute.", fields };

  let email = identifier;
  if (!identifier.includes("@")) {
    const userId = await findUserIdByUsername(identifier);
    if (!userId) return { error: "Identifiants incorrects.", fields };
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    if (!data.user?.email) return { error: "Identifiants incorrects.", fields };
    email = data.user.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translate(error.message), fields };
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fields = { username, email };

  if (!USERNAME_RE.test(username)) return { error: "Pseudo : 3 à 20 caractères (lettres, chiffres, _ ou -).", fields };
  if (!EMAIL_RE.test(email)) return { error: "Adresse e-mail invalide.", fields };
  if (password.length < 8) return { error: "Mot de passe trop court (8 caractères minimum).", fields };
  if (!(await rateLimit("auth", `signup:${await clientIp()}`))) return { error: "Trop de tentatives, réessaie dans une minute.", fields };
  if (await findUserIdByUsername(username)) return { error: "Ce pseudo est déjà pris.", fields };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) {
    if (/database error/i.test(error.message)) return { error: "Ce pseudo est déjà pris.", fields };
    return { error: translate(error.message), fields };
  }
  if (data.session) redirect("/");
  return { info: `Presque fini ! Un e-mail de confirmation a été envoyé à ${email}. Clique sur le lien pour entrer au royaume.` };
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const fields = { identifier };
  if (!identifier) return { error: "Renseigne ton e-mail ou ton pseudo.", fields };
  if (!(await rateLimit("auth", `reset:${await clientIp()}`))) return { error: "Trop de tentatives, réessaie dans une minute.", fields };

  let email: string | null = identifier.includes("@") ? identifier.toLowerCase() : null;
  if (!email) {
    const userId = await findUserIdByUsername(identifier);
    if (userId) email = (await createAdminClient().auth.admin.getUserById(userId)).data.user?.email ?? null;
  }
  if (email) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await siteOrigin()}/auth/callback?next=/nouveau-mot-de-passe`,
    });
  }
  // Même réponse dans tous les cas, pour ne pas révéler quels comptes existent.
  return { info: "Si ce compte existe, un e-mail avec un lien pour choisir un nouveau mot de passe vient d'être envoyé." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Mot de passe trop court (8 caractères minimum)." };
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Le lien a expiré. Redemande un e-mail de réinitialisation." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: translate(error.message) };
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
