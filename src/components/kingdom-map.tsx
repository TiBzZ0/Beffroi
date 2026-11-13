"use client";

// T1 : la carte du royaume dessinée comme une carte ancienne. Décor calculé une fois, lieux et armées par-dessus.
import { memo, useMemo } from "react";
import { TRAVEL_BASE_MIN, TRAVEL_PER_CELL_MIN } from "@/lib/game/config";
import { buildTerrain, type Pt, type Terrain } from "@/lib/game/map-terrain";
import type { EventView } from "@/lib/game/types";

export interface BoardPlace {
  id: string;
  pos: Pt;
  kind: "me" | "player" | "lord";
  name: string;
  /** Couleur d'alliance (toit des joueurs). */
  color?: string;
  /** Taille du domaine : hameau, village, manoir. */
  tier: 1 | 2 | 3;
  difficulty?: number;
  aggressive?: boolean;
  blazon?: string;
  shielded?: boolean;
  curfew?: boolean;
  allied?: boolean;
  atWar?: boolean;
}

export interface BoardMarch {
  id: string;
  from: Pt;
  to: Pt;
  /** Position sur la route : 0 au domaine, 1 à la cible. */
  f: number;
  status: "out" | "back" | "camp";
}

interface BoardProps {
  size: number;
  belfry: Pt;
  fortress: Pt;
  fortressName: string;
  fortressColor?: string;
  stagesDone: number;
  stagesTotal: number;
  places: BoardPlace[];
  event: EventView | null;
  now: number;
  marches: BoardMarch[];
  incoming: { id: string; from: Pt | null }[];
  picked: string | null;
  onPick: (id: string | null) => void;
  /** U1 : toucher une armée ouvre sa ligne dans le tableau des mouvements. */
  onMarch?: (id: string) => void;
  showNames: boolean;
  travel: { to: Pt; label: string } | null;
  meColor?: string;
  halls?: BoardHall[];
}

/** Halle de guilde (ou loge) : son dessin grandit avec ses étapes. */
export interface BoardHall {
  id: number;
  pos: Pt;
  name: string;
  color?: string;
  stage: number;
  maxStages: number;
  lodge: boolean;
  mine: boolean;
}

/** Une halle à colombages : échafaudage à la fondation, puis nef, tours et bannière à mesure des étapes. */
function HallGlyph({ h }: { h: BoardHall }) {
  const f = h.maxStages > 0 ? Math.max(0, h.stage) / h.maxStages : 0;
  const w = 9 + Math.round(f * 7);
  const towers = h.lodge ? (h.stage >= 3 ? 1 : 0) : h.stage >= 7 ? 2 : h.stage >= 4 ? 1 : 0;
  return (
    <g>
      <ellipse cy="10" rx={w + 5} ry="4" className="g-shadow" />
      {h.stage <= 0 ? (
        <g>
          <rect x={-w} y="2" width={2 * w} height="7" className="g-stone" />
          <path d={`M${-w + 2} 2 V-10 M${w - 2} 2 V-10 M${-w + 2} -10 H${w - 2} M${-w + 2} -3 L${w - 2} -10`} className="g-pole" />
        </g>
      ) : (
        <g>
          {towers >= 1 && (
            <g transform={`translate(${-w - 1} 0)`}>
              <rect x="-4" y="-12" width="8" height="21" className="g-stone" />
              <path d="M-5 -12 L0 -21 L5 -12 Z" className="g-roof" />
            </g>
          )}
          {towers >= 2 && (
            <g transform={`translate(${w + 1} 0)`}>
              <rect x="-4" y="-12" width="8" height="21" className="g-stone" />
              <path d="M-5 -12 L0 -21 L5 -12 Z" className="g-roof" />
            </g>
          )}
          <rect x={-w} y="-3" width={2 * w} height="12" className="g-wall" />
          <path d={`M${-w - 2} -3 L${-w + 4} -12 L${w - 4} -12 L${w + 2} -3 Z`} className="g-roof" />
          <circle cy="2" r="2.4" className="g-window" />
          <path d="M-2.4 9 V5.5 Q0 3.5 2.4 5.5 V9 Z" className="g-door" />
          <path d="M0 -12 V-24" className="g-pole" />
          <path d="M0 -24 L10 -21.5 L0 -19 Z" className="g-banner" />
        </g>
      )}
    </g>
  );
}

const C = 40;
const PAD = 14;
const BAND = 40;

/** Contour, détails et symboles réutilisés partout sur la carte. */
function Glyphs() {
  return (
    <defs>
      <pattern id="mg-furrows" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
        <line x1="0" y1="0" x2="0" y2="5" className="g-furrow" />
      </pattern>
      <pattern id="mg-specks" width="37" height="41" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="7" r="0.6" className="g-speck" />
        <circle cx="23" cy="15" r="0.45" className="g-speck" />
        <circle cx="31" cy="33" r="0.7" className="g-speck" />
        <circle cx="12" cy="29" r="0.4" className="g-speck" />
      </pattern>
      <radialGradient id="mg-vignette" cx="50%" cy="50%" r="72%">
        <stop offset="62%" className="g-vignette-in" />
        <stop offset="100%" className="g-vignette-out" />
      </radialGradient>

      {/* Végétation et relief */}
      <g id="mg-tree0">
        <path d="M0 2v5" className="g-trunk" />
        <circle cy="-1.5" r="5" className="g-tree" />
        <circle cx="-1.7" cy="-3.2" r="1.9" className="g-tree-hi" />
      </g>
      <g id="mg-tree1">
        <path d="M0 3v3.5" className="g-trunk" />
        <path d="M0 -9.5 L4.4 -2.6 L2.6 -2.6 L5.6 2.8 L-5.6 2.8 L-2.6 -2.6 L-4.4 -2.6 Z" className="g-pine" />
      </g>
      <g id="mg-tree2">
        <path d="M0 2v5" className="g-trunk" />
        <path d="M-5.5 3 Q-6.5 -5.5 0 -6.5 Q6.5 -5.5 5.5 3 Z" className="g-tree" />
        <path d="M-2.5 -3 q-1 3 0 5 M1.8 -3.5 q1 3 0 5.5" className="g-ink-thin" />
      </g>
      <g id="mg-peak">
        <path d="M-15 9 L-4 -12 L1 -5 L5 -9 L15 9 Z" className="g-rock" />
        <path d="M-4 -12 L-1.5 -3 L-6 9 L-15 9 Z" className="g-rock-shade" />
        <path d="M5 -9 L3 -1 L6.5 9" className="g-ink-thin" />
        <path d="M-15 9 L-4 -12 L1 -5 L5 -9 L15 9" className="g-outline" />
      </g>
      <g id="mg-snow">
        <path d="M-4 -12 L-7 -6.2 L-5 -7 L-3.3 -5.2 L-1.6 -7.6 Z M5 -9 L3.4 -6 L5 -6.5 L6.7 -5.8 Z" className="g-snow" />
      </g>
      <g id="mg-hill">
        <path d="M-11 5 Q-2 -8 11 5 Z" className="g-hill" />
        <path d="M-4 -1 l-1.6 4.5 M0 -2 l-0.8 5" className="g-ink-thin" />
      </g>
      <g id="mg-reed">
        <path d="M0 3 L-1.3 -4 M0 3 L1.6 -3 M0 3 L0.2 -5.5" className="g-reed" />
        <ellipse cx="0.2" cy="-6" rx="0.8" ry="1.6" className="g-reed-head" />
      </g>

      {/* Domaines des joueurs : hameau, village, manoir. Le toit prend la couleur de l'alliance. */}
      <g id="mg-house">
        <rect x="3.5" y="-9.5" width="2.6" height="6" className="g-wall" />
        <rect x="-7" y="-1" width="14" height="10" className="g-wall" />
        <path d="M-9.5 0 L0 -10 L9.5 0 Z" className="g-roof" />
        <rect x="-1.6" y="3.4" width="3.2" height="5.6" rx="1.4" className="g-door" />
        <rect x="3" y="2" width="2.4" height="2.4" className="g-window" />
      </g>
      <g id="mg-house1">
        <ellipse cy="9.5" rx="12" ry="3" className="g-shadow" />
        <use href="#mg-house" />
      </g>
      <g id="mg-house2">
        <ellipse cy="10" rx="15" ry="3.4" className="g-shadow" />
        <use href="#mg-house" transform="translate(-6 -3) scale(0.8)" />
        <use href="#mg-house" transform="translate(4 1)" />
        <use href="#mg-tree0" transform="translate(-11 4) scale(0.8)" />
      </g>
      <g id="mg-house3">
        <ellipse cy="10.5" rx="17" ry="3.6" className="g-shadow" />
        <path d="M-16 9 Q0 15 16 9" className="g-palisade" />
        <rect x="-12" y="-9" width="7" height="18" className="g-wall" />
        <path d="M-13.5 -9 L-8.5 -18 L-3.5 -9 Z" className="g-roof" />
        <rect x="-9.6" y="-4" width="2" height="3.5" className="g-window" />
        <use href="#mg-house" transform="translate(4 0)" />
      </g>

      {/* Seigneurs : manoir, donjon, château, grand château. */}
      <g id="mg-pennant">
        <path d="M0 0 V-8" className="g-pole" />
        <path d="M0 -8 L8.5 -6 L0 -4 Z" className="g-pennant" />
      </g>
      <g id="mg-lord1">
        <ellipse cy="10" rx="13" ry="3" className="g-shadow" />
        <rect x="-9" y="-1" width="18" height="10" className="g-stone" />
        <path d="M-11 0 L-6 -6 L6 -6 L11 0 Z" className="g-lroof" />
        <rect x="-2.2" y="-12" width="4.4" height="7" className="g-stone" />
        <path d="M-3.2 -12 L0 -17 L3.2 -12 Z" className="g-lroof" />
        <path d="M-2 9 V4.5 Q0 2 2 4.5 V9 Z" className="g-door" />
        <rect x="-6.5" y="2.5" width="2" height="3" className="g-window" />
        <rect x="4.5" y="2.5" width="2" height="3" className="g-window" />
      </g>
      <g id="mg-merlons">
        <path d="M-6 0 v-3 h2.4 v3 h2.4 v-3 h2.4 v3 h2.4 v-3 h2.4 v3" className="g-stone" />
      </g>
      <g id="mg-lord2">
        <ellipse cy="10" rx="13" ry="3.2" className="g-shadow" />
        <path d="M-12 10 Q0 3 12 10 Z" className="g-mound" />
        <rect x="-6" y="-11" width="12" height="19" className="g-stone" />
        <rect x="-6" y="-11" width="4" height="19" className="g-stone-shade" />
        <use href="#mg-merlons" transform="translate(0 -11)" />
        <path d="M-2 8 V3 Q0 0.5 2 3 V8 Z" className="g-door" />
        <rect x="-0.6" y="-7" width="1.4" height="4" className="g-window" />
        <rect x="-6" y="-11" width="12" height="19" className="g-outline" />
        <use href="#mg-pennant" transform="translate(3 -14)" />
      </g>
      <g id="mg-tower">
        <rect x="-3.5" y="-10" width="7" height="19" className="g-stone" />
        <path d="M-4.6 -10 L0 -17 L4.6 -10 Z" className="g-lroof" />
        <rect x="-0.6" y="-5" width="1.3" height="3.4" className="g-window" />
      </g>
      <g id="mg-lord3">
        <ellipse cy="10.5" rx="16" ry="3.4" className="g-shadow" />
        <path d="M-15 10.5 Q0 3 15 10.5 Z" className="g-mound" />
        <rect x="-9" y="-2" width="18" height="11" className="g-stone" />
        <use href="#mg-merlons" transform="translate(-1.2 -2) scale(1.4 1)" />
        <path d="M-2.4 9 V4 Q0 1 2.4 4 V9 Z" className="g-door" />
        <use href="#mg-tower" transform="translate(-10.5 0)" />
        <use href="#mg-tower" transform="translate(10.5 0)" />
        <use href="#mg-pennant" transform="translate(10.5 -17)" />
      </g>
      <g id="mg-lord4">
        <ellipse cy="11" rx="18" ry="3.6" className="g-shadow" />
        <path d="M-17 11 Q0 2 17 11 Z" className="g-mound" />
        <rect x="-11" y="0" width="22" height="10" className="g-stone" />
        <use href="#mg-merlons" transform="translate(-1.6 0) scale(1.75 1)" />
        <rect x="-5" y="-15" width="10" height="16" className="g-stone" />
        <rect x="-5" y="-15" width="3.4" height="16" className="g-stone-shade" />
        <use href="#mg-merlons" transform="translate(-0.8 -15) scale(0.85 1)" />
        <rect x="-0.7" y="-11" width="1.4" height="4" className="g-window" />
        <path d="M-2.6 10 V5 Q0 2 2.6 5 V10 Z" className="g-door" />
        <use href="#mg-tower" transform="translate(-13 1)" />
        <use href="#mg-tower" transform="translate(13 1)" />
        <use href="#mg-pennant" transform="translate(0 -18) scale(1.25)" />
      </g>
      <g id="mg-fortress">
        <path d="M-19 11 L-13 2 L-8 5 L-2 -1 L5 4 L11 0 L19 11 Z" className="g-rock" />
        <path d="M-19 11 L-13 2 L-8 5 L-6 11 Z M5 4 L11 0 L8 11 Z" className="g-rock-shade" />
        <g transform="translate(0 -4)">
          <rect x="-11" y="-2" width="22" height="9" className="g-stone" />
          <use href="#mg-merlons" transform="translate(-1.6 -2) scale(1.75 1)" />
          <path d="M-2.6 7 V2.5 Q0 0 2.6 2.5 V7 Z" className="g-door" />
          <use href="#mg-tower" transform="translate(-12 -1) scale(1.05)" />
          <use href="#mg-tower" transform="translate(12 -1) scale(1.05)" />
          <rect x="-4.5" y="-14" width="9" height="13" className="g-stone" />
          <use href="#mg-merlons" transform="translate(-0.7 -14) scale(0.75 1)" />
          <path d="M0 -17 V-28" className="g-pole" />
          <path d="M0 -28 L12 -25 L0 -22 Z" className="g-banner" />
        </g>
      </g>

      {/* Événements */}
      <g id="mg-horse">
        <ellipse cx="0" cy="0" rx="4.4" ry="2.6" className="g-horse" />
        <path d="M3 -1 L6 -5.5 L7.6 -4.6 L5.4 -0.6" className="g-horse" />
        <path d="M-3 1.5 v4.5 M-1 2 v4 M2 2 v4 M3.6 1.5 v4.5" className="g-leg" />
      </g>
      <g id="mg-wagon">
        <ellipse cy="9" rx="16" ry="2.6" className="g-shadow" />
        <rect x="-10" y="-3" width="13" height="6.5" className="g-wood" />
        <path d="M-10 -3 Q-3.5 -13 3 -3 Z" className="g-canvas" />
        <circle cx="-7" cy="5" r="3.2" className="g-wheel" />
        <circle cx="0.5" cy="5" r="3.2" className="g-wheel" />
        <path d="M3 1 H7" className="g-leg" />
        <use href="#mg-horse" transform="translate(11 0)" />
      </g>
      <g id="mg-carriage">
        <ellipse cy="9" rx="17" ry="2.6" className="g-shadow" />
        <rect x="-11" y="-7" width="14" height="10.5" rx="3" className="g-royal" />
        <rect x="-8" y="-4.5" width="3.6" height="4" className="g-window" />
        <rect x="-3" y="-4.5" width="3.6" height="4" className="g-window" />
        <path d="M-6.5 -8 V-11.5 L-4.5 -9.6 L-2 -12.5 L0.5 -9.6 L2.5 -11.5 V-8 Z" className="g-gold" />
        <circle cx="-8" cy="5" r="3.2" className="g-wheel" />
        <circle cx="0.5" cy="5" r="3.2" className="g-wheel" />
        <path d="M3 1 H7" className="g-leg" />
        <use href="#mg-horse" transform="translate(11 0)" />
      </g>
      <g id="mg-colossus">
        <circle r="19" className="g-danger-ring" />
        <ellipse cy="13" rx="12" ry="3" className="g-shadow" />
        <path d="M-6 13 L-4.5 4 L-1 4 L-1.5 13 Z M6 13 L4.5 4 L1 4 L1.5 13 Z" className="g-giant" />
        <path d="M-8 -9 L8 -9 L6 5 L-6 5 Z" className="g-giant" />
        <path d="M-8 -8 L-13 3 L-10.5 4.5 L-6 -3 Z M8 -8 L13 3 L10.5 4.5 L6 -3 Z" className="g-giant" />
        <rect x="-4" y="-17" width="8" height="8" rx="2" className="g-giant" />
        <circle cx="-1.7" cy="-13.5" r="1.1" className="g-eye" />
        <circle cx="1.7" cy="-13.5" r="1.1" className="g-eye" />
        <path d="M-4 -4 L2 -1 M-2 1 L3 3" className="g-ink-thin" />
      </g>
      <g id="mg-mine">
        <ellipse cy="10" rx="15" ry="2.8" className="g-shadow" />
        <path d="M-14 10 Q-12 -6 0 -9 Q12 -6 14 10 Z" className="g-rock" />
        <path d="M-5 10 V2 Q0 -4 5 2 V10 Z" className="g-dark" />
        <path d="M-6 10 V1.5 Q0 -6 6 1.5 V10" className="g-timber" />
        <circle cx="9" cy="5" r="1.8" className="g-gold" />
        <circle cx="-9.5" cy="6.5" r="1.4" className="g-gold" />
        <path d="M10 -6 l0.8 2.2 l2.2 0.8 l-2.2 0.8 l-0.8 2.2 l-0.8 -2.2 l-2.2 -0.8 l2.2 -0.8 Z" className="g-gold" />
      </g>
      <g id="mg-tents">
        <ellipse cy="9" rx="15" ry="2.8" className="g-shadow" />
        <path d="M-13 8 L-5.5 -7 L2 8 Z" className="g-tent" />
        <path d="M-5.5 -7 L-5.5 8" className="g-ink-thin" />
        <path d="M1 8 L7 -2 L13 8 Z" className="g-tent" />
        <path d="M7 -12 V-2" className="g-pole" />
        <path d="M7 -12 L13 -10.5 L7 -9 Z" className="g-blackflag" />
        <path d="M-1 8 q-1.5 -3 0 -6 q0.6 2 1.6 2.4 q0.4 -1.4 1.4 -2.4 q1.8 3 0 6 Z" className="g-fire" />
      </g>
      <g id="mg-treasure">
        <path d="M-8 -8 L8 8 M8 -8 L-8 8" className="g-x" />
        <g transform="translate(9 6)">
          <rect x="-5" y="-2" width="10" height="6" className="g-wood" />
          <path d="M-5 -2 Q0 -7 5 -2 Z" className="g-wood" />
          <path d="M-5 -1 H5 M0 -4.5 V4" className="g-goldline" />
        </g>
      </g>
      <g id="mg-swords">
        <path d="M-8 -8 L7 7 M8 -8 L-7 7" className="g-blade" />
        <path d="M-6.5 3.5 L-3.5 6.5 M6.5 3.5 L3.5 6.5" className="g-hilt" />
      </g>
      <g id="mg-flag">
        <path d="M0 6 V-12" className="g-pole" />
        <path d="M0 -12 L11 -9.5 L0 -7 Z" className="g-flag" />
        <circle cy="6" r="1.6" className="g-pole-base" />
      </g>
      <g id="mg-tent">
        <path d="M-7 5 L0 -7 L7 5 Z" className="g-tent" />
        <path d="M0 -7 V5" className="g-ink-thin" />
      </g>
      <g id="mg-boat">
        <path d="M-7 1 L7 1 L4.5 4.5 L-4.5 4.5 Z" className="g-wood" />
        <path d="M0 1 V-9" className="g-pole" />
        <path d="M0.8 -8.5 L6 0 L0.8 0 Z" className="g-canvas" />
      </g>
      <g id="mg-moon">
        <path d="M2 -5 A5 5 0 1 0 2 5 A4 4 0 1 1 2 -5 Z" className="g-moon" />
      </g>
    </defs>
  );
}

const X = (size: number, gx: number) => (gx - 0.5) * C;
const Y = (size: number, gy: number) => (size - gy + 0.5) * C;

function pathOf(size: number, pts: Pt[], close = false): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${X(size, p[0]).toFixed(1)} ${Y(size, p[1]).toFixed(1)}`).join(" ") + (close ? " Z" : "");
}

/** Le décor ne change qu'avec les lieux : on ne le redessine pas à chaque seconde. */
const TerrainLayer = memo(function TerrainLayer({ t, size }: { t: Terrain; size: number }) {
  const W = size * C;
  const riverD = pathOf(size, t.river);
  const third = Math.floor(t.river.length / 3);
  return (
    <g className="map-terrain" aria-hidden>
      <rect x={0} y={0} width={W} height={W} className="map-land" />
      <rect x={0} y={0} width={W} height={W} fill="url(#mg-specks)" />
      {t.fields.map((f, i) => (
        <g key={i} transform={`translate(${X(size, f.x).toFixed(1)} ${Y(size, f.y).toFixed(1)}) rotate(${f.a.toFixed(1)})`}>
          <rect x={(-f.w * C) / 2} y={(-f.h * C) / 2} width={f.w * C} height={f.h * C} rx={2} className={`map-field t${f.tint}`} />
          <rect x={(-f.w * C) / 2} y={(-f.h * C) / 2} width={f.w * C} height={f.h * C} rx={2} fill="url(#mg-furrows)" />
        </g>
      ))}
      {t.hills.map((h, i) => (
        <use key={i} href="#mg-hill" transform={`translate(${X(size, h.x).toFixed(1)} ${Y(size, h.y).toFixed(1)}) scale(${h.s.toFixed(2)})`} />
      ))}
      {/* Eau : lac de Brumeport, mares du marais, rivière qui s'élargit vers l'aval. */}
      <path d={pathOf(size, t.lake, true)} className="map-water-bank" />
      <path d={pathOf(size, t.lake, true)} className="map-water" />
      <path d={pathOf(size, t.lake, true)} className="map-water-lines" />
      {t.ponds.map((p, i) => (
        <ellipse key={i} cx={X(size, p.x)} cy={Y(size, p.y)} rx={p.rx * C} ry={p.ry * C} className="map-pond" />
      ))}
      <path d={riverD} className="map-river-bank" />
      <path d={pathOf(size, t.river.slice(0, third + 1))} className="map-river w1" />
      <path d={pathOf(size, t.river.slice(third, 2 * third + 1))} className="map-river w2" />
      <path d={pathOf(size, t.river.slice(2 * third))} className="map-river w3" />
      <path d={riverD} className="map-river-glint" />
      {t.reeds.map((r, i) => (
        <use key={i} href="#mg-reed" transform={`translate(${X(size, r.x).toFixed(1)} ${Y(size, r.y).toFixed(1)}) scale(${r.s.toFixed(2)})`} />
      ))}
      <use href="#mg-boat" transform={`translate(${X(size, 15).toFixed(1)} ${Y(size, 6.2).toFixed(1)}) scale(1.1)`} />
      {/* Routes : voies royales, chemin de ronde, sentiers. */}
      {t.roads.map((r, i) => (
        <path key={`e${i}`} d={pathOf(size, r.pts)} className={`map-road-edge ${r.kind}`} />
      ))}
      {t.roads.map((r, i) => (
        <path key={`r${i}`} d={pathOf(size, r.pts)} className={`map-road ${r.kind}`} />
      ))}
      {t.bridges.map((b, i) => (
        <g key={i} transform={`translate(${X(size, b.x).toFixed(1)} ${Y(size, b.y).toFixed(1)}) rotate(${(-b.a).toFixed(1)})`} className="map-bridge">
          <rect x={-9} y={-4.5} width={18} height={9} rx={1.5} />
          <path d="M-9 -4.5 H9 M-9 4.5 H9" />
        </g>
      ))}
      {t.peaks.map((p, i) => (
        <g key={i} transform={`translate(${X(size, p.x).toFixed(1)} ${Y(size, p.y).toFixed(1)}) scale(${p.s.toFixed(2)})`}>
          <use href="#mg-peak" />
          {p.snow && <use href="#mg-snow" />}
        </g>
      ))}
      {t.trees.map((tr, i) => (
        <use key={i} href={`#mg-tree${tr.kind}`} transform={`translate(${X(size, tr.x).toFixed(1)} ${Y(size, tr.y).toFixed(1)}) scale(${tr.s.toFixed(2)})`} />
      ))}
      <rect x={0} y={0} width={W} height={W} fill="url(#mg-vignette)" pointerEvents="none" />
    </g>
  );
});

/** Le beffroi au milieu de sa ville : la tour monte avec les étapes du chantier. */
function BelfryTown({ done, total, siege }: { done: number; total: number; siege: boolean }) {
  const h = 14 + Math.round((22 * Math.min(done, total)) / Math.max(1, total));
  const top = 6 - h;
  const finished = done >= total;
  const houses: [number, number, number][] = [
    [-14, 3, 0.62],
    [12, 4, 0.6],
    [-10, -8, 0.5],
    [10, -7, 0.52],
    [-4, 11, 0.55],
    [6, 11, 0.5],
  ];
  return (
    <g className="map-belfry">
      <ellipse cy="9" rx="22" ry="12" className="g-town" />
      <ellipse cy="9" rx="22" ry="12" className="g-townwall" />
      {houses
        .filter(([, y]) => y < 6)
        .map(([x, y, s], i) => (
          <use key={i} href="#mg-house" transform={`translate(${x} ${y}) scale(${s})`} />
        ))}
      <rect x="-5" y={top} width="10" height={h} className="g-stone" />
      <rect x="-5" y={top} width="3.4" height={h} className="g-stone-shade" />
      {Array.from({ length: Math.max(0, Math.floor(h / 6) - 1) }, (_, i) => (
        <path key={i} d={`M-5 ${6 - (i + 1) * 6} H5`} className="g-ink-thin" />
      ))}
      <path d={`M-2 6 V1 Q0 -1.5 2 1 V6 Z`} className="g-door" />
      <rect x="-3" y={top + 2} width="6" height="5" rx="2.4" className="g-dark" />
      <path d={`M-1.8 ${top + 6.4} Q-1.8 ${top + 3} 0 ${top + 3} Q1.8 ${top + 3} 1.8 ${top + 6.4} Z`} className="g-gold" />
      <rect x="-5" y={top} width="10" height={h} className="g-outline" />
      {finished ? (
        <>
          <path d={`M-6.5 ${top} L0 ${top - 14} L6.5 ${top} Z`} className="g-lroof" />
          <path d={`M0 ${top - 14} V${top - 20}`} className="g-pole" />
          <path d={`M0 ${top - 20} L7 ${top - 18.5} L0 ${top - 17} Z`} className="g-gold" />
        </>
      ) : (
        <>
          <path d={`M-6.5 ${top} L0 ${top - 6} L6.5 ${top} Z`} className="g-lroof" />
          <path d={`M-8 ${top + 10} V${top - 4} M8 ${top + 10} V${top - 4} M-8 ${top + 2} H8 M-8 ${top + 8} L8 ${top + 2} M-8 ${top - 3} H8`} className="g-scaffold" />
        </>
      )}
      {houses
        .filter(([, y]) => y >= 6)
        .map(([x, y, s], i) => (
          <use key={i} href="#mg-house" transform={`translate(${x} ${y}) scale(${s})`} />
        ))}
      {siege &&
        Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2 + 0.3;
          return <use key={i} href="#mg-tent" className="g-enemy" transform={`translate(${(Math.cos(a) * 31).toFixed(1)} ${(9 + Math.sin(a) * 19).toFixed(1)}) scale(0.8)`} />;
        })}
      {siege && <ellipse cy="9" rx="31" ry="19" className="g-danger-ring" />}
    </g>
  );
}

/** Position de la caravane ou du convoi sur sa route, en direct. */
function eventPos(e: EventView, now: number): Pt | null {
  if (e.path && (e.kind === "caravane" || e.kind === "convoi")) {
    const f = Math.min(1, Math.max(0, (now - e.startsAt) / Math.max(1, e.endsAt - e.startsAt)));
    return [e.path.from[0] + (e.path.to[0] - e.path.from[0]) * f, e.path.from[1] + (e.path.to[1] - e.path.from[1]) * f];
  }
  return e.pos ? [e.pos[0], e.pos[1]] : null;
}

const EVENT_GLYPH: Partial<Record<EventView["kind"], string>> = { caravane: "mg-wagon", convoi: "mg-carriage", colosse: "mg-colossus", filon: "mg-mine", tresor: "mg-treasure" };

function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

/** Sur la carte, un seigneur porte le nom de son fief (« Meunier de Moulinet » → « Moulinet »). */
function labelOf(p: BoardPlace): string {
  const fief = p.kind === "lord" ? p.name.match(/(?:\sde\s|\sd['’])(.+)$/)?.[1] : null;
  const name = fief ?? p.name;
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

function placeGlyph(p: BoardPlace): { id: string; scale: number } {
  if (p.kind === "lord") {
    const d = Math.min(4, Math.max(1, p.difficulty ?? 1));
    return { id: `mg-lord${d}`, scale: [1.15, 1.25, 1.3, 1.4][d - 1] };
  }
  return { id: `mg-house${p.tier}`, scale: p.kind === "me" ? 1.3 : 1.2 };
}

export function MapBoard(props: BoardProps) {
  const { size, belfry, fortress, places, event: ev, now, picked, onPick, showNames } = props;
  const W = size * C;
  const halls = props.halls ?? [];
  const key = [...places.map((p) => p.pos), ...halls.map((h) => h.pos)].map((p) => `${p[0]},${p[1]}`).join(";");
  // Le décor ne dépend que des cases occupées (la clé les résume).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const terrain = useMemo(() => buildTerrain([belfry, fortress, ...places.map((p) => p.pos), ...halls.map((h) => h.pos)], size), [key, size]);
  const sx = (p: Pt) => X(size, p[0]);
  const sy = (p: Pt) => Y(size, p[1]);
  const me = places.find((p) => p.kind === "me");
  const evLive = ev?.active && ev.endsAt > now ? ev : null;
  const evAt = evLive ? eventPos(evLive, now) : null;
  const scaleCells = 5;
  const scaleMin = TRAVEL_BASE_MIN + scaleCells * TRAVEL_PER_CELL_MIN;
  // Ordre de dessin : du nord au sud, pour que les lieux du bas passent devant.
  const sorted = [...places].sort((a, b) => b.pos[1] - a.pos[1]);
  const pickedPlace = places.find((p) => p.id === picked);

  return (
    <svg viewBox={`${-PAD} ${-PAD} ${W + 2 * PAD} ${W + 2 * PAD + BAND}`} role="img" aria-label="Carte du royaume" className="map-svg">
      <Glyphs />
      <rect x={-PAD} y={-PAD} width={W + 2 * PAD} height={W + 2 * PAD + BAND} rx={10} className="map-paper" />
      <clipPath id="mg-clip">
        <rect x={0} y={0} width={W} height={W} />
      </clipPath>
      <g onClick={() => onPick(null)} clipPath="url(#mg-clip)">
        <TerrainLayer t={terrain} size={size} />
      </g>
      <rect x={0} y={0} width={W} height={W} className="map-grid" pointerEvents="none" />

      {/* Route de l'événement en cours (caravane, convoi). */}
      {evLive?.path && (
        <path
          d={`M${sx(evLive.path.from)} ${sy(evLive.path.from)} L${sx(evLive.path.to)} ${sy(evLive.path.to)}`}
          className="map-event-path"
        />
      )}

      {/* Beffroi et forteresse */}
      <g transform={`translate(${sx(belfry)} ${sy(belfry) - 10}) scale(1.6)`}>
        <title>Le beffroi</title>
        <BelfryTown done={props.stagesDone} total={props.stagesTotal} siege={evLive?.kind === "siege" && !evLive.resolved} />
      </g>
      <g transform={`translate(${sx(fortress)} ${sy(fortress) - 6}) scale(1.35)`} style={{ ["--banner" as string]: props.fortressColor ?? "var(--map-neutral-banner)" }} className="map-fortress">
        <title>{props.fortressName}</title>
        <use href="#mg-fortress" />
      </g>

      {/* Événements posés sur la carte */}
      {evLive &&
        (evLive.camps ?? []).map((c) => (
          <g key={c.id} transform={`translate(${sx(c.pos)} ${sy(c.pos) - 4})`} className={c.winner ? "map-cleared" : "map-event"}>
            <title>{c.mine ? "Ton camp de bandits" : "Camp de bandits"}</title>
            {!c.winner && <ellipse cy="12" rx="22" ry="8" className="map-event-halo" />}
            <use href="#mg-tents" transform="scale(1.3)" />
          </g>
        ))}
      {evLive?.kind === "convoi" && evLive.pos && (
        <g transform={`translate(${sx(evLive.pos)} ${sy(evLive.pos) - 2})`} className="map-ambush">
          <title>Point d&apos;embuscade</title>
          <circle r="16" className="g-danger-ring" />
          <use href="#mg-swords" transform="scale(1.3)" />
        </g>
      )}
      {evLive && evAt && EVENT_GLYPH[evLive.kind] && (
        <g transform={`translate(${sx(evAt)} ${sy(evAt) - 4})`} className="map-event">
          <title>{evLive.name}</title>
          <ellipse cy="13" rx="26" ry="9" className="map-event-halo" />
          <use href={`#${EVENT_GLYPH[evLive.kind]}`} transform="scale(1.45)" />
        </g>
      )}

      {/* Mes armées en route */}
      {me &&
        props.marches.map((m) => {
          const a: Pt = [sx(m.from), sy(m.from)];
          const b: Pt = [sx(m.to), sy(m.to)];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const c: Pt = [(a[0] + b[0]) / 2 - ((b[1] - a[1]) / len) * len * 0.14, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * len * 0.14];
          const at = quad(a, c, b, m.f);
          const d = m.status === "back" ? `M${b[0]} ${b[1]} Q${c[0]} ${c[1]} ${a[0]} ${a[1]}` : `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`;
          return (
            <g
              key={m.id}
              className={`map-march ${m.status}`}
              style={{ ["--flag" as string]: props.meColor ?? "var(--map-me)", cursor: props.onMarch ? "pointer" : undefined }}
              onClick={(ev) => {
                if (!props.onMarch) return;
                ev.stopPropagation();
                props.onMarch(m.id);
              }}
            >
              <path d={d} className="map-march-line" />
              {m.status === "camp" && <use href="#mg-tent" transform={`translate(${b[0] + 9} ${b[1] + 4}) scale(0.8)`} />}
              <use href="#mg-flag" transform={`translate(${at[0].toFixed(1)} ${(at[1] - 2).toFixed(1)})`} />
            </g>
          );
        })}

      {/* Armées qui marchent sur moi (si je sais d'où). */}
      {me &&
        props.incoming.map((i) =>
          i.from ? (
            <path
              key={i.id}
              d={`M${sx(i.from)} ${sy(i.from)} L${sx(me.pos)} ${sy(me.pos)}`}
              className="map-incoming-line"
              style={{ cursor: props.onMarch ? "pointer" : undefined, pointerEvents: props.onMarch ? "stroke" : undefined }}
              onClick={(ev) => {
                if (!props.onMarch) return;
                ev.stopPropagation();
                props.onMarch(`in-${i.id}`);
              }}
            />
          ) : null,
        )}

      {/* Trajet vers le lieu choisi */}
      {me && props.travel && (
        <g className="map-travel" pointerEvents="none">
          <path d={`M${sx(me.pos)} ${sy(me.pos)} L${sx(props.travel.to)} ${sy(props.travel.to)}`} />
        </g>
      )}

      {/* Halles de guilde et loges */}
      {halls.map((h) => (
        <g key={`hall-${h.id}`} transform={`translate(${sx(h.pos)} ${sy(h.pos) - 4}) scale(${h.lodge ? 0.85 : 1.1})`} style={{ ["--roof" as string]: h.color ?? "var(--map-roof)", ["--banner" as string]: h.color ?? "var(--map-neutral-banner)" }} className="map-hall">
          <title>{h.stage < 0 ? `${h.name} · en fondation` : `${h.name} · étape ${h.stage}/${h.maxStages}`}</title>
          {h.mine && <ellipse cy="10" rx="20" ry="7" className="map-me-ring" />}
          <HallGlyph h={h} />
        </g>
      ))}

      {/* Lieux : seigneurs et joueurs */}
      {sorted.map((p) => {
        const x = sx(p.pos);
        const y = sy(p.pos);
        const isPicked = picked === p.id;
        const glyph = placeGlyph(p);
        const cls = ["map-place", p.kind, isPicked ? "picked" : "", p.curfew ? "curfew" : ""].filter(Boolean).join(" ");
        const style = { ["--roof" as string]: p.color ?? "var(--map-roof)", ["--pennant" as string]: p.aggressive ? "var(--map-danger)" : "var(--map-pennant)" };
        return (
          <g
            key={p.id}
            className={cls}
            transform={`translate(${x} ${y - 4})`}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              onPick(p.kind === "me" ? null : p.id);
            }}
            role="button"
            aria-label={p.kind === "me" ? "Ton domaine" : p.name}
          >
            <title>{p.kind === "me" ? "Ton domaine" : p.name}</title>
            <rect x={-19} y={-19} width={38} height={36} className="map-hit" />
            {isPicked && <ellipse cy="10" rx="18" ry="7" className="map-select" />}
            {p.kind === "me" && <ellipse cy="10" rx="18" ry="7" className="map-me-ring" />}
            {p.kind === "me" && props.incoming.length > 0 && <ellipse cy="10" rx="21" ry="9" className="map-alarm" />}
            <use href={`#${glyph.id}`} transform={`scale(${glyph.scale})`} />
            {p.kind === "me" && (
              <g transform="translate(-13 4)" style={{ ["--flag" as string]: "var(--map-me)" }}>
                <use href="#mg-flag" />
              </g>
            )}
            {p.kind === "player" && p.color && (
              <g transform="translate(-13 4) scale(0.8)" style={{ ["--flag" as string]: p.color }}>
                <use href="#mg-flag" />
              </g>
            )}
            {p.kind === "lord" && p.blazon && (
              <g transform="translate(-16 -12)">
                <circle r="8" className="g-badge" />
                <text className="map-blazon" y="0.5">
                  {p.blazon}
                </text>
              </g>
            )}
            {p.shielded && <path d="M-17 10 A17 17 0 0 1 17 10" className="map-shield" />}
            {p.curfew && <use href="#mg-moon" transform="translate(13 -12)" />}
            {p.atWar && <use href="#mg-swords" transform="translate(13 -11) scale(0.55)" className="map-war" />}
          </g>
        );
      })}

      {/* Noms */}
      <g className="map-labels" pointerEvents="none">
        <text x={sx(belfry)} y={sy(belfry) + 33} className="map-label major">
          Beffroi
        </text>
        <text x={sx(fortress)} y={sy(fortress) + 24} className="map-label major">
          {props.fortressName.replace(/^Forteresse de /, "")}
        </text>
        {places.map((p) => {
          const always = p.kind === "me" || p.id === picked;
          if (!always && !showNames) return null;
          return (
            <text key={p.id} x={sx(p.pos)} y={p.pos[1] <= 1 ? sy(p.pos) - 40 : sy(p.pos) + 21} className={`map-label${always ? " strong" : ""}${p.kind === "lord" ? " lord" : ""}`}>
              {p.kind === "me" ? "Toi" : labelOf(p)}
            </text>
          );
        })}
        {halls.map((h) =>
          h.mine || showNames ? (
            <text key={`hall-${h.id}`} x={sx(h.pos)} y={h.pos[1] <= 1 ? sy(h.pos) - 40 : sy(h.pos) + 21} className={`map-label${h.mine ? " strong" : ""}`}>
              {h.name}
            </text>
          ) : null,
        )}
        {evLive && evAt && EVENT_GLYPH[evLive.kind] && (
          <text x={sx(evAt)} y={sy(evAt) + 22} className="map-label event">
            {evLive.name}
          </text>
        )}
        {evLive?.kind === "convoi" && evLive.pos && (
          <text x={sx(evLive.pos)} y={sy(evLive.pos) + 18} className="map-label event">
            Embuscade
          </text>
        )}
        {evLive &&
          (evLive.camps ?? [])
            .filter((c) => c.mine && !c.winner)
            .map((c) => (
              <text key={c.id} x={sx(c.pos)} y={sy(c.pos) + 22} className="map-label event">
                Tes bandits
              </text>
            ))}
        {me && props.travel && pickedPlace && (
          <g transform={`translate(${(sx(me.pos) + sx(props.travel.to)) / 2} ${(sy(me.pos) + sy(props.travel.to)) / 2})`}>
            <rect x={-30} y={-9} width={60} height={18} rx={9} className="map-pill" />
            <text className="map-pill-text" y={0.5}>
              {props.travel.label}
            </text>
          </g>
        )}
      </g>

      {/* Cadre, échelle et rose des vents */}
      <rect x={-PAD / 2} y={-PAD / 2} width={W + PAD} height={W + PAD} rx={6} className="map-frame" pointerEvents="none" />
      <rect x={-1.5} y={-1.5} width={W + 3} height={W + 3} className="map-frame-inner" pointerEvents="none" />
      <g transform={`translate(${C * 0.2} ${W + PAD + BAND / 2})`} className="map-scale">
        {Array.from({ length: scaleCells }, (_, i) => (
          <rect key={i} x={i * C} y={-3} width={C} height={6} className={i % 2 ? "light" : "dark"} />
        ))}
        <text x={scaleCells * C + 8} y={1} className="map-scale-text">
          {scaleCells} cases ≈ {scaleMin} min de marche
        </text>
      </g>
      <g transform={`translate(${W - 16} ${W + PAD + BAND / 2 + 3})`} className="map-compass">
        <circle r="9" />
        <path d="M0 -12 L2.6 0 L0 12 L-2.6 0 Z" className="needle" />
        <path d="M0 -12 L2.6 0 L-2.6 0 Z" className="north" />
        <path d="M-12 0 L0 -2 L12 0 L0 2 Z" className="needle" />
        <text y={-16} className="map-compass-n">
          N
        </text>
      </g>
    </svg>
  );
}
