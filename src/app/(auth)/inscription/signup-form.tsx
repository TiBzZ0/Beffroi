"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "../actions";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, {});
  if (state.info) {
    return (
      <>
        <p className="notice notice-info" role="status">{state.info}</p>
        <p className="auth-switch">
          <Link href="/connexion">Retour à la connexion</Link>
        </p>
      </>
    );
  }
  return (
    <form action={action} noValidate>
      {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
      <div className="field">
        <label htmlFor="username">Pseudo</label>
        <input id="username" name="username" autoComplete="nickname" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_\-]{3,20}" defaultValue={state.fields?.username} />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} />
      </div>
      <div className="field">
        <label htmlFor="password">Mot de passe (8 caractères minimum)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Inscription au registre…" : "Créer mon compte"}
      </button>
      <p className="auth-switch">
        Déjà un compte ? <Link href="/connexion">Se connecter</Link>
      </p>
    </form>
  );
}
