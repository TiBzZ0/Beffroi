// Tirage des événements du royaume.
import { EVENT_WEIGHTS, type EventKind } from "./config";
import { seededRng } from "./battle";

/** Prochain événement : tiré au sort selon les poids, jamais deux fois de suite le même (tirage fixé par le précédent). */
export function pickNextEvent(lastKind: string | null | undefined, seed: number): EventKind {
  const kinds = (Object.keys(EVENT_WEIGHTS) as EventKind[]).filter((k) => k !== lastKind);
  const total = kinds.reduce((a, k) => a + EVENT_WEIGHTS[k], 0);
  let roll = seededRng(seed)() * total;
  for (const k of kinds) {
    roll -= EVENT_WEIGHTS[k];
    if (roll < 0) return k;
  }
  return kinds[kinds.length - 1];
}

