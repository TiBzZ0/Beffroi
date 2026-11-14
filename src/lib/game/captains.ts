// C3, F3 : capitaines et reliques (saison 1 et suivantes). Règles pures, sans base de données.
// Un capitaine et une relique au plus par compagnie. Leurs bonus entrent dans la bataille par type d'unité,
// au prorata des hommes des compagnies qui les portent.

import type { Army, Boost } from "./battle";
import { allocation, type ArmyHolder, type Company } from "./companies";
import type { Category, UnitId } from "./config";

// ---------------------------------------------------------------------------
// Capitaines
// ---------------------------------------------------------------------------

export type TraitId = "tenace" | "eclaireur" | "brisemurs" | "rempart" | "pillard" | "chasseur" | "recruteur" | "veinard";

export const TRAITS: Record<TraitId, { icon: string; name: string; text: string }> = {
  tenace: { icon: "🪨", name: "Tenace", text: "Sa compagnie ne descend jamais sous 10 % de ses hommes dans une bataille gagnée." },
  eclaireur: { icon: "🧭", name: "Éclaireur", text: "L'expédition qui le porte va 20 % plus vite." },
  brisemurs: { icon: "🔨", name: "Brise-murs", text: "Sa compagnie fait ×2 contre les fortifications." },
  rempart: { icon: "🛡️", name: "Rempart vivant", text: "+30 % de points de vie en défense du domaine." },
  pillard: { icon: "💰", name: "Pillard", text: "+15 % de butin pour un raid où part sa compagnie (sous les plafonds)." },
  chasseur: { icon: "🎯", name: "Chasseur", text: "+25 % de dégâts contre une catégorie, choisie au recrutement." },
  recruteur: { icon: "📯", name: "Recruteur", text: "Recrutement de sa compagnie deux fois plus rapide." },
  veinard: { icon: "🍀", name: "Veinard", text: "La fortune de la bataille ne descend pas sous 0,95." },
};
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];
export const HUNT_TARGETS: { id: Category; label: string }[] = [
  { id: "infanterie", label: "infanterie" },
  { id: "tir", label: "tireurs" },
  { id: "cavalerie", label: "cavalerie" },
  { id: "siege", label: "engins de siège" },
  { id: "fortification", label: "fortifications" },
];

/** Prix d'un capitaine en renom ; trois traits proposés. */
export const CAPTAIN_COST = 15;
export const CAPTAIN_OFFER = 3;
/** Batailles (gagnée = 1, perdue = 0,5) pour les niveaux 1 à 5. */
export const CAPTAIN_XP = [0, 3, 8, 15, 25];
export const CAPTAIN_BONUS = 0.04;
/** Il peut mourir si sa compagnie perd plus de 80 % de ses hommes : 25 % de chances. */
export const CAPTAIN_DEATH_LOSS = 0.8;
export const CAPTAIN_DEATH_CHANCE = 0.25;
export const CAPTAINS_MAX = 12;

const NAMES = ["Aubry", "Bertrand", "Clotaire", "Enguerrand", "Foulques", "Gautier", "Hugues", "Isarn", "Josselin", "Lambert", "Mahaut", "Ermengarde", "Ysabeau", "Aliénor", "Béatrix", "Guérin", "Raoul", "Thibaut", "Odon", "Perrine", "Sibylle", "Amaury", "Baudouin", "Garsende"];

export interface Captain {
  id: string;
  name: string;
  trait: TraitId;
  /** Chasseur : la catégorie visée. */
  target?: Category;
  xp: number;
  company: string | null;
}

export function captainLevel(c: Pick<Captain, "xp">): number {
  let lv = 1;
  for (let i = 1; i < CAPTAIN_XP.length; i++) if (c.xp >= CAPTAIN_XP[i]) lv = i + 1;
  return lv;
}

// ---------------------------------------------------------------------------
// Reliques
// ---------------------------------------------------------------------------

export type Rarity = "commune" | "rare" | "legendaire";
export type RelicKind =
  | "banniere"
  | "cotte"
  | "fers"
  | "torche"
  | "bottes"
  | "cor"
  | "etendard"
  | "reliquaire"
  | "lance"
  | "heaume"
  | "cuir"
  | "lame"
  | "ecu"
  | "couronne";

export const RELICS: Record<RelicKind, { icon: string; name: string; rarity: Rarity; text: string; atk?: number; hp?: number; speed?: number }> = {
  banniere: { icon: "🚩", name: "Bannière déchirée", rarity: "commune", text: "+5 % d'attaque.", atk: 0.05 },
  cotte: { icon: "🧥", name: "Cotte rapiécée", rarity: "commune", text: "+5 % de points de vie.", hp: 0.05 },
  fers: { icon: "🧲", name: "Fers à glace", rarity: "commune", text: "Ignore Sol gelé." },
  torche: { icon: "🔦", name: "Torche de poix", rarity: "commune", text: "Ses tireurs ignorent le Brouillard." },
  bottes: { icon: "🥾", name: "Bottes ferrées", rarity: "commune", text: "+8 % de vitesse vers la faille.", speed: 0.08 },
  cor: { icon: "📯", name: "Cor de chasse", rarity: "rare", text: "+15 % de vitesse vers la faille.", speed: 0.15 },
  etendard: { icon: "⚜️", name: "Étendard du Lys", rarity: "rare", text: "+12 % d'attaque contre une catégorie." },
  reliquaire: { icon: "⚱️", name: "Reliquaire", rarity: "rare", text: "+20 % de blessés soignés pour la compagnie." },
  lance: { icon: "🗡️", name: "Lance bénie", rarity: "rare", text: "+10 % d'attaque.", atk: 0.1 },
  heaume: { icon: "⛑️", name: "Heaume d'acier", rarity: "rare", text: "+10 % de points de vie.", hp: 0.1 },
  cuir: { icon: "🧯", name: "Cuir mouillé", rarity: "rare", text: "Ignore le Feu grégeois." },
  lame: { icon: "⚔️", name: "Lame de la faille", rarity: "legendaire", text: "+20 % d'attaque, la compagnie frappe en premier au premier round.", atk: 0.2 },
  ecu: { icon: "🛡️", name: "Écu des anciens", rarity: "legendaire", text: "La compagnie ne peut pas perdre plus de 50 % de ses hommes dans une bataille." },
  couronne: { icon: "👑", name: "Couronne de fer", rarity: "legendaire", text: "+10 % d'attaque et de points de vie ; son capitaine ne meurt pas.", atk: 0.1, hp: 0.1 },
};
export const RELIC_KINDS = Object.keys(RELICS) as RelicKind[];
export const RARITY_LABEL: Record<Rarity, string> = { commune: "commune", rare: "rare", legendaire: "légendaire" };
export const RELICS_MAX = 20;

export interface Relic {
  id: string;
  kind: RelicKind;
  /** Étendard du Lys : la catégorie visée. */
  target?: Category;
  company: string | null;
}

/** Rareté d'une relique trouvée à un étage (tous les 5 étages ; les gardiens donnent au moins une rare). */
export function relicRarity(floor: number, guardian: boolean, roll: number): Rarity {
  if (floor >= 45) return roll < 0.5 ? "legendaire" : "rare";
  if (floor >= 25) return roll < 0.25 ? "legendaire" : roll < 0.85 ? "rare" : guardian ? "rare" : "commune";
  if (guardian) return floor >= 20 && roll < 0.1 ? "legendaire" : "rare";
  return roll < 0.3 ? "rare" : "commune";
}

let seq = 0;
const newId = (prefix: string, now: number) => {
  seq = (seq + 1) % 1e6;
  return `${prefix}${now.toString(36)}${seq.toString(36)}`;
};

export function makeRelic(floor: number, guardian: boolean, rng: () => number, now: number): Relic {
  const rarity = relicRarity(floor, guardian, rng());
  const pool = RELIC_KINDS.filter((k) => RELICS[k].rarity === rarity);
  const kind = pool[Math.floor(rng() * pool.length) % pool.length];
  return { id: newId("r", now), kind, ...(kind === "etendard" ? { target: HUNT_TARGETS[Math.floor(rng() * HUNT_TARGETS.length) % HUNT_TARGETS.length].id } : {}), company: null };
}

export function makeCaptain(trait: TraitId, target: Category | undefined, rng: () => number, now: number): Captain {
  return { id: newId("k", now), name: NAMES[Math.floor(rng() * NAMES.length) % NAMES.length], trait, ...(trait === "chasseur" ? { target: target ?? "cavalerie" } : {}), xp: 0, company: null };
}

/** Trois traits différents. */
export function drawTraits(rng: () => number): TraitId[] {
  const pool = [...TRAIT_IDS];
  const out: TraitId[] = [];
  while (out.length < CAPTAIN_OFFER && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0]);
  return out;
}

// ---------------------------------------------------------------------------
// Effets
// ---------------------------------------------------------------------------

type Holder = Omit<ArmyHolder, "captains" | "relics"> & { captains?: Captain[]; relics?: Relic[] };

export function captainOf(s: Holder, companyId: string): Captain | undefined {
  return (s.captains ?? []).find((c) => c.company === companyId);
}

export function relicOf(s: Holder, companyId: string): Relic | undefined {
  return (s.relics ?? []).find((r) => r.company === companyId);
}

/** Bonus d'une compagnie : attaque, points de vie, dégâts contre une catégorie. */
export function companyFactors(s: Holder, c: Company, side: "attack" | "defense"): { atk: number; hp: number; vs: Partial<Record<string, number>> } {
  const cap = captainOf(s, c.id);
  const relic = relicOf(s, c.id);
  const lv = cap ? 1 + CAPTAIN_BONUS * captainLevel(cap) : 1;
  const def = relic ? RELICS[relic.kind] : undefined;
  const vs: Partial<Record<string, number>> = {};
  const mul = (cat: string, f: number) => (vs[cat] = (vs[cat] ?? 1) * f);
  if (cap?.trait === "chasseur" && cap.target) mul(cap.target, 1.25);
  if (cap?.trait === "brisemurs") mul("fortification", 2);
  if (relic?.kind === "etendard" && relic.target) mul(relic.target, 1.12);
  return {
    atk: lv * (1 + (def?.atk ?? 0)),
    hp: lv * (1 + (def?.hp ?? 0)) * (side === "defense" && cap?.trait === "rempart" ? 1.3 : 1),
    vs,
  };
}

/**
 * Bonus d'une armée par type : moyenne des compagnies de ce type, pondérée par leurs hommes.
 * `men` : hommes par compagnie engagée (sinon toutes les compagnies, avec leurs hommes).
 */
export function armyBoost(s: Holder, side: "attack" | "defense", men?: Record<string, number>): Boost | undefined {
  if (!(s.captains ?? []).some((c) => c.company) && !(s.relics ?? []).some((r) => r.company)) return undefined;
  const alloc = men ? null : allocation(s);
  const sums = new Map<string, { men: number; atk: number; hp: number; vs: Map<string, number> }>();
  for (const c of s.companies ?? []) {
    const m = men ? (men[c.id] ?? 0) : (alloc!.get(c.id)?.men ?? 0);
    if (m <= 0) continue;
    const f = companyFactors(s, c, side);
    const t = sums.get(c.unit) ?? { men: 0, atk: 0, hp: 0, vs: new Map() };
    t.men += m;
    t.atk += m * f.atk;
    t.hp += m * f.hp;
    for (const cat of ["infanterie", "tir", "cavalerie", "siege", "fortification"]) t.vs.set(cat, (t.vs.get(cat) ?? 0) + m * (f.vs[cat] ?? 1));
    sums.set(c.unit, t);
  }
  const out: Required<Boost> = { atk: {}, hp: {}, vs: {} };
  for (const [unit, t] of sums) {
    out.atk[unit] = t.atk / t.men;
    out.hp[unit] = t.hp / t.men;
    const vs: Record<string, number> = {};
    for (const [cat, v] of t.vs) if (Math.abs(v / t.men - 1) > 1e-9) vs[cat] = v / t.men;
    if (Object.keys(vs).length) out.vs[unit] = vs;
  }
  return out;
}

export function hasTrait(s: Holder, trait: TraitId, companyIds?: string[]): boolean {
  return (s.captains ?? []).some((c) => c.trait === trait && c.company !== null && (!companyIds || companyIds.includes(c.company)));
}

/** Part des hommes engagés d'un type dont la compagnie porte une relique donnée. */
export function relicShare(s: Holder, kind: RelicKind, unit: UnitId, men: Record<string, number>): number {
  let all = 0;
  let with_ = 0;
  for (const c of s.companies ?? []) {
    if (c.unit !== unit) continue;
    const m = men[c.id] ?? 0;
    all += m;
    if (relicOf(s, c.id)?.kind === kind) with_ += m;
  }
  return all > 0 ? with_ / all : 0;
}

/** Vitesse vers la faille : Éclaireur +20 %, et la meilleure relique de vitesse. */
export function expeditionSpeed(s: Holder, ids: string[]): number {
  const relic = Math.max(0, ...ids.map((id) => RELICS[relicOf(s, id)?.kind as RelicKind]?.speed ?? 0));
  return (hasTrait(s, "eclaireur", ids) ? 0.2 : 0) + relic;
}

/**
 * C3, F3 : après une bataille de compagnies, pertes bornées (Tenace, Écu des anciens), blessés en plus (Reliquaire),
 * expérience et mort des capitaines. `start` et `cut` : hommes au début, et perdus, par compagnie.
 */
export function afterBattle<S extends Holder>(s: S, start: Record<string, number>, cut: Record<string, number>, won: boolean, rng: () => number): { state: S; cut: Record<string, number>; woundBonus: Record<string, number>; dead: Captain[] } {
  const out: Record<string, number> = {};
  const woundBonus: Record<string, number> = {};
  for (const [id, n0] of Object.entries(start)) {
    let c = Math.min(n0, cut[id] ?? 0);
    const cap = captainOf(s, id);
    const relic = relicOf(s, id);
    if (relic?.kind === "ecu") c = Math.min(c, Math.floor(n0 * 0.5));
    if (won && cap?.trait === "tenace") c = Math.min(c, n0 - Math.ceil(n0 * 0.1));
    out[id] = Math.max(0, c);
    if (relic?.kind === "reliquaire") woundBonus[id] = 0.2;
  }
  const dead: Captain[] = [];
  const captains = (s.captains ?? []).flatMap((k) => {
    if (!k.company || start[k.company] === undefined) return [k];
    const n0 = start[k.company];
    const lostShare = n0 > 0 ? out[k.company] / n0 : 0;
    if (lostShare > CAPTAIN_DEATH_LOSS && relicOf(s, k.company)?.kind !== "couronne" && rng() < CAPTAIN_DEATH_CHANCE) {
      dead.push(k);
      return [];
    }
    return [{ ...k, xp: k.xp + (won ? 1 : 0.5) }];
  });
  return { state: { ...s, captains }, cut: out, woundBonus, dead };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type R<S> = { ok: true; value: S } | { ok: false; error: string };
const fail = <S>(error: string): R<S> => ({ ok: false, error });

/** Une compagnie dans la faille ne change ni de capitaine ni de relique. */
function busyCompany(s: Holder, id: string | null): boolean {
  return id !== null && (s.rift?.exp?.by ?? {})[id] !== undefined;
}

export function assignCaptain<S extends Holder>(s: S, captainId: string, companyId: string | null): R<S> {
  const k = (s.captains ?? []).find((c) => c.id === captainId);
  if (!k) return fail("Capitaine inconnu.");
  if (companyId !== null && !(s.companies ?? []).some((c) => c.id === companyId)) return fail("Compagnie inconnue.");
  if (busyCompany(s, k.company) || busyCompany(s, companyId)) return fail("Pas pendant une expédition dans la faille.");
  // Le capitaine déjà à la tête de cette compagnie revient en réserve.
  const captains = (s.captains ?? []).map((c) => (c.id === captainId ? { ...c, company: companyId } : companyId !== null && c.company === companyId ? { ...c, company: null } : c));
  return { ok: true, value: { ...s, captains } };
}

export function assignRelic<S extends Holder>(s: S, relicId: string, companyId: string | null): R<S> {
  const r = (s.relics ?? []).find((x) => x.id === relicId);
  if (!r) return fail("Relique inconnue.");
  if (companyId !== null && !(s.companies ?? []).some((c) => c.id === companyId)) return fail("Compagnie inconnue.");
  if (busyCompany(s, r.company) || busyCompany(s, companyId)) return fail("Pas pendant une expédition dans la faille.");
  const relics = (s.relics ?? []).map((x) => (x.id === relicId ? { ...x, company: companyId } : companyId !== null && x.company === companyId ? { ...x, company: null } : x));
  return { ok: true, value: { ...s, relics } };
}

export function dropRelic<S extends Holder>(s: S, relicId: string): R<S> {
  const r = (s.relics ?? []).find((x) => x.id === relicId);
  if (!r) return fail("Relique inconnue.");
  if (busyCompany(s, r.company)) return fail("Pas pendant une expédition dans la faille.");
  return { ok: true, value: { ...s, relics: (s.relics ?? []).filter((x) => x.id !== relicId) } };
}

/** Ajoute des reliques (la plus ancienne en réserve part si le coffre est plein). */
export function addRelics<S extends Holder>(s: S, found: Relic[]): S {
  let relics = [...(s.relics ?? []), ...found];
  while (relics.length > RELICS_MAX) {
    const i = relics.findIndex((r) => r.company === null);
    if (i < 0) break;
    relics.splice(i, 1);
  }
  relics = relics.slice(-Math.max(RELICS_MAX, relics.filter((r) => r.company).length));
  return { ...s, relics };
}

export function addCaptain<S extends Holder>(s: S, k: Captain): R<S> {
  if ((s.captains ?? []).length >= CAPTAINS_MAX) return fail(`${CAPTAINS_MAX} capitaines au plus.`);
  return { ok: true, value: { ...s, captains: [...(s.captains ?? []), k] } };
}

/** Nettoyage à la lecture. */
export function cleanCaptains(raw: unknown): Captain[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((k) => k && typeof k === "object" && typeof k.id === "string" && TRAIT_IDS.includes(k.trait))
    .slice(0, CAPTAINS_MAX)
    .map((k) => ({ id: k.id, name: String(k.name ?? "Capitaine").slice(0, 30), trait: k.trait as TraitId, ...(typeof k.target === "string" ? { target: k.target as Category } : {}), xp: Math.max(0, Number(k.xp) || 0), company: typeof k.company === "string" ? k.company : null }));
}

export function cleanRelics(raw: unknown): Relic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object" && typeof r.id === "string" && RELIC_KINDS.includes(r.kind))
    .slice(-RELICS_MAX * 2)
    .map((r) => ({ id: r.id, kind: r.kind as RelicKind, ...(typeof r.target === "string" ? { target: r.target as Category } : {}), company: typeof r.company === "string" ? r.company : null }));
}

export function cleanOffer(raw: unknown): TraitId[] | null {
  return Array.isArray(raw) ? (raw.filter((t) => TRAIT_IDS.includes(t)) as TraitId[]).slice(0, CAPTAIN_OFFER) : null;
}

export type { Army };
