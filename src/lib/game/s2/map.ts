// Saison 2, S2 : la carte 41 × 41, tirée à l'ouverture de la saison et gardée seulement si elle est équitable.
// Règles pures et déterministes (même graine, même carte). Coordonnées de 0 à 40, centre en (20, 20).

import { seededRng } from "../battle";
import { LORDS, LORD_ARMY } from "../config";

export type Resource = "pierre" | "fer" | "or";
export type Pos = [number, number];
export type RegionId = "froid" | "montagne" | "plaine" | "collines" | "desert" | "cote" | "foret";
export type Rank = "hobereau" | "baron" | "comte" | "duc";

export const S2_SIZE = 41;
export const S2_CENTER: Pos = [20, 20];
export const S2_CENTER_RADIUS = 7;
export const S2_BELFRY: Pos = [20, 20];
export const S2_RIFTS: { id: "normale" | "changeante" | "abyssale"; pos: Pos; name: string }[] = [
  { id: "normale", pos: [20, 18], name: "Faille" },
  { id: "changeante", pos: [22, 21], name: "Faille changeante" },
  { id: "abyssale", pos: [18, 21], name: "Faille abyssale" },
];
export const S2_FORTRESSES: Pos[] = [[20, 13], [27, 20], [20, 27], [13, 20]];
/** Vague A : une seule forteresse (au nord) ; les trois autres arrivent en vague B. */
export const S2_FORTRESSES_OPEN = 1;

export const REGIONS: { id: RegionId; name: string; icon: string; bonus: string }[] = [
  { id: "froid", name: "Froid", icon: "❄️", bonus: "+10 % de points de vie pour tes troupes au combat" },
  { id: "montagne", name: "Montagne", icon: "⛰️", bonus: "+10 % de production des carrières" },
  { id: "plaine", name: "Plaine", icon: "🌾", bonus: "+10 % de vitesse des armées et des convois" },
  { id: "collines", name: "Collines", icon: "⛏️", bonus: "+10 % de production des mines" },
  { id: "desert", name: "Désert", icon: "🏜️", bonus: "+10 % d'or sur chaque convoi arrivé" },
  { id: "cote", name: "Côte", icon: "⚓", bonus: "+10 % d'or des marchés et des routes commerciales" },
  { id: "foret", name: "Forêt", icon: "🌲", bonus: "espions, saboteurs et taupes 10 % moins souvent repérés" },
];
export const REGION_BONUS = 0.1;

export const RANKS: Record<Rank, { name: string; count: number; companies: number; train: number; conc: number; zone: number; forts: number }> = {
  duc: { name: "Duc", count: 2, companies: 10, train: 8, conc: 2, zone: 4, forts: 5 },
  comte: { name: "Comte", count: 4, companies: 5, train: 5, conc: 2, zone: 3, forts: 0 },
  baron: { name: "Baron", count: 6, companies: 3, train: 2, conc: 1, zone: 3, forts: 0 },
  hobereau: { name: "Hobereau", count: 8, companies: 2, train: 0, conc: 1, zone: 2, forts: 0 },
};
export const RANK_ORDER: Rank[] = ["duc", "comte", "baron", "hobereau"];

export interface Site {
  id: number;
  type: Resource;
  pos: Pos;
  places: number;
  name: string;
  centre: boolean;
}
export interface MapLord {
  /** Identifiant du seigneur (entité existante de LORDS). */
  id: string;
  pos: Pos;
  rank: Rank;
  /** Compagnies de sa garnison (les hobereaux les plus éloignés du centre n'en ont qu'une). */
  companies: number;
  /** Sites où il tient une place (un site peut revenir deux fois). */
  conc: number[];
}
export interface S2Map {
  seed: number;
  sites: Site[];
  lords: MapLord[];
  /** Région de chaque case [y][x], -1 dans le centre. Indice dans REGIONS. */
  regions: number[][];
}

export const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const eucl = (a: Pos, b: Pos) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Les deux cases qui flanquent chaque forteresse le long du cercle (à gauche et à droite de celle du nord). */
const FLANKS = new Set(
  S2_FORTRESSES.flatMap(([fx, fy]) => (fx === S2_CENTER[0] ? [[fx - 1, fy], [fx + 1, fy]] : [[fx, fy - 1], [fx, fy + 1]])).map(([x, y]) => `${x},${y}`),
);
/** Le centre tourbillonnant : le disque autour du beffroi, plus les cases qui flanquent les forteresses. */
export const inCentre = (p: Pos) => eucl(p, S2_CENTER) <= S2_CENTER_RADIUS || FLANKS.has(`${p[0]},${p[1]}`);

/** Facteur de production selon la taille du site. */
export function siteFactor(places: number): number {
  return places >= 8 ? 1.4 : places >= 6 ? 1.15 : 1;
}

const NAMES: Record<Resource, { head: string; tails: string[] }> = {
  pierre: { head: "Carrière", tails: ["du Faucon", "des Moines", "Blanche", "de Haute-Lame", "du Gué", "Rousse", "des Granges", "du Vieux Pont", "Grise"] },
  fer: { head: "Mine", tails: ["de la Combe", "des Nains", "Noire", "du Val Rouge", "de Sabreuil", "Profonde", "des Forges", "du Corbeau", "Sombre"] },
  or: { head: "Filon", tails: ["du Roi", "des Saules", "d'Ambre", "de la Croix", "Doré", "du Torrent", "des Fées", "du Soleil", "Clair"] },
};

/** Ressource la plus proche (Tchebychev) depuis chaque case hors du centre : la carte est équitable si tout est à 12 cases au plus. */
export const FAIR_DISTANCE = 12;
const OUTSIDE: Pos[] = [];
for (let y = 0; y < S2_SIZE; y++) for (let x = 0; x < S2_SIZE; x++) if (!inCentre([x, y])) OUTSIDE.push([x, y]);
/** Couples (case, ressource) trop loin de toute ressource de ce type. */
function uncovered(sites: Site[]): { p: Pos; r: Resource }[] {
  const out: { p: Pos; r: Resource }[] = [];
  for (const p of OUTSIDE) for (const r of ["pierre", "fer", "or"] as Resource[]) if (!sites.some((s) => s.type === r && cheb(s.pos, p) <= FAIR_DISTANCE)) out.push({ p, r });
  return out;
}
export function isFair(sites: Site[]): boolean {
  return uncovered(sites).length === 0;
}
const siteSpotOk = (sites: Site[], self: Site | null, type: Resource, p: Pos) =>
  p[0] >= 2 && p[1] >= 2 && p[0] <= S2_SIZE - 3 && p[1] <= S2_SIZE - 3 && Math.hypot(p[0] - 20, p[1] - 20) > S2_CENTER_RADIUS + 2 &&
  !sites.some((s) => s !== self && (cheb(s.pos, p) < 6 || (s.type === type && cheb(s.pos, p) < 10)));

/** Recherche locale : on déplace un site du bon type vers une case mal servie tant que la couverture s'améliore. */
export function makeFair(rng: () => number, sites: Site[]): boolean {
  let gaps = uncovered(sites);
  for (let step = 0; step < 600 && gaps.length > 0; step++) {
    const g = gaps[Math.floor(rng() * gaps.length)];
    const movable = sites.filter((s) => !s.centre && s.type === g.r);
    const s = movable[Math.floor(rng() * movable.length)];
    const old = s.pos;
    const dx = Math.sign(g.p[0] - old[0]), dy = Math.sign(g.p[1] - old[1]);
    const jump = 1 + Math.floor(rng() * 4);
    const p: Pos = [old[0] + dx * jump + Math.floor(rng() * 3) - 1, old[1] + dy * jump + Math.floor(rng() * 3) - 1];
    if (!siteSpotOk(sites, s, s.type, p)) continue;
    s.pos = p;
    const next = uncovered(sites);
    if (next.length <= gaps.length) gaps = next;
    else s.pos = old;
  }
  return gaps.length === 0;
}

export function placeSites(rng: () => number): Site[] | null {
  const sites: Site[] = [];
  const centreSpots: Pos[] = [[19, 15], [24, 23], [16, 22]];
  const order: Resource[] = ["pierre", "fer", "or"];
  // Le centre : un site de 8 places par ressource, dans un ordre tiré.
  const shuffled = [...order].sort(() => rng() - 0.5);
  shuffled.forEach((type, i) => sites.push({ id: sites.length, type, pos: centreSpots[i], places: 8, name: "", centre: true }));
  // Hors du centre : par ressource, trois sites de 6 et deux de 4.
  const wanted: { type: Resource; places: number }[] = [];
  for (const type of order) wanted.push({ type, places: 6 }, { type, places: 6 }, { type, places: 6 }, { type, places: 4 }, { type, places: 4 });
  wanted.sort(() => rng() - 0.5);
  for (const w of wanted) {
    let ok = false;
    for (let tries = 0; tries < 400 && !ok; tries++) {
      const p: Pos = [2 + Math.floor(rng() * (S2_SIZE - 4)), 2 + Math.floor(rng() * (S2_SIZE - 4))];
      if (!siteSpotOk(sites, null, w.type, p)) continue;
      sites.push({ id: sites.length, type: w.type, pos: p, places: w.places, name: "", centre: false });
      ok = true;
    }
    if (!ok) return null;
  }
  return sites;
}

export function placeLords(rng: () => number, sites: Site[]): Pos[] | null {
  const spots: Pos[] = [];
  for (let i = 0; i < LORDS.length; i++) {
    let ok = false;
    for (let tries = 0; tries < 600 && !ok; tries++) {
      const p: Pos = [1 + Math.floor(rng() * (S2_SIZE - 2)), 1 + Math.floor(rng() * (S2_SIZE - 2))];
      if (eucl(p, S2_CENTER) <= S2_CENTER_RADIUS + 1.5) continue;
      if (sites.some((s) => cheb(s.pos, p) < 3)) continue;
      if (spots.some((q) => cheb(q, p) < 5)) continue;
      spots.push(p);
      ok = true;
    }
    if (!ok) return null;
  }
  return spots;
}

/** Les seigneurs reçoivent un rang par distance au centre ; les plus forts de LORDS prennent les rangs les plus hauts. */
function assignLords(spots: Pos[], sites: Site[]): MapLord[] {
  const byPower = [...LORDS].sort((a, b) => LORD_ARMY[b.key].power - LORD_ARMY[a.key].power);
  const bySpot = [...spots].sort((a, b) => eucl(a, S2_CENTER) - eucl(b, S2_CENTER));
  const used = new Map<number, number>();
  const out: MapLord[] = [];
  let k = 0;
  for (const rank of RANK_ORDER) {
    for (let i = 0; i < RANKS[rank].count; i++, k++) {
      const pos = bySpot[k];
      const conc: number[] = [];
      // Places sur les sites les plus proches (deux sites différents pour deux places), en laissant au moins deux places libres par site.
      const near = [...sites].sort((a, b) => cheb(a.pos, pos) - cheb(b.pos, pos));
      for (const s of near) {
        if (conc.length >= RANKS[rank].conc) break;
        if ((used.get(s.id) ?? 0) >= s.places - 2) continue;
        used.set(s.id, (used.get(s.id) ?? 0) + 1);
        conc.push(s.id);
      }
      // Hobereaux : les quatre plus éloignés du centre n'ont qu'une compagnie.
      const companies = rank === "hobereau" && i >= RANKS.hobereau.count / 2 ? 1 : RANKS[rank].companies;
      out.push({ id: byPower[k].id, pos, rank, companies, conc });
    }
  }
  return out;
}

/** Bruit de valeur lissé, pour des frontières de région naturelles. */
function noise(seed: number) {
  const h = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * s(fx);
    const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * s(fx);
    return a + (b - a) * s(fy);
  };
}

export function drawRegions(rng: () => number, seed: number): number[][] | null {
  // Secteurs autour du centre, à angle déformé par le bruit, découpés à effectifs égaux : tailles égales, frontières naturelles.
  const start = rng() * Math.PI * 2;
  const order = REGIONS.map((_, i) => i).sort(() => rng() - 0.5);
  const nz = noise(seed);
  const cells: { p: Pos; a: number }[] = [];
  for (const p of OUTSIDE) {
    const base = Math.atan2(p[1] - S2_CENTER[1], p[0] - S2_CENTER[0]) - start;
    const a = (((base + (nz(p[0] / 5, p[1] / 5) - 0.5) * 0.9) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    cells.push({ p, a });
  }
  cells.sort((x, y) => x.a - y.a);
  const grid: number[][] = Array.from({ length: S2_SIZE }, () => new Array(S2_SIZE).fill(-1));
  const counts = new Array(REGIONS.length).fill(0);
  cells.forEach((c, i) => {
    const r = order[Math.min(REGIONS.length - 1, Math.floor((i * REGIONS.length) / cells.length))];
    grid[c.p[1]][c.p[0]] = r;
    counts[r]++;
  });
  // Chaque région d'un seul tenant : les îlots détachés rejoignent la région voisine la plus présente autour d'eux.
  for (let pass = 0; pass < 20; pass++) {
    let fixed = false;
    for (let r = 0; r < REGIONS.length; r++) {
      const comps: Pos[][] = [];
      const seen = new Set<string>();
      for (let y = 0; y < S2_SIZE; y++)
        for (let x = 0; x < S2_SIZE; x++) {
          if (grid[y][x] !== r || seen.has(`${x},${y}`)) continue;
          const comp: Pos[] = [];
          const stack: Pos[] = [[x, y]];
          seen.add(`${x},${y}`);
          while (stack.length) {
            const [cx, cy] = stack.pop()!;
            comp.push([cx, cy]);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const X = cx + dx, Y = cy + dy;
              if (X < 0 || Y < 0 || X >= S2_SIZE || Y >= S2_SIZE || grid[Y][X] !== r || seen.has(`${X},${Y}`)) continue;
              seen.add(`${X},${Y}`);
              stack.push([X, Y]);
            }
          }
          comps.push(comp);
        }
      if (comps.length <= 1) continue;
      comps.sort((p, q) => q.length - p.length);
      for (const comp of comps.slice(1)) {
        const around = new Map<number, number>();
        for (const [cx, cy] of comp)
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const v = grid[cy + dy]?.[cx + dx];
            if (v !== undefined && v >= 0 && v !== r) around.set(v, (around.get(v) ?? 0) + 1);
          }
        const to = [...around.entries()].sort((p, q) => q[1] - p[1])[0]?.[0];
        if (to === undefined) continue;
        for (const [cx, cy] of comp) {
          grid[cy][cx] = to;
          counts[r]--;
          counts[to]++;
        }
        fixed = true;
      }
    }
    if (!fixed) break;
  }
  const min = Math.min(...counts), max = Math.max(...counts);
  if (min <= 0 || (max - min) / min > 0.3) return null;
  return grid;
}

function nameSites(rng: () => number, sites: Site[]) {
  for (const r of ["pierre", "fer", "or"] as Resource[]) {
    const tails = [...NAMES[r].tails].sort(() => rng() - 0.5);
    sites.filter((s) => s.type === r).forEach((s, i) => (s.name = `${NAMES[r].head} ${tails[i % tails.length]}`));
  }
}

/** Tire la carte d'une saison (déterministe). Recommence jusqu'à une carte équitable. */
export function generateMap(seed: number): S2Map {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const rng = seededRng((seed * 7919 + attempt * 104729) >>> 0);
    const sites = placeSites(rng);
    if (!sites || !makeFair(rng, sites)) continue;
    const spots = placeLords(rng, sites);
    if (!spots) continue;
    const regions = drawRegions(rng, seed + attempt);
    if (!regions) continue;
    nameSites(rng, sites);
    return { seed, sites, lords: assignLords(spots, sites), regions };
  }
  throw new Error("Carte de saison impossible à tirer.");
}

/** Région d'une case, ou null dans le centre. */
export function regionAt(map: S2Map, p: Pos): RegionId | null {
  const r = map.regions[p[1]]?.[p[0]];
  return r === undefined || r < 0 || inCentre(p) ? null : REGIONS[r].id;
}

/** Une case peut-elle recevoir un château ? Hors du centre, à 2 cases au moins de tout lieu et de tout château. */
export function castleBlocker(map: S2Map, p: Pos, castles: Pos[]): string | null {
  const [x, y] = p;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= S2_SIZE || y >= S2_SIZE) return "Case hors de la carte.";
  if (inCentre(p)) return "Aucun château dans le centre.";
  if (map.sites.some((s) => cheb(s.pos, p) < 2)) return "Trop près d'un site.";
  if (map.lords.some((l) => cheb(l.pos, p) < 2)) return "Trop près d'un seigneur.";
  if (S2_FORTRESSES.some((f) => cheb(f, p) < 2)) return "Trop près d'une forteresse.";
  if (castles.some((c) => cheb(c, p) < 2)) return "Trop près d'un autre château.";
  return null;
}

/** Places tenues par les seigneurs sur un site. */
export function lordPlaces(map: S2Map, siteId: number): number {
  return map.lords.reduce((a, l) => a + l.conc.filter((c) => c === siteId).length, 0);
}
