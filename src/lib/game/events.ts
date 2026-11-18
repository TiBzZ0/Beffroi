// Tirage des événements du royaume.
import { EVENT_MIN_ONLINE, type EventKind } from "./config";
import { battle, seededRng, type Army } from "./battle";

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

/** Prochain événement : le colosse et le tournoi alternent ; le tournoi demande assez de joueurs en ligne. */
export function drawNextEvent(lastKind: string, online: number): EventKind {
  if (lastKind === "colosse" && online >= (EVENT_MIN_ONLINE.tournoi ?? 0)) return "tournoi";
  return "colosse";
}
