// C1, C2, C4 : l'armée en compagnies (saison 1 et suivantes). Règles pures, sans base de données.
//
// Les hommes restent comptés par type dans `troops` (au domaine), les marches, les renforts et l'infirmerie :
// tout le reste du jeu (raids, pertes, blessés) continue de fonctionner par type. Les compagnies ajoutent par-dessus
// un plafond d'effectif, un entraînement et un temps de recrutement. Les hommes d'un type se répartissent entre
// les compagnies de ce type dans l'ordre (la première se remplit d'abord).
import type { Army, Levels } from "./battle";
import { REF } from "./s2/economy";
import { DEFENSES, LEVEL_BONUS, UNITS, type CombatantId, type DefenseId, type UnitId } from "./config";

export interface Company {
  id: string;
  unit: UnitId;
  /** Entraînement, de 0 à 10. */
  train: number;
  /** Fin de l'entraînement en cours vers `train + 1` (0 : aucun). */
  trainUntil: number;
}

/** Une commande de recrutement : `n` hommes de `unit`, un toutes les `per` ms à partir de `from`, sur la file `slot`. */
export interface RecruitOrder {
  unit: UnitId;
  n: number;
  from: number;
  per: number;
  slot: number;
}

/** Chantiers militaires en cours : caserne et fortification (un de chaque à la fois). */
export interface ArmyWorks {
  barracks?: { level: number; until: number };
  fort?: { id: DefenseId; level: number; until: number };
}

export interface ArmyHolder {
  troops: Partial<Record<UnitId, number>>;
  defenses: Partial<Record<DefenseId, number>>;
  wounded: Partial<Record<UnitId, number>>;
  levels: Levels;
  marches?: { troops: Army; status: string }[];
  companies?: Company[];
  barracks?: number;
  works?: ArmyWorks;
  fortLevels?: Partial<Record<DefenseId, number>>;
  recruits?: RecruitOrder[];
  /** Mes troupes postées ailleurs (alliés, halle, forteresse). Fixé par le serveur, jamais enregistré. */
  abroad?: Army;
  /** C3, F3 : capitaines et reliques, chacun rattaché à une compagnie ou en réserve. */
  captains?: { id: string; company: string | null }[];
  relics?: { id: string; company: string | null }[];
  /** F1 : expédition en cours dans la faille (hommes par compagnie, blessés en route). */
  rift?: { exp?: { by: Record<string, number>; troops: Army; wounded: Army } | null } | null;
  /** Le modèle des compagnies est en vigueur (saison 1 et suivantes). Fixé par le serveur, jamais enregistré. */
  companyModel?: boolean;
}

// ---------------------------------------------------------------------------
// Réglages (calés par simulation, voir companies.test.ts)
// ---------------------------------------------------------------------------

/** Effectif maximal d'une compagnie et temps de recrutement d'un homme (ms). */
export const COMPANY_CAP: Record<UnitId, number> = { milicien: 1000, piquier: 600, arbaletrier: 500, chevalier: 150, belier: 40 };
export const RECRUIT_MS: Record<UnitId, number> = { milicien: 2_000, piquier: 4_000, arbaletrier: 5_000, chevalier: 20_000, belier: 90_000 };

/** Compagnies : 2 au départ, +1 par niveau de caserne (6 niveaux, 8 compagnies au plus). */
export const BASE_COMPANIES = 2;
export const BARRACKS_MAX = 6;
/** Caserne : durée de construction de chaque niveau, et prix en minutes de production de base. */
export const BARRACKS_MS = [0, 10 * 60_000, 3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000];
export const BARRACKS_MINUTES = [0, 20, 45, 90, 150, 240, 360];

/** Entraînement : +8 % d'attaque et de points de vie par niveau, 10 niveaux. */
export const TRAIN_MAX = 10;
export const TRAIN_BONUS = 0.08;
/** Durée d'un niveau : 15 min × 1,7^niveau (niveau 10 ≈ 72 h cumulées). */
export const TRAIN_BASE_MS = 15 * 60_000;
export const TRAIN_TIME_GROWTH = 1.7;
/** Prix d'un niveau : 8 min de production de base × 1,6^niveau (≈ 30 h cumulées jusqu'au niveau 10). */
export const TRAIN_BASE_MINUTES = 8;
export const TRAIN_COST_GROWTH = 1.6;

/** Fortifications : exemplaires par niveau, niveaux 0 à 10, durée et prix (minutes de production) par niveau. */
export const FORT_MAX = 10;
export const FORT_PER_LEVEL: Record<DefenseId, number> = { palissade: 100, tour: 20, baliste: 6, muraille: 3 };
export const FORT_BASE_MS = 10 * 60_000;
export const FORT_TIME_GROWTH = 1.5;
export const FORT_BASE_MINUTES = 6;
export const FORT_COST_GROWTH = 1.45;

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export function companiesOn(s: ArmyHolder): boolean {
  return !!s.companyModel;
}

export function barracksLevel(s: ArmyHolder): number {
  return Math.min(BARRACKS_MAX, Math.max(0, Math.floor(s.barracks ?? 0)));
}

export function maxCompanies(s: ArmyHolder): number {
  return BASE_COMPANIES + barracksLevel(s);
}

/** Files de recrutement en parallèle : une, deux au niveau 3, trois au niveau 6. */
export function recruitSlots(s: ArmyHolder): number {
  const lv = barracksLevel(s);
  return 2 + (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0);
}

const add = (a: Record<string, number>, id: string, n: number) => {
  if (n > 0) a[id] = (a[id] ?? 0) + n;
};

/** Hommes encore attendus dans les files, par type. */
export function queuedMen(s: ArmyHolder): Partial<Record<UnitId, number>> {
  const out: Record<string, number> = {};
  for (const r of s.recruits ?? []) add(out, r.unit, r.n);
  return out as Partial<Record<UnitId, number>>;
}

/** Tous les hommes d'un type qui appartiennent au joueur : au domaine, en route, ailleurs, à l'infirmerie. */
export function menOf(s: ArmyHolder, unit: UnitId): number {
  let n = (s.troops[unit] ?? 0) + (s.wounded?.[unit] ?? 0) + ((s.abroad as Record<string, number> | undefined)?.[unit] ?? 0);
  for (const m of s.marches ?? []) n += (m.troops as Record<string, number>)[unit] ?? 0;
  const exp = s.rift?.exp;
  if (exp) n += ((exp.troops as Record<string, number>)[unit] ?? 0) + ((exp.wounded as Record<string, number>)[unit] ?? 0);
  return n;
}

export function capacityOf(s: ArmyHolder, unit: UnitId): number {
  return (s.companies ?? []).filter((c) => c.unit === unit).length * COMPANY_CAP[unit];
}

/** Hommes de chaque compagnie (répartition dans l'ordre), file comprise à part. */
export function allocation(s: ArmyHolder): Map<string, { men: number; home: number; queued: number }> {
  const out = new Map<string, { men: number; home: number; queued: number }>();
  const queued = queuedMen(s);
  const pinned = s.rift?.exp?.by ?? {};
  for (const u of UNITS) {
    const list = (s.companies ?? []).filter((c) => c.unit === u.id);
    let men = menOf(s, u.id);
    let home = s.troops[u.id] ?? 0;
    let q = queued[u.id] ?? 0;
    // Les compagnies parties dans la faille gardent leurs hommes ; les autres se remplissent dans l'ordre.
    for (const c of list) {
      if (pinned[c.id] === undefined) continue;
      const m = Math.min(COMPANY_CAP[u.id], Math.max(0, pinned[c.id]), men);
      out.set(c.id, { men: m, home: 0, queued: 0 });
      men -= m;
    }
    for (const c of list) {
      if (pinned[c.id] !== undefined) continue;
      const m = Math.min(COMPANY_CAP[u.id], men);
      const h = Math.min(m, home);
      const qq = Math.min(COMPANY_CAP[u.id] - m, q);
      out.set(c.id, { men: m, home: h, queued: qq });
      men -= m;
      home -= h;
      q -= qq;
    }
  }
  return out;
}

/** Pour chaque compagnie qui attend des hommes : arrivée du prochain et du dernier (même ordre de remplissage qu'`allocation`). */
export function companyEta(s: ArmyHolder): Map<string, { next: number; last: number }> {
  const out = new Map<string, { next: number; last: number }>();
  const alloc = allocation(s);
  for (const u of UNITS) {
    const times: number[] = [];
    for (const r of s.recruits ?? []) if (r.unit === u.id) for (let k = 1; k <= r.n; k++) times.push(r.from + k * r.per);
    if (times.length === 0) continue;
    times.sort((a, b) => a - b);
    let i = 0;
    for (const c of s.companies ?? []) {
      if (c.unit !== u.id) continue;
      const q = alloc.get(c.id)?.queued ?? 0;
      if (q > 0 && i < times.length) out.set(c.id, { next: times[i], last: times[Math.min(times.length, i + q) - 1] });
      i += q;
    }
  }
  return out;
}

/** Niveaux de combat de quelques compagnies seulement (expédition dans la faille). */
export function companyLevels(s: ArmyHolder, ids: string[], men: Record<string, number>): Levels {
  const out: Record<string, number> = { ...(s.levels as Record<string, number>) };
  for (const u of UNITS) {
    let total = 0;
    let weighted = 0;
    for (const c of s.companies ?? []) {
      if (c.unit !== u.id || !ids.includes(c.id)) continue;
      const m = men[c.id] ?? 0;
      total += m;
      weighted += m * trainFactor(c);
    }
    if (total <= 0) continue;
    const forge = 1 + LEVEL_BONUS * Math.max(0, out[u.id] ?? 0);
    out[u.id] = (forge * (weighted / total) - 1) / LEVEL_BONUS;
  }
  return out as Levels;
}

/** Hommes retenus au domaine par l'entraînement de leur compagnie, par type. */
export function lockedMen(s: ArmyHolder, now: number): Partial<Record<UnitId, number>> {
  if (!companiesOn(s)) return {};
  const alloc = allocation(s);
  const out: Record<string, number> = {};
  for (const c of s.companies ?? []) if (c.trainUntil > now) add(out, c.unit, alloc.get(c.id)?.home ?? 0);
  return out as Partial<Record<UnitId, number>>;
}

/** Facteur d'entraînement d'une compagnie. */
export function trainFactor(c: Pick<Company, "train">): number {
  return 1 + TRAIN_BONUS * Math.max(0, Math.min(TRAIN_MAX, c.train));
}

/**
 * Niveaux de combat : la Forge (+10 % par niveau) multipliée par l'entraînement moyen des compagnies de chaque type,
 * pondéré par leurs hommes. Exprimé en « niveaux » fractionnaires pour que la bataille reste inchangée.
 */
export function combatLevels(s: ArmyHolder): Levels {
  if (!companiesOn(s)) return s.levels;
  const out: Record<string, number> = { ...(s.levels as Record<string, number>) };
  const alloc = allocation(s);
  for (const u of UNITS) {
    const list = (s.companies ?? []).filter((c) => c.unit === u.id);
    let men = 0;
    let weighted = 0;
    for (const c of list) {
      const m = alloc.get(c.id)?.men ?? 0;
      men += m;
      weighted += m * trainFactor(c);
    }
    if (men <= 0) continue;
    const forge = 1 + LEVEL_BONUS * Math.max(0, out[u.id] ?? 0);
    out[u.id] = (forge * (weighted / men) - 1) / LEVEL_BONUS;
  }
  return out as Levels;
}

export function fortCount(id: DefenseId, level: number): number {
  return FORT_PER_LEVEL[id] * Math.max(0, Math.min(FORT_MAX, Math.floor(level)));
}

/** Fortifications données par les niveaux. */
export function fortsFromLevels(levels: Partial<Record<DefenseId, number>> | undefined): Partial<Record<DefenseId, number>> {
  const out: Partial<Record<DefenseId, number>> = {};
  for (const d of DEFENSES) {
    const n = fortCount(d.id, levels?.[d.id] ?? 0);
    if (n > 0) out[d.id] = n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prix et durées
// ---------------------------------------------------------------------------

/**
 * Prix fixes, les mêmes pour tous : quelques minutes de la production d'un joueur actif typique au moment où l'on
 * achète d'habitude ce niveau (repères relevés en saisons 0 et 1, pierre par seconde selon l'âge du domaine en heures).
 * Le prix ne bouge donc plus quand ta production monte.
 */
const REF_RATE: [number, number][] = [
  [0, 30], [0.25, 1e3], [0.5, 1e4], [1, 1e5], [2, 6e5], [3.5, 3e6], [6, 8e6], [12, 3e7], [24, 1e8], [48, 4e8], [72, 1.6e9], [96, 7e9], [144, 1e10],
];
/** Saison 2 : l'armée se paie en fer (prix en pierre ÷ 100), l'entraînement aussi ; la courbe de référence suit REF(j). */
let ironArmy = false;
export function setIronArmy(on: boolean): void {
  ironArmy = on;
}
export function ironArmyOn(): boolean {
  return ironArmy;
}
/** Concessions d'un joueur actif selon l'âge de la saison (1, 2 dès la première étape, puis achetées en or). */
function s2Concessions(hours: number): number {
  return hours < 12 ? 1 : hours < 48 ? 2 : hours < 120 ? 3 : hours < 216 ? 4 : 5;
}
export function refRate(hours: number): number {
  if (ironArmy) return (REF(hours / 24) * s2Concessions(hours)) / 3600;
  const h = Math.max(0, hours);
  for (let i = 1; i < REF_RATE.length; i++) {
    const [h1, r1] = REF_RATE[i];
    if (h <= h1) {
      const [h0, r0] = REF_RATE[i - 1];
      return Math.exp(Math.log(r0) + ((h - h0) / (h1 - h0)) * (Math.log(r1) - Math.log(r0)));
    }
  }
  return REF_RATE[REF_RATE.length - 1][1];
}
const price = (hours: number, m: number) => Math.max(1, Math.round((refRate(hours) * m * 60) / 1000) * 1000 || 1);
const HOUR = 3_600_000;

export function barracksCost(s: ArmyHolder): number {
  const next = Math.min(BARRACKS_MAX, barracksLevel(s) + 1);
  // Moment habituel : la fin des chantiers précédents.
  const at = BARRACKS_MS.slice(1, next).reduce((a, b) => a + b, 0) / HOUR;
  return price(at, BARRACKS_MINUTES[next] ?? 0);
}

export function trainCost(c: Pick<Company, "train">): number {
  if (ironArmy) return Math.round(500 * 1.6 ** c.train);
  // Moment habituel : une demi-heure pour lever la compagnie, puis les entraînements précédents.
  let at = 0.5;
  for (let k = 0; k < c.train; k++) at += trainMs({ train: k }) / HOUR;
  return price(at, TRAIN_BASE_MINUTES * TRAIN_COST_GROWTH ** c.train);
}

export function trainMs(c: Pick<Company, "train">): number {
  return Math.round(TRAIN_BASE_MS * TRAIN_TIME_GROWTH ** c.train);
}

export function fortCost(level: number): number {
  // Moment habituel : une demi-heure, puis les niveaux précédents des quatre fortifications, bâties une à une.
  let at = 0.5;
  for (let k = 0; k < level; k++) at += (DEFENSES.length * fortMs(k)) / HOUR;
  return price(at, FORT_BASE_MINUTES * FORT_COST_GROWTH ** level);
}

export function fortMs(level: number): number {
  return Math.round(FORT_BASE_MS * FORT_TIME_GROWTH ** level);
}

export function recruitPrice(unit: UnitId, n: number, discount = 1): number {
  const def = UNITS.find((u) => u.id === unit);
  return Math.ceil(((def?.cost ?? 0) * n * discount) / (ironArmy ? 100 : 1));
}

// ---------------------------------------------------------------------------
// Avancer dans le temps
// ---------------------------------------------------------------------------

/** Hommes arrivés, entraînements et chantiers finis jusqu'à `now`. */
export function settleArmy<S extends ArmyHolder>(s: S, now: number): S {
  if (!companiesOn(s)) return s;
  let changed = false;
  const troops: Record<string, number> = { ...(s.troops as Record<string, number>) };
  const recruits: RecruitOrder[] = [];
  for (const r of s.recruits ?? []) {
    const arrived = Math.min(r.n, Math.max(0, Math.floor((now - r.from) / r.per)));
    if (arrived > 0) {
      add(troops, r.unit, arrived);
      changed = true;
    }
    if (arrived < r.n) recruits.push(arrived > 0 ? { ...r, n: r.n - arrived, from: r.from + arrived * r.per } : r);
  }
  const companies = (s.companies ?? []).map((c) => {
    if (c.trainUntil > 0 && c.trainUntil <= now) {
      changed = true;
      return { ...c, train: Math.min(TRAIN_MAX, c.train + 1), trainUntil: 0 };
    }
    return c;
  });
  const works: ArmyWorks = { ...(s.works ?? {}) };
  let barracks = s.barracks ?? 0;
  const fortLevels = { ...(s.fortLevels ?? {}) };
  if (works.barracks && works.barracks.until <= now) {
    barracks = Math.max(barracks, works.barracks.level);
    delete works.barracks;
    changed = true;
  }
  if (works.fort && works.fort.until <= now) {
    fortLevels[works.fort.id] = Math.max(fortLevels[works.fort.id] ?? 0, works.fort.level);
    delete works.fort;
    changed = true;
  }
  // Les commandes pas encore commencées passent sur la file qui se libère le plus tôt (une file vient de s'ouvrir, une autre s'est vidée).
  const slots = recruitSlots({ ...s, barracks });
  const ends = Array.from({ length: slots }, () => now);
  const started = recruits.filter((r) => r.from <= now || r.slot >= slots);
  for (const r of started) if (r.slot < slots) ends[r.slot] = Math.max(ends[r.slot], r.from + r.n * r.per);
  const waiting = recruits.filter((r) => !started.includes(r)).sort((a, b) => a.from - b.from);
  const queue: RecruitOrder[] = [...started];
  for (const r of waiting) {
    const slot = ends.indexOf(Math.min(...ends));
    const from = Math.min(r.from, ends[slot]);
    if (from !== r.from || slot !== r.slot) changed = true;
    queue.push(from !== r.from || slot !== r.slot ? { ...r, from, slot } : r);
    ends[slot] = from + r.n * r.per;
  }
  recruits.splice(0, recruits.length, ...queue);
  // Les fortifications se relèvent toujours au compte de leur niveau.
  const defenses = fortsFromLevels(fortLevels);
  const sameDefenses = DEFENSES.every((d) => (s.defenses[d.id] ?? 0) === (defenses[d.id] ?? 0));
  if (!changed && sameDefenses) return s;
  return { ...s, troops: troops as S["troops"], recruits, companies, works, barracks, fortLevels, defenses };
}

/** Prochaine échéance (pour découper le calcul hors ligne si besoin). */
export function armyBreakpoints(s: ArmyHolder): number[] {
  if (!companiesOn(s)) return [];
  return [...(s.companies ?? []).map((c) => c.trainUntil), s.works?.barracks?.until ?? 0, s.works?.fort?.until ?? 0].filter((t) => t > 0);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type R<S> = { ok: true; value: S } | { ok: false; error: string };
const fail = <S>(error: string): R<S> => ({ ok: false, error });

let seq = 0;
function newId(now: number): string {
  seq = (seq + 1) % 1e6;
  return `c${now.toString(36)}${seq.toString(36)}`;
}

export function createCompany<S extends ArmyHolder>(s: S, unit: string, now: number): R<S> {
  if (!companiesOn(s)) return fail("Les compagnies arrivent avec la saison 1.");
  if (!UNITS.some((u) => u.id === unit)) return fail("Troupe inconnue.");
  if ((s.companies ?? []).length >= maxCompanies(s)) return fail(`${maxCompanies(s)} compagnies au plus : agrandis ta caserne.`);
  return { ok: true, value: { ...s, companies: [...(s.companies ?? []), { id: newId(now), unit: unit as UnitId, train: 0, trainUntil: 0 }] } };
}

/** Dissoudre : la compagnie et ses hommes disparaissent (ils doivent être au domaine). */
export function dissolveCompany<S extends ArmyHolder>(s: S, id: string, keepGear = false): R<S> {
  const c = (s.companies ?? []).find((x) => x.id === id);
  if (!c) return fail("Compagnie inconnue.");
  const a = allocation(s).get(id) ?? { men: 0, home: 0, queued: 0 };
  if (a.home < a.men) return fail("Une partie de ses hommes est hors du domaine : attends leur retour.");
  const troops = { ...s.troops };
  troops[c.unit] = Math.max(0, (troops[c.unit] ?? 0) - a.men);
  const rest = (s.companies ?? []).filter((x) => x.id !== id);
  // Les hommes en file au-delà de la nouvelle capacité sont annulés.
  const cap = rest.filter((x) => x.unit === c.unit).length * COMPANY_CAP[c.unit];
  const left = { ...s, troops, companies: rest };
  const room = Math.max(0, cap - menOf(left, c.unit));
  let budget = room;
  const recruits = (s.recruits ?? []).flatMap((r) => {
    if (r.unit !== c.unit) return [r];
    const keep = Math.min(r.n, budget);
    budget -= keep;
    return keep > 0 ? [{ ...r, n: keep }] : [];
  });
  // Sa relique se perd, son capitaine revient en réserve (sauf changement de type, où tout reste).
  const gear = keepGear ? {} : { ...(s.relics ? { relics: s.relics.filter((r) => r.company !== id) } : {}), ...(s.captains ? { captains: s.captains.map((k) => (k.company === id ? { ...k, company: null } : k)) } : {}) };
  return { ok: true, value: { ...left, recruits, ...gear } };
}

/** Changer de type : la compagnie repart à 0 homme et garde la moitié de son entraînement. */
export function retypeCompany<S extends ArmyHolder>(s: S, id: string, unit: string): R<S> {
  const c = (s.companies ?? []).find((x) => x.id === id);
  if (!c) return fail("Compagnie inconnue.");
  if (!UNITS.some((u) => u.id === unit) || unit === c.unit) return fail("Choisis un autre type.");
  if (c.trainUntil > 0) return fail("Elle est à l'entraînement.");
  const gone = dissolveCompany(s, id, true);
  if (!gone.ok) return gone;
  const companies = [...(gone.value.companies ?? [])];
  const at = (s.companies ?? []).findIndex((x) => x.id === id);
  companies.splice(at, 0, { ...c, unit: unit as UnitId, train: Math.floor(c.train / 2), trainUntil: 0 });
  return { ok: true, value: { ...gone.value, companies } };
}

/** Recruter `n` hommes pour une compagnie : payés tout de suite, ils arrivent un par un. */
export function recruit<S extends ArmyHolder & { stone: number }>(s: S, id: string, n: number, now: number, speed = 1): R<S> {
  const c = (s.companies ?? []).find((x) => x.id === id);
  if (!c) return fail("Compagnie inconnue.");
  const qty = Math.floor(n);
  if (!Number.isSafeInteger(qty) || qty < 1) return fail("Quantité invalide.");
  const a = allocation(s).get(id) ?? { men: 0, home: 0, queued: 0 };
  const room = COMPANY_CAP[c.unit] - a.men - a.queued;
  // Les hommes déjà en file d'un type remplissent les compagnies dans l'ordre : on borne au total du type.
  const typeRoom = capacityOf(s, c.unit) - menOf(s, c.unit) - (queuedMen(s)[c.unit] ?? 0);
  const take = Math.min(qty, Math.max(0, Math.min(room, typeRoom)));
  if (take <= 0) return fail("Cette compagnie est au complet.");
  const cost = recruitPrice(c.unit, take);
  if (cost > s.stone) return fail("Pas assez de pierre.");
  const per = Math.max(250, Math.round(RECRUIT_MS[c.unit] / Math.max(0.1, speed)));
  // La file la moins chargée prend la commande.
  const slots = recruitSlots(s);
  const ends = Array.from({ length: slots }, (_, i) => Math.max(now, ...(s.recruits ?? []).filter((r) => r.slot === i).map((r) => r.from + r.n * r.per)));
  const slot = ends.indexOf(Math.min(...ends));
  const order: RecruitOrder = { unit: c.unit, n: take, from: ends[slot], per, slot };
  return { ok: true, value: { ...s, stone: s.stone - cost, recruits: [...(s.recruits ?? []), order] } };
}

export function trainBlocker(s: ArmyHolder & { stone: number }, id: string, now: number): string | null {
  const c = (s.companies ?? []).find((x) => x.id === id);
  if (!c) return "Compagnie inconnue.";
  if (c.trainUntil > now) return "Déjà à l'entraînement.";
  if (c.train >= TRAIN_MAX) return "Entraînement au maximum.";
  const a = allocation(s).get(id);
  if (a && a.home < a.men) return "Une partie de ses hommes est hors du domaine.";
  if (trainCost(c) > s.stone) return "Pas assez de pierre.";
  return null;
}

export function startTraining<S extends ArmyHolder & { stone: number }>(s: S, id: string, now: number): R<S> {
  const why = trainBlocker(s, id, now);
  if (why) return fail(why);
  const c = (s.companies ?? []).find((x) => x.id === id)!;
  const cost = trainCost(c);
  const companies = (s.companies ?? []).map((x) => (x.id === id ? { ...x, trainUntil: now + trainMs(x) } : x));
  return { ok: true, value: { ...s, stone: s.stone - cost, companies } };
}

export function barracksBlocker(s: ArmyHolder & { stone: number }): string | null {
  if (barracksLevel(s) >= BARRACKS_MAX) return "Caserne au niveau maximal.";
  if (s.works?.barracks) return "La caserne est déjà en travaux.";
  if (barracksCost(s) > s.stone) return "Pas assez de pierre.";
  return null;
}

export function buildBarracks<S extends ArmyHolder & { stone: number }>(s: S, now: number): R<S> {
  const why = barracksBlocker(s);
  if (why) return fail(why);
  const level = barracksLevel(s) + 1;
  return { ok: true, value: { ...s, stone: s.stone - barracksCost(s), works: { ...(s.works ?? {}), barracks: { level, until: now + BARRACKS_MS[level] } } } };
}

export function fortBlocker(s: ArmyHolder & { stone: number }, id: string): string | null {
  if (!DEFENSES.some((d) => d.id === id)) return "Fortification inconnue.";
  const lv = s.fortLevels?.[id as DefenseId] ?? 0;
  if (lv >= FORT_MAX) return "Niveau maximal.";
  if (s.works?.fort) return "Une fortification est déjà en travaux.";
  if (fortCost(lv) > s.stone) return "Pas assez de pierre.";
  return null;
}

export function buildFort<S extends ArmyHolder & { stone: number }>(s: S, id: string, now: number): R<S> {
  const why = fortBlocker(s, id);
  if (why) return fail(why);
  const lv = s.fortLevels?.[id as DefenseId] ?? 0;
  return { ok: true, value: { ...s, stone: s.stone - fortCost(lv), works: { ...(s.works ?? {}), fort: { id: id as DefenseId, level: lv + 1, until: now + fortMs(lv) } } } };
}

/** Nettoyage à la lecture. */
export function cleanCompanies(raw: unknown): Company[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === "object" && typeof c.id === "string" && UNITS.some((u) => u.id === c.unit))
    .slice(0, BASE_COMPANIES + BARRACKS_MAX)
    .map((c) => ({ id: String(c.id), unit: c.unit as UnitId, train: Math.max(0, Math.min(TRAIN_MAX, Math.floor(Number(c.train) || 0))), trainUntil: Number(c.trainUntil) || 0 }));
}

export function cleanRecruits(raw: unknown): RecruitOrder[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object" && UNITS.some((u) => u.id === r.unit) && Number(r.n) > 0)
    .map((r) => ({ unit: r.unit as UnitId, n: Math.floor(Number(r.n)), from: Number(r.from) || 0, per: Math.max(250, Number(r.per) || 1000), slot: Math.max(0, Math.floor(Number(r.slot) || 0)) }));
}

export function cleanWorks(raw: unknown): ArmyWorks {
  const w = (raw ?? {}) as { barracks?: { level?: unknown; until?: unknown }; fort?: { id?: unknown; level?: unknown; until?: unknown } };
  const out: ArmyWorks = {};
  if (w.barracks && Number(w.barracks.level) > 0) out.barracks = { level: Math.floor(Number(w.barracks.level)), until: Number(w.barracks.until) || 0 };
  if (w.fort && DEFENSES.some((d) => d.id === w.fort?.id)) out.fort = { id: w.fort.id as DefenseId, level: Math.floor(Number(w.fort.level) || 1), until: Number(w.fort.until) || 0 };
  return out;
}

export function cleanFortLevels(raw: unknown): Partial<Record<DefenseId, number>> {
  const out: Partial<Record<DefenseId, number>> = {};
  for (const d of DEFENSES) {
    const n = Math.floor(Number((raw as Record<string, unknown> | null)?.[d.id] ?? 0));
    if (n > 0) out[d.id] = Math.min(FORT_MAX, n);
  }
  return out;
}

export type { CombatantId };

// ---------------------------------------------------------------------------
// C5 : armées fixes (seigneurs, forteresse, événements), calées par simulation
// ---------------------------------------------------------------------------

/** Valeur en pierre d'une compagnie pleine (≈ 250 000), étalon des armées fixes. */
export const COMPANY_VALUE = 250_000;
/** Entraînement des seigneurs selon leur niveau (facile, moyen, difficile, redoutable). */
export const LORD_TRAIN: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 3, 3: 5, 4: 8 };
/**
 * Taille de chaque seigneur, en compagnies pleines (troupes et fortifications selon son caractère).
 * Saison 1, demandé par le créateur : un facile se prend avec 1 à 2 compagnies. Simulé à 70 % de chances, en compagnies
 * non entraînées (mélange piquiers, arbalétriers, chevaliers) :
 * faciles ≈ 1,5 (dès les deux premières compagnies), moyens ≈ 4,5, difficiles : 63 à 78 % pour 6 compagnies à l'entraînement 5 avec Forge 4,
 * 0 % pour 4 compagnies à l'entraînement 3, redoutables ≈ 27 (Forge, capitaines, reliques ou alliés).
 */
export const LORD_COMPANIES: Record<string, number> = {
  bourbelin: 1.52, aubeval: 1.23, moulinet: 1.52, bruyere: 1.52, pontcroix: 2.15, sauleraie: 2.02,
  corbelune: 2.82, ventebrise: 2.82, roncebois: 4.23, clairmarais: 2.58, pierrefendue: 2.77, brumeport: 2.82,
  grisemolle: 5.27, noirval: 6.32, lysnoir: 6.73, hautgivre: 6.12, rougemarc: 6.28,
  hautefaille: 10.4, marches: 10.2, orgemont: 10.9,
};
/** Part de son budget qu'un seigneur envoie en raid. */
export const LORD_RAID_SHARE = 0.6;
/** Étalon des armées d'événements et de la garnison neutre de la forteresse, en compagnies. */
export const FIXED_EVENT_COMPANIES = 4;
export const FORTRESS_COMPANIES = 7;
/** Entraînement des armées d'événements et de la garnison neutre. */
export const FIXED_TRAIN = 4;

/** Niveaux de combat équivalents à un entraînement donné (sans Forge). */
export function trainLevels(train: number): Levels {
  const lv = (trainFactor({ train }) - 1) / LEVEL_BONUS;
  return Object.fromEntries([...UNITS.map((u) => u.id), ...DEFENSES.map((d) => d.id)].map((id) => [id, lv])) as Levels;
}
