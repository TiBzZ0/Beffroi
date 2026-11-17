// Saison 2 : la carte de la saison en cours, connue du serveur et du client, et l'interrupteur de la saison 2.
import type { S2Map } from "./map";

export const S2_SEASON = 2;
/**
 * Interrupteur de la saison 2 : tant qu'il est à false, une saison numérotée 2 tourne avec les règles de la saison 1
 * (filet de sécurité si la vague A n'est pas prête à l'ouverture).
 */
export const S2_READY = true;
export function s2Enabled(seasonNumber: number): boolean {
  return S2_READY && seasonNumber >= S2_SEASON;
}
let current: S2Map | null = null;

/** Carte de la saison en cours (null avant la saison 2, ou tant qu'elle n'est pas chargée). */
export function s2Map(): S2Map | null {
  return current;
}
export function setS2Map(map: S2Map | null): void {
  current = map;
}
