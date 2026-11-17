"use client";

// Saison 2 : la grande carte (41 × 41, zoom, glisser, filtres), la pose du château, et l'onglet du domaine
// (concessions, bâtiments d'appui, marché). Tout se lit dans `snap.s2` et dans l'état prévu `live`.
import { useRef, useState } from "react";
import { UNITS } from "@/lib/game/config";
import { formatNumber } from "@/lib/game/format";
import { lin, LIN_GENERATOR_DISCOUNT } from "@/lib/game/lineage";
import type { PlayerState } from "@/lib/game/engine";
import type { GameAction, GameSnapshot, S2WorldView } from "@/lib/game/types";
import {
  BUILDING_IDS,
  BUILDINGS,
  buildBlocker,
  buildingCost,
  buyConcessionBlocker,
  CONCESSION_GOLD,
  CONCESSION_MAX_LEVEL,
  concessionCost,
  concessionRate,
  concessionSlots,
  convoyIntervalMs,
  convoyLoad,
  exchangeBlocker,
  localCap,
  marketQuote,
  RESOURCE_ICON,
  RESOURCE_LABEL,
  stockFull,
  takeConcessionBlocker,
  upgradeConcessionBlocker,
  type BuildingId,
} from "@/lib/game/s2/economy";
import { castleBlocker, cheb, inCentre, RANKS, REGIONS, S2_BELFRY, S2_FORTRESSES, S2_FORTRESSES_OPEN, S2_RIFTS, S2_SIZE, type Pos, type Resource } from "@/lib/game/s2/map";

type Run = (action: GameAction) => Promise<unknown>;
type Pick = { kind: "cell"; pos: Pos } | { kind: "site"; id: number } | { kind: "lord"; id: string } | { kind: "castle"; id: string };

const REGION_FILL = ["#9fb7c9", "#b9a68a", "#c9c27a", "#c7a777", "#d9c08a", "#8fb3a8", "#8ea56f"];
const RES_COLOR: Record<Resource, string> = { pierre: "#8c8172", fer: "#56677a", or: "#c49a2c" };
const unitOf = (id: string) => UNITS.find((u) => u.id === id);
const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000));

function stageConcessions(snap: GameSnapshot, now: number): number {
  return snap.worksite.stageCompletedAt.filter((t) => t <= now).length >= 1 ? 1 : 0;
}

export function S2MapScreen({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: Run }) {
  const world = snap.s2!;
  const s2 = live.s2;
  const castle = s2?.castle ?? null;
  const [zoom, setZoom] = useState(castle ? 2 : 1);
  const [center, setCenter] = useState<[number, number]>(castle ? [castle[0], castle[1]] : [20, 20]);
  const [filters, setFilters] = useState({ sites: true, lords: true, castles: true, convoys: true });
  const [picked, setPicked] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; c: [number, number]; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  if (!s2) return <p className="empty">La carte de la saison 2 n&apos;est pas encore ouverte.</p>;

  const span = S2_SIZE / zoom;
  const clamp = (v: number) => Math.min(S2_SIZE - span / 2, Math.max(span / 2, v));
  const cx = zoom === 1 ? S2_SIZE / 2 : clamp(center[0] + 0.5);
  const cy = zoom === 1 ? S2_SIZE / 2 : clamp(center[1] + 0.5);
  const viewBox = `${cx - span / 2} ${cy - span / 2} ${span} ${span}`;
  const setZ = (z: number) => setZoom(Math.min(4, Math.max(1, z)));
  const act = async (a: GameAction) => {
    setBusy(true);
    await run(a);
    setBusy(false);
  };

  const cellAt = (clientX: number, clientY: number): Pos | null => {
    const el = svg.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.floor(cx - span / 2 + ((clientX - r.left) / r.width) * span);
    const y = Math.floor(cy - span / 2 + ((clientY - r.top) / r.height) * span);
    return x >= 0 && y >= 0 && x < S2_SIZE && y < S2_SIZE ? [x, y] : null;
  };
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, c: [cx - 0.5, cy - 0.5], moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = svg.current;
    if (!d || !el || zoom === 1) return;
    const scale = span / el.getBoundingClientRect().width;
    const dx = (e.clientX - d.x) * scale;
    const dy = (e.clientY - d.y) * scale;
    if (Math.abs(dx) + Math.abs(dy) > 0.3) d.moved = true;
    if (d.moved) setCenter([d.c[0] - dx, d.c[1] - dy]);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) return;
    const p = cellAt(e.clientX, e.clientY);
    if (!p) return;
    const site = world.map.sites.find((s) => s.pos[0] === p[0] && s.pos[1] === p[1]);
    const lord = world.lords.find((l) => l.pos[0] === p[0] && l.pos[1] === p[1]);
    const other = world.castles.find((c) => c.pos[0] === p[0] && c.pos[1] === p[1]);
    setPicked(site ? { kind: "site", id: site.id } : lord ? { kind: "lord", id: lord.id } : other ? { kind: "castle", id: other.id } : { kind: "cell", pos: p });
  };

  const mineSites = new Set(s2.conc.map((c) => c.site));
  const castlesOthers = world.castles.filter((c) => !c.me).map((c) => c.pos as Pos);
  const pickedPos: Pos | null =
    picked?.kind === "cell" ? picked.pos : picked?.kind === "site" ? world.map.sites[picked.id]?.pos ?? null : picked?.kind === "lord" ? world.lords.find((l) => l.id === picked.id)?.pos ?? null : picked?.kind === "castle" ? world.castles.find((c) => c.id === picked.id)?.pos ?? null : null;

  return (
    <div className="s2-map">
      {!castle && (
        <p className="s2-hint">🏰 Choisis où poser ton château : touche une case libre hors du centre, à 2 cases au moins des sites, des seigneurs et des autres châteaux. Ta première concession sera une carrière proche.</p>
      )}
      <div className="map-tools">
        <button className="btn btn-small" onClick={() => setZ(zoom + 1)} aria-label="Zoomer">＋</button>
        <button className="btn btn-small" onClick={() => setZ(zoom - 1)} aria-label="Dézoomer">－</button>
        {castle && (
          <button className="btn btn-small" onClick={() => { setZ(Math.max(zoom, 2)); setCenter([castle[0], castle[1]]); }}>Mon château</button>
        )}
        {(["sites", "lords", "castles", "convoys"] as const).map((k) => (
          <button key={k} className="btn btn-small" aria-pressed={filters[k]} onClick={() => setFilters({ ...filters, [k]: !filters[k] })}>
            {{ sites: "⛏️ Sites", lords: "🛡️ Seigneurs", castles: "🏰 Châteaux", convoys: "🐎 Convois" }[k]}
          </button>
        ))}
      </div>
      <svg
        ref={svg}
        className="s2-svg"
        viewBox={viewBox}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => (drag.current = null)}
        onWheel={(e) => setZ(zoom + (e.deltaY < 0 ? 1 : -1))}
        role="img"
        aria-label="Carte du royaume"
      >
        <rect x={0} y={0} width={S2_SIZE} height={S2_SIZE} className="s2-paper" />
        {world.map.regions.map((row, y) =>
          row.map((r, x) => (r >= 0 ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={REGION_FILL[r % REGION_FILL.length]} fillOpacity={0.35} /> : null)),
        )}
        <circle cx={20.5} cy={20.5} r={7.5} className="s2-centre" />
        {zoom >= 2 && Array.from({ length: S2_SIZE + 1 }, (_, i) => <path key={i} d={`M${i} 0V${S2_SIZE}M0 ${i}H${S2_SIZE}`} className="s2-grid" />)}
        {/* Routes de mes concessions. */}
        {castle && s2.conc.map((c) => {
          const p = world.map.sites[c.site]?.pos;
          return p ? <line key={c.id} x1={p[0] + 0.5} y1={p[1] + 0.5} x2={castle[0] + 0.5} y2={castle[1] + 0.5} className="s2-road" /> : null;
        })}
        {/* Centre : beffroi, failles, forteresses. */}
        <text x={S2_BELFRY[0] + 0.5} y={S2_BELFRY[1] + 0.8} className="s2-glyph s2-big">🔔</text>
        {S2_RIFTS.map((r) => (
          <text key={r.id} x={r.pos[0] + 0.5} y={r.pos[1] + 0.75} className="s2-glyph" opacity={r.id === "normale" ? 1 : 0.4}>🌀</text>
        ))}
        {S2_FORTRESSES.map((f, i) => (
          <text key={i} x={f[0] + 0.5} y={f[1] + 0.75} className="s2-glyph" opacity={i < S2_FORTRESSES_OPEN ? 1 : 0.35}>🏯</text>
        ))}
        {filters.sites && world.map.sites.map((s) => (
          <g key={s.id}>
            <rect x={s.pos[0] + 0.08} y={s.pos[1] + 0.08} width={0.84} height={0.84} rx={0.2} fill={RES_COLOR[s.type]} className={mineSites.has(s.id) ? "s2-site s2-mine" : "s2-site"} />
            <text x={s.pos[0] + 0.5} y={s.pos[1] + 0.72} className="s2-glyph s2-small">{RESOURCE_ICON[s.type]}</text>
          </g>
        ))}
        {filters.lords && world.lords.map((l) => (
          <g key={l.id}>
            <circle cx={l.pos[0] + 0.5} cy={l.pos[1] + 0.5} r={0.46} className={`s2-lord s2-${l.rank}`} />
            <text x={l.pos[0] + 0.5} y={l.pos[1] + 0.72} className="s2-glyph s2-small">🛡️</text>
          </g>
        ))}
        {filters.castles && world.castles.map((c) => (
          <text key={c.id} x={c.pos[0] + 0.5} y={c.pos[1] + 0.78} className={`s2-glyph${c.me ? " s2-big" : ""}`}>{c.me ? "🏰" : "🏠"}</text>
        ))}
        {filters.convoys && world.convoys.map((v, i) => {
          const f = Math.min(1, Math.max(0, (now - v.depart) / Math.max(1, v.arrive - v.depart)));
          const x = v.from[0] + (v.to[0] - v.from[0]) * f + 0.5;
          const y = v.from[1] + (v.to[1] - v.from[1]) * f + 0.5;
          return <circle key={i} cx={x} cy={y} r={v.size === "grosse" ? 0.3 : v.size === "moyenne" ? 0.22 : 0.15} fill={RES_COLOR[v.res]} className={v.mine ? "s2-convoy s2-mine" : "s2-convoy"} />;
        })}
        {pickedPos && <rect x={pickedPos[0]} y={pickedPos[1]} width={1} height={1} className="s2-pick" />}
      </svg>
      <S2Panel snap={snap} live={live} now={now} world={world} picked={picked} busy={busy} act={act} castlesOthers={castlesOthers} />
    </div>
  );
}

function S2Panel({ snap, live, now, world, picked, busy, act, castlesOthers }: { snap: GameSnapshot; live: PlayerState; now: number; world: S2WorldView; picked: Pick | null; busy: boolean; act: (a: GameAction) => Promise<void>; castlesOthers: Pos[] }) {
  const s2 = live.s2!;
  const castle = s2.castle;
  if (!picked) return <p className="row-desc s2-panel">Touche une case, un site ou un seigneur pour le voir ici.</p>;
  const regionOf = (p: Pos) => {
    const r = world.map.regions[p[1]]?.[p[0]] ?? -1;
    return r >= 0 ? REGIONS[r] : null;
  };
  if (picked.kind === "cell") {
    const p = picked.pos;
    const region = regionOf(p);
    const why = castle ? null : castleBlocker(world.map, p, castlesOthers);
    return (
      <div className="s2-panel">
        <div className="row-title">Case ({p[0]}, {p[1]}) {region ? `· ${region.icon} ${region.name}` : inCentre(p) ? "· centre du royaume" : ""}</div>
        {region && <div className="row-desc">Bonus de région : {region.bonus}.</div>}
        {!castle && (
          why ? <div className="row-desc">{why}</div> : (
            <button className="btn btn-primary" disabled={busy} onClick={() => void act({ type: "s2", op: "place", x: p[0], y: p[1] })}>Poser mon château ici</button>
          )
        )}
      </div>
    );
  }
  if (picked.kind === "site") {
    const site = world.map.sites[picked.id];
    const taken = world.taken[site.id] ?? 0;
    const mine = s2.conc.filter((c) => c.site === site.id).length;
    const why = takeConcessionBlocker(s2, { map: world.map, stageConcessions: stageConcessions(snap, now) }, site.id, { taken: () => taken });
    return (
      <div className="s2-panel">
        <div className="row-title">{RESOURCE_ICON[site.type]} {site.name || `Site de ${RESOURCE_LABEL[site.type]}`}</div>
        <div className="row-desc">
          {taken + mine}/{site.places} places prises{mine ? ` (dont ${mine} à toi)` : ""}{castle ? ` · à ${cheb(site.pos, castle)} cases de ton château` : ""}.
        </div>
        {castle && (why ? <div className="row-desc">{why}</div> : (
          <button className="btn btn-primary" disabled={busy} onClick={() => void act({ type: "s2", op: "take", site: site.id })}>Prendre une concession ici</button>
        ))}
      </div>
    );
  }
  if (picked.kind === "lord") {
    const l = world.lords.find((x) => x.id === picked.id)!;
    const patrol = unitOf(l.patrol);
    return (
      <div className="s2-panel">
        <div className="row-title">🛡️ {l.name} · {RANKS[l.rank].name}</div>
        <div className="row-desc">
          Garnison : {l.home}/{l.companies} compagnie{l.companies > 1 ? "s" : ""}, entraînement {l.train}
          {l.rank === "duc" ? ", fortifications niveau 5" : ""}. Patrouilles : {patrol ? `${patrol.icon} ${patrol.plural.toLowerCase()}` : l.patrol}.
        </div>
        <div className="row-desc">
          Fief : environ {formatNumber(l.fief)} en valeur pierre (une victoire en emporte 60 %, plus du fer par compagnie battue).
          {l.reformAt > now ? ` La garnison se reforme : complète dans ${minutes(l.reformAt - now)} min.` : ""}
        </div>
        {castle && (
          <button className="btn btn-primary" disabled={busy} onClick={() => void act({ type: "raid", target: l.id })}>Attaquer</button>
        )}
      </div>
    );
  }
  const c = world.castles.find((x) => x.id === picked.id)!;
  return (
    <div className="s2-panel">
      <div className="row-title">{c.me ? "🏰 Ton château" : `🏠 ${c.name}`}</div>
      {castle && !c.me && <div className="row-desc">À {cheb(c.pos, castle)} cases de ton château.</div>}
    </div>
  );
}

/** Onglet du domaine en saison 2 : concessions, bâtiments d'appui, marché. */
export function S2Domain({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: Run }) {
  const world = snap.s2!;
  const s2 = live.s2;
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState<Resource>("pierre");
  const [to, setTo] = useState<Resource>("fer");
  const [amount, setAmount] = useState(1000);
  if (!s2) return <p className="empty">La saison 2 n&apos;est pas encore ouverte.</p>;
  const act = async (a: GameAction) => {
    setBusy(true);
    await run(a);
    setBusy(false);
  };
  const map = world.map;
  const slots = concessionSlots(s2, { stageConcessions: stageConcessions(snap, now) });
  const discount = lin(live, "main_oeuvre") ? 1 - LIN_GENERATOR_DISCOUNT : 1;
  const have = { pierre: live.stone, fer: s2.iron, or: s2.gold };
  if (!s2.castle) return <p className="empty">Pose d&apos;abord ton château depuis l&apos;onglet Carte.</p>;
  const exWhy = exchangeBlocker(have, from, to, amount);
  return (
    <div className="s2-domain">
      <div className="s2-purse">
        <span>🪨 {formatNumber(live.stone)}</span>
        <span>⚔️ {formatNumber(s2.iron)} fer</span>
        <span>🪙 {formatNumber(s2.gold)} or</span>
      </div>

      <h3>Concessions ({s2.conc.length}/{slots})</h3>
      <div className="list">
        {s2.conc.map((c) => {
          const site = map.sites[c.site];
          if (!site) return null;
          const rate = concessionRate(s2, c, map);
          const cap = localCap(s2, c, map);
          const full = stockFull(s2, c, map);
          const upWhy = upgradeConcessionBlocker(s2, c.id, live.stone, now);
          return (
            <div key={c.id} className="row">
              <div>
                <div className="row-title">{RESOURCE_ICON[site.type]} {site.name || RESOURCE_LABEL[site.type]} <span className="badge">niv. {c.level}</span></div>
                <div className="row-desc">
                  {formatNumber(rate)} {RESOURCE_LABEL[site.type]}/h · convoi de {formatNumber(convoyLoad(s2, c, map))} toutes les {minutes(convoyIntervalMs(s2))} min, prochain dans {minutes(c.next - now)} min.
                </div>
                <div className="bar bar-thin"><span style={{ width: `${Math.min(100, (c.stock / Math.max(1, cap)) * 100)}%` }} /></div>
                {full && <div className="row-desc">⚠️ Stock plein : améliore ta charronnerie ou ton relais.</div>}
                {c.upUntil && c.upUntil > now && <div className="row-desc">🔨 Niveau {c.level + 1} dans {minutes(c.upUntil - now)} min.</div>}
              </div>
              <div className="s2-actions">
                {c.level < CONCESSION_MAX_LEVEL && (
                  <button className="btn btn-small btn-primary" disabled={busy || !!upWhy} title={upWhy ?? undefined} onClick={() => void act({ type: "s2", op: "upgrade", id: c.id })}>
                    Améliorer · 🪨 {formatNumber(concessionCost(c.level + 1))}
                  </button>
                )}
                {s2.conc.length > 1 && (
                  <button className="btn btn-small" disabled={busy} onClick={() => void act({ type: "s2", op: "drop", id: c.id })}>Abandonner</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {s2.conc.length < slots && <p className="row-desc">Une place libre : choisis un site sur la carte.</p>}
      {s2.bought < CONCESSION_GOLD.length && (
        <button className="btn" disabled={busy || !!buyConcessionBlocker(s2)} title={buyConcessionBlocker(s2) ?? undefined} onClick={() => void act({ type: "s2", op: "buy" })}>
          Acheter une concession · 🪙 {formatNumber(CONCESSION_GOLD[s2.bought])}
        </button>
      )}

      <h3>Bâtiments d&apos;appui</h3>
      <div className="list">
        {BUILDING_IDS.map((id: BuildingId) => {
          const def = BUILDINGS[id];
          const work = s2.works.filter((w) => w.id === id);
          const next = Math.max(s2.bld[id], ...work.map((w) => w.level)) + 1;
          const why = buildBlocker(s2, id, live.stone, discount);
          return (
            <div key={id} className="row">
              <div>
                <div className="row-title">{def.icon} {def.name} <span className="badge">niv. {s2.bld[id]}</span></div>
                <div className="row-desc">{def.text}</div>
                {work.map((w) => <div key={w.level} className="row-desc">🔨 Niveau {w.level} dans {minutes(w.until - now)} min.</div>)}
              </div>
              <button className="btn btn-small btn-primary" disabled={busy || !!why} title={why ?? undefined} onClick={() => void act({ type: "s2", op: "build", building: id })}>
                Niveau {next} · 🪨 {formatNumber(Math.ceil(buildingCost(id, next) * discount))}
              </button>
            </div>
          );
        })}
      </div>

      <h3>Marché</h3>
      <p className="row-desc">Échange immédiat au tiers de la valeur (1 or vaut 4 pierres, 1 fer en vaut 2).</p>
      <div className="s2-market">
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))} aria-label="Quantité" />
        <select value={from} onChange={(e) => setFrom(e.target.value as Resource)} aria-label="Monnaie donnée">
          {(["pierre", "fer", "or"] as Resource[]).map((r) => <option key={r} value={r}>{RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}</option>)}
        </select>
        <span>→</span>
        <select value={to} onChange={(e) => setTo(e.target.value as Resource)} aria-label="Monnaie reçue">
          {(["pierre", "fer", "or"] as Resource[]).map((r) => <option key={r} value={r}>{RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}</option>)}
        </select>
        <button className="btn btn-primary" disabled={busy || !!exWhy} title={exWhy ?? undefined} onClick={() => void act({ type: "s2", op: "exchange", from, to, amount })}>
          Recevoir {from !== to ? formatNumber(marketQuote(from, to, amount)) : 0} {RESOURCE_LABEL[to]}
        </button>
      </div>
    </div>
  );
}
