"use client";

// Saison 2 : la grande carte (41 × 41, zoom, glisser, filtres), la pose du château, et l'onglet du domaine
// (concessions, bâtiments d'appui, marché). Tout se lit dans `snap.s2` et dans l'état prévu `live`.
import { useEffect, useRef, useState } from "react";
import { guideDone, openTutorial } from "@/components/s2-tutorial";
import { armySize, estimateChance } from "@/lib/game/battle";
import { armySpeedBonus, attackArmy, playerAttackOpts, travelMs } from "@/lib/game/engine";
import { interceptPoint, sabotagePrice, tradePay, TRADE_MAX } from "@/lib/game/s2/players";
import { MERC_ARMY, mercBlocker, mercOffer, mercPrice, mercsNow } from "@/lib/game/s2/mercs";
import { garrisonOfView } from "@/lib/game/s2/lords";
import { campSide, CONTRACT_MIN_CHANCE, CONTRACT_TEXT, contractFoe, contractsFor, fightChance, HOSTILITY_LEVELS, hostilityAt, hostilityLevel, safeBlocker, safePrice } from "@/lib/game/s2/convoys";
import { dailyDay } from "@/lib/game/daily";
import { drawBelfry, drawCastle, drawFort, drawLord, drawMap, drawRift, drawSite, toCell, type Layers, type View } from "@/components/s2-canvas";
import { UNITS } from "@/lib/game/config";
import { formatNumber } from "@/lib/game/format";
import type { PlayerState } from "@/lib/game/engine";
import type { GameAction, GameSnapshot, S2WorldView } from "@/lib/game/types";
import { tierOf, RESOURCE_ICON, RESOURCE_LABEL, takeConcessionBlocker } from "@/lib/game/s2/economy";
import { fortressBonus } from "@/lib/game/config";
import { castleBlocker, cheb, inCentre, RANKS, REGIONS, S2_FORTRESSES, S2_SIZE, type Pos } from "@/lib/game/s2/map";

type Run = (action: GameAction) => Promise<unknown>;
type Pick = { kind: "cell"; pos: Pos } | { kind: "site"; id: number } | { kind: "lord"; id: string } | { kind: "castle"; id: string } | { kind: "camp"; id: string } | { kind: "fort"; idx: number };

const unitOf = (id: string) => UNITS.find((u) => u.id === id);
/** Durée lisible : « 12 s », « 3 min 05 », « 1 h 20 ». */
const dur = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  if (t < 60) return `${t}\u00a0s`;
  if (t < 3600) return `${Math.floor(t / 60)}\u00a0min\u00a0${String(t % 60).padStart(2, "0")}`;
  return `${Math.floor(t / 3600)}\u00a0h\u00a0${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}`;
};

function stageConcessions(snap: GameSnapshot, now: number): number {
  return snap.worksite.stageCompletedAt.filter((t) => t <= now).length >= 1 ? 1 : 0;
}

export function S2MapScreen({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: Run }) {
  const world = snap.s2!;
  const s2 = live.s2;
  const castle = s2?.castle ?? null;
  const [zoom, setZoom] = useState(castle ? 2 : 1);
  const [center, setCenter] = useState<[number, number]>(castle ? [castle[0] + 0.5, castle[1] + 0.5] : [S2_SIZE / 2, S2_SIZE / 2]);
  const [layers, setLayers] = useState<Layers>({ sites: true, lords: true, zones: false, castles: true, convoys: true, free: !castle, grid: false });
  const [picked, setPicked] = useState<Pick | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(600);
  const drag = useRef<{ x: number; y: number; c: [number, number]; moved: boolean } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const span = S2_SIZE / zoom;
  const clamp = (v: number) => Math.min(S2_SIZE - span / 2, Math.max(span / 2, v));
  const view: View = { w: width, cx: zoom === 1 ? S2_SIZE / 2 : clamp(center[0]), cy: zoom === 1 ? S2_SIZE / 2 : clamp(center[1]), span };
  const castlesOthers = world.castles.filter((c) => !c.me).map((c) => c.pos as Pos);
  const pickedPos: Pos | null = !s2 || !picked
    ? null
    : picked.kind === "cell" ? picked.pos : picked.kind === "site" ? world.map.sites[picked.id]?.pos ?? null : picked.kind === "lord" ? world.lords.find((l) => l.id === picked.id)?.pos ?? null : picked.kind === "camp" ? (world.camps ?? []).find((k) => k.id === picked.id)?.pos ?? null : picked.kind === "fort" ? S2_FORTRESSES[picked.idx] ?? null : world.castles.find((c) => c.id === picked.id)?.pos ?? null;

  // Largeur du conteneur suivie en direct : la carte reste carrée et nette sur tous les écrans.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !s2) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(width * dpr);
    el.height = Math.round(width * dpr);
    const c = el.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(c, {
      world,
      now,
      view,
      layers,
      mineSites: new Map(s2.conc.map((x) => [x.site, tierOf(x.level)] as [number, number])),
      routes: s2.conc.flatMap((x) => (world.map.sites[x.site] ? [[world.map.sites[x.site].pos]] : [])),
      myCastle: castle,
      picked: pickedPos,
      hover,
      isFree: castle ? undefined : (x, y) => !castleBlocker(world.map, [x, y], castlesOthers),
    });
  });
  if (!s2) return <p className="empty">La carte de la saison 2 n&apos;est pas encore ouverte.</p>;

  const setZ = (z: number) => setZoom(Math.min(5, Math.max(1, z)));
  const act = async (a: GameAction) => {
    // Les actions avec aperçu immédiat ne bloquent pas les boutons pendant l'aller-retour.
    const waits = a.type !== "s2" || a.op === "place" || a.op === "take";
    if (waits) setBusy(true);
    await run(a);
    if (waits) setBusy(false);
  };
  const cellAt = (clientX: number, clientY: number): Pos | null => {
    const el = canvas.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const [x, y] = toCell(view, clientX - r.left, clientY - r.top);
    return x >= 0 && y >= 0 && x < S2_SIZE && y < S2_SIZE ? [x, y] : null;
  };
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, c: [view.cx, view.cy], moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      if (e.pointerType === "mouse") setHover(cellAt(e.clientX, e.clientY));
      return;
    }
    if (zoom === 1) return;
    const scale = span / width;
    const dx = (e.clientX - d.x) * scale;
    const dy = (e.clientY - d.y) * scale;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) d.moved = true;
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
    const camp = (world.camps ?? []).find((k) => k.pos[0] === p[0] && k.pos[1] === p[1]);
    const fort = S2_FORTRESSES.findIndex((f) => f[0] === p[0] && f[1] === p[1]);
    setPicked(site ? { kind: "site", id: site.id } : lord ? { kind: "lord", id: lord.id } : other ? { kind: "castle", id: other.id } : camp ? { kind: "camp", id: camp.id } : fort >= 0 ? { kind: "fort", idx: fort } : { kind: "cell", pos: p });
  };
  const toggles: [keyof Layers, string][] = [
    ["sites", "Sites"],
    ["lords", "Seigneurs"],
    ["zones", "Zones des seigneurs"],
    ["castles", "Châteaux"],
    ["convoys", "Convois"],
    ["free", "Cases libres"],
    ["grid", "Grille"],
  ];

  return (
    <div className="s2-map">
      {!castle && (
        <p className="s2-hint">🏰 Choisis où poser ton château : touche une case marquée d&apos;un point blanc, hors du centre et à 2 cases au moins des sites, des seigneurs et des autres châteaux. Ta première concession sera une carrière proche.</p>
      )}
      <div className="s2-board" ref={box}>
        <canvas
          ref={canvas}
          data-tuto="map"
          className="s2-canvas"
          style={{ width, height: width }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => {
            drag.current = null;
            setHover(null);
          }}
          onWheel={(e) => setZ(zoom + (e.deltaY < 0 ? 1 : -1))}
          role="img"
          aria-label="Carte du royaume : régions, sites, seigneurs, châteaux et convois"
        />
        <div className="s2-zoom">
          <button className="btn btn-small" onClick={() => setZ(zoom + 1)} aria-label="Zoomer">＋</button>
          <button className="btn btn-small" onClick={() => setZ(zoom - 1)} aria-label="Dézoomer">－</button>
          {castle && (
            <button className="btn btn-small" onClick={() => { setZ(Math.max(zoom, 2)); setCenter([castle[0] + 0.5, castle[1] + 0.5]); }} aria-label="Centrer sur mon château">🏰</button>
          )}
          <button className="btn btn-small" onClick={openTutorial} aria-label="Comment jouer">?</button>
        </div>
      </div>
      <div className="s2-toggles">
        {toggles.map(([k, label]) => (
          <label key={k}>
            <input type="checkbox" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} /> {label}
          </label>
        ))}
      </div>
      <S2Panel snap={snap} live={live} now={now} world={world} picked={picked} busy={busy} act={act} castlesOthers={castlesOthers} />
      <S2Legend />
    </div>
  );
}

/** Légende dessinée avec les mêmes fonctions que la carte. */
function S2Legend() {
  const items: [string, (c: CanvasRenderingContext2D) => void][] = [
    ["Carrière (pierre)", (c) => drawSite(c, 14, 14, 24, "pierre", 6)],
    ["Mine (fer)", (c) => drawSite(c, 14, 14, 24, "fer", 6)],
    ["Filon (or)", (c) => drawSite(c, 14, 14, 24, "or", 4)],
    ["Hobereau ou baron", (c) => drawLord(c, 14, 16, 24, 1)],
    ["Comte ou duc", (c) => drawLord(c, 14, 18, 22, 3)],
    ["Château d'un joueur", (c) => drawCastle(c, 14, 17, 24, "#4f8fd9")],
    ["Le beffroi", (c) => drawBelfry(c, 14, 14, 24)],
    ["Faille", (c) => drawRift(c, 14, 14, 24, "#9b6bd6")],
    ["Forteresse", (c) => drawFort(c, 14, 14, 24)],
  ];
  return (
    <details className="s2-legend">
      <summary>Légende et régions</summary>
      <div className="s2-legend-grid">
        {items.map(([label, fn]) => (
          <LegendIcon key={label} label={label} draw={fn} />
        ))}
      </div>
      <ul className="s2-regions">
        {REGIONS.map((r) => (
          <li key={r.id}>
            <b>{r.icon} {r.name}</b> · {r.bonus}
          </li>
        ))}
      </ul>
    </details>
  );
}

function LegendIcon({ label, draw }: { label: string; draw: (c: CanvasRenderingContext2D) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    const c = el?.getContext("2d");
    if (!el || !c) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = 28 * dpr;
    el.height = 28 * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(c);
  }, [draw]);
  return (
    <>
      <canvas ref={ref} style={{ width: 28, height: 28 }} aria-hidden />
      <span>{label}</span>
    </>
  );
}

function S2Panel({ snap, live, now, world, picked, busy, act, castlesOthers }: { snap: GameSnapshot; live: PlayerState; now: number; world: S2WorldView; picked: Pick | null; busy: boolean; act: (a: GameAction) => Promise<void>; castlesOthers: Pos[] }) {
  const s2 = live.s2!;
  const castle = s2.castle;
  if (!picked) return (
    <>
      <p className="row-desc s2-panel">Touche une case, un site, un seigneur, un camp ou une forteresse pour le voir ici.</p>
      {castle && <Ambushes world={world} now={now} busy={busy} act={act} />}
      {castle && <Expeditions world={world} now={now} />}
      {castle && <ConvoysInSight snap={snap} live={live} now={now} busy={busy} act={act} />}
      {castle && <TradeRoutes snap={snap} live={live} now={now} busy={busy} act={act} />}
      {castle && <Contracts snap={snap} live={live} now={now} busy={busy} act={act} />}
    </>
  );
  const regionOf = (p: Pos) => {
    const r = inCentre(p) ? -1 : (world.map.regions[p[1]]?.[p[0]] ?? -1);
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
            <button className="btn btn-primary" data-tuto="place" disabled={busy} onClick={() => void act({ type: "s2", op: "place", x: p[0], y: p[1] })}>Poser mon château ici</button>
          )
        )}
        {castle && <AmbushHere world={world} live={live} pos={p} now={now} busy={busy} act={act} />}
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
          <button className="btn btn-primary" data-tuto="take" disabled={busy} onClick={() => void act({ type: "s2", op: "take", site: site.id })}>Prendre une concession ici</button>
        ))}
        {castle && <Occupants world={world} live={live} siteId={site.id} busy={busy} act={act} />}
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
          {l.reformAt > now ? ` La garnison se reforme : complète dans ${dur(l.reformAt - now)}.` : ""}
        </div>
        {l.away ? <div className="row-desc">⚔️ {l.away} compagnie{l.away > 1 ? "s" : ""} parti{l.away > 1 ? "es" : "e"} en expédition : la garnison est réduite d&apos;autant.</div> : null}
        {l.annexed && <div className="row-desc">👑 Annexé par {l.annexed.name} jusqu&apos;à la fin de la saison : sa production est partagée entre ses membres, sa zone laisse passer leurs convois. Battre sa garnison le libère.</div>}
        {l.rival && <div className="row-desc">⚖️ Rival de {world.lords.find((x) => x.id === l.rival)?.name ?? "?"} : t&apos;en prendre à l&apos;un apaise l&apos;autre (à 30 points apaisés, sauf-conduit offert pour 24 h).</div>}
        <LordRelations snap={snap} live={live} lord={l} now={now} busy={busy} act={act} />
        {castle && <Mercs snap={snap} live={live} lord={l} now={now} busy={busy} act={act} />}
        {castle && !(l.annexed && snap.alliance && l.annexed.alliance === snap.alliance.id) && <LordAttack live={live} lord={l} busy={busy} attack={() => void act({ type: "raid", target: l.id })} />}
      </div>
    );
  }
  if (picked.kind === "camp") {
    const k = (world.camps ?? []).find((x) => x.id === picked.id);
    if (!k) return null;
    return <CampPanel live={live} camp={k} now={now} busy={busy} act={act} />;
  }
  if (picked.kind === "fort") {
    const f = (world.forts ?? []).find((x) => x.idx === picked.idx);
    const fp = S2_FORTRESSES[picked.idx];
    const mineHeld = !!f && f.holder !== null && !!snap.alliance && f.holder === snap.alliance.id;
    const key = `fort:${picked.idx}`;
    const offered = (s2.trade ?? []).some((t) => t.to === key);
    return (
      <div className="s2-panel">
        <div className="row-title">🏰 {f?.name ?? "Forteresse"}</div>
        <div className="row-desc">Bonus pour l&apos;alliance qui la tient : {fortressBonus(picked.idx)}. À 4 cases autour, ses convois passent sans patrouille, embuscade ni bandits.</div>
        <div className="row-desc">{f?.holderName ? `Tenue par ${f.holderName}.` : "Gardée par une garnison neutre."}{castle ? ` À ${cheb(fp, castle)} cases de ton château.` : ""} Assaut, espion et garnison : onglet Alliance.</div>
        {castle && mineHeld && (
          <div className="s2-settings">
            <span>🛤️ Route commerciale vers la forteresse de ton alliance : un convoi par heure, {formatNumber(tradePay(s2, castle, fp, live.seasonStart || now, now))} 🪙 chacun.</span>
            <button className="btn btn-small" disabled={busy} onClick={() => void act({ type: "s2", op: "trade", to: key, on: !offered })}>{offered ? "Fermer" : "Ouvrir"}</button>
          </div>
        )}
      </div>
    );
  }
  const c = world.castles.find((x) => x.id === picked.id)!;
  const route = (world.trades ?? []).find((t) => t.to === c.id);
  const offered = (s2.trade ?? []).some((t) => t.to === c.id);
  return (
    <div className="s2-panel">
      <div className="row-title">{c.me ? "🏰 Ton château" : `🏠 ${c.name}`}</div>
      {castle && !c.me && <div className="row-desc">À {cheb(c.pos, castle)} cases de ton château.</div>}
      {castle && !c.me && (
        <div className="s2-settings">
          <span>
            🛤️ {route?.active ? "Route commerciale ouverte" : offered ? "Route commerciale proposée, en attente de sa réponse" : route?.theirs ? `${c.name} te propose une route commerciale` : "Route commerciale"} : un convoi par heure dans chaque sens, {formatNumber(tradePay(s2, castle, c.pos, live.seasonStart || now, now))} 🪙 pour toi à chaque arrivée.
          </span>
          <button className="btn btn-small" disabled={busy} onClick={() => void act({ type: "s2", op: "trade", to: c.id, on: !offered })}>
            {offered ? (route?.active ? "Fermer" : "Retirer") : route?.theirs ? "Accepter" : "Proposer"}
          </button>
        </div>
      )}
    </div>
  );
}

/** S8 : poster une embuscade sur cette case (4 h, convois ennemis à une case). */
function AmbushHere({ world, live, pos, now, busy, act }: { world: S2WorldView; live: PlayerState; pos: Pos; now: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const mine = attackArmy(live);
  const placed = (world.ambushes ?? []).find((a) => a.mine && a.until > now);
  const taken = world.map.sites.some((x) => x.pos[0] === pos[0] && x.pos[1] === pos[1]) || world.lords.some((l) => l.pos[0] === pos[0] && l.pos[1] === pos[1]);
  const why = inCentre(pos) ? "Pas d'embuscade dans le centre du royaume." : taken ? "Case occupée." : placed ? "Tu as déjà une embuscade en place." : armySize(mine) === 0 ? "Aucune troupe au château." : null;
  return (
    <div className="s2-settings">
      <span>🏹 Embuscade : toutes tes troupes au château s&apos;y postent 4 h et attaquent chaque convoi ennemi qui passe à une case (un tiers de sa charge, contre son escorte). Les voisins dont la vue couvre la case la repèrent.</span>
      <button className="btn btn-small" disabled={busy || !!why} title={why ?? undefined} onClick={() => void act({ type: "ambush", x: pos[0], y: pos[1] })}>Poster ici</button>
    </div>
  );
}

/** S8 : embuscades en place (les miennes, celles de l'alliance, celles des autres repérées près de mes terres). */
function Ambushes({ world, now, busy, act }: { world: S2WorldView; now: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const list = (world.ambushes ?? []).filter((a) => a.until > now);
  if (list.length === 0) return null;
  return (
    <div className="s2-panel s2-contracts">
      <div className="row-title">🏹 Embuscades</div>
      <ul>
        {list.map((a) => (
          <li key={a.id}>
            <span>
              {a.mine ? "La tienne" : a.ally ? `${a.name} (alliance)` : `⚠️ ${a.name}`} en ({a.pos[0]}, {a.pos[1]}) · {a.from > now ? `en place dans ${dur(a.from - now)}` : `encore ${dur(a.until - now)}`}
              {!a.mine && !a.ally ? ` · environ ${formatNumber(Math.round(a.size / 100) * 100)} hommes : tes convois qui passent à une case seront attaqués.` : ""}
            </span>
            {a.mine && a.from <= now && (
              <button className="btn btn-small" disabled={busy} onClick={() => void act({ type: "march_recall", id: a.id })}>Lever</button>
            )}
            {!a.mine && !a.ally && a.from <= now && (
              <button className="btn btn-small" disabled={busy} title="Toutes tes troupes au château partent la déloger. Vaincue, elle se lève aussitôt." onClick={() => void act({ type: "ambush_hit", id: a.id })}>🗡️ Déloger</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Expéditions des seigneurs encore dehors (contre mes convois, ceux de l'alliance, ou vues près de mes terres). */
function Expeditions({ world, now }: { world: S2WorldView; now: number }) {
  const list = (world.expeditions ?? []).filter((x) => x.back > now);
  if (list.length === 0) return null;
  return (
    <div className="s2-panel s2-contracts">
      <div className="row-title">⚔️ Expéditions des seigneurs</div>
      <ul>
        {list.map((x) => (
          <li key={`${x.lord}-${x.at}`}>
            <span>
              {x.lordName} · {x.n} compagnie{x.n > 1 ? "s" : ""} {x.mine ? "partie contre tes convois" : `partie contre ${x.target}`} · de retour au fief dans {dur(x.back - now)} : sa garnison est affaiblie d&apos;ici là.
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** S8 : les convois des autres à portée de mes sites ; les intercepter ou les saboter. */
function ConvoysInSight({ snap, live, now, busy, act }: { snap: GameSnapshot; live: PlayerState; now: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const world = snap.s2!;
  const s2 = live.s2!;
  const list = world.convoys.filter((v) => !v.mine && !v.ally && v.owner && v.arrive > now);
  const mine = attackArmy(live);
  const price = sabotagePrice(live.seasonStart || now, now);
  const [sure, setSure] = useState<string | null>(null);
  return (
    <div className="s2-panel s2-contracts">
      <div className="row-title">🔭 Convois en vue</div>
      <p className="row-desc">Les convois des autres joueurs qui passent à {world.vision ?? 5} cases ou moins de ton château et de tes concessions{(world.vision ?? 5) > 5 ? " (« La tour de guet » incluse)" : ""}.</p>
      {list.length === 0 ? (
        <p className="row-desc">Aucun convoi en vue pour le moment.</p>
      ) : (
        <ul>
          {list.map((v) => {
            const id = `${v.owner}:${v.conc}:${v.depart}`;
            const point = s2.castle && armySize(mine) > 0 ? interceptPoint(v, s2.castle, (cells) => travelMs(mine, cells, armySpeedBonus(live)), now) : null;
            const why = v.why ?? (armySize(mine) === 0 ? "Aucune troupe au château." : !point ? "Ton armée ne peut pas le rattraper." : null);
            const sabWhy = v.why && !v.hit ? v.why : v.sabotaged ? "Déjà saboté." : s2.gold < price ? `Il faut ${formatNumber(price)} 🪙.` : null;
            return (
              <li key={id}>
                <div>
                  <b>{RESOURCE_ICON[v.res]} {v.ownerName}</b> · convoi {v.size} · {v.escort ? "🛡️ escorté" : "sans escorte"} · arrivée dans {dur(v.arrive - now)}
                  {v.hit ? " · déjà attaqué" : ""}
                </div>
                {point && !v.why && <div className="row-desc">Embuscade possible en ({point.cell[0]}, {point.cell[1]}), combat dans {dur(point.at - now)}. Butin : un tiers de la charge{s2.region === "desert" ? " (+10 % Désert)" : ""}.</div>}
                <div className="s2-settings">
                  {v.escort && sure !== id && !why ? (
                    <button className="btn btn-small" disabled={busy} onClick={() => setSure(id)}>🏇 Intercepter…</button>
                  ) : (
                    <button className="btn btn-small btn-primary" disabled={busy || !!why} title={why ?? "Toutes tes troupes au château partent en embuscade."} onClick={() => void act({ type: "intercept", target: v.owner!, conc: v.conc!, depart: v.depart })}>
                      {v.escort ? "🏇 Intercepter quand même" : "🏇 Intercepter"}
                    </button>
                  )}
                  <button className="btn btn-small" disabled={busy || !!sabWhy} title={sabWhy ?? "Un saboteur : 60 % de réussite (Forêt +10 %). Le convoi perd 15 % de sa charge et arrive 15 min plus tard."} onClick={() => void act({ type: "convoy_sabotage", target: v.owner!, conc: v.conc!, depart: v.depart })}>
                    🕯️ Saboter · 🪙 {formatNumber(price)}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** S8 : mes routes commerciales et celles qu'on me propose. */
function TradeRoutes({ snap, live, now, busy, act }: { snap: GameSnapshot; live: PlayerState; now: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const list = snap.s2!.trades ?? [];
  const s2 = live.s2!;
  return (
    <div className="s2-panel s2-contracts">
      <div className="row-title">🛤️ Routes commerciales</div>
      {list.length === 0 ? (
        <p className="row-desc">Aucune route. Touche le château d&apos;un autre joueur pour lui en proposer une (elle s&apos;ouvre quand il la propose aussi), ou une forteresse tenue par ton alliance. Un convoi par heure rapporte de l&apos;or selon la longueur de la route (+10 % en Côte) ; il peut être attaqué. {TRADE_MAX} routes au plus ({TRADE_MAX + 1} avec les Comptoirs de la Lignée).</p>
      ) : (
        <ul>
          {list.map((t) => (
            <li key={t.to}>
              <span>
                {t.name} · {t.active ? `ouverte, ${formatNumber(tradePay(s2, s2.castle!, t.pos, live.seasonStart || now, now))} 🪙 par convoi` : t.mine ? "proposée, en attente" : "te propose une route"}
              </span>
              <button className="btn btn-small" disabled={busy} onClick={() => void act({ type: "s2", op: "trade", to: t.to, on: !t.mine })}>
                {t.mine ? (t.active ? "Fermer" : "Retirer") : "Accepter"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Camp de bandits : sa garnison, son butin, l'assaut. */
function CampPanel({ live, camp, now, busy, act }: { live: PlayerState; camp: NonNullable<S2WorldView["camps"]>[number]; now: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const [sure, setSure] = useState(false);
  const mine = attackArmy(live);
  const opts = playerAttackOpts(live);
  const chance = armySize(mine) > 0 ? fightChance({ army: mine, levels: opts.attackerLevels, boost: opts.attackerBoost }, campSide({ id: camp.id, pos: camp.pos, from: camp.from }, now)) : 0;
  const pct = Math.round(chance * 100);
  const waiting = camp.from > now;
  return (
    <div className="s2-panel">
      <div className="row-title">🏕️ Camp de bandits</div>
      <div className="row-desc">
        Une compagnie de miliciens, entraînement {camp.train}. Ses bandits attaquent les convois qui passent à une case (15 %). Détruit, il rapporte ⚔️ {formatNumber(camp.loot)} fer et un autre camp apparaît ailleurs 6 h plus tard.
        {waiting ? ` Il s'installe : actif dans ${dur(camp.from - now)}.` : ""}
      </div>
      {!waiting && live.s2?.castle && (
        chance < 0.6 && !sure ? (
          <button className="btn" disabled={busy || armySize(mine) === 0} onClick={() => setSure(true)}>Attaquer… ({pct} %)</button>
        ) : (
          <button className="btn btn-primary" disabled={busy || armySize(mine) === 0} onClick={() => void act({ type: "camp", id: camp.id })}>{chance < 0.6 ? `Attaquer quand même (${pct} %)` : `Attaquer (${pct} %)`}</button>
        )
      )}
    </div>
  );
}

/** Vague C : louer une compagnie du seigneur pour escorter une concession pendant 12 h. */
function Mercs({ snap, live, lord, now, busy, act }: { snap: GameSnapshot; live: PlayerState; lord: S2WorldView["lords"][number]; now: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const s2 = live.s2!;
  const ml = snap.s2!.map.lords.find((x) => x.id === lord.id);
  const [conc, setConc] = useState(s2.conc[0]?.id ?? MERC_ARMY);
  if (!ml || !s2.castle) return null;
  const price = mercPrice(ml, live.seasonStart || now, now);
  const offer = mercOffer(ml, live.seasonStart || now, now);
  const why = mercBlocker(s2, ml, conc, price, now);
  const hired = mercsNow(s2, now).find((m) => m.lord === lord.id);
  const unit = unitOf(offer.unit);
  const site = (id: string) => {
    if (id === MERC_ARMY) return "ton armée";
    const c = s2.conc.find((x) => x.id === id);
    return c ? snap.s2!.map.sites[c.site]?.name ?? "concession" : "concession";
  };
  return (
    <div className="s2-settings">
      {hired ? (
        <span>⚔️ Ses mercenaires {hired.conc === MERC_ARMY ? "marchent avec ton armée sur les routes" : `escortent ${site(hired.conc)}`} encore {dur(hired.until - now)} ({hired.men} hommes).</span>
      ) : (
        <>
          <span>⚔️ Mercenaires : {offer.men} {unit ? unit.plural.toLowerCase() : offer.unit}, entraînement {offer.train}, pour 12 h, à l&apos;escorte d&apos;une concession ou avec ton armée (ils se joignent à tes pillages, interceptions, camps, contrats et délogements)</span>
          <select className="input" value={conc} onChange={(e) => setConc(e.target.value)} aria-label="Concession à escorter, ou ton armée">
            {s2.conc.map((c) => (
              <option key={c.id} value={c.id}>{site(c.id)}</option>
            ))}
            <option value={MERC_ARMY}>⚔️ avec ton armée</option>
          </select>
          <button className="btn btn-small" disabled={busy || !!why} title={why ?? undefined} onClick={() => void act({ type: "s2", op: "merc", id: lord.id, to: conc })}>
            Louer · 🪙 {formatNumber(price)}
          </button>
        </>
      )}
    </div>
  );
}

/** Chance estimée contre la garnison d'un seigneur, et une confirmation quand elle est faible. */
function LordAttack({ live, lord, busy, attack }: { live: PlayerState; lord: S2WorldView["lords"][number]; busy: boolean; attack: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    guideDone("lord");
  }, []);
  const mine = attackArmy(live);
  const g = garrisonOfView(lord);
  const chance = armySize(mine) > 0 ? estimateChance(mine, g.army, playerAttackOpts(live, { defenderLevels: g.levels })) : 0;
  const pct = Math.round(chance * 100);
  const risky = chance < 0.6;
  return (
    <div className="lord-attack">
      <div className="row-desc">
        {armySize(mine) === 0 ? (
          "Tu n'as aucune troupe au château : recrute d'abord dans l'onglet Armée."
        ) : (
          <>
            Chance de victoire estimée avec toutes tes troupes au château : <span className={`lord-chance ${risky ? "bad" : "good"}`}>{pct} %</span>.
            {risky && " Une défaite te coûte des hommes : entraîne et remplis tes compagnies avant d'attaquer."}
          </>
        )}
      </div>
      {!risky || sure ? (
        <button className="btn btn-primary" data-tuto="lord-attack" disabled={busy || armySize(mine) === 0} onClick={attack}>
          {risky ? `Attaquer quand même (${pct} %)` : `Attaquer (${pct} %)`}
        </button>
      ) : (
        <button className="btn" disabled={busy || armySize(mine) === 0} onClick={() => setSure(true)}>
          Attaquer…
        </button>
      )}
    </div>
  );
}

/** Vague B : hostilité du seigneur envers toi, sauf-conduit, vassalité. */
function LordRelations({ snap, live, lord, now, busy, act }: { snap: GameSnapshot; live: PlayerState; lord: S2WorldView["lords"][number]; now: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const s2 = live.s2!;
  const ml = snap.s2!.map.lords.find((x) => x.id === lord.id);
  if (!ml) return null;
  const v = hostilityAt(s2, lord.id, now);
  const lv = HOSTILITY_LEVELS[hostilityLevel(v)];
  const safe = (s2.safe?.[lord.id] ?? 0) > now ? s2.safe![lord.id] : 0;
  const price = safePrice(s2, ml, live.seasonStart || now, now);
  const why = safeBlocker(s2, ml, live.seasonStart || now, now);
  const vassal = lord.vassal && lord.vassal.until > now ? lord.vassal : null;
  const mine = vassal?.owner === snap.userId;
  return (
    <div className="s2-relations">
      <div className="row-desc">
        Hostilité envers toi : {lv.icon} <b>{lv.name}</b> ({Math.round(v)}/100).
        {lv.chance > 1 ? ` Ses patrouilles attaquent ${lv.chance === 2 ? "deux" : "une fois et demie"} fois plus souvent.` : ""}
        {lv.every > 0 ? ` Il envoie une expédition contre tes convois toutes les ${Math.round(lv.every / 3_600_000)} h.` : ""}
      </div>
      {vassal && (
        <div className="row-desc">
          👑 {mine ? "Ton vassal" : `Vassal de ${vassal.name}`} encore {dur(vassal.until - now)} : sa zone laisse passer les convois {mine ? "de ton alliance" : "de son suzerain et de son alliance"}
          {mine ? ", et un quart de sa production part en convoi vers ton château." : ". Bats sa garnison reformée pour le prendre."}
        </div>
      )}
      {!mine && (
        <div className="s2-settings">
          <span>{safe ? `📜 Sauf-conduit encore ${dur(safe - now)}` : "📜 Sauf-conduit : 24 h de passage libre dans sa zone (pas contre les joueurs ni les brigands)"}</span>
          <button className="btn btn-small" disabled={busy || !!why} title={why ?? undefined} onClick={() => void act({ type: "s2", op: "safe", id: lord.id })}>
            {safe ? "Prolonger" : "Acheter"}{price !== null ? ` · 🪙 ${formatNumber(price)}` : ""}
          </button>
        </div>
      )}
      {safe > 0 && <div className="row-desc">L&apos;attaquer romprait le sauf-conduit : hostilité +30 et deux expéditions de rancune.</div>}
    </div>
  );
}

/** Vague B : les concessions des autres joueurs sur ce site, et le pillage. */
function Occupants({ world, live, siteId, busy, act }: { world: S2WorldView; live: PlayerState; siteId: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const list = (world.occupants ?? []).filter((o) => o.site === siteId);
  const mine = attackArmy(live);
  if (list.length === 0) return null;
  return (
    <div className="s2-occupants">
      <div className="row-title">Concessions des autres</div>
      <ul>
        {list.map((o) => (
          <li key={o.conc}>
            <span>
              {o.name} · niv. {o.level} · {o.escort ? "🛡️ escortée" : "sans escorte"}{o.tower ? ` · 🗼 tour niv. ${o.tower} (${o.tower * 200} arbalétriers)` : ""}
            </span>
            {o.why ? (
              <span className="row-desc"> · {o.why}</span>
            ) : (
              <button className="btn btn-small" disabled={busy || armySize(mine) === 0} title={armySize(mine) === 0 ? "Aucune troupe au château." : "Toutes tes troupes au château partent. Butin : 25 % du stock et 15 % de la réserve, au plus le tiers. Une fois toutes les 6 h."} onClick={() => void act({ type: "pillage", target: o.owner, conc: o.conc })}>
                ⛏️ Piller
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="row-desc">Le pillage se joue contre l&apos;escorte de la route et les gardes de la tour du site ; sans l&apos;une ni l&apos;autre, il réussit. Ton armée revient avec le butin.</p>
    </div>
  );
}

/** Vague B : contrats du jour des seigneurs neutres envers toi. */
function Contracts({ snap, live, now, busy, act }: { snap: GameSnapshot; live: PlayerState; now: number; busy: boolean; act: (a: GameAction) => Promise<void> }) {
  const map = snap.s2!.map;
  const list = contractsFor(live.s2!, map, snap.userId, dailyDay(now), live.seasonStart || now, now);
  const mine = attackArmy(live);
  const name = (id: string) => snap.s2!.lords.find((l) => l.id === id)?.name ?? id;
  const [sure, setSure] = useState<string | null>(null);
  return (
    <div className="s2-panel s2-contracts">
      <div className="row-title">📜 Contrats du jour</div>
      {list.length === 0 ? (
        <p className="row-desc">Plus de contrat aujourd&apos;hui. Les seigneurs neutres envers toi en proposent de nouveaux chaque jour à 4 h.</p>
      ) : (
        <ul>
          {list.map((c) => {
            const t = CONTRACT_TEXT[c.kind];
            const foe = contractFoe(c, map, live.seasonStart || now, now);
            const chance = armySize(mine) > 0 ? fightChance({ army: mine, levels: playerAttackOpts(live).attackerLevels, boost: playerAttackOpts(live).attackerBoost }, foe) : 0;
            return (
              <li key={c.id}>
                <div>
                  <b>{t.icon} {t.title(name(c.lord), c.rival ? name(c.rival) : undefined)}</b>
                </div>
                <div className="row-desc">
                  {t.text} Récompense : 🪙 {formatNumber(c.gold)} et 🎖️ 3. À {live.s2?.castle ? cheb(live.s2.castle, c.pos) : "?"} cases.
                  {armySize(mine) > 0 ? ` Chance avec toutes tes troupes au château : ${Math.round(chance * 100)} %.` : ""}
                </div>
                {chance < 0.6 && sure !== c.id ? (
                  <button className="btn btn-small" disabled={busy || armySize(mine) === 0 || chance < CONTRACT_MIN_CHANCE} title={armySize(mine) === 0 ? "Aucune troupe au château." : chance < CONTRACT_MIN_CHANCE ? "Ton armée n'a presque aucune chance : recrute d'abord." : undefined} onClick={() => setSure(c.id)}>
                    Accepter…
                  </button>
                ) : (
                  <button className="btn btn-small btn-primary" disabled={busy || armySize(mine) === 0} onClick={() => void act({ type: "contract", id: c.id })}>
                    {chance < 0.6 ? `Accepter quand même (${Math.round(chance * 100)} %)` : "Accepter"}
                  </button>
                )}
                {chance < 0.6 && sure === c.id && <div className="row-desc">Une défaite coûte des hommes : renforce ton armée avant de partir.</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
