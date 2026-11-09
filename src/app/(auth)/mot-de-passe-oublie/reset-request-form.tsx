"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "../actions";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
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
        <label htmlFor="identifier">E-mail ou pseudo</label>
        <input id="identifier" name="identifier" autoComplete="username" required defaultValue={state.fields?.identifier} />
      </div>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Envoi du messager…" : "Recevoir un lien par e-mail"}
      </button>
      <p className="auth-switch">
        <Link href="/connexion">Retour à la connexion</Link>
      </p>
    </form>
  );
}
