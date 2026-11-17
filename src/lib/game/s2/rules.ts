// Saison 2 : la carte de la saison en cours, connue du serveur et du client, et l'interrupteur de la saison 2.
import type { S2Map } from "./map";

export const S2_SEASON = 2;
let current: S2Map | null = null;

/** Carte de la saison en cours (null avant la saison 2, ou tant qu'elle n'est pas chargée). */
export function s2Map(): S2Map | null {
  return current;
}
export function setS2Map(map: S2Map | null): void {
  current = map;
}
