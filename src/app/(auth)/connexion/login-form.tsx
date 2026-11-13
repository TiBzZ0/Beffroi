"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "../actions";
import { ASK_ADMIN } from "@/components/ask-admin";
import { PASSWORD_RESET_ENABLED } from "@/lib/env";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});
  return (
    <form action={action} noValidate>
      {linkError && !state.error && <p className="notice notice-error">Ce lien de confirmation est invalide ou expiré.</p>}
      {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
      <div className="field">
        <label htmlFor="identifier">E-mail ou pseudo</label>
        <input id="identifier" name="identifier" autoComplete="username" required defaultValue={state.fields?.identifier} />
      </div>
      <div className="field">
        <label htmlFor="password">Mot de passe</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Ouverture des portes…" : "Entrer au royaume"}
      </button>
      <p className="auth-switch">
        {PASSWORD_RESET_ENABLED ? <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link> : <>Mot de passe oublié ? {ASK_ADMIN}</>}
      </p>
      <p className="auth-switch">
        Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
      </p>
    </form>
  );
}
