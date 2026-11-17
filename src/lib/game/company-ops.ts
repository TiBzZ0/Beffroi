// Compagnies (C1 à C4) : création, recrutement, entraînement, caserne et fortifications.
// Partagé par le serveur (qui fait foi) et le navigateur (aperçu immédiat).
import { captainOf } from "./captains";
import { buildBarracks, buildFort, createCompany, dissolveCompany, recruit, retypeCompany, startTraining } from "./companies";
import type { PlayerState, Result } from "./engine";
import type { GameAction } from "./types";

/**
 * Saison 2 (S9) : le recrutement et l'entraînement se paient en fer. Les fonctions de companies.ts comptent en
 * « stone » ; on leur prête le fer à la place, puis on remet chaque monnaie à sa place.
 */
export function ironPaid(state: PlayerState, f: (s: PlayerState) => Result<PlayerState>): Result<PlayerState> {
  if (!state.s2) return f(state);
  const r = f({ ...state, stone: state.s2.iron });
  if (!r.ok) return { ok: false, error: r.error.replace("pierre", "fer") };
  return { ok: true, value: { ...r.value, stone: state.stone, s2: { ...r.value.s2!, iron: r.value.stone } } };
}

export function applyCompanyOp(state: PlayerState, action: Extract<GameAction, { type: "company" }>, now: number): Result<PlayerState> {
  if (!state.companyModel) return { ok: false, error: "Les compagnies arrivent avec la saison 1." };
  const op = String(action.op);
  const id = String(action.id ?? "");
  return op === "create" ? createCompany(state, String(action.unit), now)
    : op === "dissolve" ? dissolveCompany(state, id)
    : op === "retype" ? retypeCompany(state, id, String(action.unit))
    : op === "recruit" ? ironPaid(state, (s) => recruit(s, id, Number(action.qty), now, captainOf(s, id)?.trait === "recruteur" ? 2 : 1))
    : op === "train" ? ironPaid(state, (s) => startTraining(s, id, now))
    : op === "barracks" ? buildBarracks(state, now)
    : op === "fort" ? buildFort(state, String(action.unit), now)
    : { ok: false, error: "Action inconnue." };
}
