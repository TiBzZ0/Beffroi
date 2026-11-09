"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "../actions";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={action} noValidate>
      {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
      <div className="field">
        <label htmlFor="password">Nouveau mot de passe (8 caractères minimum)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirme-le</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Gravure en cours…" : "Changer mon mot de passe"}
      </button>
    </form>
  );
}
