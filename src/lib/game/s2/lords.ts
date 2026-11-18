// Saison 2, S7 (vague A) : seigneurs à rangs. Garnisons en vraies compagnies, fief alimenté par leurs concessions,
// butin, reformation de la garnison en 12 h. Les patrouilles, l'hostilité, les sauf-conduits, les expéditions et
// la vassalité arrivent en vague B.

import type { Army, Levels } from "../battle";
import { LORDS, LORD_ARMY, type UnitId } from "../config";
import { COMPANY_CAP, fortsFromLevels, trainLevels } from "../companies";
import { REF, VALUE, type Arrivals } from "./economy";
import { RANKS, type MapLord, type Rank, type Resource, type S2Map } from "./map";

/** Stock plein du fief, en heures de REF(j). */
export const FIEF_HOURS: Record<Rank, number> = { hobereau: 3, baron: 6, comte: 12, duc: 24 };
/** Part du fief emportée par une victoire. */
export const FIEF_LOOT_SHARE = 0.6;
/** Fer par compagnie vaincue : 0,5 h × REF(j) / 2. */
export const IRON_PER_COMPANY_HOURS = 0.5;
/** La garnison détruite se reforme en 12 h, compagnie par compagnie. */
export const REFORM_MS = 12 * 3_600_000;
/** Entraînement : +1 tous les 4 jours. */
export const TRAIN_EVERY_DAYS = 4;

export interface LordS2State {
  fief: Arrivals;
  /** Instant du dernier calcul du fief. */
  at: number;
  /** Dernière défaite de la garnison (0 : jamais). */
  beatenAt: number;
  /** Vague B : suzerain pendant 24 h après une défaite. */
  vassal?: { owner: string; alliance: number | null; until: number };
}

export function newLordS2State(now: number): LordS2State {
  return { fief: { pierre: 0, fer: 0, or: 0 }, at: now, beatenAt: 0 };
}

const dayOf = (seasonStart: number, t: number) => Math.max(0, (t - seasonStart) / 86_400_000);

/** Types des compagnies d'un seigneur, d'après le mélange de troupes de son tempérament. */
export function garrisonUnits(lordId: string, rank: Rank, companies = RANKS[rank].companies): UnitId[] {
  const def = LORDS.find((l) => l.id === lordId);
  const mix = def ? LORD_ARMY[def.key].troops : {};
  const entries = (Object.entries(mix).length ? Object.entries(mix) : [["piquier", 0.6], ["milicien", 0.4]]) as [UnitId, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const n = companies;
  const counts = entries.map(([u, share]) => ({ u, k: Math.floor(share * n), rest: share * n - Math.floor(share * n) }));
  let left = n - counts.reduce((a, c) => a + c.k, 0);
  for (const c of [...counts].sort((a, b) => b.rest - a.rest)) {
    if (left-- <= 0) break;
    c.k++;
  }
  return counts.flatMap((c) => Array.from({ length: c.k }, () => c.u));
}

/** Type des patrouilles : le plus fréquent de la garnison (affiché sur le fief). */
export function patrolUnit(lordId: string, rank: Rank): UnitId {
  return garrisonUnits(lordId, rank)[0] ?? "piquier";
}

export function lordTrain(rank: Rank, seasonStart: number, now: number): number {
  return Math.min(10, RANKS[rank].train + Math.floor(dayOf(seasonStart, now) / TRAIN_EVERY_DAYS));
}

/** Compagnies présentes au fief : toutes, sauf pendant la reformation (linéaire sur 12 h). */
export function companiesHome(n: number, ls: LordS2State, now: number): number {
  if (!ls.beatenAt || now >= ls.beatenAt + REFORM_MS) return n;
  return Math.min(n, Math.floor((n * Math.max(0, now - ls.beatenAt)) / REFORM_MS));
}

/** Garnison : troupes, fortifications (ducs), niveaux de combat. */
export function garrison(lord: MapLord, ls: LordS2State, seasonStart: number, now: number): { army: Army; levels: Levels; companies: number } {
  const units = garrisonUnits(lord.id, lord.rank, lord.companies).slice(0, companiesHome(lord.companies, ls, now));
  const army: Record<string, number> = {};
  for (const u of units) army[u] = (army[u] ?? 0) + COMPANY_CAP[u];
  const forts = RANKS[lord.rank].forts;
  if (forts > 0) Object.assign(army, fortsFromLevels({ palissade: forts, tour: forts, baliste: forts, muraille: forts }));
  return { army: army as Army, levels: trainLevels(lordTrain(lord.rank, seasonStart, now)), companies: units.length };
}

/** Production horaire du fief : chaque concession du seigneur produit REF(j) en valeur, dans sa ressource. */
function fiefRates(map: S2Map, lord: MapLord, day: number): Arrivals {
  const out: Arrivals = { pierre: 0, fer: 0, or: 0 };
  for (const siteId of lord.conc) {
    const res: Resource = map.sites[siteId]?.type ?? "pierre";
    out[res] += REF(day) / VALUE[res];
  }
  return out;
}

export function fiefCapValue(rank: Rank, day: number): number {
  return FIEF_HOURS[rank] * REF(day);
}

const valueOf = (a: Arrivals) => a.pierre * VALUE.pierre + a.fer * VALUE.fer + a.or * VALUE.or;

/** Fait avancer le fief jusqu'à `now` (par pas d'une heure au plus, la courbe REF montant avec les jours). */
export function settleFief(map: S2Map, lord: MapLord, ls: LordS2State, seasonStart: number, now: number): LordS2State {
  if (now <= ls.at) return ls;
  const fief = { ...ls.fief };
  let t = Math.max(ls.at, now - 7 * 86_400_000);
  while (t < now) {
    const end = Math.min(now, t + 3_600_000);
    const day = dayOf(seasonStart, t);
    const r = fiefRates(map, lord, day);
    const h = (end - t) / 3_600_000;
    for (const k of ["pierre", "fer", "or"] as Resource[]) fief[k] += r[k] * h;
    // Plafond du stock plein, en valeur, réparti au prorata.
    const cap = fiefCapValue(lord.rank, dayOf(seasonStart, end));
    const v = valueOf(fief);
    if (v > cap) for (const k of ["pierre", "fer", "or"] as Resource[]) fief[k] *= cap / v;
    t = end;
  }
  return { ...ls, fief, at: now };
}

/** Butin d'une victoire : 60 % du fief, et du fer par compagnie vaincue. */
export function fiefLoot(ls: LordS2State, companiesBeaten: number, seasonStart: number, now: number): Arrivals {
  const iron = companiesBeaten * IRON_PER_COMPANY_HOURS * (REF(dayOf(seasonStart, now)) / VALUE.fer);
  return {
    pierre: Math.floor(ls.fief.pierre * FIEF_LOOT_SHARE),
    fer: Math.floor(ls.fief.fer * FIEF_LOOT_SHARE + iron),
    or: Math.floor(ls.fief.or * FIEF_LOOT_SHARE),
  };
}

/** Après une victoire : le fief perd sa part, la garnison se reforme à partir de maintenant. */
export function afterDefeat(ls: LordS2State, now: number, vassal?: LordS2State["vassal"]): LordS2State {
  return { fief: { pierre: ls.fief.pierre * (1 - FIEF_LOOT_SHARE), fer: ls.fief.fer * (1 - FIEF_LOOT_SHARE), or: ls.fief.or * (1 - FIEF_LOOT_SHARE) }, at: ls.at, beatenAt: now, ...(vassal ? { vassal } : ls.vassal ? { vassal: ls.vassal } : {}) };
}

export function cleanLordS2(raw: unknown, now: number): LordS2State {
  const r = (raw ?? {}) as Partial<LordS2State>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const f = (r.fief ?? {}) as Partial<Arrivals>;
  const v = r.vassal as { owner?: unknown; alliance?: unknown; until?: unknown } | undefined;
  const vassal = v && typeof v.owner === "string" && num(v.until) > 0 ? { owner: v.owner, alliance: v.alliance === null || v.alliance === undefined ? null : Number(v.alliance), until: num(v.until) } : undefined;
  return { fief: { pierre: num(f.pierre), fer: num(f.fer), or: num(f.or) }, at: num(r.at) || now, beatenAt: num(r.beatenAt), ...(vassal ? { vassal } : {}) };
}

/** Garnison telle que le joueur la voit sur la carte (compagnies présentes, entraînement) : pour estimer un combat côté navigateur. */
export function garrisonOfView(l: { id: string; rank: Rank; companies: number; home: number; train: number }): { army: Army; levels: Levels } {
  const units = garrisonUnits(l.id, l.rank, l.companies).slice(0, Math.max(0, l.home));
  const army: Record<string, number> = {};
  for (const u of units) army[u] = (army[u] ?? 0) + COMPANY_CAP[u];
  const forts = RANKS[l.rank].forts;
  if (forts > 0) Object.assign(army, fortsFromLevels({ palissade: forts, tour: forts, baliste: forts, muraille: forts }));
  return { army: army as Army, levels: trainLevels(l.train) };
}
