"use client";

// Saison 2 : le domaine, lieu par lieu. À droite, la liste de tes terres (château et concessions) pour choisir
// où travailler ; en haut, les ressources du lieu choisi ; au centre, ce qui se fait dans ce lieu.
import { useState } from "react";
import { openTutorial } from "@/components/s2-tutorial";
import { formatNumber } from "@/lib/game/format";
import { lin, LIN_GENERATOR_DISCOUNT } from "@/lib/game/lineage";
import type { PlayerState } from "@/lib/game/engine";
import type { GameAction, GameSnapshot } from "@/lib/game/types";
import {
  BANDIT_HIGH,
  BUILDING_IDS,
  BUILDINGS,
  buildBlocker,
  buildingCost,
  buildingMs,
  buyConcessionBlocker,
  CONC_BUILDING_IDS,
  CONC_BUILDING_MAX,
  CONC_BUILDINGS,
  concBuildBlocker,
  concBuildingCost,
  concBuildingMs,
  CONCESSION_GOLD,
  CONCESSION_MAX_LEVEL,
  concessionBudget,
  concessionBuildMs,
  concessionCost,
  concessionRate,
  concessionSlots,
  convoyIntervalMs,
  convoyLoad,
  exchangeBlocker,
  fundRoom,
  localCap,
  marketQuote,
  PACES,
  RESOURCE_ICON,
  RESOURCE_LABEL,
  SECOND_SLOT_LEVEL,
  stockFull,
  supplyBlocker,
  TIERS,
  tierOf,
  upgradeConcessionBlocker,
  VALUE,
  type Concession,
  type Pace,
  type S2State,
} from "@/lib/game/s2/economy";
import { cheb, REGIONS, type Resource, type S2Map } from "@/lib/game/s2/map";

type Run = (action: GameAction) => Promise<unknown>;
/** Lieu choisi : le château, ou l'identifiant d'une concession. */
export type Place = "chateau" | string;

export const TIER_ICON = ["⛺", "🏚️", "🏭", "🏰"];
const RES: Resource[] = ["pierre", "fer", "or"];

/** Durée lisible : « 12 s », « 3 min 05 », « 1 h 20 ». */
export const dur = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  if (t < 60) return `${t} s`;
  if (t < 3600) return `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, "0")}`;
  return `${Math.floor(t / 3600)} h ${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}`;
};

export function concName(map: S2Map, c: Concession): string {
  const site = map.sites[c.site];
  return site?.name || (site ? `${RESOURCE_LABEL[site.type][0].toUpperCase()}${RESOURCE_LABEL[site.type].slice(1)}` : "Concession");
}

/** Le lieu choisi existe-t-il encore ? Sinon, retour au château. */
export function placeOf(s2: S2State | undefined, place: Place): Place {
  return place !== "chateau" && s2?.conc.some((c) => c.id === place) ? place : "chateau";
}

/** Ce qui arrive au château chaque heure, par ressource (concessions en départs automatiques vers le château). */
function castleIncome(s2: S2State, map: S2Map): Record<Resource, number> {
  const out: Record<Resource, number> = { pierre: 0, fer: 0, or: 0 };
  for (const c of s2.conc) {
    const site = map.sites[c.site];
    if (!site || c.manual || c.destConc || (c.dest ?? "chateau") !== "chateau") continue;
    out[site.type] += concessionRate(s2, c, map);
  }
  return out;
}

function stageConcessions(snap: GameSnapshot, now: number): number {
  return snap.worksite.stageCompletedAt.filter((t) => t <= now).length >= 1 ? 1 : 0;
}

/** Un chantier en cours : son nom, le temps restant qui défile, et une barre d'avancement. */
export function Work({ icon, label, start, until, now }: { icon: string; label: string; start: number; until: number; now: number }) {
  const pct = Math.min(100, Math.max(0, ((now - start) / Math.max(1, until - start)) * 100));
  return (
    <div className="s2-work">
      <div className="s2-work-head">
        <span>
          {icon} {label}
        </span>
        <span className="num">{until > now ? dur(until - now) : "terminé"}</span>
      </div>
      <div className="bar bar-thin" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barre de ressources : celles du lieu où l'on travaille.
// ---------------------------------------------------------------------------

export function S2ResourceBar({ live, now, place, map }: { live: PlayerState; now: number; place: Place; map: S2Map }) {
  const s2 = live.s2;
  if (!s2?.castle) return null;
  const c = place === "chateau" ? undefined : s2.conc.find((x) => x.id === place);
  const have: Record<Resource, number> = { pierre: live.stone, fer: s2.iron, or: s2.gold };
  if (!c) {
    const income = castleIncome(s2, map);
    return (
      <div className="resbar" aria-label="Ressources du château">
        <span className="resbar-place">🏰 Château</span>
        {RES.map((r) => (
          <span key={r} className="res" title={`${RESOURCE_LABEL[r]} au château${income[r] ? `, environ +${formatNumber(income[r])} par heure par les convois` : ""}`}>
            <span className="res-icon" aria-hidden>{RESOURCE_ICON[r]}</span>
            <span className="res-val num">{formatNumber(Math.floor(have[r]))}</span>
            <span className="res-sub num">{income[r] ? `+${formatNumber(income[r])}/h` : RESOURCE_LABEL[r]}</span>
          </span>
        ))}
      </div>
    );
  }
  const site = map.sites[c.site];
  const cap = localCap(s2, c, map);
  const pct = Math.min(100, (c.stock / Math.max(1, cap)) * 100);
  const res = site?.type ?? "pierre";
  return (
    <div className="resbar resbar-conc" aria-label={`Ressources de ${concName(map, c)}`}>
      <span className="resbar-place">
        {RESOURCE_ICON[res]} {concName(map, c)}
      </span>
      <span className="res res-wide" title="Stock de la concession : ce qui attend le prochain convoi, et sert à ses améliorations.">
        <span className="res-icon" aria-hidden>📦</span>
        <span className="res-val num">
          {formatNumber(Math.floor(c.stock))} <small>/ {formatNumber(cap)}</small>
        </span>
        <span className={`bar bar-thin${pct >= BANDIT_HIGH * 100 ? " bar-warn" : ""}`}>
          <span style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className="res" title="Production de cette concession, par heure.">
        <span className="res-icon" aria-hidden>⛏️</span>
        <span className="res-val num">{formatNumber(concessionRate(s2, c, map))}</span>
        <span className="res-sub">{RESOURCE_LABEL[res]}/h</span>
      </span>
      <span className="res" title="Réserve de chantier : envoyée par le château, elle paie les améliorations de la concession avant son stock.">
        <span className="res-icon" aria-hidden>🧱</span>
        <span className="res-val num">{formatNumber(Math.floor(c.fund ?? 0))}</span>
        <span className="res-sub">réserve</span>
      </span>
      <span className="res" title="Prochain convoi vers sa destination.">
        <span className="res-icon" aria-hidden>🛒</span>
        <span className="res-val num">{c.manual ? "à la main" : dur(c.next - now)}</span>
        <span className="res-sub">convoi</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mes terres : la liste à droite pour choisir où travailler.
// ---------------------------------------------------------------------------

export function S2Lands({ snap, live, now, place, select, openMap, run }: { snap: GameSnapshot; live: PlayerState; now: number; place: Place; select: (p: Place) => void; openMap: () => void; run: Run }) {
  const s2 = live.s2;
  const map = snap.s2?.map;
  if (!s2 || !map) return null;
  if (!s2.castle) {
    return (
      <div className="panel lands">
        <h3>Mes terres</h3>
        <button className="land land-empty" onClick={openMap}>
          <span className="land-icon" aria-hidden>🏰</span>
          <span className="land-body">
            <span className="land-name">Pose ton château</span>
            <span className="land-sub">Choisis sa case sur la carte</span>
          </span>
        </button>
      </div>
    );
  }
  const slots = concessionSlots(s2, { stageConcessions: stageConcessions(snap, now) });
  const castleBusy = s2.works.some((w) => w.until > now);
  const buyWhy = buyConcessionBlocker(s2);
  return (
    <div className="panel lands">
      <h3>
        Mes terres <span className="lands-count num">{s2.conc.length}/{slots}</span>
      </h3>
      <button className="land" aria-pressed={place === "chateau"} data-tuto="land-chateau" onClick={() => select("chateau")}>
        <span className="land-icon" aria-hidden>🏰</span>
        <span className="land-body">
          <span className="land-name">Château</span>
          <span className="land-sub num">
            🪨 {formatNumber(Math.floor(live.stone))} · ⚔️ {formatNumber(Math.floor(s2.iron))} · 🪙 {formatNumber(Math.floor(s2.gold))}
          </span>
        </span>
        {castleBusy && <span className="land-flag" title="Chantier en cours">🔨</span>}
      </button>
      {s2.conc.map((c, i) => {
        const site = map.sites[c.site];
        if (!site) return null;
        const cap = localCap(s2, c, map);
        const pct = Math.min(100, (c.stock / Math.max(1, cap)) * 100);
        const busy = (c.upUntil ?? 0) > now || (c.cwork?.until ?? 0) > now;
        const danger = pct >= BANDIT_HIGH * 100 && c.pace !== "prudent";
        return (
          <button key={c.id} className="land" aria-pressed={place === c.id} data-tuto={i === 0 ? "land-conc0" : undefined} onClick={() => select(c.id)}>
            <span className="land-icon" aria-hidden>{RESOURCE_ICON[site.type]}</span>
            <span className="land-body">
              <span className="land-name">{concName(map, c)}</span>
              <span className="land-sub">
                {TIER_ICON[tierOf(c.level)]} niv. {c.level} · {formatNumber(concessionRate(s2, c, map))}/h
              </span>
              <span className={`bar bar-thin${danger ? " bar-warn" : ""}`} title={`Stock ${formatNumber(Math.floor(c.stock))} / ${formatNumber(cap)}`}>
                <span style={{ width: `${pct}%` }} />
              </span>
            </span>
            {busy && <span className="land-flag" title="Chantier en cours">🔨</span>}
            {danger && <span className="land-flag" title="Stock au-dessus de 90 % : des brigands rôdent">🗡️</span>}
          </button>
        );
      })}
      {s2.conc.length < slots && (
        <button className="land land-empty" data-tuto="land-free" onClick={openMap}>
          <span className="land-icon" aria-hidden>➕</span>
          <span className="land-body">
            <span className="land-name">Place libre</span>
            <span className="land-sub">Choisis un site sur la carte</span>
          </span>
        </button>
      )}
      {slots < 2 && (
        <div className="land land-locked">
          <span className="land-icon" aria-hidden>🔒</span>
          <span className="land-body">
            <span className="land-name">2ᵉ concession</span>
            <span className="land-sub">Monte une concession au niveau {SECOND_SLOT_LEVEL}, ou attends la 1ʳᵉ étape du beffroi</span>
          </span>
        </div>
      )}
      {s2.bought < CONCESSION_GOLD.length && slots >= 2 && (
        <button className="btn btn-small lands-buy" disabled={!!buyWhy} title={buyWhy ?? "Une place de plus pour une concession."} onClick={() => void run({ type: "s2", op: "buy" })}>
          🪙 Acheter une place · {formatNumber(CONCESSION_GOLD[s2.bought])}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le domaine : ce qui se fait dans le lieu choisi.
// ---------------------------------------------------------------------------

export function S2Domain({ snap, live, now, run, place, select }: { snap: GameSnapshot; live: PlayerState; now: number; run: Run; place: Place; select: (p: Place) => void }) {
  const s2 = live.s2;
  const world = snap.s2;
  if (!s2 || !world) return <p className="empty">La saison 2 n&apos;est pas encore ouverte.</p>;
  if (!s2.castle) return <p className="empty">Pose d&apos;abord ton château depuis l&apos;onglet Carte.</p>;
  const c = place === "chateau" ? undefined : s2.conc.find((x) => x.id === place);
  return c ? <ConcessionView snap={snap} live={live} s2={s2} c={c} now={now} run={run} select={select} /> : <CastleView snap={snap} live={live} s2={s2} now={now} run={run} select={select} />;
}

function CastleView({ snap, live, s2, now, run, select }: { snap: GameSnapshot; live: PlayerState; s2: S2State; now: number; run: Run; select: (p: Place) => void }) {
  const map = snap.s2!.map;
  const discount = lin(live, "main_oeuvre") ? 1 - LIN_GENERATOR_DISCOUNT : 1;
  const region = REGIONS.find((r) => r.id === s2.region);
  const income = castleIncome(s2, map);
  const works: { key: string; icon: string; label: string; start: number; until: number; place: Place }[] = [];
  for (const c of s2.conc) {
    if (c.upUntil && c.upUntil > now) works.push({ key: `up-${c.id}`, icon: "⛏️", label: `${concName(map, c)} → niveau ${c.level + 1}`, start: c.upUntil - concessionBuildMs(c.level + 1), until: c.upUntil, place: c.id });
    if (c.cwork && c.cwork.until > now) works.push({ key: `cb-${c.id}`, icon: CONC_BUILDINGS[c.cwork.id].icon, label: `${CONC_BUILDINGS[c.cwork.id].name} niv. ${c.cwork.level} · ${concName(map, c)}`, start: c.cwork.until - concBuildingMs(c.cwork.level), until: c.cwork.until, place: c.id });
  }
  for (const w of s2.works) if (w.until > now) works.push({ key: `w-${w.id}-${w.level}`, icon: BUILDINGS[w.id].icon, label: `${BUILDINGS[w.id].name} → niveau ${w.level}`, start: w.until - buildingMs(w.level), until: w.until, place: "chateau" });
  works.sort((a, b) => a.until - b.until);
  const moving = s2.convoys.filter((v) => v.arrive > now).sort((a, b) => a.arrive - b.arrive);
  return (
    <div className="s2-place">
      <header className="place-head">
        <div className="place-icon" aria-hidden>🏰</div>
        <div>
          <h2>Ton château</h2>
          <p className="row-desc">
            Case ({s2.castle![0]}, {s2.castle![1]}){region ? ` · ${region.icon} ${region.name} : ${region.bonus}` : ""}. Il reçoit les convois, paie les bâtiments ci-dessous et l&apos;armée.
          </p>
        </div>
        <button className="btn btn-small" onClick={openTutorial}>📖 Règles</button>
      </header>

      <section className="place-section">
        <h3>Vue d&apos;ensemble</h3>
        <div className="tiles">
          {RES.map((r) => (
            <div key={r} className="tile">
              <div className="tile-label">{RESOURCE_ICON[r]} {RESOURCE_LABEL[r]} par heure</div>
              <div className="tile-val num">+{formatNumber(income[r])}</div>
              <div className="tile-sub">par les convois automatiques</div>
            </div>
          ))}
        </div>
        {(works.length > 0 || moving.length > 0) && (
          <div className="s2-works">
            {works.map((w) => (
              <button key={w.key} className="work-link" onClick={() => select(w.place)} title="Voir ce lieu">
                <Work icon={w.icon} label={w.label} start={w.start} until={w.until} now={now} />
              </button>
            ))}
            {moving.length > 0 && (
              <Work
                icon="🛒"
                label={`${moving.length} convoi${moving.length > 1 ? "s" : ""} en route · le prochain apporte ${formatNumber(moving[0].load)} ${RESOURCE_LABEL[moving[0].res]}`}
                start={moving[0].depart}
                until={moving[0].arrive}
                now={now}
              />
            )}
          </div>
        )}
      </section>

      <section className="place-section">
        <h3>Bâtiments du château</h3>
        <p className="row-desc">Payés en 🪨 pierre du château, deux chantiers à la fois. Ils valent pour toutes tes concessions.</p>
        <div className="cards">
          {BUILDING_IDS.map((id) => {
            const def = BUILDINGS[id];
            const work = s2.works.filter((w) => w.id === id && w.until > now);
            const next = Math.max(s2.bld[id], ...work.map((w) => w.level)) + 1;
            const why = buildBlocker(s2, id, live.stone, discount);
            const cost = Math.ceil(buildingCost(id, next) * discount);
            return (
              <div key={id} className="card">
                <div className="card-head">
                  <span className="card-icon" aria-hidden>{def.icon}</span>
                  <span className="card-name">{def.name}</span>
                  <span className="badge">niv. {s2.bld[id]}</span>
                </div>
                <p className="card-text">{def.text}.</p>
                {work.map((w) => (
                  <Work key={w.level} icon="🔨" label={`Niveau ${w.level}`} start={w.until - buildingMs(w.level)} until={w.until} now={now} />
                ))}
                <button className="btn btn-small btn-primary" data-tuto={`bld-${id}`} disabled={!!why} title={why ?? undefined} onClick={() => void run({ type: "s2", op: "build", building: id })}>
                  Niveau {next} · 🪨 {formatNumber(cost)} · ⏱ {dur(buildingMs(next))}
                </button>
                {why && <p className="card-why">{why}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <Market live={live} s2={s2} run={run} />
    </div>
  );
}

function Market({ live, s2, run }: { live: PlayerState; s2: S2State; run: Run }) {
  const [from, setFrom] = useState<Resource>("pierre");
  const [to, setTo] = useState<Resource>("fer");
  const [amount, setAmount] = useState(1000);
  const have = { pierre: live.stone, fer: s2.iron, or: s2.gold };
  const why = exchangeBlocker(have, from, to, amount);
  return (
    <section className="place-section">
      <h3>⚖️ Marché</h3>
      <p className="row-desc">Échange immédiat au tiers de la valeur (1 or vaut 4 pierre, 1 fer en vaut 2).</p>
      <div className="s2-market">
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))} aria-label="Quantité" />
        <select value={from} onChange={(e) => setFrom(e.target.value as Resource)} aria-label="Ressource donnée">
          {RES.map((r) => <option key={r} value={r}>{RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}</option>)}
        </select>
        <span>→</span>
        <select value={to} onChange={(e) => setTo(e.target.value as Resource)} aria-label="Ressource reçue">
          {RES.map((r) => <option key={r} value={r}>{RESOURCE_ICON[r]} {RESOURCE_LABEL[r]}</option>)}
        </select>
        <button className="btn btn-primary" disabled={!!why} title={why ?? undefined} onClick={() => void run({ type: "s2", op: "exchange", from, to, amount })}>
          Recevoir {from !== to ? formatNumber(marketQuote(from, to, amount)) : 0} {RESOURCE_LABEL[to]}
        </button>
      </div>
    </section>
  );
}

function ConcessionView({ snap, live, s2, c, now, run, select }: { snap: GameSnapshot; live: PlayerState; s2: S2State; c: Concession; now: number; run: Run; select: (p: Place) => void }) {
  const map = snap.s2!.map;
  const [supply, setSupply] = useState<{ res: Resource; amount: number }>({ res: "pierre", amount: 500 });
  const site = map.sites[c.site];
  if (!site) return null;
  const res = site.type;
  const rate = concessionRate(s2, c, map);
  const cap = localCap(s2, c, map);
  const load = convoyLoad(s2, c, map);
  const per = rate * (convoyIntervalMs(s2) / 3_600_000);
  const upWhy = upgradeConcessionBlocker(s2, c.id, map, now);
  const budget = concessionBudget(c, map);
  const incoming = s2.convoys.filter((v) => v.dest === "concession" && v.conc === c.id && v.arrive > now);
  const have = { pierre: live.stone, fer: s2.iron, or: s2.gold };
  const supplyWhy = supplyBlocker(s2, c.id, have, supply.res, supply.amount);
  const tier = tierOf(c.level);
  const dist = s2.castle ? cheb(site.pos, s2.castle) : 0;
  const danger = c.stock >= BANDIT_HIGH * cap && c.pace !== "prudent";
  const upCost = concessionCost(c.level + 1);
  const destLabel = c.destConc ? `${concName(map, s2.conc.find((o) => o.id === c.destConc) ?? c)} (réserve)` : (c.dest ?? "chateau") === "beffroi" ? "le beffroi" : "ton château";
  return (
    <div className="s2-place">
      <header className="place-head">
        <div className="place-icon" aria-hidden>{RESOURCE_ICON[res]}</div>
        <div>
          <h2>
            {concName(map, c)} <span className="badge">niv. {c.level}</span> <span className="badge">{TIER_ICON[tier]} {TIERS[tier].name}</span>
          </h2>
          <p className="row-desc">
            {res === "pierre" ? "Carrière" : res === "fer" ? "Mine de fer" : "Filon d'or"} à {dist} case{dist > 1 ? "s" : ""} de ton château. Ses convois vont vers {destLabel}.
          </p>
        </div>
        <button className="btn btn-small" onClick={() => select("chateau")}>🏰 Château</button>
      </header>

      {danger && <p className="notice notice-warn">🗡️ Stock au-dessus de 90 % : des brigands rôdent. Chaque heure, 30 % de risque d&apos;en perdre 20 %. Envoie un convoi, ou passe en prudent.</p>}
      {!danger && stockFull(s2, c, map) && <p className="notice notice-warn">⚠️ Stock plein : la concession s&apos;arrête. Envoie un convoi ou augmente la charge (écurie, charronnerie).</p>}

      <section className="place-section">
        <div className="tiles">
          <div className="tile">
            <div className="tile-label">⛏️ Production</div>
            <div className="tile-val num">{formatNumber(rate)}</div>
            <div className="tile-sub">{RESOURCE_LABEL[res]} par heure</div>
          </div>
          <div className="tile">
            <div className="tile-label">📦 Stock</div>
            <div className="tile-val num">
              {formatNumber(Math.floor(c.stock))} <small>/ {formatNumber(cap)}</small>
            </div>
            <div className={`bar bar-thin${danger ? " bar-warn" : ""}`}>
              <span style={{ width: `${Math.min(100, (c.stock / Math.max(1, cap)) * 100)}%` }} />
            </div>
          </div>
          <div className="tile">
            <div className="tile-label">🛒 Convoi</div>
            <div className="tile-val num">{formatNumber(load)}</div>
            <div className="tile-sub">{c.manual ? "envoyé à la main" : `toutes les ${dur(convoyIntervalMs(s2))}, prochain ${dur(c.next - now)}`}</div>
          </div>
          <div className="tile">
            <div className="tile-label">🧱 Réserve de chantier</div>
            <div className="tile-val num">{formatNumber(Math.floor(c.fund ?? 0))}</div>
            <div className="tile-sub">
              {formatNumber(budget)} disponibles avec le stock{incoming.length ? ` · +${formatNumber(incoming.reduce((a, v) => a + v.load * VALUE[v.res], 0))} en route` : ""}
            </div>
          </div>
        </div>
        {per > load && !c.manual && <p className="row-desc s2-over">La charge ({formatNumber(load)}) ne suit pas la production d&apos;un intervalle ({formatNumber(per)}) : le stock va se remplir. Bâtis une écurie ici ou monte la charronnerie au château.</p>}
      </section>

      <section className="place-section">
        <h3>Améliorer</h3>
        <div className="cards">
          {c.level < CONCESSION_MAX_LEVEL ? (
            <div className="card card-main">
              <div className="card-head">
                <span className="card-icon" aria-hidden>{TIER_ICON[tierOf(c.level + 1)]}</span>
                <span className="card-name">Concession niveau {c.level + 1}</span>
              </div>
              <p className="card-text">
                +15 % de production et de charge.{c.level + 1 === SECOND_SLOT_LEVEL ? " Ouvre une deuxième place de concession." : ""}
                {TIERS.some((t) => t.from === c.level + 1) ? ` Passe au palier ${TIERS.find((t) => t.from === c.level + 1)!.name}.` : ""} Payé avec la réserve, puis le stock ({formatNumber(budget)} / {formatNumber(upCost)} en valeur pierre).
              </p>
              {c.upUntil && c.upUntil > now && <Work icon="⛏️" label={`Niveau ${c.level + 1}`} start={c.upUntil - concessionBuildMs(c.level + 1)} until={c.upUntil} now={now} />}
              <button className="btn btn-small btn-primary" data-tuto="conc-upgrade" data-conc={c.id} disabled={!!upWhy} title={upWhy ?? undefined} onClick={() => void run({ type: "s2", op: "upgrade", id: c.id })}>
                Niveau {c.level + 1} · 🧱 {formatNumber(upCost)} · ⏱ {dur(concessionBuildMs(c.level + 1))}
              </button>
              {upWhy && <p className="card-why">{upWhy}</p>}
            </div>
          ) : (
            <div className="card card-main">
              <div className="card-head">
                <span className="card-icon" aria-hidden>🏰</span>
                <span className="card-name">Niveau maximal</span>
              </div>
              <p className="card-text">Grand domaine : ta bannière flotte sur la carte.</p>
            </div>
          )}
          {CONC_BUILDING_IDS.map((b) => {
            const lvl = c.cb?.[b] ?? 0;
            const why = concBuildBlocker(s2, c.id, b, map, now);
            const working = c.cwork && c.cwork.until > now && c.cwork.id === b ? c.cwork : null;
            return (
              <div key={b} className="card">
                <div className="card-head">
                  <span className="card-icon" aria-hidden>{CONC_BUILDINGS[b].icon}</span>
                  <span className="card-name">{CONC_BUILDINGS[b].name}</span>
                  <span className="badge">niv. {lvl}</span>
                </div>
                <p className="card-text">{CONC_BUILDINGS[b].text}.</p>
                {working && <Work icon="🔨" label={`Niveau ${working.level}`} start={working.until - concBuildingMs(working.level)} until={working.until} now={now} />}
                {lvl < CONC_BUILDING_MAX && (
                  <button className="btn btn-small btn-primary" data-tuto={`cbuild-${b}`} disabled={!!why} title={why ?? undefined} onClick={() => void run({ type: "s2", op: "cbuild", id: c.id, building: b })}>
                    Niveau {lvl + 1} · 🧱 {formatNumber(concBuildingCost(lvl + 1))} · ⏱ {dur(concBuildingMs(lvl + 1))}
                  </button>
                )}
                {why && lvl < CONC_BUILDING_MAX && <p className="card-why">{why}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="place-section">
        <h3>🧱 Ravitailler depuis le château</h3>
        <p className="row-desc">
          Un convoi part du château et remplit la réserve de chantier de cette concession (fer ×2, or ×4 en valeur pierre).
          {c.level < CONCESSION_MAX_LEVEL ? ` Elle accepte encore ${formatNumber(Math.max(0, fundRoom(s2, c)))}.` : ""}
          {incoming.length > 0 && ` Arrivée du prochain dans ${dur(Math.min(...incoming.map((v) => v.arrive)) - now)}.`}
        </p>
        <div className="s2-market">
          <input type="number" min={1} step={100} value={supply.amount} onChange={(e) => setSupply({ ...supply, amount: Math.max(1, Math.floor(Number(e.target.value) || 0)) })} aria-label="Quantité à envoyer" />
          <select value={supply.res} onChange={(e) => setSupply({ ...supply, res: e.target.value as Resource })} aria-label="Ressource à envoyer">
            {RES.map((r) => <option key={r} value={r}>{RESOURCE_ICON[r]} {RESOURCE_LABEL[r]} ({formatNumber(Math.floor(have[r]))})</option>)}
          </select>
          <button className="btn btn-primary" data-tuto="supply" disabled={!!supplyWhy} title={supplyWhy ?? undefined} onClick={() => void run({ type: "s2", op: "supply", id: c.id, from: supply.res, amount: supply.amount })}>
            Envoyer
          </button>
        </div>
        {supplyWhy && <p className="card-why">{supplyWhy}</p>}
      </section>

      <section className="place-section">
        <h3>🛒 Logistique</h3>
        <div className="s2-settings">
          <span>Départs</span>
          <button className={`btn btn-small${!c.manual ? " btn-primary" : ""}`} disabled={!c.manual} title="Un convoi part tout seul à chaque intervalle." onClick={() => void run({ type: "s2", op: "set", id: c.id, manual: false })}>
            Automatiques
          </button>
          <button className={`btn btn-small${c.manual ? " btn-primary" : ""}`} disabled={!!c.manual} title="La concession garde tout pour ses améliorations." onClick={() => void run({ type: "s2", op: "set", id: c.id, manual: true })}>
            À la main
          </button>
          {c.manual && (
            <button className="btn btn-small btn-primary" disabled={c.stock < 1} onClick={() => void run({ type: "s2", op: "ship", id: c.id })}>
              🛒 Envoyer un convoi ({formatNumber(Math.min(c.stock, load))})
            </button>
          )}
        </div>
        <div className="s2-settings">
          <span>Destination</span>
          {(["chateau", "beffroi"] as const).map((k) => (
            <button key={k} className={`btn btn-small${!c.destConc && (c.dest ?? "chateau") === k ? " btn-primary" : ""}`} disabled={!c.destConc && (c.dest ?? "chateau") === k} title={k === "beffroi" ? "Chaque convoi arrivé compte entièrement comme un don au beffroi." : "Ton château."} onClick={() => void run({ type: "s2", op: "set", id: c.id, dest: k })}>
              {k === "beffroi" ? "🔔 Beffroi" : "🏰 Château"}
            </button>
          ))}
          {s2.conc
            .filter((o) => o.id !== c.id && map.sites[o.site])
            .map((o) => (
              <button key={o.id} className={`btn btn-small${c.destConc === o.id ? " btn-primary" : ""}`} disabled={c.destConc === o.id} title="Remplit la réserve de chantier de cette concession ; quand elle est pleine, le reste va au château." onClick={() => void run({ type: "s2", op: "set", id: c.id, dest: o.id })}>
                {RESOURCE_ICON[map.sites[o.site].type]} {concName(map, o)}
              </button>
            ))}
        </div>
        <div className="s2-settings">
          <span>Rythme</span>
          {(Object.keys(PACES) as Pace[]).map((k) => (
            <button key={k} className={`btn btn-small${(c.pace ?? "normal") === k ? " btn-primary" : ""}`} disabled={(c.pace ?? "normal") === k} title={PACES[k].text} onClick={() => void run({ type: "s2", op: "set", id: c.id, pace: k })}>
              {k === "prudent" ? "🐢 " : k === "intensif" ? "🔥 " : ""}
              {PACES[k].name}
            </button>
          ))}
        </div>
        <p className="row-desc">{PACES[c.pace ?? "normal"].text}{c.manual ? " Départs à la main : le stock reste ici pour les améliorations ; au-dessus de 90 %, les brigands rôdent (sauf en prudent)." : ""}</p>
      </section>

      {s2.conc.length > 1 && (
        <details className="place-danger">
          <summary>Abandonner cette concession</summary>
          <p className="row-desc">La place se libère ; niveau, bâtiments, stock et réserve sont perdus.</p>
          <button className="btn btn-small" onClick={() => void run({ type: "s2", op: "drop", id: c.id })}>
            Abandonner {concName(map, c)}
          </button>
        </details>
      )}
    </div>
  );
}
