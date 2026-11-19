// Vague C : mercenaires. Un seigneur neutre ou vassal loue une de ses compagnies pour 12 h. Elle escorte les convois
// d'une concession, ou se joint à ton armée sur les routes, avec son propre entraînement ; elle ne compte pas dans la limite de compagnies.

import { COMPANY_CAP } from "../companies";
import type { UnitId } from "../config";
import { freePass, hostilityAt, hostilityLevel } from "./convoys";
import { REF, VALUE, type S2State } from "./economy";
import { lordTrain, patrolUnit } from "./lords";
import type { MapLord, Rank } from "./map";

const H = 3_600_000;
export const MERC_MS = 12 * H;
/** Mercenaires loués « à l'armée » : ils se joignent à chacun de tes combats sur les routes (pillage, interception, camp, contrat, délogement). */
export const MERC_ARMY = "army";
/** Prix : 2 h × REF(j) en or pour un hobereau, ×2 par rang. */
export const MERC_HOURS = 2;
export const MERC_RANK: Record<Rank, number> = { hobereau: 1, baron: 2, comte: 4, duc: 8 };

export function mercPrice(lord: Pick<MapLord, "rank">, seasonStart: number, now: number): number {
  return Math.round((MERC_HOURS * REF(Math.max(0, (now - seasonStart) / (24 * H))) * MERC_RANK[lord.rank]) / VALUE.or);
}

/** La compagnie qu'un seigneur loue : son type de patrouille, pleine, à son entraînement du moment. */
export function mercOffer(lord: MapLord, seasonStart: number, now: number): { unit: UnitId; men: number; train: number } {
  const unit = patrolUnit(lord.id, lord.rank);
  return { unit, men: COMPANY_CAP[unit], train: lordTrain(lord.rank, seasonStart, now) };
}

export function mercsNow(s: S2State, now: number): NonNullable<S2State["mercs"]> {
  return (s.mercs ?? []).filter((m) => m.until > now && m.men > 0);
}

export function mercBlocker(s: S2State, lord: MapLord | undefined, concId: string, price: number, now: number): string | null {
  if (!s.castle) return "Pose d'abord ton château.";
  if (!lord) return "Seigneur inconnu.";
  if (concId !== MERC_ARMY && !s.conc.some((c) => c.id === concId)) return "Choisis la concession à escorter.";
  const vassal = (s.vassals?.[lord.id] ?? 0) > now || freePass({ ...s, safe: {} }, lord.id, now);
  if (!vassal && hostilityLevel(hostilityAt(s, lord.id, now)) > 0) return "Seul un seigneur neutre envers toi, ou ton vassal, loue ses compagnies.";
  const live = mercsNow(s, now);
  if (live.some((m) => m.lord === lord.id)) return "Ce seigneur t'a déjà loué une compagnie.";
  if (live.some((m) => m.conc === concId)) return concId === MERC_ARMY ? "Ton armée a déjà ses mercenaires." : "Cette concession a déjà ses mercenaires.";
  if (s.gold < price) return `Il faut ${price.toLocaleString("fr-FR")} 🪙.`;
  return null;
}

export function hireMerc(s: S2State, lord: MapLord, concId: string, seasonStart: number, now: number): { ok: true; value: { s: S2State; price: number } } | { ok: false; error: string } {
  const price = mercPrice(lord, seasonStart, now);
  const why = mercBlocker(s, lord, concId, price, now);
  if (why) return { ok: false, error: why };
  const o = mercOffer(lord, seasonStart, now);
  return { ok: true, value: { price, s: { ...s, gold: s.gold - price, mercs: [...mercsNow(s, now), { lord: lord.id, unit: o.unit, men: o.men, train: o.train, until: now + MERC_MS, conc: concId }] } } };
}
