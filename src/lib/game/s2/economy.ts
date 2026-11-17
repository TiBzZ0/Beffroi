// Saison 2, S1, S3, S4 : monnaies, concessions, bâtiments d'appui et convois automatiques.
// Le domaine ne produit plus rien : chaque concession produit dans un stock local, et un convoi part vers le château
// à chaque intervalle. Tout se calcule à la lecture (comme `advance`), sans tâche de fond.

import { cheb, siteFactor, type Pos, type RegionId, type Resource, type S2Map } from "./map";

// ---------------------------------------------------------------------------
// Monnaies et courbe de référence
// ---------------------------------------------------------------------------

/** Valeur de référence en pierre : 1 or = 2 fer = 4 pierre. */
export const VALUE: Record<Resource, number> = { pierre: 1, fer: 2, or: 4 };
export const RESOURCE_ICON: Record<Resource, string> = { pierre: "🪨", fer: "⚔️", or: "🪙" };
export const RESOURCE_LABEL: Record<Resource, string> = { pierre: "pierre", fer: "fer", or: "or" };
/** Production de base d'une concession, par heure. */
export const BASE_PROD: Record<Resource, number> = { pierre: 100, fer: 50, or: 25 };
/** Marché : une monnaie contre une autre au tiers de sa valeur de référence. */
export const MARKET_RATE = 1 / 3;
/** Or en plus à chaque convoi arrivé : 3 % de sa charge, en valeur de référence. */
export const CONVOY_GOLD = 0.03;

/** REF(j) : production d'une concession typique d'un joueur actif au jour j, en valeur pierre par heure. */
const REF_POINTS: [number, number][] = [[0, 100], [3, 400], [7, 1200], [14, 3000]];
export function REF(day: number): number {
  const d = Math.max(0, day);
  for (let i = 1; i < REF_POINTS.length; i++) {
    const [d1, r1] = REF_POINTS[i];
    if (d <= d1) {
      const [d0, r0] = REF_POINTS[i - 1];
      return r0 * Math.pow(r1 / r0, (d - d0) / (d1 - d0));
    }
  }
  // Au-delà du dernier point : on prolonge la dernière pente.
  const [d0, r0] = REF_POINTS[REF_POINTS.length - 2];
  const [d1, r1] = REF_POINTS[REF_POINTS.length - 1];
  return r1 * Math.pow(r1 / r0, (d - d1) / (d1 - d0));
}

/** Marché : ce que rapporte `amount` de `from` en `to`. */
export function marketQuote(from: Resource, to: Resource, amount: number): number {
  if (from === to) return 0;
  return Math.floor((amount * VALUE[from] * MARKET_RATE) / VALUE[to]);
}

// ---------------------------------------------------------------------------
// Concessions et bâtiments d'appui
// ---------------------------------------------------------------------------

export const CONCESSION_MAX_LEVEL = 15;
export const CONCESSIONS_MAX = 5;
/** Concessions achetées en or : la 3e, la 4e, la 5e. */
export const CONCESSION_GOLD = [1_500, 5_000, 15_000];
export const LOCAL_STOCK_HOURS = 4;

export function concessionLevelFactor(level: number): number {
  return 1 + 0.2 * (Math.max(1, level) - 1);
}
/** Prix du niveau n (2 à 15) d'une concession, en pierre. */
export function concessionCost(level: number): number {
  return Math.round(300 * Math.pow(1.5, level - 1));
}
export function concessionBuildMs(level: number): number {
  return Math.round(5 * 60_000 * Math.pow(1.3, level - 1));
}

export type BuildingId = "outils" | "charronnerie" | "relais" | "entrepot";
export const BUILDING_MAX = 20;
export const BUILDING_SLOTS = 2;
export const BUILDINGS: Record<BuildingId, { name: string; icon: string; base: number; text: string }> = {
  outils: { name: "Outils", icon: "🛠️", base: 500, text: "+5 % de production de toutes les concessions par niveau" },
  charronnerie: { name: "Charronnerie", icon: "🛞", base: 400, text: "Charge d'un convoi : 60 min de production de base, +10 % par niveau" },
  relais: { name: "Relais", icon: "🐎", base: 400, text: "Un convoi toutes les 60 min, 2 min de moins par niveau ; convois 3 % plus rapides par niveau" },
  entrepot: { name: "Entrepôt", icon: "🏚️", base: 300, text: "Stock local +30 min par niveau ; stock à l'abri au château +15 min par niveau" },
};
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export function buildingCost(id: BuildingId, level: number): number {
  return Math.round(BUILDINGS[id].base * Math.pow(1.5, level - 1));
}
export function buildingMs(level: number): number {
  return Math.round(10 * 60_000 * Math.pow(1.25, level - 1));
}

// ---------------------------------------------------------------------------
// État du joueur
// ---------------------------------------------------------------------------

export interface Concession {
  id: string;
  site: number;
  level: number;
  /** Stock local au moment `S2State.at`. */
  stock: number;
  /** Prochain départ de convoi. */
  next: number;
  /** Amélioration en cours vers `level + 1`. */
  upUntil?: number;
}
export interface Convoy {
  conc: string;
  res: Resource;
  load: number;
  depart: number;
  arrive: number;
  from: Pos;
  to: Pos;
}
export interface S2Work {
  id: BuildingId;
  level: number;
  until: number;
}
export interface S2State {
  castle: Pos | null;
  region: RegionId | null;
  iron: number;
  gold: number;
  conc: Concession[];
  convoys: Convoy[];
  bld: Record<BuildingId, number>;
  works: S2Work[];
  /** Concessions achetées en or (0 à 3). */
  bought: number;
  /** Instant jusqu'où le calcul a été fait. */
  at: number;
  /** Production livrée sur la saison, en valeur pierre (classement de richesse). */
  produced: number;
}

export function newS2State(now: number): S2State {
  return { castle: null, region: null, iron: 3_000, gold: 0, conc: [], convoys: [], bld: { outils: 0, charronnerie: 0, relais: 0, entrepot: 0 }, works: [], bought: 0, at: now, produced: 0 };
}

/** Ce qui vient d'ailleurs que de l'état : la carte, et les bonus de l'instant. */
export interface S2Context {
  map: S2Map;
  /** Concessions gagnées par les étapes du beffroi (la 2e à la première étape). */
  stageConcessions: number;
  /** Multiplicateur de production commun (élan, bonus du jour, dons au beffroi…), par segment. */
  multiplier?: (t: number) => number;
  /** Instants où ce multiplicateur change. */
  breakpoints?: number[];
}

export function concessionSlots(s: S2State, ctx: Pick<S2Context, "stageConcessions">): number {
  return Math.min(CONCESSIONS_MAX, 1 + ctx.stageConcessions + s.bought);
}

const regionBonus = (s: S2State, res: Resource) =>
  (s.region === "montagne" && res === "pierre") || (s.region === "collines" && res === "fer") || (s.region === "cote" && res === "or") ? 1.1 : 1;

/** Production horaire d'une concession, hors multiplicateur commun. */
export function concessionRate(s: S2State, c: Concession, map: S2Map): number {
  const site = map.sites[c.site];
  if (!site) return 0;
  return BASE_PROD[site.type] * siteFactor(site.places) * concessionLevelFactor(c.level) * (1 + 0.05 * s.bld.outils) * regionBonus(s, site.type);
}
/** Charge d'un convoi : 60 min de production de base de la concession, +10 % par niveau de charronnerie. */
export function convoyLoad(s: S2State, c: Concession, map: S2Map): number {
  const site = map.sites[c.site];
  return site ? BASE_PROD[site.type] * siteFactor(site.places) * (1 + 0.1 * s.bld.charronnerie) : 0;
}
export function convoyIntervalMs(s: S2State): number {
  return Math.max(20, 60 - 2 * s.bld.relais) * 60_000;
}
export function localCap(s: S2State, c: Concession, map: S2Map): number {
  return concessionRate(s, c, map) * (LOCAL_STOCK_HOURS + 0.5 * s.bld.entrepot);
}
/** Trajet d'un convoi : 2 min par case (Tchebychev), plafonné à 45 min, plus rapide avec le relais et en Plaine. */
export function convoyTravelMs(s: S2State, from: Pos, to: Pos): number {
  const base = Math.min(45, 2 * cheb(from, to)) * 60_000;
  return Math.round(base / ((1 + 0.03 * s.bld.relais) * (s.region === "plaine" ? 1.1 : 1)));
}
/** Stock du château à l'abri des raids : 15 min de production par niveau d'entrepôt (au moins 30 min). */
export function safeHours(s: S2State): number {
  return 0.5 + 0.25 * s.bld.entrepot;
}

/** Production horaire totale, en valeur pierre (sert aux plafonds de butin, aux quêtes, aux classements). */
export function productionValue(s: S2State, map: S2Map): number {
  return s.conc.reduce((a, c) => a + concessionRate(s, c, map) * VALUE[map.sites[c.site]?.type ?? "pierre"], 0);
}

/** Stock local plein : la concession s'arrête (« stock plein, améliore ta charronnerie »). */
export function stockFull(s: S2State, c: Concession, map: S2Map): boolean {
  return c.stock >= localCap(s, c, map) - convoyLoad(s, c, map) - 1e-6 && concessionRate(s, c, map) * (convoyIntervalMs(s) / 3_600_000) > convoyLoad(s, c, map);
}

// ---------------------------------------------------------------------------
// Calcul paresseux
// ---------------------------------------------------------------------------

export interface Arrivals {
  pierre: number;
  fer: number;
  or: number;
}

/**
 * Fait avancer la saison 2 du joueur jusqu'à `now` : production des concessions, départs et arrivées de convois,
 * chantiers finis. Renvoie le nouvel état et ce qui est arrivé au château (à verser dans la pierre, le fer et l'or).
 */
export function settleS2(s: S2State, ctx: S2Context, now: number): { s: S2State; arrived: Arrivals } {
  const arrived: Arrivals = { pierre: 0, fer: 0, or: 0 };
  if (now <= s.at || !s.castle) return { s: s.castle ? s : { ...s, at: Math.max(s.at, now) }, arrived };
  let st: S2State = { ...s, bld: { ...s.bld }, conc: s.conc.map((c) => ({ ...c })), convoys: [...s.convoys], works: [...s.works] };
  const castle = st.castle!;
  const mult = ctx.multiplier ?? (() => 1);
  // Instants où quelque chose change : chantiers finis, bonus communs.
  const cuts = [...st.works.map((w) => w.until), ...st.conc.map((c) => c.upUntil ?? 0), ...(ctx.breakpoints ?? [])].filter((t) => t > st.at && t < now);
  cuts.sort((a, b) => a - b);
  let cursor = st.at;
  for (const end of [...cuts, now]) {
    const m = mult(cursor);
    const interval = convoyIntervalMs(st);
    for (const c of st.conc) {
      const site = ctx.map.sites[c.site];
      if (!site) continue;
      const rate = (concessionRate(st, c, ctx.map) * m) / 3_600_000;
      const cap = localCap(st, c, ctx.map);
      const load = convoyLoad(st, c, ctx.map);
      let t = cursor;
      // Départs dans le segment.
      while (c.next <= end) {
        const dep = Math.max(c.next, t);
        c.stock = Math.min(cap, c.stock + rate * (dep - t));
        t = dep;
        const take = Math.min(c.stock, load);
        if (take >= 1) {
          c.stock -= take;
          st.convoys.push({ conc: c.id, res: site.type, load: take, depart: dep, arrive: dep + convoyTravelMs(st, site.pos, castle), from: site.pos, to: castle });
        }
        c.next = dep + interval;
      }
      c.stock = Math.min(cap, c.stock + rate * (end - t));
    }
    // Chantiers finis à `end`.
    st.conc = st.conc.map((c) => (c.upUntil && c.upUntil <= end ? { ...c, level: Math.min(CONCESSION_MAX_LEVEL, c.level + 1), upUntil: undefined } : c));
    const done = st.works.filter((w) => w.until <= end);
    for (const w of done) st.bld[w.id] = Math.max(st.bld[w.id], w.level);
    st.works = st.works.filter((w) => w.until > end);
    cursor = end;
  }
  // Arrivées.
  const still: Convoy[] = [];
  let produced = 0;
  for (const v of st.convoys) {
    if (v.arrive <= now) {
      arrived[v.res] += v.load;
      produced += v.load * VALUE[v.res];
      arrived.or += (v.load * VALUE[v.res] * CONVOY_GOLD) / VALUE.or;
    } else still.push(v);
  }
  st = { ...st, convoys: still, at: now, produced: st.produced + produced };
  return { s: st, arrived };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type R<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = <T>(error: string): R<T> => ({ ok: false, error });
let seq = 0;
const newId = (now: number) => `c${now.toString(36)}${(seq++ % 1296).toString(36)}`;

/** Places prises sur un site, par les joueurs (liste fournie par le serveur) et les seigneurs. */
export interface SiteOccupancy {
  taken: (siteId: number) => number;
}

export function takeConcessionBlocker(s: S2State, ctx: S2Context, siteId: number, occ: SiteOccupancy): string | null {
  const site = ctx.map.sites[siteId];
  if (!site) return "Site inconnu.";
  if (!s.castle) return "Pose d'abord ton château.";
  if (s.conc.length >= concessionSlots(s, ctx)) return "Plus de place pour une concession : achète-en une avec de l'or, ou fais avancer le beffroi.";
  if (occ.taken(siteId) >= site.places) return "Ce site est complet.";
  return null;
}

export function takeConcession(s: S2State, ctx: S2Context, siteId: number, occ: SiteOccupancy, now: number): R<S2State> {
  const why = takeConcessionBlocker(s, ctx, siteId, occ);
  if (why) return fail(why);
  const c: Concession = { id: newId(now), site: siteId, level: 1, stock: 0, next: now + convoyIntervalMs(s) };
  return { ok: true, value: { ...s, conc: [...s.conc, c] } };
}

/** Abandonner une concession : sans remboursement, niveau perdu, la place se libère. */
export function dropConcession(s: S2State, id: string): R<S2State> {
  if (!s.conc.some((c) => c.id === id)) return fail("Concession inconnue.");
  if (s.conc.length <= 1) return fail("Garde au moins une concession.");
  return { ok: true, value: { ...s, conc: s.conc.filter((c) => c.id !== id), convoys: s.convoys } };
}

export function upgradeConcessionBlocker(s: S2State, id: string, stone: number, now: number): string | null {
  const c = s.conc.find((x) => x.id === id);
  if (!c) return "Concession inconnue.";
  if (c.upUntil && c.upUntil > now) return "Déjà en travaux.";
  if (c.level >= CONCESSION_MAX_LEVEL) return "Niveau maximal.";
  if (concessionCost(c.level + 1) > stone) return "Pas assez de pierre.";
  return null;
}

export function upgradeConcession(s: S2State, id: string, stone: number, now: number): R<{ s: S2State; cost: number }> {
  const why = upgradeConcessionBlocker(s, id, stone, now);
  if (why) return fail(why);
  const c = s.conc.find((x) => x.id === id)!;
  const cost = concessionCost(c.level + 1);
  return { ok: true, value: { s: { ...s, conc: s.conc.map((x) => (x.id === id ? { ...x, upUntil: now + concessionBuildMs(c.level + 1) } : x)) }, cost } };
}

export function buyConcessionBlocker(s: S2State): string | null {
  if (s.bought >= CONCESSION_GOLD.length) return "Tu as déjà acheté toutes les concessions possibles.";
  if (CONCESSION_GOLD[s.bought] > s.gold) return "Pas assez d'or.";
  return null;
}

export function buyConcession(s: S2State): R<S2State> {
  const why = buyConcessionBlocker(s);
  if (why) return fail(why);
  return { ok: true, value: { ...s, gold: s.gold - CONCESSION_GOLD[s.bought], bought: s.bought + 1 } };
}

function nextBuildingLevel(s: S2State, id: BuildingId): number {
  return Math.max(s.bld[id], ...s.works.filter((w) => w.id === id).map((w) => w.level)) + 1;
}

export function buildBlocker(s: S2State, id: BuildingId, stone: number, discount = 1): string | null {
  if (!BUILDINGS[id]) return "Bâtiment inconnu.";
  const level = nextBuildingLevel(s, id);
  if (level > BUILDING_MAX) return "Niveau maximal.";
  if (s.works.length >= BUILDING_SLOTS) return "Les deux places de chantier sont prises.";
  if (Math.ceil(buildingCost(id, level) * discount) > stone) return "Pas assez de pierre.";
  return null;
}

export function build(s: S2State, id: BuildingId, stone: number, now: number, discount = 1): R<{ s: S2State; cost: number }> {
  const why = buildBlocker(s, id, stone, discount);
  if (why) return fail(why);
  const level = nextBuildingLevel(s, id);
  return { ok: true, value: { s: { ...s, works: [...s.works, { id, level, until: now + buildingMs(level) }] }, cost: Math.ceil(buildingCost(id, level) * discount) } };
}

/** Marché : échange immédiat au tiers de la valeur de référence. */
export function exchangeBlocker(have: Arrivals, from: Resource, to: Resource, amount: number): string | null {
  if (from === to) return "Choisis deux monnaies différentes.";
  if (!(amount > 0) || !Number.isFinite(amount)) return "Quantité invalide.";
  if (have[from] < amount) return "Pas assez de " + RESOURCE_LABEL[from] + ".";
  if (marketQuote(from, to, amount) < 1) return "Trop peu pour obtenir quoi que ce soit.";
  return null;
}

/** Concessions qu'un joueur pourrait prendre pour la première : sites de pierre à 8 cases au plus, sinon la plus proche. */
export function firstConcessionSites(map: S2Map, castle: Pos, taken: (siteId: number) => number): number[] {
  const free = map.sites.filter((s) => s.type === "pierre" && taken(s.id) < s.places);
  const near = free.filter((s) => cheb(s.pos, castle) <= 8).map((s) => s.id);
  if (near.length) return near;
  const best = [...free].sort((a, b) => cheb(a.pos, castle) - cheb(b.pos, castle))[0];
  return best ? [best.id] : [];
}
