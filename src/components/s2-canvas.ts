// Saison 2 : dessin de la grande carte sur un canvas, repris de la maquette « Carte de la saison 2 »
// (régions peintes avec leurs motifs, frontières, centre tourbillonnant, sites hexagonaux, écus des seigneurs,
// châteaux à bannière, failles, forteresses, beffroi). Fonctions pures de dessin : l'écran gère la vue et les clics.
import { inCentre, RANKS, REGIONS, S2_BELFRY, S2_FORTRESSES, S2_FORTRESSES_OPEN, S2_RIFTS, S2_SIZE, type Rank, type Resource } from "@/lib/game/s2/map";
import type { S2WorldView } from "@/lib/game/types";

type RGB = [number, number, number];
const PAL: Record<string, { base: RGB; ink: RGB }> = {
  froid: { base: [196, 211, 219], ink: [110, 135, 150] },
  montagne: { base: [150, 142, 128], ink: [84, 76, 66] },
  plaine: { base: [181, 190, 120], ink: [118, 128, 64] },
  collines: { base: [164, 150, 98], ink: [104, 90, 50] },
  desert: { base: [218, 190, 133], ink: [168, 132, 72] },
  cote: { base: [150, 185, 160], ink: [70, 115, 105] },
  foret: { base: [92, 128, 86], ink: [44, 74, 46] },
};
const CENTRE: { base: RGB; ink: RGB } = { base: [74, 66, 92], ink: [155, 107, 214] };
const RES: Record<Resource, string> = { pierre: "#b9b2a3", fer: "#7f93a6", or: "#e0b84a" };
const BRASS = "#c9a35b";
const LORD = "#c4473a";
const RIFT_COLOR: Record<string, string> = { normale: "#9b6bd6", changeante: "#3fb8a0", abyssale: "#d0473a" };
const BANNERS = ["#d9534f", "#4f8fd9", "#e3c04d", "#5cb85c", "#b066d6", "#e07b39", "#3fb8b0", "#d65c9a", "#8b9dc3", "#c9d65c"];
const TIER: Record<Rank, number> = { hobereau: 1, baron: 2, comte: 3, duc: 4 };
const DISPLAY = '"Cinzel", Georgia, serif';
const BODY = '"EB Garamond", Georgia, serif';

const rgb = (a: RGB, k = 1) => `rgb(${a.map((v) => Math.round(Math.max(0, Math.min(255, v * k)))).join(",")})`;
function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const bannerOf = (allianceId: number | null, id: string) => {
  if (allianceId !== null) return BANNERS[allianceId % BANNERS.length];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return BANNERS[Math.abs(h) % BANNERS.length];
};

export interface View {
  /** Taille du canvas en pixels CSS (carré). */
  w: number;
  /** Case au centre de la vue, et nombre de cases visibles de côté. */
  cx: number;
  cy: number;
  span: number;
}
export interface Layers {
  sites: boolean;
  lords: boolean;
  zones: boolean;
  castles: boolean;
  convoys: boolean;
  free: boolean;
  grid: boolean;
}

export const cellSize = (v: View) => v.w / v.span;
export const toScreen = (v: View, x: number, y: number) => [(x - (v.cx - v.span / 2)) * cellSize(v), (y - (v.cy - v.span / 2)) * cellSize(v)] as const;
export const toCell = (v: View, px: number, py: number) => [Math.floor(v.cx - v.span / 2 + px / cellSize(v)), Math.floor(v.cy - v.span / 2 + py / cellSize(v))] as const;

function glyph(c: CanvasRenderingContext2D, k: string, x: number, y: number, X: number, Y: number, S: number) {
  const cx = X + S / 2;
  const cy = Y + S / 2;
  const r = hash(x, y, 7);
  const p = PAL[k];
  const ink = rgb(p.ink);
  const u = S / 10;
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = Math.max(1, S / 16);
  c.lineCap = "round";
  const px = cx + (hash(x, y, 3) - 0.5) * S * 0.35;
  const py = cy + (hash(x, y, 4) - 0.5) * S * 0.35;
  if (k === "montagne") {
    if (r < 0.55) {
      c.beginPath();
      c.moveTo(px - 3.5 * u, py + 2.5 * u);
      c.lineTo(px, py - 3 * u);
      c.lineTo(px + 3.5 * u, py + 2.5 * u);
      c.stroke();
      c.fillStyle = "rgba(240,240,236,.85)";
      c.beginPath();
      c.moveTo(px - 1.2 * u, py - 1.2 * u);
      c.lineTo(px, py - 3 * u);
      c.lineTo(px + 1.2 * u, py - 1.2 * u);
      c.fill();
    }
  } else if (k === "froid") {
    if (r < 0.3) {
      c.beginPath();
      c.moveTo(px, py - 3 * u);
      c.lineTo(px - 2 * u, py + 1.5 * u);
      c.lineTo(px + 2 * u, py + 1.5 * u);
      c.closePath();
      c.fill();
      c.fillRect(px - 0.4 * u, py + 1.5 * u, 0.8 * u, u);
    } else if (r < 0.6) {
      c.fillStyle = "rgba(255,255,255,.9)";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(cx + (hash(x, y, 10 + i) - 0.5) * S * 0.8, cy + (hash(x, y, 20 + i) - 0.5) * S * 0.8, u * 0.55, 0, 7);
        c.fill();
      }
    }
  } else if (k === "foret") {
    if (r < 0.8) {
      c.fillStyle = rgb(p.ink, 1.05);
      c.beginPath();
      c.arc(px, py - u * 0.6, 2.3 * u, 0, 7);
      c.fill();
      c.fillStyle = rgb(p.base, 1.25);
      c.beginPath();
      c.arc(px - 0.7 * u, py - 1.3 * u, 0.8 * u, 0, 7);
      c.fill();
      c.fillStyle = ink;
      c.fillRect(px - 0.35 * u, py + 1.4 * u, 0.7 * u, 1.2 * u);
    }
  } else if (k === "plaine") {
    if (r < 0.5)
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(px + i * 1.2 * u, py + 1.5 * u);
        c.lineTo(px + i * 1.6 * u, py - 1 * u);
        c.stroke();
      }
  } else if (k === "collines") {
    if (r < 0.55) {
      c.beginPath();
      c.arc(px, py + 2 * u, 3 * u, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
  } else if (k === "desert") {
    if (r < 0.45) {
      c.beginPath();
      c.moveTo(px - 3.5 * u, py + u);
      c.quadraticCurveTo(px - u, py - 2 * u, px + 3.5 * u, py + u);
      c.stroke();
    }
  } else if (k === "cote") {
    if (r < 0.4) {
      c.beginPath();
      c.moveTo(px - 2.5 * u, py);
      c.quadraticCurveTo(px - 1.2 * u, py - 1.5 * u, px, py);
      c.quadraticCurveTo(px + 1.2 * u, py + 1.5 * u, px + 2.5 * u, py);
      c.stroke();
    }
  }
}

export function drawSite(c: CanvasRenderingContext2D, x: number, y: number, S: number, t: Resource, places: number, mine = false, tier = 0) {
  const r = S * (places >= 8 ? 0.62 : places >= 6 ? 0.52 : 0.44);
  // Paliers de ma concession : anneaux de laiton (exploitation, manufacture), puis la bannière (grand domaine).
  if (mine && tier > 0) {
    c.strokeStyle = "rgba(201,163,91,.95)";
    c.lineWidth = Math.max(1, S / 14);
    for (let k = 1; k <= Math.min(2, tier); k++) {
      c.beginPath();
      c.arc(x, y, r + (S / 7) * k, 0, Math.PI * 2);
      c.stroke();
    }
  }
  c.fillStyle = RES[t];
  c.strokeStyle = mine ? "#8b1e1e" : "#1a1a1a";
  c.lineWidth = Math.max(1.2, S / (mine ? 5 : 10));
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = "#1a1a1a";
  c.font = `700 ${Math.max(9, S * 0.62)}px ${BODY}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(String(places), x, y + 0.5);
  if (mine && tier >= 3) {
    const fx = x + r * 0.7;
    const fy = y - r * 1.1;
    c.strokeStyle = "#1a1a1a";
    c.lineWidth = Math.max(1, S / 16);
    c.beginPath();
    c.moveTo(fx, fy + r * 0.9);
    c.lineTo(fx, fy - r * 0.5);
    c.stroke();
    c.fillStyle = "#8b1e1e";
    c.beginPath();
    c.moveTo(fx, fy - r * 0.5);
    c.lineTo(fx + r * 0.8, fy - r * 0.25);
    c.lineTo(fx, fy);
    c.closePath();
    c.fill();
  }
}

export function drawLord(c: CanvasRenderingContext2D, x: number, y: number, S: number, tier: number, weak = false) {
  const w = S * 0.34;
  const h = S * 0.42;
  c.globalAlpha = weak ? 0.55 : 1;
  c.fillStyle = LORD;
  c.strokeStyle = "#1a1a1a";
  c.lineWidth = Math.max(1, S / 12);
  c.beginPath();
  c.moveTo(x - w, y - h);
  c.lineTo(x + w, y - h);
  c.lineTo(x + w, y + h * 0.1);
  c.quadraticCurveTo(x + w, y + h * 0.8, x, y + h * 1.05);
  c.quadraticCurveTo(x - w, y + h * 0.8, x - w, y + h * 0.1);
  c.closePath();
  c.fill();
  c.stroke();
  c.strokeStyle = "rgba(255,230,200,.8)";
  c.lineWidth = Math.max(1, S / 14);
  c.beginPath();
  c.moveTo(x - w * 0.5, y - h * 0.4);
  c.lineTo(x + w * 0.5, y + h * 0.4);
  c.moveTo(x + w * 0.5, y - h * 0.4);
  c.lineTo(x - w * 0.5, y + h * 0.4);
  c.stroke();
  if (tier >= 3) {
    c.fillStyle = BRASS;
    c.strokeStyle = "#1a1a1a";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x - w * 0.8, y - h * 1.05);
    c.lineTo(x - w * 0.8, y - h * 1.6);
    c.lineTo(x - w * 0.4, y - h * 1.3);
    c.lineTo(x, y - h * 1.75);
    c.lineTo(x + w * 0.4, y - h * 1.3);
    c.lineTo(x + w * 0.8, y - h * 1.6);
    c.lineTo(x + w * 0.8, y - h * 1.05);
    c.closePath();
    c.fill();
    c.stroke();
    if (tier === 4) {
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(x, y - h * 1.75, 1.6, 0, 7);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

export function drawCastle(c: CanvasRenderingContext2D, x: number, y: number, S: number, col: string, me = false) {
  const k = me ? 1.25 : 1;
  const w = S * 0.36 * k;
  const h = S * 0.3 * k;
  c.fillStyle = "#ece4d2";
  c.strokeStyle = "#1a1a1a";
  c.lineWidth = Math.max(1, S / 12);
  c.beginPath();
  c.moveTo(x - w, y + h);
  c.lineTo(x - w, y - h * 0.5);
  c.lineTo(x - w * 0.6, y - h * 0.5);
  c.lineTo(x - w * 0.6, y - h * 0.1);
  c.lineTo(x - w * 0.2, y - h * 0.1);
  c.lineTo(x - w * 0.2, y - h * 0.5);
  c.lineTo(x + w * 0.2, y - h * 0.5);
  c.lineTo(x + w * 0.2, y - h * 0.1);
  c.lineTo(x + w * 0.6, y - h * 0.1);
  c.lineTo(x + w * 0.6, y - h * 0.5);
  c.lineTo(x + w, y - h * 0.5);
  c.lineTo(x + w, y + h);
  c.closePath();
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(x, y - h * 0.5);
  c.lineTo(x, y - h * 1.6);
  c.stroke();
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - h * 1.6);
  c.lineTo(x + w * 0.9, y - h * 1.3);
  c.lineTo(x, y - h * 1.0);
  c.closePath();
  c.fill();
}

export function drawRift(c: CanvasRenderingContext2D, x: number, y: number, S: number, col: string, sealed = false, dim = false) {
  c.save();
  c.translate(x, y);
  c.globalAlpha = dim ? 0.45 : 1;
  c.strokeStyle = col;
  c.lineWidth = Math.max(1.5, S / 7);
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    for (let t = 0; t <= 1; t += 0.04) {
      const a = t * Math.PI * 2.2 + i * 2.1;
      const r = t * S * 0.75;
      c.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    c.stroke();
  }
  c.fillStyle = "#120a1c";
  c.beginPath();
  c.arc(0, 0, S * 0.18, 0, 7);
  c.fill();
  if (sealed) {
    c.strokeStyle = "#e9e2d0";
    c.lineWidth = Math.max(1.2, S / 10);
    c.beginPath();
    c.moveTo(-S * 0.45, -S * 0.45);
    c.lineTo(S * 0.45, S * 0.45);
    c.moveTo(S * 0.45, -S * 0.45);
    c.lineTo(-S * 0.45, S * 0.45);
    c.stroke();
  }
  c.restore();
}

export function drawBelfry(c: CanvasRenderingContext2D, x: number, y: number, S: number) {
  const w = S * 0.32;
  c.fillStyle = "#d8cfb8";
  c.strokeStyle = "#1a1a1a";
  c.lineWidth = Math.max(1, S / 12);
  c.beginPath();
  c.moveTo(x - w, y + S * 0.9);
  c.lineTo(x - w * 0.75, y - S * 0.55);
  c.lineTo(x + w * 0.75, y - S * 0.55);
  c.lineTo(x + w, y + S * 0.9);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = BRASS;
  c.beginPath();
  c.moveTo(x - w * 1.05, y - S * 0.55);
  c.lineTo(x, y - S * 1.35);
  c.lineTo(x + w * 1.05, y - S * 0.55);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = "#1a1a1a";
  c.beginPath();
  c.arc(x, y - S * 0.15, w * 0.38, 0, 7);
  c.fill();
}

/** Camp de bandits : une tente rayée et un feu ; pâle tant qu'il n'est pas installé. */
export function drawCamp(c: CanvasRenderingContext2D, x: number, y: number, S: number, dim = false) {
  const w = S * 0.36;
  c.globalAlpha = dim ? 0.45 : 1;
  c.fillStyle = "#7a5230";
  c.strokeStyle = "#1e1a16";
  c.lineWidth = Math.max(1, S / 14);
  c.beginPath();
  c.moveTo(x - w, y + w * 0.7);
  c.lineTo(x, y - w * 0.8);
  c.lineTo(x + w, y + w * 0.7);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = "#e0c070";
  c.beginPath();
  c.moveTo(x - w * 0.18, y + w * 0.7);
  c.lineTo(x, y - w * 0.1);
  c.lineTo(x + w * 0.18, y + w * 0.7);
  c.closePath();
  c.fill();
  c.fillStyle = "#e2572b";
  c.beginPath();
  c.arc(x + w * 0.95, y + w * 0.6, Math.max(1.5, S * 0.08), 0, 7);
  c.fill();
  c.globalAlpha = 1;
}

export function drawFort(c: CanvasRenderingContext2D, x: number, y: number, S: number, dim = false) {
  const w = S * 0.42;
  c.globalAlpha = dim ? 0.45 : 1;
  c.fillStyle = "#5a5363";
  c.strokeStyle = "#e9e2d0";
  c.lineWidth = Math.max(1, S / 12);
  c.beginPath();
  c.rect(x - w, y - w * 0.6, w * 2, w * 1.4);
  c.fill();
  c.stroke();
  c.fillStyle = BRASS;
  c.beginPath();
  c.moveTo(x - w * 0.5, y - w * 0.6);
  c.lineTo(x, y - w * 1.3);
  c.lineTo(x + w * 0.5, y - w * 0.6);
  c.closePath();
  c.fill();
  c.globalAlpha = 1;
}

/** Centre de chaque région (moyenne de ses cases), pour écrire son nom. */
const labelCache = new WeakMap<number[][], { k: number; x: number; y: number }[]>();
function regionLabels(regions: number[][]) {
  const hit = labelCache.get(regions);
  if (hit) return hit;
  const acc = REGIONS.map(() => ({ x: 0, y: 0, n: 0 }));
  regions.forEach((row, y) => row.forEach((k, x) => {
    if (k >= 0 && acc[k]) {
      acc[k].x += x;
      acc[k].y += y;
      acc[k].n++;
    }
  }));
  const out = acc.flatMap((a, k) => (a.n ? [{ k, x: a.x / a.n, y: a.y / a.n }] : []));
  labelCache.set(regions, out);
  return out;
}

export interface DrawInput {
  world: S2WorldView;
  now: number;
  view: View;
  layers: Layers;
  /** Mes concessions : site → palier (0 campement … 3 grand domaine). */
  mineSites: Map<number, number>;
  routes: [number, number][][];
  myCastle: [number, number] | null;
  picked: [number, number] | null;
  hover: [number, number] | null;
  isFree?: (x: number, y: number) => boolean;
}

export function drawMap(c: CanvasRenderingContext2D, d: DrawInput) {
  const { world, view: v, layers } = d;
  const S = cellSize(v);
  const N = S2_SIZE;
  const at = (x: number, y: number) => toScreen(v, x, y);
  const mid = (x: number, y: number) => {
    const [px, py] = at(x, y);
    return [px + S / 2, py + S / 2] as const;
  };
  const visible = (x: number, y: number, pad = 2) => Math.abs(x + 0.5 - v.cx) <= v.span / 2 + pad && Math.abs(y + 0.5 - v.cy) <= v.span / 2 + pad;
  const reg = world.map.regions;
  // Le tourbillon prime sur les régions enregistrées (une carte tirée avant l'anneau des forteresses).
  const regionAt = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? undefined : inCentre([x, y]) ? -1 : reg[y]?.[x]);

  // Mer et cadre.
  c.fillStyle = "#2b4a5a";
  c.fillRect(0, 0, v.w, v.w);
  // Cases.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!visible(x, y, 1)) continue;
      const k = regionAt(x, y)!;
      const p = k < 0 ? CENTRE : PAL[REGIONS[k]?.id ?? "plaine"];
      const [px, py] = at(x, y);
      c.fillStyle = rgb(p.base, 0.93 + hash(x, y, 1) * 0.12);
      c.fillRect(px, py, S + 0.6, S + 0.6);
    }
  // Le centre : un tourbillon violet cerclé de laiton.
  const [bx, by] = mid(S2_BELFRY[0], S2_BELFRY[1]);
  const g = c.createRadialGradient(bx, by, S * 0.5, bx, by, S * 7.5);
  g.addColorStop(0, "rgba(155,107,214,.55)");
  g.addColorStop(1, "rgba(155,107,214,0)");
  c.fillStyle = g;
  c.beginPath();
  c.arc(bx, by, S * 7.5, 0, 7);
  c.fill();
  c.strokeStyle = "rgba(201,163,91,.55)";
  c.setLineDash([S * 0.4, S * 0.3]);
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(bx, by, S * 7.5, 0, 7);
  c.stroke();
  c.setLineDash([]);
  // Motifs du terrain, hors des cases occupées.
  const occ = new Set<string>([
    ...world.map.sites.map((s) => `${s.pos[0]},${s.pos[1]}`),
    ...world.lords.map((l) => `${l.pos[0]},${l.pos[1]}`),
    ...world.castles.map((x) => `${x.pos[0]},${x.pos[1]}`),
    ...S2_FORTRESSES.map((f) => `${f[0]},${f[1]}`),
  ]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = regionAt(x, y)!;
      if (k < 0 || !visible(x, y, 1) || occ.has(`${x},${y}`)) continue;
      const [px, py] = at(x, y);
      glyph(c, REGIONS[k].id, x, y, px, py, S);
    }
  if (layers.grid) {
    c.strokeStyle = "rgba(0,0,0,.16)";
    c.lineWidth = 0.6;
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const [x0, y0] = at(i, 0);
      const [x1, y1] = at(i, N);
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      const [a0, b0] = at(0, i);
      const [a1, b1] = at(N, i);
      c.moveTo(a0, b0);
      c.lineTo(a1, b1);
    }
    c.stroke();
  }
  // Frontières des régions.
  c.strokeStyle = "rgba(30,26,22,.75)";
  c.lineWidth = Math.max(1.4, S / 8);
  c.beginPath();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!visible(x, y, 1)) continue;
      const k = regionAt(x, y);
      if (x + 1 < N && regionAt(x + 1, y) !== k) {
        const [px, py] = at(x + 1, y);
        c.moveTo(px, py);
        c.lineTo(px, py + S);
      }
      if (y + 1 < N && regionAt(x, y + 1) !== k) {
        const [px, py] = at(x, y + 1);
        c.moveTo(px, py);
        c.lineTo(px + S, py);
      }
    }
  c.stroke();
  const [fx, fy] = at(0, 0);
  c.strokeStyle = "rgba(20,18,16,.9)";
  c.lineWidth = 2;
  c.strokeRect(fx, fy, N * S, N * S);
  // Cases libres pour poser un château.
  if (layers.free && d.isFree) {
    c.fillStyle = "rgba(255,255,255,.45)";
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (!visible(x, y, 0) || !d.isFree(x, y)) continue;
        const [px, py] = mid(x, y);
        c.beginPath();
        c.arc(px, py, Math.max(2, S * 0.14), 0, 7);
        c.fill();
      }
  }
  // Zones des seigneurs et leurs places sur les sites.
  if (layers.lords && layers.zones) {
    for (const l of world.lords) {
      const [px, py] = mid(l.pos[0], l.pos[1]);
      c.fillStyle = "rgba(196,71,58,.10)";
      c.strokeStyle = "rgba(150,40,30,.55)";
      c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath();
      c.arc(px, py, (RANKS[l.rank].zone + 0.5) * S, 0, 7);
      c.fill();
      c.stroke();
      c.setLineDash([]);
      const ml = world.map.lords.find((x) => x.id === l.id);
      for (const i of ml?.conc ?? []) {
        const st = world.map.sites[i];
        if (!st) continue;
        const [sx, sy] = mid(st.pos[0], st.pos[1]);
        c.strokeStyle = "rgba(150,40,30,.9)";
        c.lineWidth = Math.max(1, S / 12);
        c.setLineDash([S * 0.15, S * 0.2]);
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(sx, sy);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }
  // Mes routes de convoi.
  if (d.myCastle) {
    const [cx0, cy0] = mid(d.myCastle[0], d.myCastle[1]);
    c.lineWidth = Math.max(1.2, S / 9);
    c.setLineDash([S * 0.35, S * 0.25]);
    c.strokeStyle = "#8b1e1e";
    for (const r of d.routes) {
      const [sx, sy] = mid(r[0][0], r[0][1]);
      c.beginPath();
      c.moveTo(cx0, cy0);
      c.lineTo(sx, sy);
      c.stroke();
    }
    c.setLineDash([]);
    // Routes commerciales actives : pointillés dorés jusqu'à l'autre bout.
    c.strokeStyle = "#c9a35b";
    c.setLineDash([S * 0.15, S * 0.25]);
    for (const t of world.trades ?? []) {
      if (!t.active) continue;
      const [tx, ty] = mid(t.pos[0], t.pos[1]);
      c.beginPath();
      c.moveTo(cx0, cy0);
      c.lineTo(tx, ty);
      c.stroke();
    }
    c.setLineDash([]);
  }
  // Noms des régions.
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `${Math.max(12, S * 1.05)}px ${DISPLAY}`;
  for (const lab of regionLabels(reg)) {
    const [lx, ly] = mid(lab.x, lab.y);
    const name = REGIONS[lab.k].name;
    c.lineWidth = 3;
    c.strokeStyle = "rgba(245,240,225,.75)";
    c.strokeText(name, lx, ly);
    c.fillStyle = "#2a221a";
    c.fillText(name, lx, ly);
  }
  // Lieux.
  if (layers.sites)
    for (const s of world.map.sites) {
      if (!visible(s.pos[0], s.pos[1])) continue;
      const [px, py] = mid(s.pos[0], s.pos[1]);
      drawSite(c, px, py, S, s.type, s.places, d.mineSites.has(s.id), d.mineSites.get(s.id) ?? 0);
    }
  if (layers.lords)
    for (const l of world.lords) {
      if (!visible(l.pos[0], l.pos[1])) continue;
      const [px, py] = mid(l.pos[0], l.pos[1]);
      drawLord(c, px, py, S * (0.85 + TIER[l.rank] * 0.12), TIER[l.rank], l.home < l.companies);
    }
  S2_RIFTS.forEach((f) => {
    const [px, py] = mid(f.pos[0], f.pos[1]);
    drawRift(c, px, py, S, RIFT_COLOR[f.id] ?? "#9b6bd6", f.id === "abyssale", f.id !== "normale");
  });
  S2_FORTRESSES.forEach((f, i) => {
    const [px, py] = mid(f[0], f[1]);
    drawFort(c, px, py, S, i >= S2_FORTRESSES_OPEN);
  });
  drawBelfry(c, bx, by, S);
  if (layers.castles)
    for (const k of world.castles) {
      if (!visible(k.pos[0], k.pos[1])) continue;
      const [px, py] = mid(k.pos[0], k.pos[1]);
      drawCastle(c, px, py, S, k.me ? "#8b1e1e" : bannerOf(k.allianceId, k.id), k.me);
    }
  // Convois en route.
  if (layers.convoys)
    for (const cv of world.convoys) {
      const f = Math.min(1, Math.max(0, (d.now - cv.depart) / Math.max(1, cv.arrive - cv.depart)));
      const [ax, ay] = mid(cv.from[0], cv.from[1]);
      const [zx, zy] = mid(cv.to[0], cv.to[1]);
      const x = ax + (zx - ax) * f;
      const y = ay + (zy - ay) * f;
      c.fillStyle = RES[cv.res];
      // Mes convois cerclés de rouge, ceux de l'alliance de bleu, les autres de noir (blanc s'ils peuvent être attaqués).
      c.strokeStyle = cv.mine ? "#8b1e1e" : cv.ally ? "#2f6db3" : cv.why ? "#1a1a1a" : "#f5f0e1";
      c.lineWidth = cv.mine || cv.ally || !cv.why ? 2 : 1;
      c.beginPath();
      c.arc(x, y, S * (cv.size === "grosse" ? 0.3 : cv.size === "moyenne" ? 0.22 : 0.16), 0, 7);
      c.fill();
      c.stroke();
    }
  // Embuscades : un arc, rouge si elle est ennemie.
  for (const a of world.ambushes ?? []) {
    if (!visible(a.pos[0], a.pos[1])) continue;
    const [px, py] = mid(a.pos[0], a.pos[1]);
    c.globalAlpha = a.from > d.now ? 0.5 : 1;
    c.strokeStyle = a.mine ? "#8b1e1e" : a.ally ? "#2f6db3" : "#c4473a";
    c.lineWidth = Math.max(1.5, S / 9);
    c.beginPath();
    c.arc(px - S * 0.1, py, S * 0.3, -1.2, 1.2);
    c.moveTo(px - S * 0.1 + Math.cos(-1.2) * S * 0.3, py + Math.sin(-1.2) * S * 0.3);
    c.lineTo(px - S * 0.1 + Math.cos(1.2) * S * 0.3, py + Math.sin(1.2) * S * 0.3);
    c.moveTo(px - S * 0.3, py);
    c.lineTo(px + S * 0.3, py);
    c.stroke();
    c.globalAlpha = 1;
  }
  // Expéditions des seigneurs : un trait pointillé du fief vers la cible, et la troupe qui rentre.
  for (const x of world.expeditions ?? []) {
    const [ax, ay] = mid(x.from[0], x.from[1]);
    const [zx, zy] = mid(x.to[0], x.to[1]);
    c.strokeStyle = x.mine ? "#c4473a" : "rgba(196,71,58,.6)";
    c.lineWidth = Math.max(1, S / 12);
    c.setLineDash([S * 0.25, S * 0.2]);
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(zx, zy);
    c.stroke();
    c.setLineDash([]);
    const f = Math.min(1, Math.max(0, (d.now - x.at) / Math.max(1, x.back - x.at)));
    const k = f < 0.5 ? f * 2 : 2 - f * 2;
    const px = ax + (zx - ax) * k;
    const py = ay + (zy - ay) * k;
    c.fillStyle = "#c4473a";
    c.strokeStyle = "#1a1a1a";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(px, py - S * 0.25);
    c.lineTo(px + S * 0.2, py);
    c.lineTo(px, py + S * 0.25);
    c.lineTo(px - S * 0.2, py);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // Camps de bandits.
  for (const k of world.camps ?? []) {
    if (!visible(k.pos[0], k.pos[1])) continue;
    const [px, py] = mid(k.pos[0], k.pos[1]);
    drawCamp(c, px, py, S, k.from > d.now);
  }
  // Coordonnées en bord de vue.
  c.fillStyle = "rgba(233,226,208,.85)";
  c.font = `${Math.max(9, Math.min(13, S * 0.55))}px ${BODY}`;
  for (let i = 0; i < N; i += 5) {
    const [px] = mid(i, 0);
    const [, py] = mid(0, i);
    c.fillText(String(i), px, 8);
    c.fillText(String(i), 10, py);
  }
  // Survol et sélection.
  for (const [cell, col] of [[d.hover, "rgba(255,255,255,.8)"], [d.picked, "#fff"]] as const) {
    if (!cell) continue;
    const [px, py] = at(cell[0], cell[1]);
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.strokeRect(px + 1, py + 1, S - 2, S - 2);
  }
}
