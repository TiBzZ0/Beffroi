// Décor de la carte du royaume : rivière, lac, marais, forêts, montagnes, collines, champs et routes.
// Tout est calculé en coordonnées de grille (1 à MAP_SIZE, y vers le haut) et ne dépend que des lieux
// occupés : la carte reste la même d'une visite à l'autre.
import { BELFRY_POS, FORTRESS_POS, LORD_POSITIONS, type MapPos } from "./config";

export type Pt = [number, number];
export interface Tree { x: number; y: number; s: number; kind: 0 | 1 | 2 }
export interface Peak { x: number; y: number; s: number; snow: boolean }
export interface Hill { x: number; y: number; s: number }
export interface Reed { x: number; y: number; s: number }
export interface Field { x: number; y: number; w: number; h: number; a: number; tint: 0 | 1 | 2 | 3 }
export interface Road { pts: Pt[]; kind: "royal" | "road" | "trail" }
export interface Bridge { x: number; y: number; a: number }
export interface Pond { x: number; y: number; rx: number; ry: number }
export interface Terrain {
  river: Pt[];
  lake: Pt[];
  ponds: Pond[];
  trees: Tree[];
  peaks: Peak[];
  hills: Hill[];
  reeds: Reed[];
  fields: Field[];
  roads: Road[];
  bridges: Bridge[];
}

/** Bruit déterministe entre 0 et 1. */
export function hash(x: number, y: number, seed = 0): number {
  let h = Math.imul(Math.floor(x * 73856093) ^ Math.floor(y * 19349663) ^ Math.imul(seed + 1, 83492791), 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Courbe de Catmull-Rom passant par les points donnés. */
export function smooth(points: Pt[], steps = 6): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function distToLine(p: Pt, line: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, distToSegment(p, line[i], line[i + 1]));
  return best;
}

function insidePolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function intersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}

/** Route un peu sinueuse, comme tracée à la main. */
function wobbly(points: Pt[], seed: number, amount = 0.22): Pt[] {
  const out: Pt[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 1.2));
    const nx = -(b[1] - a[1]) / (len || 1);
    const ny = (b[0] - a[0]) / (len || 1);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const off = k === n ? 0 : (hash(a[0] + t * 7, a[1] - t * 3, seed + i) - 0.5) * amount;
      out.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off]);
    }
  }
  return smooth(out, 5);
}

const L = LORD_POSITIONS;
const B = BELFRY_POS as Pt;
const F = FORTRESS_POS as Pt;
const P = (p: MapPos): Pt => [p[0], p[1]];

/** La rivière descend du val de Noirval, longe le beffroi et la forteresse, passe le pont de Pontcroix et se perd dans les marais. */
const RIVER_COURSE: Pt[] = [
  [10.5, 15.8], [10.5, 14.5], [9.5, 13.5], [9.5, 11.5], [9.5, 9.5], [9.5, 7.5], [9.5, 6.5], [8.5, 5.5], [7.5, 4.5],
  [6.5, 3.6], [5.5, 3.5], [4.5, 3.6], [3.5, 4.5], [2.5, 5.4], [1.5, 5.5], [0.2, 5.6],
];

function lakeShape(): Pt[] {
  const c: Pt = [14.75, 5.95];
  return Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const r = 1 + (hash(i, 3, 11) - 0.5) * 0.3;
    return [c[0] + Math.cos(a) * 1.05 * r, c[1] + Math.sin(a) * 0.82 * r] as Pt;
  });
}

function roadNetwork(): Road[] {
  const ring: Pt[] = [P(L.bruyere), P(L.moulinet), P(L.aubeval), P(L.bourbelin), P(L.sauleraie), P(L.pontcroix), P(L.bruyere)];
  const trails: [MapPos, MapPos][] = [
    [L.bourbelin, L.corbelune], [L.corbelune, L.marches], [L.aubeval, L.noirval], [L.moulinet, L.grisemolle],
    [L.moulinet, L.roncebois], [L.roncebois, L.orgemont], [L.bruyere, L.clairmarais], [L.clairmarais, L.hautefaille],
    [L.pontcroix, L.lysnoir], [L.sauleraie, L.hautgivre], [L.sauleraie, L.brumeport], [L.brumeport, L.rougemarc],
  ];
  return [
    { kind: "royal", pts: wobbly([B, [8, 11.5], P(L.ventebrise)], 1) },
    { kind: "royal", pts: wobbly([B, F, P(L.pierrefendue)], 2) },
    { kind: "royal", pts: wobbly([B, [5, 8], P(L.bruyere)], 3) },
    { kind: "royal", pts: wobbly([B, [11, 8], P(L.bourbelin)], 4) },
    { kind: "road", pts: wobbly(ring, 5, 0.35) },
    ...trails.map(([a, b], i) => ({ kind: "trail" as const, pts: wobbly([P(a), P(b)], 10 + i, 0.4) })),
  ];
}

/** Décor complet ; `places` : toutes les cases occupées (lieux fixes et joueurs). */
export function buildTerrain(places: Pt[], size: number): Terrain {
  const river = smooth(RIVER_COURSE, 8);
  const lake = lakeShape();
  const roads = roadNetwork();
  const allRoads = roads.flatMap((r) => [r.pts]);
  const near = (p: Pt, d: number) => places.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < d);
  const onRoad = (p: Pt, d: number) => allRoads.some((r) => distToLine(p, r) < d);
  const wet = (p: Pt, d: number) => distToLine(p, river) < d || insidePolygon(p, lake) || Math.hypot(p[0] - 14.75, p[1] - 5.95) < 1.25 + d - 0.2;
  const inMap = (p: Pt) => p[0] > 0.6 && p[0] < size + 0.4 && p[1] > 0.6 && p[1] < size + 0.4;
  const fromBelfry = (p: Pt) => Math.hypot(p[0] - B[0], p[1] - B[1]);

  // Ponts : là où une route croise la rivière.
  const bridges: Bridge[] = [];
  for (const r of roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      for (let j = 0; j < river.length - 1; j++) {
        const x = intersect(r.pts[i], r.pts[i + 1], river[j], river[j + 1]);
        if (x && !bridges.some((b) => Math.hypot(b.x - x[0], b.y - x[1]) < 0.6)) {
          bridges.push({ x: x[0], y: x[1], a: (Math.atan2(-(r.pts[i + 1][1] - r.pts[i][1]), r.pts[i + 1][0] - r.pts[i][0]) * 180) / Math.PI });
        }
      }
    }
  }

  // Montagnes : la chaîne d'Orgemont au nord-ouest, les cimes de Hautgivre au sud-est, quelques pics au nord-est.
  const peaks: Peak[] = [];
  const ranges: { x: [number, number]; y: [number, number]; snow: boolean; step: number }[] = [
    { x: [0.7, 7.3], y: [13.5, 15.5], snow: true, step: 0.78 },
    { x: [11.6, 15.3], y: [13.9, 15.4], snow: false, step: 0.85 },
    { x: [8.6, 14.6], y: [0.6, 1.9], snow: true, step: 0.8 },
    { x: [5.6, 7.4], y: [0.6, 1.6], snow: false, step: 0.9 },
  ];
  ranges.forEach((g, gi) => {
    for (let y = g.y[1]; y >= g.y[0]; y -= g.step * 0.8)
      for (let x = g.x[0]; x <= g.x[1]; x += g.step) {
        const p: Pt = [x + (hash(x, y, 20 + gi) - 0.5) * 0.4, y + (hash(y, x, 21 + gi) - 0.5) * 0.3];
        if (!inMap(p) || near(p, 0.85) || onRoad(p, 0.45) || wet(p, 0.5)) continue;
        if (hash(p[0], p[1], 22) < 0.18) continue;
        peaks.push({ x: p[0], y: p[1], s: 0.8 + hash(p[0], p[1], 23) * 0.5, snow: g.snow && hash(p[0], p[1], 24) < 0.7 });
      }
  });
  const isPeak = (p: Pt, d: number) => peaks.some((k) => Math.hypot(k.x - p[0], k.y - p[1]) < d * k.s);

  // Forêts : bois de Roncebois, forêt du nord-est, saulaie et bosquets épars hors des terres cultivées.
  const blobs: { c: Pt; r: number }[] = [
    { c: [2.4, 11.4], r: 2.1 },
    { c: [13.2, 12.6], r: 1.7 },
    { c: [14.5, 10.1], r: 1.2 },
    { c: [3.4, 1.8], r: 1.5 },
    { c: [12.7, 2.9], r: 1.3 },
    { c: [6.8, 14.0], r: 0.9 },
    { c: [0.9, 13.6], r: 0.8 },
  ];
  for (let x = 1; x <= size; x++)
    for (let y = 1; y <= size; y++) if (fromBelfry([x, y]) > 5.6 && hash(x, y, 30) > 0.84) blobs.push({ c: [x + 0.3, y - 0.2], r: 0.55 });
  const trees: Tree[] = [];
  const step = 0.3;
  for (let x = 0.6; x <= size + 0.4; x += step)
    for (let y = 0.6; y <= size + 0.4; y += step) {
      const p: Pt = [x + (hash(x, y, 31) - 0.5) * step, y + (hash(y, x, 32) - 0.5) * step];
      const density = Math.max(0, ...blobs.map((b) => 1 - Math.hypot(p[0] - b.c[0], p[1] - b.c[1]) / b.r));
      if (density <= 0 || hash(p[0], p[1], 33) > Math.pow(density, 0.5) * 0.9) continue;
      if (!inMap(p) || near(p, 0.6) || onRoad(p, 0.22) || wet(p, 0.28) || isPeak(p, 0.5)) continue;
      const h = hash(p[0], p[1], 34);
      trees.push({ x: p[0], y: p[1], s: 0.75 + hash(p[0], p[1], 35) * 0.5, kind: p[1] > 12.5 || p[1] < 2.2 ? (h < 0.7 ? 1 : 0) : h < 0.15 ? 1 : h < 0.25 ? 2 : 0 });
    }
  trees.sort((a, b) => b.y - a.y);

  // Collines : la lande de la Bruyère à l'ouest, et le sud.
  const hills: Hill[] = [];
  const hillZones: { x: [number, number]; y: [number, number] }[] = [
    { x: [0.7, 3.8], y: [6.6, 9.8] },
    { x: [3.6, 7.6], y: [1.9, 2.6] },
    { x: [12.4, 15.3], y: [7.0, 8.9] },
  ];
  hillZones.forEach((z, zi) => {
    for (let x = z.x[0]; x <= z.x[1]; x += 0.9)
      for (let y = z.y[0]; y <= z.y[1]; y += 0.7) {
        const p: Pt = [x + (hash(x, y, 40 + zi) - 0.5) * 0.4, y + (hash(y, x, 41) - 0.5) * 0.3];
        if (!inMap(p) || near(p, 0.7) || onRoad(p, 0.3) || wet(p, 0.4) || hash(p[0], p[1], 42) < 0.35) continue;
        if (trees.some((t) => Math.hypot(t.x - p[0], t.y - p[1]) < 0.35)) continue;
        hills.push({ x: p[0], y: p[1], s: 0.8 + hash(p[0], p[1], 43) * 0.5 });
      }
  });

  // Marais de Clairmarais : mares et roseaux.
  const ponds: Pond[] = [
    { x: 1.3, y: 3.1, rx: 0.45, ry: 0.22 },
    { x: 3.3, y: 2.9, rx: 0.32, ry: 0.16 },
    { x: 1.1, y: 6.5, rx: 0.3, ry: 0.15 },
  ].filter((p) => !near([p.x, p.y], 0.6));
  const reeds: Reed[] = [];
  for (let x = 0.7; x <= 4.4; x += 0.32)
    for (let y = 2.2; y <= 6.9; y += 0.3) {
      const p: Pt = [x + (hash(x, y, 50) - 0.5) * 0.25, y + (hash(y, x, 51) - 0.5) * 0.2];
      const nearWater = distToLine(p, river) < 0.8 || ponds.some((q) => Math.hypot(q.x - p[0], q.y - p[1]) < q.rx + 0.4);
      if (!nearWater || hash(p[0], p[1], 52) < 0.45 || near(p, 0.55) || onRoad(p, 0.2) || wet(p, 0.2)) continue;
      if (ponds.some((q) => Math.hypot((q.x - p[0]) / q.rx, (q.y - p[1]) / q.ry) < 1.1)) continue;
      reeds.push({ x: p[0], y: p[1], s: 0.8 + hash(p[0], p[1], 53) * 0.4 });
    }

  // Champs : une mosaïque de parcelles autour du beffroi.
  const fields: Field[] = [];
  for (let x = 1; x <= size; x++)
    for (let y = 1; y <= size; y++) {
      const d = fromBelfry([x, y]);
      if (d > 5.2 || d < 1.4) continue;
      for (let k = 0; k < 3; k++) {
        const c: Pt = [x + (hash(x, y, 60 + k) - 0.5) * 0.6, y + (hash(y, x, 63 + k) - 0.5) * 0.6];
        if (hash(c[0], c[1], 64) < 0.12 + (d - 1.4) * 0.09) continue;
        if (near(c, 0.62) || wet(c, 0.42) || onRoad(c, 0.24)) continue;
        if (trees.some((t) => Math.hypot(t.x - c[0], t.y - c[1]) < 0.4)) continue;
        if (fields.some((f) => Math.hypot(f.x - c[0], f.y - c[1]) < 0.36)) continue;
        fields.push({ x: c[0], y: c[1], w: 0.46 + hash(c[0], c[1], 65) * 0.32, h: 0.32 + hash(c[0], c[1], 66) * 0.24, a: -14 + hash(c[0], c[1], 67) * 28, tint: Math.floor(hash(c[0], c[1], 68) * 4) as 0 | 1 | 2 | 3 });
      }
    }

  return { river, lake, ponds, trees, peaks, hills, reeds, fields, roads, bridges };
}
