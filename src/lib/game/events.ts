// Tirage des événements du royaume.
import { EVENT_MIN_ONLINE, EVENT_WEIGHTS, type EventKind } from "./config";
import { battle, seededRng, type Army } from "./battle";

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


/** V12 : tableau à élimination tiré au sort ; renvoie le podium (au plus 3). */
export function tourneyPodium(entries: Record<string, Army>, seed: number): string[] {
  const rng = seededRng(seed);
  let round = Object.keys(entries).sort();
  for (let i = round.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [round[i], round[j]] = [round[j], round[i]];
  }
  if (round.length < 2) return round;
  let semis: string[] = [];
  let finalLoser = "";
  while (round.length > 1) {
    const next: string[] = [];
    const losers: string[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const a = round[i];
      const b = round[i + 1];
      if (!b) {
        next.push(a);
        continue;
      }
      const win = battle(entries[a], entries[b], rng).success ? a : b;
      next.push(win);
      losers.push(win === a ? b : a);
    }
    if (next.length === 1) finalLoser = losers[0];
    else if (next.length <= 2) semis = losers;
    round = next;
  }
  return [round[0], finalLoser, ...semis.slice(0, 1)].filter(Boolean);
}

/** Tirage qui saute les événements de groupe quand trop peu de joueurs sont en ligne. */
export function drawNextEvent(lastKind: string, seed: number, online: number): EventKind {
  let kind = pickNextEvent(lastKind, seed);
  for (let i = 1; (EVENT_MIN_ONLINE[kind] ?? 0) > online && i < 50; i++) kind = pickNextEvent(kind, seed + i);
  return kind;
}
