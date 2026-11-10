"use client";

import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "@/app/(auth)/actions";
import {
  CATEGORY_LABELS,
  MAX_ALLIANCE_SIZE,
  HALL,
  ONLINE_MS,
  DIFFICULTY_LABELS,
  COMBATANTS,
  LEVEL_BONUS,
  ELAN_MAX_MS,
  ELAN_PER_CLICK_MS,
  MAX_TITHE,
  ADVISED_TITHE,
  DONOR_TIERS,
  DONOR_TIER_ECUS,
  DONOR_TIER_BONUS,
  CURFEW_MINUTES,
  LOT_ECUS,
  MASTER_BONUSES,
  type MasterBonusKind,
  QUESTS,
  VEIN_VISIBLE_MS,
  ACADEMY_SPEED,
  RESEARCH_QUEUE_MAX,
  DEFENSES,
  GENERATORS,
  RAID_COOLDOWN_MS,
  STAGES,
  UNITS,
  UPGRADES,
  type Category,
  type CombatantDef,
  type CombatantId,
  type GeneratorId,
  type HallUnit,
  REVENGE_ATTACK_BONUS,
  MAP_SPAWN_RADIUS,
  MAX_MARCHES,
  MERCHANT_OFFERS,
  type MerchantChoice,
  mapDistance,
} from "@/lib/game/config";
import {
  advance,
  inCurfew,
  stagePerk,
  productionPerSecond,
  questProgress,
  armyWorth,
  clickValue,
  generatorCost,
  generatorRate,
  lootOf,
  spyCost,
  academyCost,
  levelOf,
  elanBonus,
  queuedLevel,
  researchCost,
  researchTime,
  maxAffordable,
  owned,
  productionMultiplier,
  rateAt,
  ruinCost,
  ruinsOf,
  stagesDoneAt,
  upgradeCost,
  upgradeUnlocked,
  attackArmy,
  travelMs,
  type PlayerState,
} from "@/lib/game/engine";
import { formatNumber, formatRate } from "@/lib/game/format";
import { battle, estimateChance, seededRng, type Army } from "@/lib/game/battle";
import { worldFrom, type AwaySummary, type LotView, type AllianceSummary, type ChronicleEntry, type EventView, type GameSnapshot, type RivalView } from "@/lib/game/types";
import { useChat, useGame, useLeaderboard, usePush, useTick } from "./use-game";
import { CHAT_MAX_LENGTH, CHAT_REACTIONS, type ChatChannel } from "@/lib/game/chat-config";
import { CHANGELOG } from "@/lib/game/changelog";

type Tab = "ateliers" | "ameliorations" | "chantier" | "armee" | "carte" | "raids" | "alliance" | "messages" | "classement";
type Qty = 1 | 10 | "max";
const DAY_MS = 86_400_000;

export function Game({ userId }: { userId: string }) {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("ateliers");
  useTick(250);

  const snap = game.snap;
  const leaderboard = useLeaderboard(tab === "classement" && !!snap, snap?.worksite.total);
  const { watchRivals } = game;
  useEffect(() => {
    watchRivals(tab === "raids" || tab === "alliance" || tab === "carte");
  }, [tab, watchRivals]);
  // B8 : pastille « recherche terminée » tant que l'onglet Armée n'a pas été ouvert depuis.
  const research = snap?.state.research;
  const [seenResearch, setSeenResearch] = useState(research);
  const [researchEnds, setResearchEnds] = useState<number[]>([]);
  if (research !== seenResearch) {
    setSeenResearch(research);
    setResearchEnds((prev) => [...new Set([...prev, ...(research ?? []).map((r) => r.endsAt)])]);
  }
  const [armySeenAt, setArmySeenAt] = useState(() => {
    try {
      return Number(localStorage.getItem("beffroi.armySeenAt")) || 0;
    } catch {
      return 0;
    }
  });
  const selectTab = (t: Tab) => {
    if (t === "armee" || tab === "armee") {
      const seen = game.serverNow();
      setArmySeenAt(seen);
      try {
        localStorage.setItem("beffroi.armySeenAt", String(seen));
      } catch {}
    }
    setTab(t);
  };

  if (!snap) return <div className="loading">On allume les torches…</div>;

  const now = game.serverNow();
  const world = worldFrom(snap.worksite);
  const stagesDone = stagesDoneAt(world, now);
  // État prévu « maintenant » : sert à savoir ce qui est achetable.
  const live: PlayerState = { ...advance(snap.state, now, world), stone: game.predictedStone() };
  const rate = rateAt(live, world, now);
  const researchDone = tab !== "armee" && researchEnds.some((e) => e <= now && e > armySeenAt);
  const eventLive = (isCombatEvent(snap.event) || isLocalEvent(snap.event)) && !!snap.event?.active && snap.event.endsAt > now;
  const affordableUpgrades = UPGRADES.filter((u) => !live.upgrades.includes(u.id) && upgradeUnlocked(live, u) && upgradeCost(live, u) <= live.stone).length;

  return (
    <div className="game">
      <WhatsNew />
      {game.away && <AwayModal away={game.away} event={snap.event} onClose={game.dismissAway} />}
      <TopBar snap={snap} now={now} />
      <PushPrompt raided={(snap.chronicle ?? []).some((c) => c.kind === "raid" && c.targetId === snap.userId) || (game.away?.raidsLost.length ?? 0) > 0} />
      <div className="layout">
        <Hero snap={snap} rate={rate} clickGain={clickValue(live, world, stagesDone)} game={game} />
        <section className="panel">
          <div className="tabs" role="tablist">
            <TabButton id="ateliers" tab={tab} setTab={selectTab} label="Ateliers" />
            <TabButton id="ameliorations" tab={tab} setTab={selectTab} label="Savoirs" dot={affordableUpgrades > 0} />
            <TabButton id="chantier" tab={tab} setTab={selectTab} label="Chantier" />
            <TabButton id="armee" tab={tab} setTab={selectTab} label="Armée" dot={researchDone} />
            <TabButton id="carte" tab={tab} setTab={selectTab} label="Carte" />
            <TabButton id="raids" tab={tab} setTab={selectTab} label={eventLive ? "Raids ⚡" : "Raids"} dot={eventLive || snap.rivals.some((r) => r.revenge && !r.blocker)} />
            <TabButton id="alliance" tab={tab} setTab={selectTab} label="Alliance" dot={snap.invites.length > 0} />
            <TabButton id="messages" tab={tab} setTab={selectTab} label="Messages" />
            <TabButton id="classement" tab={tab} setTab={selectTab} label="Rangs" />
          </div>
          <div className="tab-body" role="tabpanel">
            {tab === "ateliers" && <Generators live={live} stagesDone={stagesDone} snap={snap} run={game.run} />}
            {tab === "ameliorations" && <Upgrades live={live} run={game.run} />}
            {tab === "chantier" && <Worksite snap={snap} live={live} run={game.run} />}
            {tab === "armee" && <Army snap={snap} live={live} now={now} run={game.run} />}
            {tab === "carte" && <KingdomMap snap={snap} live={live} now={now} run={game.run} />}
            {tab === "raids" && <Raids snap={snap} live={live} now={now} run={game.run} />}
            {tab === "alliance" && <AllianceTab snap={snap} live={live} now={now} run={game.run} />}
            {tab === "messages" && <Chat userId={userId} hasAlliance={!!snap.alliance} now={now} />}
            {tab === "classement" && <Ranking boards={leaderboard} userId={userId} />}
          </div>
        </section>
      </div>
      <NumberLegend />
      {game.toast && (
        <div className="toast" role="status">
          {game.toast}
        </div>
      )}
    </div>
  );
}

/** Panneau « Ce qui change » : les nouvelles règles, une fois à la connexion suivante. */
/** B4 : accueil guidé, une quête à la fois. */
function QuestCard({ snap }: { snap: GameSnapshot }) {
  const i = snap.state.quest;
  if (i === null || i === undefined || i >= QUESTS.length) return null;
  const q = QUESTS[i];
  const done = Math.min(q.goal, questProgress(snap.state, q.id, { alliance: snap.alliance !== null && snap.alliance !== undefined }));
  return (
    <div className="quest">
      <div className="row-title">
        📜 Quête {i + 1}/{QUESTS.length} : {q.label}
      </div>
      {q.goal > 1 && (
        <div className="bar bar-thin">
          <span style={{ width: `${(done / q.goal) * 100}%` }} />
        </div>
      )}
      <div className="note num">
        {q.goal > 1 ? `${done} / ${q.goal} · ` : ""}Récompense : 5 minutes de production{i === QUESTS.length - 1 ? " et 5 écus" : ""}.
      </div>
    </div>
  );
}

/** C1 : la veine d'or apparaît 12 secondes ; le serveur décide de l'heure et de ce qu'elle rapporte. */
function Vein({ veinAt, now, run }: { veinAt: number; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [taken, setTaken] = useState(0);
  if (!(veinAt > 0) || now < veinAt || now > veinAt + VEIN_VISIBLE_MS || taken === veinAt) return null;
  // Position stable pour une veine donnée, autour de la pierre.
  const angle = (veinAt % 360) * (Math.PI / 180);
  const style = { left: `calc(50% + ${Math.round(Math.cos(angle) * 110)}px)`, top: `calc(50% + ${Math.round(Math.sin(angle) * 90)}px)` };
  const take = () => {
    setTaken(veinAt);
    void run({ type: "vein" });
  };
  return (
    <button className="vein" style={style} onClick={take} aria-label="Veine d'or : la toucher">
      ✨
    </button>
  );
}

/** B3 : ce qui s'est passé pendant l'absence (30 minutes ou plus). */
function AwayModal({ away, event, onClose }: { away: AwaySummary; event: EventView | null | undefined; onClose: () => void }) {
  const lines: string[] = [];
  lines.push(`⛏️ Tes ateliers ont produit ${formatNumber(away.produced)} pierres.`);
  if (away.tithe >= 1) lines.push(`⛪ Ta dîme a versé ${formatNumber(away.tithe)} pierres au chantier.`);
  for (const r of away.raidsLost) {
    const troops = Object.values(r.troops).reduce((a, b) => a + b, 0);
    const buildings = Object.values(r.buildings).reduce((a, b) => a + b, 0);
    lines.push(
      `⚔️ ${r.by} t'a pillé ${formatNumber(r.stolen)} pierres${troops ? `, ${formatNumber(troops)} troupe${troops > 1 ? "s" : ""} et fortification${troops > 1 ? "s" : ""} tombées` : ""}${buildings ? `, ${buildings} bâtiment${buildings > 1 ? "s" : ""} en ruine` : ""}.`,
    );
  }
  if (away.raidsRepelled.length) lines.push(`🛡️ Raid${away.raidsRepelled.length > 1 ? "s" : ""} repoussé${away.raidsRepelled.length > 1 ? "s" : ""} : ${away.raidsRepelled.join(", ")}.`);
  for (const sb of away.sabotages) lines.push(sb.success ? `🧨 ${sb.by} a saboté ton académie.` : `🧨 Un saboteur de ${sb.by} a été arrêté.`);
  for (const r of away.research) lines.push(`🔬 Recherche terminée : ${COMBATANTS.get(r.id)?.name ?? r.id}${r.levels > 1 ? ` (+${r.levels} niveaux)` : ""}.`);
  for (const i of away.stages) lines.push(`🏗️ Étape franchie : ${STAGES[i]?.name ?? i + 1}.`);
  if (event) lines.push(event.kind === "colosse" ? "🗿 Un colosse est en cours, va le frapper dans Raids." : "🐫 Une caravane passe, va la piller dans Raids.");
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Pendant ton absence">
      <div className="modal panel">
        <h2>🌄 Pendant ton absence</h2>
        <p className="note">Depuis {new Date(away.since).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}.</p>
        <ul>
          {lines.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <button className="btn btn-primary" onClick={onClose}>
          Au travail
        </button>
      </div>
    </div>
  );
}

function WhatsNew() {
  // Rendu seulement côté navigateur (le jeu attend sa première synchronisation), on peut lire le stockage tout de suite.
  const [seen, setSeen] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("beffroi.changes") ?? 0);
    } catch {
      return CHANGELOG.at(-1)?.id ?? 0;
    }
  });
  const fresh = CHANGELOG.filter((c) => c.id > seen);
  if (fresh.length === 0) return null;
  const close = () => {
    const last = CHANGELOG.at(-1)?.id ?? 0;
    try {
      localStorage.setItem("beffroi.changes", String(last));
    } catch {
      // pas de stockage : le panneau reviendra
    }
    setSeen(last);
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Ce qui change">
      <div className="modal panel">
        <h2>📜 Ce qui change</h2>
        {fresh.map((c) => (
          <section key={c.id}>
            <h3>{c.date}</h3>
            <ul>
              {c.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ))}
        <button className="btn btn-primary" onClick={close}>
          Compris
        </button>
      </div>
    </div>
  );
}

/** Cloche : active ou coupe les notifications (raids, sabotages, forteresse, événements). */
function PushButton() {
  const push = usePush();
  const [note, setNote] = useState<string | null>(null);
  if (push.state === "loading" || push.state === "unsupported") return null;
  const on = push.state === "on";
  const label = on ? "Couper les notifications" : push.state === "denied" ? "Notifications bloquées dans les réglages du navigateur" : "Recevoir une notification quand on t'attaque ou qu'un événement commence";
  return (
    <>
      <button
        className="btn btn-ghost"
        title={note ?? label}
        aria-label={label}
        disabled={push.state === "denied"}
        onClick={async () => setNote(on ? (await push.disable(), null) : await push.enable())}
      >
        {on ? "🔔" : "🔕"}
      </button>
      {note && <span className="push-note">{note}</span>}
    </>
  );
}

/** B10 : après un premier raid subi, on propose les notifications (une seule fois). */
function PushPrompt({ raided }: { raided: boolean }) {
  const push = usePush();
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem("beffroi.pushPrompt") === "1";
    } catch {
      return false;
    }
  });
  const [note, setNote] = useState<string | null>(null);
  if (hidden || !raided || push.state !== "off") return note ? <p className="notice notice-info push-prompt">{note}</p> : null;
  const close = () => {
    try {
      localStorage.setItem("beffroi.pushPrompt", "1");
    } catch {
      // pas de stockage : le bandeau reviendra
    }
    setHidden(true);
  };
  return (
    <div className="notice notice-info push-prompt">
      <strong>On vient de te piller.</strong> Active les notifications pour être prévenu des prochains raids, même quand le jeu est fermé.
      <div className="row-actions">
        <button
          className="btn btn-primary"
          onClick={async () => {
            setNote(await push.enable());
            close();
          }}
        >
          Activer
        </button>
        <button className="btn btn-ghost" onClick={close}>
          Plus tard
        </button>
      </div>
    </div>
  );
}

/** B13 : légende des suffixes des grands nombres. */
function NumberLegend() {
  return (
    <details className="legend note">
      <summary>Lire les grands nombres</summary>
      <p>
        k = mille · M = million · Md = milliard · Bn = billion (mille milliards) · Bd = billiard (mille billions) · Tn = trillion · Td = trilliard · Qn =
        quadrillion. Chaque suffixe vaut mille fois le précédent : 2,5 Md = 2 500 M.
      </p>
    </details>
  );
}

function TopBar({ snap, now }: { snap: GameSnapshot; now: number }) {
  const day = Math.min(14, Math.floor((now - snap.season.startsAt) / DAY_MS) + 1);
  const left = Math.max(0, snap.season.endsAt - now);
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / 3_600_000);
  return (
    <header className="topbar">
      <h1 className="brand">🔔 Beffroi</h1>
      <div className="topbar-meta">
        <div>
          <strong>{snap.username}</strong>
          {(snap.myTitles ?? []).map((t) => (
            <span key={t} className="badge badge-title">
              {t}
            </span>
          ))}
          <br />
          Saison {snap.season.number} · jour {day}/14
          <br />
          fin dans {days} j {hours} h
        </div>
        <PushButton />
        <form action={signOut}>
          <button className="btn btn-ghost" title="Se déconnecter" aria-label="Se déconnecter">
            🚪
          </button>
        </form>
      </div>
    </header>
  );
}

function TabButton({ id, tab, setTab, label, dot }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; label: string; dot?: boolean }) {
  return (
    <button className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
      {label}
      {dot && <span className="dot" aria-label="nouveautés" />}
    </button>
  );
}

interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
}

/** B5 : le beffroi dessiné, une pièce par étape. L'étape en cours se remplit de bas en haut au fil des dons. */
const BELFRY_PARTS: { box: [number, number]; draw: React.ReactNode }[] = [
  { box: [140, 156], draw: <><rect x="12" y="140" width="76" height="16" rx="1" /><rect x="6" y="152" width="88" height="4" /></> },
  {
    box: [62, 140],
    draw: (
      <>
        <rect x="28" y="70" width="44" height="70" />
        {[28, 37, 46, 55, 64].map((x) => <rect key={x} x={x} y="62" width="6" height="9" />)}
        <rect className="belfry-hole" x="46" y="122" width="8" height="18" rx="4" />
      </>
    ),
  },
  {
    box: [38, 62],
    draw: (
      <>
        <rect x="31" y="38" width="38" height="24" />
        <rect className="belfry-hole" x="36" y="43" width="11" height="17" rx="5" />
        <rect className="belfry-hole" x="53" y="43" width="11" height="17" rx="5" />
      </>
    ),
  },
  { box: [58, 68], draw: <><path d="M28 64 L16 60 L19 66 Z" /><path d="M72 64 L84 60 L81 66 Z" /></> },
  { box: [44, 60], draw: <path className="belfry-gold" d="M50 44 C44 44 44 52 42 57 L58 57 C56 52 56 44 50 44 Z M48 57 a2 2 0 0 0 4 0 Z" /> },
  { box: [4, 38], draw: <path d="M29 38 L50 4 L71 38 Z" /> },
  {
    box: [84, 106],
    draw: (
      <>
        <circle className="belfry-gold" cx="50" cy="95" r="10" />
        <path className="belfry-hand" d="M50 95 L50 88 M50 95 L55 98" />
      </>
    ),
  },
  { box: [-14, 6], draw: <><path className="belfry-hand" d="M50 6 L50 -14" /><path className="belfry-gold" d="M50 -14 L64 -10 L50 -6 Z" /></> },
];

function Belfry({ done, pct }: { done: number; pct: number }) {
  const clip = `belfry-rise-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className="belfry" viewBox="0 -16 100 174" role="img" aria-label={`Le beffroi : ${done} étape${done > 1 ? "s" : ""} sur ${BELFRY_PARTS.length}`}>
      <defs>
        {done < BELFRY_PARTS.length && (
          <clipPath id={clip}>
            {(() => {
              const [top, bottom] = BELFRY_PARTS[done].box;
              const h = ((bottom - top) * pct) / 100;
              return <rect x="0" y={bottom - h} width="100" height={h} />;
            })()}
          </clipPath>
        )}
      </defs>
      {BELFRY_PARTS.map((p, i) =>
        i < done ? (
          <g key={i} className="belfry-part">
            {p.draw}
          </g>
        ) : i === done ? (
          <g key={i}>
            <g className="belfry-ghost">{p.draw}</g>
            <g className="belfry-part" clipPath={`url(#${clip})`}>
              {p.draw}
            </g>
          </g>
        ) : null,
      )}
    </svg>
  );
}

function Hero({ snap, rate, clickGain, game }: { snap: GameSnapshot; rate: number; clickGain: number; game: ReturnType<typeof useGame> }) {
  const counter = useRef<HTMLSpanElement>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(0);
  const { predictedStone } = game;

  // Compteur animé à chaque image, sans re-rendu React.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (counter.current) counter.current.textContent = formatNumber(Math.floor(predictedStone()));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [predictedStone]);

  const onHit = (e: React.PointerEvent<HTMLButtonElement>) => {
    const gain = game.click();
    if (gain <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const id = nextId.current++;
    const f = { id, x: e.clientX - rect.left || rect.width / 2, y: e.clientY - rect.top || rect.height / 2, text: `+${formatRate(gain)}` };
    setFloaters((list) => [...list.slice(-12), f]);
    setTimeout(() => setFloaters((list) => list.filter((x) => x.id !== id)), 900);
  };

  const paused = snap.state.clickPausedUntil > game.serverNow();
  const w = snap.worksite;
  const finished = w.stage >= STAGES.length;
  const pct = finished ? 100 : Math.min(100, (w.progress / Math.max(1, w.target)) * 100);

  return (
    <section className="panel hero">
      <div className="hero-main">
        <div className="hero-stats">
          <div className="stone-count num">
            <span ref={counter}>{formatNumber(Math.floor(snap.state.stone))}</span>
          </div>
          <div className="stone-label">pierres taillées</div>
          <div className="rate num">{formatRate(rate)} / seconde</div>
          {(snap.state.catchUp ?? 0) > 0 && (
            <div className="catch-up" title="Bonus accordé tant que tu es loin derrière le premier joueur. Il diminue à mesure que tu le rattrapes.">
              🤝 Coup de pouce : +{Math.round((snap.state.catchUp ?? 0) * 100)} % de production et de défense
            </div>
          )}
          {elanBonus(snap.state) > 0 && (
            <ElanGauge
              left={Math.min(ELAN_MAX_MS, Math.max(0, (snap.state.elanUntil ?? 0) - game.serverNow()) + game.pendingClicks() * ELAN_PER_CLICK_MS)}
              bonus={elanBonus(snap.state) + stagePerk(snap.worksite.stageCompletedAt.length, "elan")}
            />
          )}
          {(snap.state.lotBonusUntilStage ?? 0) > snap.worksite.stageCompletedAt.length && (
            <div className="catch-up">🏗️ Prime de lot : +10 % de production jusqu&apos;à la fin de l&apos;étape suivante</div>
          )}
          {snap.state.masterBonus && snap.state.masterBonus.until > game.serverNow() && snap.state.masterBonus.from <= game.serverNow() && (
            <div className="catch-up">👑 Maître d&apos;œuvre : {MASTER_BONUSES[snap.state.masterBonus.kind].label} encore {duration(snap.state.masterBonus.until - game.serverNow())}</div>
          )}
          {(snap.state.frenzyUntil ?? 0) > game.serverNow() && (
            <div className="catch-up">✨ Frénésie : production doublée encore {Math.ceil((snap.state.frenzyUntil - game.serverNow()) / 1000)} s</div>
          )}
          <div className="hammer-hint">
            {paused ? `🔨 Marteau confisqué encore ${Math.ceil((snap.state.clickPausedUntil - game.serverNow()) / 1000)} s` : `Frappe la pierre : +${formatRate(clickGain)} par coup`}
          </div>
        </div>
        <div className="hammer-zone">
          <Vein veinAt={snap.state.veinAt ?? 0} now={game.serverNow()} run={game.run} />
          <button className="hammer" disabled={paused} onPointerDown={onHit} aria-label={`Tailler la pierre (+${formatRate(clickGain)})`}>
            🪨
          </button>
          {floaters.map((f) => (
            <span key={f.id} className="float" style={{ left: f.x, top: f.y - 20 }}>
              {f.text}
            </span>
          ))}
        </div>
      </div>
      <Incoming snap={snap} now={game.serverNow()} />
      <EventBanner e={snap.event} now={game.serverNow()} stone={snap.state.stone} run={game.run} />
      <Status state={snap.state} now={game.serverNow()} />
      <div className="mini-site">
        <Belfry done={Math.min(w.stage, STAGES.length)} pct={pct} />
        <h3>{finished ? "Le beffroi est achevé !" : `Chantier : ${STAGES[w.stage].name}`}</h3>
        <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="bar-caption num">
          <span>{finished ? `${formatNumber(w.total)} pierres versées` : `${formatNumber(w.progress)} / ${formatNumber(w.target)}`}</span>
          <span>{finished ? `${STAGES.length}/${STAGES.length}` : `étape ${w.stage + 1}/${STAGES.length}`}</span>
        </div>
      </div>
      <QuestCard snap={snap} />
      {!finished && <ShareLine snap={snap} />}
      {!finished && !snap.state.titheSet && <TitheBanner run={game.run} />}
      <ResearchLine state={snap.state} now={game.serverNow()} />
    </section>
  );
}

function Generators({ live, stagesDone, snap, run }: { live: PlayerState; stagesDone: number; snap: GameSnapshot; run: ReturnType<typeof useGame>["run"] }) {
  const [qty, setQty] = useState<Qty>(1);
  const [busy, setBusy] = useState<GeneratorId | null>(null);
  const world = worldFrom(snap.worksite);
  const mult = productionMultiplier(live, world, stagesDone);
  // On montre les bâtiments possédés, plus le prochain à découvrir.
  const visibleCount = Math.min(GENERATORS.length, Math.max(1, GENERATORS.findIndex((g) => owned(live, g.id) === 0 && live.totalProduced < g.baseCost * 0.5) + 1 || GENERATORS.length));

  // B9 : l'achat le plus rentable (production gagnée par pierre dépensée) parmi les bâtiments connus.
  const rate = productionPerSecond(live, world, stagesDone);
  const best = GENERATORS.slice(0, visibleCount)
    .filter((g) => owned(live, g.id) > 0 || live.totalProduced >= g.baseCost * 0.5)
    .map((g) => ({ id: g.id, value: (generatorRate(live, g.id) * mult) / generatorCost(live, g.id, 1) }))
    .sort((a, b) => b.value - a.value)[0]?.id;
  // L'achat s'affiche tout de suite (voir useGame) : pas besoin de bloquer le bouton.
  const buy = (id: GeneratorId, n: number) => void run({ type: "buy", generator: id, qty: n });
  const rebuild = async (id: GeneratorId) => {
    setBusy(id);
    await run({ type: "rebuild", generator: id });
    setBusy(null);
  };

  return (
    <>
      <div className="qty" role="group" aria-label="Quantité">
        {([1, 10, "max"] as Qty[]).map((q) => (
          <button key={q} className="btn" aria-pressed={qty === q} onClick={() => setQty(q)}>
            {q === "max" ? "Max" : `×${q}`}
          </button>
        ))}
      </div>
      <div className="list">
        {GENERATORS.slice(0, visibleCount).map((g, i) => {
          const n = owned(live, g.id);
          const hidden = i === visibleCount - 1 && n === 0 && live.totalProduced < g.baseCost * 0.5;
          const count = qty === "max" ? Math.max(1, maxAffordable(live, g.id)) : qty;
          const cost = generatorCost(live, g.id, count);
          const each = generatorRate(live, g.id) * mult;
          return (
            <div key={g.id} className={`row${hidden ? " locked" : ""}`}>
              <div className="row-icon" aria-hidden>
                {hidden ? "❔" : g.icon}
              </div>
              <div>
                <div className="row-title">
                  {hidden ? "???" : g.name}
                  {n > 0 && <span className="row-count num">{n}</span>}
                  {!hidden && g.id === best && <span className="badge badge-best" title="La meilleure production gagnée par pierre dépensée">⭐ le plus rentable</span>}
                </div>
                <div className="row-desc num">
                  {hidden ? "Continue de bâtir pour le découvrir." : `${g.description} ${formatRate(each)}/s chacun${n > 0 ? ` · total ${formatRate(each * n)}/s` : ""}`}
                  {!hidden && cost > live.stone && rate > 0 ? ` · à toi dans ${duration(((cost - live.stone) / rate) * 1000)}` : ""}
                </div>
              </div>
              <button className="btn btn-primary" disabled={hidden || cost > live.stone} onClick={() => buy(g.id, count)}>
                +{count}
                <span className="cost num">{formatNumber(cost)} 🪨</span>
              </button>
              {ruinsOf(live, g.id) > 0 && (
                <div className="ruins">
                  <span>
                    🏚️ {ruinsOf(live, g.id)} en ruine après un raid
                  </span>
                  <button className="btn" disabled={ruinCost(live, g.id) > live.stone || busy !== null} onClick={() => rebuild(g.id)}>
                    Rebâtir · <span className="num">{formatNumber(ruinCost(live, g.id))} 🪨</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Upgrades({ live, run }: { live: PlayerState; run: ReturnType<typeof useGame>["run"] }) {
  const available = UPGRADES.filter((u) => !live.upgrades.includes(u.id) && upgradeUnlocked(live, u)).sort((a, b) => a.cost - b.cost);
  const bought = UPGRADES.filter((u) => live.upgrades.includes(u.id));
  const nextLocked = UPGRADES.filter((u) => !live.upgrades.includes(u.id) && !upgradeUnlocked(live, u)).sort((a, b) => a.cost - b.cost)[0];

  const buy = (id: string) => void run({ type: "upgrade", upgrade: id });

  return (
    <div className="list">
      {available.length === 0 && <p className="empty">Aucun savoir à acquérir pour l&apos;instant.</p>}
      {available.map((u) => (
        <div key={u.id} className="row">
          <div className="row-icon" aria-hidden>
            📜
          </div>
          <div>
            <div className="row-title">{u.name}</div>
            <div className="row-desc">{u.description}</div>
          </div>
          <button className="btn btn-primary" disabled={upgradeCost(live, u) > live.stone} onClick={() => buy(u.id)}>
            Apprendre
            <span className="cost num">{formatNumber(upgradeCost(live, u))} 🪨</span>
          </button>
        </div>
      ))}
      {nextLocked?.requires && (
        <p className="note">
          Prochain savoir : posséder {nextLocked.requires.count} {GENERATORS.find((g) => g.id === nextLocked.requires!.generator)!.plural.toLowerCase()}.
        </p>
      )}
      {bought.length > 0 && (
        <p className="note">
          Savoirs acquis ({bought.length}) : {bought.map((u) => u.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

function Worksite({ snap, live, run }: { snap: GameSnapshot; live: PlayerState; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  const w = snap.worksite;
  const give = async (fraction: number) => {
    const amount = Math.floor(live.stone * fraction);
    if (amount < 1) return;
    setBusy(true);
    await run({ type: "contribute", amount });
    setBusy(false);
  };
  const finished = w.stage >= STAGES.length;

  return (
    <>
      <div className="stages">
        {STAGES.map((s, i) => {
          const done = i < w.stage;
          const current = i === w.stage;
          const pct = done ? 100 : current ? Math.min(100, (w.progress / Math.max(1, w.target)) * 100) : 0;
          const at = w.stageCompletedAt[i];
          return (
            <div key={s.name} className={`stage${done ? " done" : current ? "" : " upcoming"}`}>
              <div className="stage-head">
                <span className="stage-name">
                  {i + 1}. {s.name}
                </span>
                <span className="stage-status">
                  {done ? `✓ achevé${at ? ` le ${new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}` : current ? `${Math.floor(pct)} %` : "à venir"}
                </span>
              </div>
              <div className="stage-bonus">🎁 {s.bonusLabel}</div>
              {snap.masters?.[i] && <div className="stage-bonus">👑 Maître d&apos;œuvre : {snap.masters[i]}</div>}
              {(current || done) && (
                <>
                  <div className="bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  {current && (
                    <div className="bar-caption num">
                      <span>
                        {formatNumber(w.progress)} / {formatNumber(w.target)}
                      </span>
                    </div>
                  )}
                </>
              )}
              {!current && !done && <div className="row-desc">{s.description}</div>}
            </div>
          );
        })}
      </div>
      {(snap.lots ?? []).length > 0 && <Lots lots={snap.lots ?? []} now={snap.serverNow} run={run} />}
      <div className="row-title">{finished ? "Orner le beffroi" : "Verser de la pierre au chantier"}</div>
      <div className="contrib">
        {[
          [0.1, "10 %"],
          [0.5, "50 %"],
          [1, "Tout"],
        ].map(([f, label]) => (
          <button key={label} className="btn btn-primary" disabled={busy || Math.floor(live.stone * (f as number)) < 1} onClick={() => give(f as number)}>
            {label}
            <span className="cost num">{formatNumber(Math.floor(live.stone * (f as number)))}</span>
          </button>
        ))}
      </div>
      {!finished && <ShareLine snap={snap} detailed />}
      {!finished && <TitheSlider state={snap.state} run={run} />}
      <p className="note num">
        Tu as versé {formatNumber(snap.state.totalContributed)} pierres. {w.activePlayers} bâtisseur{w.activePlayers > 1 ? "s" : ""} actif{w.activePlayers > 1 ? "s" : ""} cette semaine. Chaque étape vaut 4 heures de leur production, fixée à son ouverture.
      </p>
    </>
  );
}

/** D1 à D4 : les lots de l'étape, une barre par alliance ou joueur seul. */
function Lots({ lots, now, run }: { lots: LotView[]; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  const choose = async (choice: MasterBonusKind) => {
    setBusy(true);
    await run({ type: "master_choice", choice });
    setBusy(false);
  };
  const mine = lots.find((l) => l.mine && l.canChoose);
  return (
    <div className="lots">
      <div className="row-title">Lots de l&apos;étape</div>
      <p className="note">
        Chaque alliance (ou joueur seul) a son lot : 4 heures de la production de ses membres. Lot fini : ceux qui ont versé au moins 25 % de leur part
        gagnent +10 % de production jusqu&apos;à la fin de l&apos;étape suivante et {LOT_ECUS} écus. Le premier lot fini désigne le maître d&apos;œuvre.
      </p>
      {mine && (
        <div className="notice notice-info">
          <strong>👑 Maître d&apos;œuvre !</strong> Choisis le bonus de 24 heures de ton lot (sinon ce sera la production) :
          <div className="row-actions">
            {(Object.keys(MASTER_BONUSES) as MasterBonusKind[]).map((k) => (
              <button key={k} className="btn btn-primary" disabled={busy} onClick={() => choose(k)}>
                {MASTER_BONUSES[k].label}
              </button>
            ))}
          </div>
        </div>
      )}
      {lots.map((l) => {
        const pct = Math.min(100, (l.progress / Math.max(1, l.target)) * 100);
        return (
          <div key={`${l.stage}-${l.owner}`} className={`lot${l.mine ? " lot-mine" : ""}`}>
            <div className="bar-caption num">
              <span>
                {l.master ? "👑 " : l.finishedAt ? "✓ " : ""}
                {l.name}
                {l.solo ? "" : ` (${l.members})`}
                {l.stage !== lots[0].stage ? ` · étape précédente, ferme ${new Date(l.closesAt ?? 0).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
              <span>{l.finishedAt ? "fini" : `${Math.floor(pct)} %`}</span>
            </div>
            <div className="bar bar-thin">
              <span style={{ width: `${pct}%` }} />
            </div>
            {l.mine && l.myShare !== undefined && (
              <div className="note num">
                Ta part : {formatNumber(l.myGiven ?? 0)} / {formatNumber(l.myShare)} versées
                {(l.myGiven ?? 0) >= l.myShare * 0.25 ? " ✓ prime assurée si le lot est fini" : ` (25 % pour la prime : ${formatNumber(l.myShare * 0.25)})`}
              </div>
            )}
            {l.master && l.masterChoice && l.masterUntil && l.masterUntil > now && (
              <div className="note">Bonus du maître d&apos;œuvre : {MASTER_BONUSES[l.masterChoice].label} jusqu&apos;à {new Date(l.masterUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** B2 : progression vers le prochain palier de don de l'étape, et les écus. */
function ShareLine({ snap, detailed = false }: { snap: GameSnapshot; detailed?: boolean }) {
  const share = snap.state.share;
  const ecus = snap.ecus ?? 0;
  const bonus = Math.round((snap.state.donorTiers ?? 0) * DONOR_TIER_BONUS * 100);
  if (!share || share.stage !== snap.worksite.stage) return null;
  const next = share.tiers < DONOR_TIERS.length ? DONOR_TIERS[share.tiers] : null;
  const goal = next !== null ? share.size * next : share.size;
  const pct = Math.min(100, (share.given / Math.max(1, goal)) * 100);
  return (
    <div className="share-line">
      <div className="bar-caption num">
        <span>
          {next !== null
            ? `Ta part : palier ${share.tiers + 1}/${DONOR_TIERS.length} à ${next * 100} %, ${formatNumber(share.given)} / ${formatNumber(goal)}`
            : `Ta part est versée en entier : les 3 paliers de l'étape sont atteints`}
        </span>
        <span>🪙 {ecus}</span>
      </div>
      {next !== null && (
        <div className="bar bar-thin">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {detailed && (
        <p className="note">
          Ta part de chantier vaut 4 heures de ta production, mesurée au début de l&apos;étape. À 25 %, 50 % et 100 % versés, tu gagnes +{DONOR_TIER_BONUS * 100} % de production jusqu&apos;à la fin de la saison et {DONOR_TIER_ECUS.join(", ")} écus.
          {bonus > 0 ? ` Tes paliers te rapportent déjà +${bonus} %.` : ""} Tes écus serviront dès la saison 1.
        </p>
      )}
    </div>
  );
}

/** Dîme automatique : une part de la production passive part d'office au chantier. */
function TitheSlider({ state, run }: { state: PlayerState; run: ReturnType<typeof useGame>["run"] }) {
  const saved = Math.round((state.tithe ?? 0) * 100);
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const value = draft ?? saved;
  const change = (percent: number) => {
    setDraft(percent);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await run({ type: "tithe", percent });
      setDraft(null);
    }, 600);
  };
  return (
    <div className="tithe">
      <label className="row-title" htmlFor="tithe">
        Dîme automatique : <span className="num">{value} %</span>
      </label>
      <input id="tithe" type="range" min={0} max={MAX_TITHE * 100} step={1} value={value} onChange={(e) => change(Number(e.target.value))} />
      <p className="note">
        Cette part de ta production, même hors ligne, part d&apos;office au chantier au lieu de ton stock. Elle compte comme un don. On conseille {ADVISED_TITHE * 100} %.
      </p>
    </div>
  );
}

function TitheBanner({ run }: { run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  const pick = async (percent: number) => {
    setBusy(true);
    await run({ type: "tithe", percent });
    setBusy(false);
  };
  return (
    <div className="notice notice-info tithe-banner">
      <strong>Règle ta dîme.</strong> Une part de ta production peut aller d&apos;office au chantier, même quand tu n&apos;es pas là. On conseille {ADVISED_TITHE * 100} %, réglable à tout moment dans l&apos;onglet du chantier.
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => pick(ADVISED_TITHE * 100)}>
          Verser {ADVISED_TITHE * 100} %
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => pick(0)}>
          Pas de dîme
        </button>
      </div>
    </div>
  );
}

function Ranking({ boards, userId }: { boards: ReturnType<typeof useLeaderboard>; userId: string }) {
  const [view, setView] = useState<"saison" | "pantheon">("saison");
  if (!boards) return <p className="empty">On consulte les registres…</p>;
  const standings = boards.standings ?? [];
  const hall = boards.hall ?? [];
  return (
    <>
      <div className="subtabs" role="group" aria-label="Classements">
        <button className="btn" aria-pressed={view === "saison"} onClick={() => setView("saison")}>
          Saison en cours
        </button>
        <button className="btn" aria-pressed={view === "pantheon"} onClick={() => setView("pantheon")}>
          Panthéon ({hall.length})
        </button>
      </div>
      {view === "saison" && (
        <>
          <p className="note">
            À la fin de la saison, le podium de chaque catégorie entre au Panthéon, et chaque premier porte son titre à côté de son nom pendant toute la
            saison suivante. Les seigneurs voisins n&apos;y figurent pas.
          </p>
          {HALL.map((h) => {
            const rows = standings.find((st) => st.category === h.id)?.rows ?? [];
            return (
              <div key={h.id}>
                <h3 className="section-title">
                  {h.icon} {h.label}
                  <span className="hall-title"> · titre : {h.title}</span>
                </h3>
                <Board rows={rows.map((r) => ({ userId: r.id, username: r.name, total: r.value }))} userId={userId} empty="Personne pour l'instant." unit={h.unit} />
              </div>
            );
          })}
        </>
      )}
      {view === "pantheon" &&
        (hall.length === 0 ? (
          <p className="empty">Aucune saison terminée pour l&apos;instant. Le premier podium sera gravé à la fin de cette saison.</p>
        ) : (
          hall.map((season) => (
            <div key={season.season} className="hall-season">
              <h3 className="section-title">
                Saison {season.season} · terminée le {new Date(season.endsAt).toLocaleDateString("fr-FR")}
              </h3>
              <ul className="hall-list">
                {HALL.map((h) => {
                  const rows = season.podiums.find((p) => p.category === h.id)?.rows ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <li key={h.id}>
                      <strong>
                        {h.icon} {h.title}
                      </strong>{" "}
                      {rows.map((r, i) => (
                        <span key={i} className={r.id === userId ? "me" : undefined}>
                          {["🥇", "🥈", "🥉"][i]} {r.name} ({formatValue(r.value, h.unit)}){" "}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ))}
    </>
  );
}

function formatValue(v: number, unit: HallUnit): string {
  if (unit === "time") return duration(v);
  if (unit === "percent") return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  if (unit === "ratio") return `×${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`;
  if (unit === "count") return String(v);
  return formatNumber(v);
}

function Board({ rows, userId, empty, unit = "stone" }: { rows: { userId: string; username: string; total: number }[]; userId: string; empty: string; unit?: HallUnit }) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <ol className="ranking">
      {rows.map((r, i) => (
        <li key={r.userId} className={r.userId === userId ? "me" : undefined}>
          <span className="rank">{medals[i] ?? i + 1}</span>
          <span>{r.username}</span>
          <span className="num">{formatValue(r.total, unit)}</span>
        </li>
      ))}
    </ol>
  );
}

function duration(msLeft: number): string {
  const m = Math.max(0, Math.ceil(msLeft / 60_000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** Jauge d'élan : tant qu'elle n'est pas vide, la production est augmentée. */
function ElanGauge({ left, bonus }: { left: number; bonus: number }) {
  const pct = Math.round((left / ELAN_MAX_MS) * 100);
  return (
    <div className="elan" title="Chaque coup ajoute 1 s d'élan (30 s au plus). Tant qu'il en reste, ta production est augmentée.">
      <span>
        ⚡ Élan {left > 0 ? `+${Math.round(bonus * 100)} % · ${Math.ceil(left / 1000)} s` : "vide : frappe pour l'allumer"}
      </span>
      <div className="bar">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Améliorations en cours, sous le compteur de pierre. */
function ResearchLine({ state, now }: { state: PlayerState; now: number }) {
  const queue = (state.research ?? []).filter((r) => r.endsAt > now);
  if (queue.length === 0) return null;
  return (
    <div className="research-line">
      <h3>Améliorations en cours</h3>
      <ul className="num">
      {queue.map((r, i) => {
        const def = COMBATANTS.get(r.id);
        const level = levelOf(state, r.id) + (state.research ?? []).filter((q) => q.endsAt <= now && q.id === r.id).length + queue.slice(0, i + 1).filter((q) => q.id === r.id).length;
        return (
          <li key={`${r.id}-${r.endsAt}`}>
            {i === 0 ? "⏳" : "⌛"} {def?.icon} {def?.name} niv. {level} · {duration(r.endsAt - now)}
          </li>
        );
      })}
      </ul>
    </div>
  );
}

/** Bandeau d'état sous le marteau : incendie, bouclier. */
function Status({ state, now }: { state: PlayerState; now: number }) {
  const burning = state.burnedUntil > now;
  const shielded = state.shieldUntil > now;
  if (!burning && !shielded) return null;
  return (
    <div className="status">
      {burning && (
        <p className="status-burn">
          🔥 Ateliers incendiés : production −50 % encore {duration(state.burnedUntil - now)}. Frappe la pierre pour éteindre le feu plus vite !
        </p>
      )}
      {shielded && <p className="status-shield">🛡️ Bouclier actif encore {duration(state.shieldUntil - now)}.</p>}
    </div>
  );
}

type RaidView = "seigneurs" | "joueurs" | "chronique";
type ArmyView = "garnison" | "forge";

/** B8 : onglet Armée, avec la garnison et la Forge, sorties de l'onglet Raids. */
function Army({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [view, setView] = useState<ArmyView>("garnison");
  const views: [ArmyView, string][] = [
    ["garnison", "Garnison"],
    ["forge", live.research.some((r) => r.endsAt > now) ? `Forge ⏳${live.research.length}` : "Forge"],
  ];
  return (
    <>
      <div className="subtabs" role="group" aria-label="Sections de l'armée">
        {views.map(([id, label]) => (
          <button key={id} className="btn" aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {view === "garnison" && (
        <>
          <p className="note raid-intro">
            Un raid est une bataille de 4 rounds au plus : toutes tes troupes (et les renforts de tes alliés) contre les troupes, fortifications et 3 gardes
            de la cible. Chaque unité a ses forces et ses faiblesses, compose ton armée selon ce que tu vois en face. Tu gagnes si plus personne ne
            riposte en face. Une partie des troupes perdues revient de l&apos;infirmerie au bout de 30 minutes.
          </p>
          <Marches snap={snap} now={now} run={run} />
          <Garrison live={live} run={run} />
          <CurfewCard live={live} now={now} run={run} />
        </>
      )}
      {view === "forge" && <Forge live={live} now={now} run={run} stagesDone={stagesDoneAt(worldFrom(snap.worksite), now)} />}
    </>
  );
}

function Raids({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [view, setView] = useState<RaidView>("seigneurs");
  const [level, setLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const spyPrice = spyCost(live, worldFrom(snap.worksite), now);
  const act = async (target: string, action: Parameters<typeof run>[0]) => {
    setBusy(target);
    await run(action);
    setBusy(null);
  };
  const spy = (target: string) => act(target, { type: "spy", target });
  const raid = (target: string, troops?: Record<string, number>) => act(target, { type: "raid", target, troops });
  const mine = snap.map?.places[snap.userId];
  const distanceTo = (id: string) => (mine && snap.map?.places[id] ? mapDistance(mine, snap.map.places[id]) : undefined);
  const players = snap.rivals.filter((r) => !r.isLord && !r.allied);
  const lords = snap.rivals.filter((r) => r.isLord && (level === null || r.difficulty === level));
  const sabotage = (target: string) => act(target, { type: "sabotage", target });
  const row = (r: RivalView) => (
    <RivalRow key={r.id} r={r} now={now} busy={busy} onRaid={raid} onSpy={spy} spyPrice={spyPrice} stone={live.stone} onSabotage={sabotage} stagesDone={stagesDoneAt(worldFrom(snap.worksite), now)} me={live} distance={distanceTo(r.id)} />
  );
  const views: [RaidView, string][] = [
    ["seigneurs", `Seigneurs (${snap.rivals.filter((r) => r.isLord).length})`],
    ["joueurs", `Joueurs (${players.length})`],
    ["chronique", "Chronique"],
  ];

  return (
    <>
      <div className="subtabs" role="group" aria-label="Sections des raids">
        {views.map(([id, label]) => (
          <button key={id} className="btn" aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {snap.event && isLocalEvent(snap.event) && snap.event.active && <LocalEventCard e={snap.event} live={live} now={now} run={run} />}
      {snap.event && !(isLocalEvent(snap.event) && snap.event.active) && <EventCard
          e={snap.event}
          now={now}
          busy={busy !== null}
          onAttack={() => act("event", { type: "event_attack" })}
          history={(snap.chronicle ?? []).filter((c) => c.kind === "event" && c.details.phase === "attack" && c.details.eventId === snap.event?.id)}
          me={snap.userId}
        />}
      {inCurfew(live, now) && <p className="raid-state">🌙 Tu es en couvre-feu : ni attaque ni sabotage, dans un sens comme dans l&apos;autre.</p>}
      <Marches snap={snap} now={now} run={run} />
      {view === "seigneurs" && (
        <p className="note raid-intro">
          Un raid réussi vole 25 % (40 % en revanche) de la pierre non sécurisée (les 2 dernières heures de production sont à l&apos;abri, mais jamais plus
          de la moitié du stock), incendie les ateliers 30 min et ruine quelques bâtiments ; la victime reçoit 4 h de bouclier (10 min pour un seigneur) et un
          droit de revanche (+50 % de dégâts). Les seigneurs difficiles ne frappent que ceux qui les ont attaqués. De loin, tu ne vois qu&apos;une estimation
          (≈) des armées : un espion révèle l&apos;armée exacte pendant 1 h, mais il peut être repéré (surtout par les tours d&apos;archers). Ta garnison et
          la Forge sont dans l&apos;onglet Armée.
        </p>
      )}
      {view === "seigneurs" && (
        <>
          <div className="qty level-filter" role="group" aria-label="Difficulté">
            <button className="btn" aria-pressed={level === null} onClick={() => setLevel(null)}>
              Tous
            </button>
            {([1, 2, 3, 4] as const).map((d) => (
              <button key={d} className="btn" aria-pressed={level === d} onClick={() => setLevel(d)}>
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="list">{lords.map(row)}</div>
        </>
      )}
      {view === "joueurs" && (
        <div className="list">
          {players.length === 0 && <p className="empty">Aucun joueur à piller (tes alliés sont dans l&apos;onglet Alliance).</p>}
          {players.map(row)}
        </div>
      )}
      {view === "chronique" && <Chronicle entries={snap.chronicle ?? []} me={snap.userId} now={now} rivals={snap.rivals} alliances={snap.alliances} />}
    </>
  );
}

/** Onglet Alliance : fondation, invitations, alliés et renforts. */
function AllianceTab({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const allies = snap.rivals.filter((r) => r.allied);
  const invitable = snap.alliance && snap.alliance.members.length < MAX_ALLIANCE_SIZE ? snap.rivals.filter((r) => !r.isLord && !r.allianceName) : [];
  const invite = async (target: string) => {
    setBusy(target);
    await run({ type: "alliance_invite", target });
    setBusy(null);
  };
  return (
    <>
      <Marches snap={snap} now={now} run={run} />
      <Alliance snap={snap} run={run} />
      <Fortress snap={snap} live={live} now={now} run={run} />
      {snap.alliance && <Wars snap={snap} run={run} now={now} />}
      {allies.length > 0 && (
        <>
          <h3 className="section-title">Alliés</h3>
          <div className="list">
            {allies.map((r) => (
              <AllyRow key={r.id} r={r} live={live} now={now} run={run} />
            ))}
          </div>
        </>
      )}
      {invitable.length > 0 && (
        <>
          <h3 className="section-title">Inviter</h3>
          <div className="list">
            {invitable.map((r) => (
              <div key={r.id} className="row">
                <div className="row-icon" aria-hidden>
                  🛡️
                </div>
                <div className="row-title">{r.name}</div>
                <button className="btn" disabled={busy !== null} onClick={() => invite(r.id)}>
                  ✉️ Inviter
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** Heure locale (« 23 h » ou « 23 h 30 ») d'une minute UTC de la journée. */
function localTime(utcMinute: number): string {
  const local = (utcMinute - new Date().getTimezoneOffset() + 2880) % 1440;
  const h = Math.floor(local / 60);
  const m = local % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** C2 : plage de 8 h par jour sans attaque ni sabotage, choisie en heure locale. */
function CurfewCard({ live, now, run }: { live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  const offset = new Date().getTimezoneOffset();
  const current = live.curfew?.start ?? null;
  const next = live.curfew?.next && live.curfew.next.from > now ? live.curfew.next : null;
  const pick = async (value: string) => {
    setBusy(true);
    const start = value === "" ? null : (Number(value) * 60 + offset + 1440) % 1440;
    await run({ type: "curfew", start });
    setBusy(false);
  };
  const shown = next ? next.start : current;
  const localHour = shown === null ? "" : String(Math.floor(((shown - offset + 1440) % 1440) / 60));
  const span = (start: number) => `de ${localTime(start)} à ${localTime((start + CURFEW_MINUTES) % 1440)}`;
  return (
    <div className="curfew">
      <div className="row-title">🌙 Couvre-feu</div>
      <p className="note">
        Pendant 8 heures par jour, tu ne peux ni attaquer ni être attaqué, ni saboter ni être saboté, seigneurs et guerre compris. Ta production et ta dîme continuent. Un changement prend effet 24 heures plus tard.
      </p>
      <label className="note" htmlFor="curfew">
        Début de la plage (heure locale) :{" "}
        <select id="curfew" className="input" disabled={busy} value={localHour} onChange={(e) => pick(e.target.value)}>
          <option value="">aucun couvre-feu</option>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {h} h à {(h + CURFEW_MINUTES / 60) % 24} h
            </option>
          ))}
        </select>
      </label>
      <p className="note">
        {current === null ? "Aucun couvre-feu en vigueur." : `En vigueur : ${span(current)}.`}
        {next ? ` À partir du ${new Date(next.from).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })} : ${next.start === null ? "aucun couvre-feu" : span(next.start)}.` : ""}
      </p>
    </div>
  );
}

function RivalRow({
  r,
  now,
  busy,
  onRaid,
  onSpy,
  spyPrice,
  stone: myStone,
  onSabotage,
  stagesDone = 0,
  me,
  distance,
}: {
  r: RivalView;
  now: number;
  busy: string | null;
  onRaid: (id: string, troops?: Record<string, number>) => void;
  onSpy: (id: string) => void;
  spyPrice: number;
  stone: number;
  onSabotage: (id: string) => void;
  stagesDone?: number;
  me?: PlayerState;
  distance?: number;
}) {
  const [sim, setSim] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [chosen, setChosen] = useState<Record<string, number> | null>(null);
  const sabotagePrice = r.sabotageCost ?? 0;
  const intel = r.intelUntil > now;
  // La pierre du rival progresse en direct entre deux nouvelles du serveur.
  const stone = r.stone + (r.rate * Math.max(0, now - r.stoneAt)) / 1000;
  // Mêmes règles que le serveur : plafond PvP, coefficient d'équité, stock à l'abri des étapes.
  const loot = lootOf(stone, r.rate, r.revenge, { lord: r.isLord, cap: r.lootCap, factor: r.fairness, stagesDone, extraSecured: r.lootSafe });
  const shielded = r.shieldUntil > now;
  const blocked = r.blocker !== null;
  const pct = Math.round(r.chance * 100);
  return (
    <div className="row">
      <div className="row-icon" aria-hidden>
        {r.isLord ? r.blazon : "🛡️"}
      </div>
      <div>
        <div className="row-title">
          {r.name}
          {r.isLord && <span className={`badge badge-level-${r.difficulty ?? 1}`}>{DIFFICULTY_LABELS[r.difficulty ?? 1]}</span>}
          {r.revenge && <span className="badge badge-revenge">revanche !</span>}
          {r.allianceName && <span className="badge">🤝 {r.allianceName}</span>}
          {r.atWar && <span className="badge badge-revenge">⚔️ en guerre</span>}
          {(r.titles ?? []).map((t) => (
            <span key={t} className="badge badge-title">
              {t}
            </span>
          ))}
          <Presence lastSeen={r.lastSeen} now={now} />
          {r.curfew && <span className="badge" title="En couvre-feu : ni attaque ni sabotage">🌙 couvre-feu</span>}
        </div>
        <div className="row-desc num">
          {r.temper ? `${r.temper} · ` : ""}
          {r.retaliateOnly ? "ne frappe qu'en représailles · " : ""}
          {formatNumber(stone)} pierres · {formatRate(r.rate)}/s
          {shielded ? ` · bouclier ${duration(r.shieldUntil - now)}` : ""}
          {r.burnedUntil > now ? " · 🔥" : ""}
        </div>
        <div className="row-desc army-line num" title={intel ? "Armée exacte (rapport d'espion)" : "Estimation de loin : envoie un espion pour voir l'armée exacte"}>
          {intel ? `🕵️ ${armyIcons(r.army)} (rapport encore ${duration(r.intelUntil - now)})` : `≈ ${armyIcons(r.army)}`}
        </div>
        <div className="row-desc">
          {r.blocker ??
            [
              loot > 0 ? `Butin estimé : ${formatNumber(loot)} pierres` : "Rien à piller pour l'instant",
              (r.ransom ?? 0) > 0 ? `rançon ≈ ${formatNumber(r.ransom ?? 0)}` : null,
              (r.fairness ?? 1) < 1 ? `équité ×${(r.fairness ?? 1).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} (cible plus petite)` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
        </div>
        {composing && me && (
          <SendArmy
            me={me}
            r={r}
            intel={intel}
            distance={distance ?? MAP_SPAWN_RADIUS}
            chosen={chosen ?? (me.troops as Record<string, number>)}
            setChosen={setChosen}
            busy={busy !== null}
            onSend={(troops) => {
              setComposing(false);
              onRaid(r.id, troops);
            }}
            onClose={() => setComposing(false)}
          />
        )}
        {sim !== null && me && <Simulator me={me} army={(chosen ?? me.troops) as Army} r={r} intel={intel} seed={sim} onReplay={() => setSim(sim + 1)} onClose={() => setSim(null)} />}
      </div>
      <div className="row-actions">
        <button className="btn btn-primary" disabled={blocked || busy !== null} onClick={() => (me ? setComposing(!composing) : onRaid(r.id))}>
          Raider
          <span className="cost num">{r.chance < 0 ? "chance cachée 🌫️" : `${intel ? "" : "~"}${pct} % de succès`}</span>
        </button>
        {me && sim === null && r.chance >= 0 && (
          <button className="btn" onClick={() => setSim(1)} title="Joue une bataille pour de faux avec ton armée contre celle que tu vois en face.">
            🎲 Simuler
          </button>
        )}
        {!intel && (
          <button className="btn" disabled={busy !== null || myStone < spyPrice} onClick={() => onSpy(r.id)} title="Révèle l'armée exacte pendant 1 h. Il peut être repéré.">
            🕵️ Espionner
            <span className="cost num">{formatNumber(spyPrice)} 🪨</span>
          </button>
        )}
        {r.sabotageBlocker !== undefined && (
          <button
            className="btn"
            disabled={busy !== null || r.sabotageBlocker !== null || myStone < sabotagePrice}
            onClick={() => onSabotage(r.id)}
            title={r.sabotageBlocker ?? "Abat un niveau de son académie et retarde sa recherche. Les tours d'archers gênent le saboteur."}
          >
            🧨 Saboter
            <span className="cost num">{formatNumber(sabotagePrice)} 🪨</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** T3 : composer l'armée envoyée, type par type ; trajet et chance portent sur ce choix. */
function SendArmy({
  me,
  r,
  intel,
  distance,
  chosen,
  setChosen,
  busy,
  onSend,
  onClose,
}: {
  me: PlayerState;
  r: RivalView;
  intel: boolean;
  distance: number;
  chosen: Record<string, number>;
  setChosen: (a: Record<string, number>) => void;
  busy: boolean;
  onSend: (troops: Record<string, number>) => void;
  onClose: () => void;
}) {
  const have = me.troops as Record<string, number>;
  const army = Object.fromEntries(UNITS.map((u) => [u.id, Math.min(have[u.id] ?? 0, Math.max(0, Math.floor(chosen[u.id] ?? 0)))]).filter(([, n]) => (n as number) > 0)) as Record<string, number>;
  const out = travelMs(army as Army, distance);
  const chance = estimateChance(army as Army, r.army as Army, { attackBonus: r.revenge ? REVENGE_ATTACK_BONUS : 1, attackerLevels: me.levels });
  const away = (me.marches ?? []).length;
  return (
    <div className="simulator send-army">
      <p>
        <strong>Composer l&apos;armée</strong> · {distance.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} cases · aller {duration(out)}, retour autant
      </p>
      {UNITS.filter((u) => (have[u.id] ?? 0) > 0).map((u) => (
        <label key={u.id} className="send-line">
          <span>
            {u.icon} {u.name} <span className="num">({formatNumber(have[u.id] ?? 0)})</span>
          </span>
          <input
            type="number"
            min={0}
            max={have[u.id] ?? 0}
            value={army[u.id] ?? 0}
            onChange={(e) => setChosen({ ...army, [u.id]: Math.max(0, Math.min(have[u.id] ?? 0, Math.floor(Number(e.target.value) || 0))) })}
          />
        </label>
      ))}
      {UNITS.every((u) => (have[u.id] ?? 0) === 0) && <p className="note">Toutes tes troupes sont en route ou à l&apos;infirmerie.</p>}
      <p className="note">
        {r.chance < 0 ? "Chance cachée par le brouillard : envoie un espion." : `Chance estimée ${intel ? "" : "(sans espion, sur une estimation) "}: ${Math.round(chance * 100)} %.`} Les troupes envoyées ne défendent plus ton domaine pendant le trajet.
        {away > 0 ? ` Armées déjà en route : ${away}/${MAX_MARCHES}.` : ""}
      </p>
      <div className="qty">
        <button className="btn" onClick={() => setChosen({ ...have })}>
          Tout envoyer
        </button>
        <button className="btn btn-primary" disabled={busy || Object.keys(army).length === 0 || away >= MAX_MARCHES} onClick={() => onSend(army)}>
          🏇 Envoyer
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/** T3, T4 : mes armées en route, avec le rappel. */
function Marches({ snap, now, run }: { snap: GameSnapshot; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const list = snap.state.marches ?? [];
  if (list.length === 0) return null;
  const nameOf = (id: string) =>
    id === "fortress"
      ? "Pierre-Haute"
      : id.startsWith("event:")
        ? snap.event?.kind === "colosse" ? "le colosse" : "la caravane"
        : id.startsWith("mine:")
          ? "le filon"
          : id.startsWith("treasure:")
            ? "le trésor"
            : id.startsWith("camp:")
              ? "un camp de bandits"
              : (snap.rivals.find((r) => r.id === id)?.name ?? "une cible");
  return (
    <ul className="marches">
      {list.map((m) => {
        const back = m.status === "back";
        const camp = m.status === "camp";
        const left = Math.max(0, (back || camp ? m.returnAt : m.arriveAt) - now);
        const verdict = m.outcome === "won" ? "victoire" : m.outcome === "lost" ? "repoussée" : m.outcome === "turned" ? (m.kind === "raid" ? "demi-tour, cible protégée" : "demi-tour") : m.outcome === "recalled" ? "rappelée" : "";
        return (
          <li key={m.id}>
            <span>
              {back ? "↩️" : m.kind === "reinforce" || m.kind === "station" ? "🛡️" : m.kind === "fortress" ? "🏰" : "🏇"} {armyIcons(m.troops, "plus personne")}{" "}
              {camp
                ? `postée sur ${nameOf(m.target)}`
                : back
                ? `rentre de ${nameOf(m.target)}`
                : m.kind === "reinforce" || m.kind === "station"
                  ? `en renfort vers ${nameOf(m.target)}`
                  : m.kind === "fortress"
                    ? `à l'assaut de ${nameOf(m.target)}`
                    : `vers ${nameOf(m.target)}`}
              {verdict ? ` (${verdict})` : ""} · {left > 0 ? duration(left) : "imminent"}
              {back && m.loot + m.ransom > 0 ? ` · rapporte ${formatNumber(m.loot + m.ransom)} 🪨` : ""}
            </span>
            {(camp || (!back && left > 0)) && (
              <button className="btn btn-ghost" onClick={() => void run({ type: "march_recall", id: m.id })}>
                Rappeler
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** T5 : une armée approche de mon domaine. */
function Incoming({ snap, now }: { snap: GameSnapshot; now: number }) {
  const list = (snap.incoming ?? []).filter((i) => i.arriveAt > now);
  if (list.length === 0) return null;
  return (
    <div className="event-banner incoming">
      {list.map((i) => (
        <div key={i.id}>
          ⚠️ Une armée {i.from ? `de ${i.from} ` : ""}approche : arrivée dans {duration(i.arriveAt - now)}. Renforce tes défenses ou rappelle tes troupes !
        </div>
      ))}
    </div>
  );
}

/** B7 : simulateur avant l'attaque, une bataille pour de faux contre l'armée vue en face (rien n'est perdu). */
function Simulator({ me, army, r, intel, seed, onReplay, onClose }: { me: PlayerState; army: Army; r: RivalView; intel: boolean; seed: number; onReplay: () => void; onClose: () => void }) {
  const attack = army;
  const opts = { attackBonus: r.revenge ? REVENGE_ATTACK_BONUS : 1, attackerLevels: me.levels };
  const fight = battle(attack, r.army as Army, seededRng(seed * 7919), opts);
  return (
    <div className="simulator">
      <p>
        <strong>{fight.success ? "🏆 Victoire" : "💀 Défaite"}</strong> sur ce tirage. Tu perdrais {armyIcons(fight.attackerLost, "rien")}, il perdrait{" "}
        {armyIcons(fight.defenderLost, "rien")}.
      </p>
      <RoundsReport log={fight.log} open />
      <p className="note">
        {intel ? "Contre son armée exacte" : "Contre une estimation de son armée (espionne-le pour un calcul juste)"}, sans ses améliorations ni ses bonus de
        défense : la chance affichée sur le bouton reste la référence.
      </p>
      <div className="qty">
        <button className="btn" onClick={onReplay}>
          🎲 Rejouer
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

/** Forge : académie militaire et améliorations des troupes et fortifications (une recherche à la fois). */
function Forge({ live, now, run, stagesDone }: { live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; stagesDone: number }) {
  // File de recherche : l'état local n'est pas encore « réglé », on ignore ce qui est déjà fini.
  const queue = live.research.filter((r) => r.endsAt > now);
  const full = queue.length >= RESEARCH_QUEUE_MAX;
  const academyPrice = academyCost(live);
  const rows = (defs: readonly CombatantDef<string>[]) =>
    defs.map((d) => {
      const id = d.id as CombatantId;
      const lv = levelOf(live, id);
      const next = queuedLevel(live, id) + 1;
      const cost = researchCost(live, id);
      return (
        <div key={d.id} className="row">
          <div className="row-icon" aria-hidden>
            {d.icon}
          </div>
          <div>
            <div className="row-title">
              {d.name}
              <span className="badge">niv. {lv}</span>
            </div>
            <div className="row-desc num">
              ⚔️ et ❤️ +{Math.round(lv * LEVEL_BONUS * 100)} % · niveau {next} en {duration(researchTime(live, id, stagesDone))}
            </div>
          </div>
          <button className="btn btn-primary" disabled={full || cost > live.stone} onClick={() => void run({ type: "research", id: d.id })}>
            {queue.length > 0 ? "En file" : "Améliorer"}
            <span className="cost num">{formatNumber(cost)} 🪨</span>
          </button>
        </div>
      );
    });
  return (
    <>
      <p className="note raid-intro">
        Chaque niveau donne +{Math.round(LEVEL_BONUS * 100)} % d&apos;attaque et de points de vie au type amélioré, en attaque comme en défense. Jusqu&apos;à 3
        recherches en file, et chaque niveau prend plus de temps que le précédent. L&apos;académie accélère les recherches, mais les rivaux peuvent la
        saboter : les tours d&apos;archers gênent leurs saboteurs.
      </p>
      <div className="row">
        <div className="row-icon" aria-hidden>
          🎓
        </div>
        <div>
          <div className="row-title">
            Académie militaire <span className="badge">niv. {live.academy ?? 0}</span>
          </div>
          <div className="row-desc">
            Recherches {Math.round((live.academy ?? 0) * ACADEMY_SPEED * 100)} % plus rapides (+{Math.round(ACADEMY_SPEED * 100)} % par niveau, pour les recherches lancées ensuite).
            {live.sabotageImmuneUntil > now ? ` Garde renforcée contre les saboteurs encore ${duration(live.sabotageImmuneUntil - now)}.` : ""}
          </div>
        </div>
        <button className="btn btn-primary" disabled={academyPrice > live.stone} onClick={() => void run({ type: "academy" })}>
          Agrandir
          <span className="cost num">{formatNumber(academyPrice)} 🪨</span>
        </button>
      </div>
      <h3 className="section-title">
        File de recherche ({queue.length}/{RESEARCH_QUEUE_MAX})
      </h3>
      {queue.length === 0 ? (
        <p className="raid-state">🔨 Aucune recherche en cours.</p>
      ) : (
        <ol className="research-queue">
          {queue.map((r, i) => {
            const def = COMBATANTS.get(r.id);
            const level = levelOf(live, r.id) + queue.slice(0, i + 1).filter((q) => q.id === r.id).length;
            return (
              <li key={`${r.id}-${r.endsAt}`}>
                {i === 0 ? "⏳" : "⌛"} {def?.icon} {def?.name} niveau {level} : {i === 0 ? `encore ${duration(r.endsAt - now)}` : `fini dans ${duration(r.endsAt - now)}`}
              </li>
            );
          })}
        </ol>
      )}
      <h3 className="section-title">Troupes</h3>
      <div className="list">{rows(UNITS)}</div>
      <h3 className="section-title">Fortifications</h3>
      <div className="list">{rows(DEFENSES)}</div>
    </>
  );
}

/** Mon alliance : fondation, invitations, troupes postées. */
function Alliance({ snap, run }: { snap: GameSnapshot; run: ReturnType<typeof useGame>["run"] }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (action: Parameters<typeof run>[0]) => {
    setBusy(true);
    await run(action);
    setBusy(false);
  };
  const a = snap.alliance;
  return (
    <div className="alliance">
      <h3 className="section-title">Ton alliance</h3>
      {a ? (
        <>
          <p className="row-desc">
            🤝 <strong>{a.name}</strong> · {a.members.map((m) => (m.id === snap.userId ? "toi" : m.name)).join(", ")} ({a.members.length}/{MAX_ALLIANCE_SIZE})
          </p>
          <p className="note">
            Entre alliés, pas de pillage. Les troupes envoyées chez un allié défendent son domaine et partent en raid avec lui (butin et pertes sont
            partagés au prorata de la valeur des troupes engagées par chacun).
          </p>
        </>
      ) : (
        <>
          {snap.invites.map((inv) => (
            <div key={inv.allianceId} className="row">
              <div className="row-icon" aria-hidden>
                ✉️
              </div>
              <div className="row-desc">
                {inv.inviterName} t&apos;invite dans l&apos;alliance <strong>{inv.allianceName}</strong>.
              </div>
              <div className="row-actions">
                <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: "alliance_accept", alliance: inv.allianceId })}>
                  Rejoindre
                </button>
                <button className="btn" disabled={busy} onClick={() => act({ type: "alliance_decline", alliance: inv.allianceId })}>
                  Refuser
                </button>
              </div>
            </div>
          ))}
          <form
            className="alliance-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act({ type: "alliance_create", name });
            }}
          >
            <input className="input" value={name} maxLength={30} placeholder="Nom de ton alliance" onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>
              Fonder
            </button>
          </form>
        </>
      )}
      {snap.reinforcements.length > 0 && (
        <p className="row-desc">
          Renforts chez toi :{" "}
          {snap.reinforcements.map((g) => (
            <span key={g.id} className="num">
              {g.name} {armyIcons(g.troops)}{" "}
            </span>
          ))}
        </p>
      )}
      {snap.abroad.map((g) => (
        <div key={g.id} className="row">
          <div className="row-icon" aria-hidden>
            🏕️
          </div>
          <div className="row-desc num">
            Tes troupes chez {g.name} : {armyIcons(g.troops)}
          </div>
          <button className="btn" disabled={busy} onClick={() => act({ type: "recall", host: g.id })}>
            Rappeler
          </button>
        </div>
      ))}
      {a && (
        <button className="btn btn-ghost alliance-leave" disabled={busy} onClick={() => act({ type: "alliance_leave" })}>
          Quitter l&apos;alliance
        </button>
      )}
    </div>
  );
}

/** Guerres : celle en cours, ou les alliances à qui la déclarer. */
function Wars({ snap, run, now }: { snap: GameSnapshot; run: ReturnType<typeof useGame>["run"]; now: number }) {
  const [busy, setBusy] = useState(false);
  const w = snap.war;
  const others = snap.alliances.filter((a) => a.id !== snap.alliance?.id);
  const declare = async (id: number) => {
    setBusy(true);
    await run({ type: "war_declare", alliance: id });
    setBusy(false);
  };
  return (
    <>
      <h3 className="section-title">Guerre</h3>
      {w ? (
        <div className="war-card">
          <div className="row-title">⚔️ Contre {w.enemyName}</div>
          <div className="war-score num">
            <span>
              Toi et tes alliés : <strong>{formatNumber(w.myScore)}</strong>
            </span>
            <span>
              Eux : <strong>{formatNumber(w.enemyScore)}</strong>
            </span>
          </div>
          <div className="row-desc">
            {w.startsAt > now ? `Commence dans ${duration(w.startsAt - now)}, puis dure 24 h.` : `Encore ${duration(w.endsAt - now)}.`} Pendant la guerre, plus de
            bouclier entre vous (le repos de 5 min reste, et pas deux fois de suite la même cible) : chaque pierre pillée compte. Les vainqueurs se
            partagent une prime égale à la moitié du butin total.
          </div>
        </div>
      ) : others.length === 0 ? (
        <p className="empty">Aucune autre alliance à qui déclarer la guerre pour l&apos;instant.</p>
      ) : (
        <div className="list">
          {others.map((a) => (
            <div key={a.id} className="row">
              <div className="row-icon" aria-hidden>
                🏳️
              </div>
              <div>
                <div className="row-title">{a.name}</div>
                <div className="row-desc">
                  {a.size} membre{a.size > 1 ? "s" : ""}
                </div>
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={() => declare(a.id)}>
                Déclarer
                <span className="cost">la guerre (24 h)</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** La forteresse : la prendre, la garder. */
function Fortress({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const f = snap.fortress;
  const spyPrice = spyCost(live, worldFrom(snap.worksite), now);
  const intel = f.intelUntil !== null && f.intelUntil > now;
  const [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState(1);
  const act = async (action: Parameters<typeof run>[0]) => {
    setBusy(true);
    await run(action);
    setBusy(false);
  };
  const available = UNITS.filter((u) => (live.troops[u.id] ?? 0) > 0);
  const chosen = available.find((u) => u.id === unit) ?? available[0];
  const hasGarrison = Object.keys(f.myGarrison).length > 0;
  return (
    <>
      <h3 className="section-title">Forteresse</h3>
      <div className="row">
        <div className="row-icon" aria-hidden>
          🏰
        </div>
        <div>
          <div className="row-title">
            {f.name}
            {f.mine && <span className="badge badge-level-1">à vous</span>}
          </div>
          <div className="row-desc">
            {f.holderName
              ? `Tenue par ${f.holderName}, défendue uniquement par les troupes que ses membres y envoient.`
              : "Tenue par personne, gardée par une garnison neutre."}{" "}
            L&apos;alliance qui la tient gagne +20 % de production.
          </div>
          <div className="row-desc army-line num">
            {intel ? `🕵️ ${armyIcons(f.army)} (rapport encore ${duration(f.intelUntil! - now)})` : f.exact ? armyIcons(f.army) : `≈ ${armyIcons(f.army)}`}
          </div>
          <div className="row-desc">{f.blocker ?? `${f.exact ? "" : "~"}${Math.round(f.chance * 100)} % de chances de la prendre.`}</div>
        </div>
        {!f.mine && (
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy || f.blocker !== null} onClick={() => act({ type: "fortress_attack" })}>
              Assiéger
              <span className="cost num">
                {f.exact ? "" : "~"}
                {Math.round(f.chance * 100)} %
              </span>
            </button>
            {!intel && (
              <button className="btn" disabled={busy || live.stone < spyPrice} onClick={() => act({ type: "spy", target: "fortress" })} title="Révèle les défenses exactes pendant 1 h. Il peut être repéré.">
                🕵️ Espionner
                <span className="cost num">{formatNumber(spyPrice)} 🪨</span>
              </button>
            )}
          </div>
        )}
      </div>
      {f.mine && (
        <>
          {f.garrison.length === 0 && <p className="status-burn">⚠️ Personne ne défend la forteresse : envoyez des troupes, sinon le premier assaut la prend.</p>}
          {f.garrison.length > 0 && (
            <p className="row-desc num">
              Garnison :{" "}
              {f.garrison.map((g) => (
                <span key={g.id}>
                  {g.id === snap.userId ? "toi" : g.name} {armyIcons(g.troops)}{" "}
                </span>
              ))}
            </p>
          )}
          {chosen ? (
            <div className="reinforce">
              <select className="input" value={chosen.id} onChange={(e) => setUnit(e.target.value)} aria-label="Troupe à poster">
                {available.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.icon} {u.plural} ({live.troops[u.id]})
                  </option>
                ))}
              </select>
              <input className="input input-qty" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} aria-label="Nombre" />
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => act({ type: "fortress_station", unit: chosen.id, qty: Math.min(qty, live.troops[chosen.id] ?? 0) })}
              >
                Poster
              </button>
            </div>
          ) : (
            <p className="row-desc">Aucune troupe chez toi à poster dans la forteresse.</p>
          )}
        </>
      )}
      {hasGarrison && (
        <button className="btn" disabled={busy} onClick={() => act({ type: "fortress_recall" })}>
          Rappeler mes troupes de la forteresse ({armyIcons(f.myGarrison)})
        </button>
      )}
    </>
  );
}

/** Un allié : son armée exacte et l'envoi de renforts. */
/** Pastille de présence : en ligne, ou depuis quand le joueur n'a pas été vu. */
function Presence({ lastSeen, now }: { lastSeen?: number; now: number }) {
  if (lastSeen === undefined) return null;
  const away = now - lastSeen;
  if (away < ONLINE_MS) return <span className="badge badge-online">● en ligne</span>;
  const m = Math.floor(away / 60_000);
  const label = m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} j`;
  return (
    <span className="badge badge-offline" title={new Date(lastSeen).toLocaleString("fr-FR")}>
      vu il y a {label}
    </span>
  );
}

function AllyRow({ r, live, now, run }: { r: RivalView; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const available = UNITS.filter((u) => (live.troops[u.id] ?? 0) > 0);
  const [unit, setUnit] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const chosen = available.find((u) => u.id === unit) ?? available[0];
  const max = chosen ? (live.troops[chosen.id] ?? 0) : 0;
  const send = async () => {
    if (!chosen) return;
    setBusy(true);
    await run({ type: "reinforce", target: r.id, unit: chosen.id, qty: Math.min(qty, max) });
    setBusy(false);
  };
  return (
    <div className="row">
      <div className="row-icon" aria-hidden>
        🤝
      </div>
      <div>
        <div className="row-title">
          {r.name}
          <Presence lastSeen={r.lastSeen} now={now} />
        </div>
        <div className="row-desc army-line num">{armyIcons(r.army)}</div>
        {chosen ? (
          <div className="reinforce">
            <select className="input" value={chosen.id} onChange={(e) => setUnit(e.target.value)} aria-label="Troupe à envoyer">
              {available.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.icon} {u.plural} ({live.troops[u.id]})
                </option>
              ))}
            </select>
            <input
              className="input input-qty"
              type="number"
              min={1}
              max={max}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              aria-label="Nombre"
            />
          </div>
        ) : (
          <div className="row-desc">Aucune troupe disponible chez toi à envoyer.</div>
        )}
      </div>
      <button className="btn btn-primary" disabled={busy || !chosen} onClick={send}>
        Envoyer
        <span className="cost">en renfort</span>
      </button>
    </div>
  );
}

/** « 🗡️12 🔱3 💂3 » dans l'ordre des unités. */
function armyIcons(army: Record<string, number>, empty = "personne"): string {
  const parts = [...COMBATANTS.values()].filter((c) => (army[c.id] ?? 0) > 0).map((c) => `${c.icon}${formatNumber(army[c.id])}`);
  return parts.length ? parts.join("  ") : empty;
}

/** Récit d'un assaut contre la caravane ou le colosse. */
function eventAttackText(c: ChronicleEntry, me: string): string {
  const d = c.details;
  const you = c.actorId === me;
  const who = you ? "Tu" : c.actorName;
  const lost = armyIcons(d.attackerLost ?? {}, "aucune");
  if (d.event === "caravane")
    return d.success
      ? `🐪 ${who} ${you ? "as pillé" : "a pillé"} la caravane : ${formatNumber(d.stolen ?? 0)} pierres (pertes : ${lost}).`
      : `🐪 ${who} ${you ? "as été repoussé" : "a été repoussé"} par l'escorte de la caravane (pertes : ${lost}).`;
  return `🗿 ${who} ${you ? "as frappé" : "a frappé"} le Colosse : ${armyIcons(d.defenderLost ?? {}, "personne")} fauchés, ${formatNumber(d.dealt ?? 0)} 🪨 de dégâts (pertes : ${lost}).`;
}

/** Événement en cours (ou le prochain) en tête de l'onglet Raids, avec ses derniers assauts. */
const EVENT_ICONS: Record<EventView["kind"], string> = { caravane: "🐪", colosse: "🗿", foire: "🎪", fete: "🎉", etoiles: "🌠", treve: "🔔", marchand: "🧺", lune: "🌕", brouillard: "🌫️", filon: "⛏️", bandits: "🏕️", tresor: "💰", convoi: "👑", siege: "🏰", tournoi: "🏆" };
const isLocalEvent = (e: EventView | null | undefined) => !!e && (e.kind === "filon" || e.kind === "bandits" || e.kind === "tresor" || e.kind === "convoi" || e.kind === "siege" || e.kind === "tournoi");
const isCombatEvent = (e: EventView | null | undefined) => !!e && (e.kind === "caravane" || e.kind === "colosse");

/** V7 à V9 : filon, camps de bandits, trésor. On y envoie une armée composée comme pour un raid. */
function LocalEventCard(props: { e: EventView; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  return props.e.kind === "tournoi" ? <TourneyCard {...props} /> : <PlaceEventCard {...props} />;
}

/** V12 : composer une armée de tournoi avec le budget commun. */
function TourneyCard({ e, now, run }: { e: EventView; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [chosen, setChosen] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const army = chosen ?? e.myEntry ?? {};
  const budget = e.budget ?? 0;
  const spent = UNITS.reduce((sum, u) => sum + (army[u.id] ?? 0) * u.cost, 0);
  const open = !e.resolved && (e.battleAt ?? e.endsAt) > now;
  const join = async () => {
    setBusy(true);
    await run({ type: "tournament_join", troops: army });
    setBusy(false);
    setChosen(null);
  };
  return (
    <div className="row event-card">
      <div className="row-icon" aria-hidden>
        🏆
      </div>
      <div>
        <div className="row-title">
          {e.name}
          <span className="badge badge-level-3">{open ? `encore ${duration(Math.max(0, e.endsAt - now))}` : "terminé"}</span>
        </div>
        <div className="row-desc">{e.description}</div>
        <div className="row-desc">
          {e.entries ?? 0} inscrit{(e.entries ?? 0) > 1 ? "s" : ""}
          {e.myEntry ? ` · ton armée : ${armyIcons(e.myEntry)}` : ""}
        </div>
        {e.resolved && <div className="row-desc">{(e.podium ?? []).length ? `Podium : ${(e.podium ?? []).map((n, i) => `${["🥇", "🥈", "🥉"][i]} ${n}`).join(" · ")}` : "Pas assez d'inscrits."}</div>}
        {open && (
          <div className="simulator send-army">
            {UNITS.map((u) => (
              <label key={u.id} className="send-line">
                <span>
                  {u.icon} {u.name} <span className="num">({formatNumber(u.cost)} 🪨)</span>
                </span>
                <input type="number" min={0} value={army[u.id] ?? 0} onChange={(ev) => setChosen({ ...army, [u.id]: Math.max(0, Math.floor(Number(ev.target.value) || 0)) })} />
              </label>
            ))}
            <div className="qty">
              <span className={spent > budget ? "num warn" : "num"}>
                {formatNumber(spent)} / {formatNumber(budget)} 🪨
              </span>
              <button className="btn btn-primary" disabled={busy || spent === 0 || spent > budget} onClick={() => void join()}>
                {e.myEntry ? "Modifier mon armée" : "S'inscrire"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Filon, camps de bandits, trésor, convoi et siège : on y envoie une armée composée comme pour un raid. */
function PlaceEventCard({ e, live, now, run }: { e: EventView; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [target, setTarget] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const have = live.troops as Record<string, number>;
  const army = Object.fromEntries(UNITS.map((u) => [u.id, Math.min(have[u.id] ?? 0, Math.max(0, Math.floor((chosen ?? have)[u.id] ?? 0)))]).filter(([, n]) => (n as number) > 0)) as Record<string, number>;
  const send = async (camp?: string) => {
    setBusy(true);
    await run({ type: "event_attack", troops: army, ...(camp ? { camp } : {}) });
    setBusy(false);
    setTarget(null);
  };
  const composer = (camp?: string) => (
    <div className="simulator send-army">
      {UNITS.filter((u) => (have[u.id] ?? 0) > 0).map((u) => (
        <label key={u.id} className="send-line">
          <span>
            {u.icon} {u.name} <span className="num">({formatNumber(have[u.id] ?? 0)})</span>
          </span>
          <input type="number" min={0} max={have[u.id] ?? 0} value={army[u.id] ?? 0} onChange={(ev) => setChosen({ ...army, [u.id]: Math.max(0, Math.min(have[u.id] ?? 0, Math.floor(Number(ev.target.value) || 0))) })} />
        </label>
      ))}
      <div className="qty">
        <button className="btn" onClick={() => setChosen({ ...have })}>
          Tout envoyer
        </button>
        <button className="btn btn-primary" disabled={busy || Object.keys(army).length === 0} onClick={() => void send(camp)}>
          🏇 Envoyer
        </button>
        <button className="btn btn-ghost" onClick={() => setTarget(null)}>
          Annuler
        </button>
      </div>
    </div>
  );
  return (
    <div className="row event-card">
      <div className="row-icon" aria-hidden>
        {EVENT_ICONS[e.kind]}
      </div>
      <div>
        <div className="row-title">
          {e.name}
          <span className="badge badge-level-3">encore {duration(Math.max(0, e.endsAt - now))}</span>
        </div>
        <div className="row-desc">{e.description}</div>
        {(e.kind === "convoi" || e.kind === "siege") && (
          <div className="row-desc">
            {e.resolved
              ? e.outcome === "left"
                ? e.kind === "convoi" ? "👑 Personne n'escortait le convoi." : "🏰 Personne ne défendait : l'armée est repartie sans rien détruire."
                : e.outcome === "won"
                ? e.kind === "convoi" ? "👑 Le convoi est passé." : "🏰 Le beffroi a tenu."
                : e.kind === "convoi" ? "👑 Le convoi est tombé dans l'embuscade." : "🏰 Le beffroi est tombé : l'étape a perdu 10 % de sa pierre."
              : `${e.kind === "convoi" ? "Embuscade" : "Assaut"} dans ${duration(Math.max(0, (e.battleAt ?? e.endsAt) - now))} · ennemis : ${armyIcons(e.army)} · ${e.posters ?? 0} joueur${(e.posters ?? 0) > 1 ? "s" : ""} posté${(e.posters ?? 0) > 1 ? "s" : ""}${(e.posters ?? 0) > 0 ? ` (${Math.round(e.chance * 100)} % de tenir)` : ""}`}
          </div>
        )}
        {e.kind === "tresor" && <div className="row-desc">{e.holder ? `💰 La case est tenue par ${e.holder}.` : "💰 Personne ne tient encore la case."}</div>}
        {e.kind === "bandits" && (
          <ul className="marches">
            {(e.camps ?? []).map((c) => (
              <li key={c.id}>
                <span>
                  🏕️ {c.mine ? "Ton camp" : "Un camp"} · {c.winner ? `vidé par ${c.winner}` : armyIcons(c.army)}
                </span>
                {!c.winner && (
                  <button className="btn" onClick={() => setTarget(target === c.id ? null : c.id)}>
                    Attaquer
                  </button>
                )}
              </li>
            ))}
            {(e.camps ?? []).length === 0 && <li>Aucun camp cette fois.</li>}
          </ul>
        )}
        {e.kind === "bandits" && target && composer(target)}
        {e.kind !== "bandits" && (target ? composer() : null)}
      </div>
      {e.kind !== "bandits" && !target && !e.resolved && !e.myPosted && (e.battleAt ?? e.endsAt) > now && (
        <button className="btn btn-primary" onClick={() => setTarget("go")}>
          {e.kind === "filon" ? "Poster une armée" : e.kind === "convoi" ? "Escorter le convoi" : e.kind === "siege" ? "Défendre le beffroi" : "Prendre la case"}
        </button>
      )}
    </div>
  );
}

/** Événements sans combat (foire, fête, étoiles, trêve, marchand) : un bandeau sous le compteur, et les achats du marchand. */
function EventBanner({ e, now, stone, run }: { e: EventView | null; now: number; stone: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  if (!e) return null;
  if (!e.active) {
    if (e.startsAt - now > 15 * 60_000 || e.startsAt <= now) return null;
    return (
      <div className="event-banner">
        {EVENT_ICONS[e.kind]} Dans {duration(e.startsAt - now)} : <strong>{e.name}</strong>
      </div>
    );
  }
  if (isCombatEvent(e) || isLocalEvent(e) || e.endsAt <= now) return null;
  const buy = async (choice: MerchantChoice) => {
    setBusy(true);
    await run({ type: "merchant", choice });
    setBusy(false);
  };
  return (
    <div className="event-banner active">
      <div>
        {EVENT_ICONS[e.kind]} <strong>{e.name}</strong> · encore {duration(e.endsAt - now)}
      </div>
      <div className="note">{e.description}</div>
      {e.kind === "marchand" &&
        (e.merchantBought ? (
          <div className="note">Tu as déjà acheté à ce marchand.</div>
        ) : (
          <div className="merchant-offers">
            {(Object.keys(MERCHANT_OFFERS) as MerchantChoice[]).map((c) => (
              <button key={c} className="btn" disabled={busy || (e.merchantPrice ?? 0) > stone} onClick={() => void buy(c)}>
                {MERCHANT_OFFERS[c].icon} {MERCHANT_OFFERS[c].label}
                <span className="cost num">{formatNumber(e.merchantPrice ?? 0)} 🪨</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

function EventCard({ e, now, busy, onAttack, history, me }: { e: EventView; now: number; busy: boolean; onAttack: () => void; history: ChronicleEntry[]; me: string }) {
  const icon = EVENT_ICONS[e.kind];
  if (!isCombatEvent(e) && e.active) {
    return (
      <p className="note event-next">
        {icon} En ce moment : {e.name}, encore {duration(Math.max(0, e.endsAt - now))}. {e.description}
      </p>
    );
  }
  if (!e.active) {
    return (
      <p className="note event-next">
        {icon} Prochain événement : {e.name}, {e.startsAt > now ? `dans ${duration(e.startsAt - now)}` : "imminent"}.
      </p>
    );
  }
  const pct = Math.round(e.chance * 100);
  return (
    <div className="row event-card">
      <div className="row-icon" aria-hidden>
        {icon}
      </div>
      <div>
        <div className="row-title">
          {e.name}
          <span className="badge badge-level-3">encore {duration(Math.max(0, e.endsAt - now))}</span>
        </div>
        <div className="row-desc">{e.description}</div>
        <div className="row-desc army-line num">{armyIcons(e.army)}</div>
        <div className="event-bar" aria-label="Défenseurs restants">
          <span style={{ width: `${Math.round((e.kind === "caravane" ? Math.max(0, e.endsAt - now) / Math.max(1, e.endsAt - e.startsAt) : e.armyLeft) * 100)}%` }} />
        </div>
        <div className="row-desc num">
          {e.kind === "caravane"
            ? `${e.attackers} pillard${e.attackers > 1 ? "s" : ""} · ${e.mine > 0 ? `tu as pris ${formatNumber(e.mine)} 🪨` : `une victoire te rapporte ${formatNumber(e.take)} 🪨`}`
            : e.pool > 0
              ? `Prime : ${formatNumber(e.pool)} 🪨 · ${e.attackers} combattant${e.attackers > 1 ? "s" : ""} · ta part : ${Math.round(e.mine * 100)} %`
              : `${e.attackers} combattant${e.attackers > 1 ? "s" : ""} · un assaut rapporte environ ${formatNumber(e.take * 2)} 🪨 de prime`}
        </div>
        <div className="row-desc">
          {e.blocker ?? (e.kind === "caravane" ? `${pct} % de chances de battre l'escorte.` : `Un assaut devrait faucher environ ${formatNumber(e.take)} 🪨 de son armée.`)}
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy || e.blocker !== null} onClick={onAttack}>
        {e.kind === "caravane" ? "Piller" : "Attaquer"}
        {e.kind === "caravane" && <span className="cost num">{pct} %</span>}
      </button>
      {history.length > 0 && (
        <ul className="chronicle event-history">
          {history.slice(0, 8).map((c) => (
            <li key={c.id}>{eventAttackText(c, me)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chronicle({ entries, me, now, rivals, alliances = [] }: { entries: ChronicleEntry[]; me: string; now: number; rivals: RivalView[]; alliances?: AllianceSummary[] }) {
  const allianceName = (id: number | null | undefined) => alliances.find((a) => a.id === id)?.name ?? "une alliance disparue";
  const nameOf = (id: string) => (id === me ? "toi" : (rivals.find((r) => r.id === id)?.name ?? "un allié"));
  if (entries.length === 0) return <p className="empty">Le royaume est calme. Pour l&apos;instant…</p>;
  const ago = (t: number) => agoText(t, now);
  const who = (id: string | null, name: string, cap = false) => (id === me ? (cap ? "Tu" : "toi") : name);
  return (
    <ul className="chronicle">
      {entries.map((e) => {
        let text: string;
        if (e.kind === "war") {
          const d = e.details;
          if (d.phase === "start") text = `⚔️ ${allianceName(d.a)} déclare la guerre à ${allianceName(d.b)} pour 24 h !`;
          else
            text =
              d.winner != null
                ? `🏆 ${allianceName(d.winner)} remporte la guerre ${allianceName(d.a)} – ${allianceName(d.b)} (${formatNumber(d.scoreA ?? 0)} contre ${formatNumber(d.scoreB ?? 0)}) et partage ${formatNumber(d.bounty ?? 0)} pierres de prime.`
                : `🤝 La guerre ${allianceName(d.a)} – ${allianceName(d.b)} se termine sur une égalité.`;
        } else if (e.kind === "event") {
          const d = e.details;
          const shares = Object.entries(d.shares ?? {})
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => nameOf(id))
            .slice(0, 4)
            .join(", ");
          if (d.phase === "attack") text = eventAttackText(e, me);
          else if (d.event === "caravane")
            text = (d.stolen ?? 0) > 0 ? `🐪 La caravane marchande est repartie, allégée de ${formatNumber(d.stolen ?? 0)} pierres (${shares}).` : "🐪 La caravane marchande est repartie intacte.";
          else text = d.success ? `🗿 Le Colosse est tombé ! ${formatNumber(d.bounty ?? 0)} pierres versées à ceux qui l'ont touché (${shares}).` : "🗿 Le Colosse s'en va invaincu.";
        } else if (e.kind === "fortress") {
          text = e.details.success
            ? `🏰 ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "as pris" : "a pris"} la forteresse pour ${allianceName(e.details.alliance)} !`
            : `🏰 ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "t'es brisé" : "s'est brisé"} sur les murs de la forteresse.`;
        } else if (e.kind === "sabotage") {
          const target = e.targetId === me ? "ton académie" : `l'académie de ${e.targetName}`;
          text = e.details.success
            ? e.actorId === me
              ? `🧨 Tu as saboté ${target}.`
              : `🧨 Un saboteur a frappé ${target}${e.targetId === me ? " : un niveau perdu et ta recherche retardée" : ""}.`
            : `🧨 ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "as été pris" : "a été pris"} en train de saboter ${target}.`;
        } else if (e.kind === "spy") {
          text = `${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "as été surpris" : "a été surpris"} à espionner ${e.details.fortress ? "la forteresse" : e.targetId === me ? "ton domaine" : e.targetName}.`;
        } else if (e.kind === "lot") {
          const d = e.details as { stage?: number; name?: string; master?: boolean };
          const stageName = STAGES[d.stage ?? 0]?.name ?? "l'étape";
          text = d.master
            ? `👑 ${d.name} finit son lot de « ${stageName} » le premier et devient maître d'œuvre !`
            : `🏗️ ${d.name} finit son lot de « ${stageName} ».`;
        } else if (e.kind === "gift") {
          text = `${e.actorName} a offert ${formatNumber(e.details.amount ?? 0)} pierres au chantier.`;
        } else {
          const ruined = Object.values(e.details.destroyed ?? {}).reduce((a, b) => a + b, 0);
          const actor = who(e.actorId, e.actorName, true);
          const targetName = e.targetId === me ? "toi" : e.targetName;
          if (e.details.success === false) {
            const repel = e.targetId === me ? "Tu as repoussé" : `${e.targetName} a repoussé`;
            text = `${repel} le raid de ${e.actorId === me ? "toi" : e.actorName}${e.details.revenge ? " (revanche)" : ""}.`;
            if (e.details.attackerLost) text += ` Pertes de l'assaillant : ${armyIcons(e.details.attackerLost, "aucune")}.`;
          } else {
            const verb = e.actorId === me ? "as pillé" : "a pillé";
            const target = e.targetId === me ? "tes greniers" : targetName;
            text = `${actor} ${verb} ${target}${e.details.revenge ? " (revanche)" : ""} : ${formatNumber(e.details.stolen ?? 0)} pierres${ruined ? `, ${ruined} bâtiment${ruined > 1 ? "s" : ""} en ruine` : ""}.`;
            const shares = Object.entries(e.details.allyShares ?? {});
            if (shares.length) text += ` Butin partagé : ${shares.map(([id, n]) => `${formatNumber(n)} pour ${nameOf(id)}`).join(", ")}.`;
            if (e.details.defenderLost) text += ` Pertes du défenseur : ${armyIcons(e.details.defenderLost, "aucune")}.`;
          }
        }
        return (
          <li key={e.id} className={e.targetId === me ? "hit" : undefined}>
            <span>
              {text}
              {e.details.log && e.details.log.length > 0 && (e.kind === "raid" || e.kind === "fortress") && <RoundsReport log={e.details.log} />}
            </span>
            <span className="when">{ago(e.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function agoText(t: number, now: number): string {
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.floor(m / 60)} h`;
  return `il y a ${Math.floor(m / 1440)} j`;
}

/** Couleur stable d'une alliance sur la carte. */
const ALLIANCE_COLORS = ["#2f6db3", "#3f8f3a", "#b35a1f", "#7a3fa0", "#b3304a", "#1f8f8a", "#8a7a1f", "#555"];
function allianceColor(id: number | null | undefined): string | undefined {
  return id == null ? undefined : ALLIANCE_COLORS[Math.abs(id) % ALLIANCE_COLORS.length];
}

/** T1 : carte du royaume. Toucher un lieu ouvre sa fiche. */
function KingdomMap({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const map = snap.map;
  if (!map) return <p className="empty">On déplie la carte…</p>;
  const cell = 24;
  const size = map.size * cell;
  const at = (p: readonly [number, number]) => ({ cx: (p[0] - 0.5) * cell, cy: (map.size - p[1] + 0.5) * cell });
  const mine = map.places[snap.userId];
  // La caravane avance en direct le long de sa route.
  const ev = snap.event;
  const evPos: [number, number] | undefined = ev?.active && ev.path
    ? (() => {
        const f = Math.min(1, Math.max(0, (now - ev.startsAt) / Math.max(1, ev.endsAt - ev.startsAt)));
        return [ev.path.from[0] + (ev.path.to[0] - ev.path.from[0]) * f, ev.path.from[1] + (ev.path.to[1] - ev.path.from[1]) * f];
      })()
    : ev?.pos;
  const myAlliance = snap.alliance?.id ?? null;
  const allianceIdOf = (name: string | null) => snap.alliances.find((a) => a.name === name)?.id ?? null;
  const rival = snap.rivals.find((r) => r.id === picked);
  const act = async (target: string, action: Parameters<typeof run>[0]) => {
    setBusy(target);
    await run(action);
    setBusy(null);
  };
  const spyPrice = spyCost(live, worldFrom(snap.worksite), now);
  const placeDistance = (p?: readonly [number, number]) => (mine && p ? mapDistance(mine, p) : null);
  return (
    <>
      <p className="note">
        Le royaume vu d&apos;en haut : 🔔 le beffroi au centre, 🏰 Pierre-Haute, les seigneurs sous leur blason, les joueurs sous leur écu, aux couleurs de leur
        alliance. Toi, tu es l&apos;étoile. Touche un lieu pour ouvrir sa fiche.
      </p>
      <div className="kingdom-map">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Carte du royaume">
          {Array.from({ length: map.size + 1 }, (_, i) => (
            <g key={i} className="map-grid">
              <line x1={i * cell} y1={0} x2={i * cell} y2={size} />
              <line x1={0} y1={i * cell} x2={size} y2={i * cell} />
            </g>
          ))}
          <text {...(({ cx, cy }) => ({ x: cx, y: cy }))(at(map.belfry))} className="map-icon">
            🔔
          </text>
          <text {...(({ cx, cy }) => ({ x: cx, y: cy }))(at(map.fortress))} className="map-icon" onClick={() => setPicked(null)}>
            🏰
          </text>
          {snap.event?.active && snap.event.path && (
            <line className="map-path" {...(({ cx, cy }) => ({ x1: cx, y1: cy }))(at(snap.event.path.from))} {...(({ cx, cy }) => ({ x2: cx, y2: cy }))(at(snap.event.path.to))} />
          )}
          {snap.event?.active &&
            (snap.event.camps ?? []).map((c) => (
              <text key={c.id} x={at(c.pos).cx} y={at(c.pos).cy} className="map-icon" opacity={c.winner ? 0.35 : 1}>
                🏕️
              </text>
            ))}
          {snap.event?.active && evPos && (
            <text {...(({ cx, cy }) => ({ x: cx, y: cy }))(at(evPos))} className="map-icon">
              {EVENT_ICONS[snap.event.kind]}
            </text>
          )}
          {mine &&
            (snap.state.marches ?? []).map((m) => {
              const camp = m.target.startsWith("camp:") ? snap.event?.camps?.find((c) => `camp:${snap.event?.id}:${c.id}` === m.target) : undefined;
              const target =
                m.target === "fortress"
                  ? map.fortress
                  : m.target.startsWith("convoy:") || m.target.startsWith("siege:")
                    ? ev?.pos
                    : m.target.startsWith("event:") || m.target.startsWith("mine:") || m.target.startsWith("treasure:")
                    ? evPos
                    : camp
                      ? camp.pos
                      : map.places[m.target];
              if (!target) return null;
              const a = at(mine);
              const b = at(target);
              // Position sur la route : 0 au domaine, 1 à la cible.
              const f = m.status === "camp"
                ? 1
                : m.status === "out"
                ? Math.min(1, Math.max(0, (now - m.departAt) / Math.max(1, m.arriveAt - m.departAt)))
                : Math.min(1, Math.max(0, (m.returnAt - now) / Math.max(1, m.arriveAt - m.departAt)));
              return (
                <g key={m.id} className="map-march">
                  <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} />
                  <circle cx={a.cx + (b.cx - a.cx) * f} cy={a.cy + (b.cy - a.cy) * f} r={4} />
                </g>
              );
            })}
          {Object.entries(map.places).map(([id, p]) => {
            const { cx, cy } = at(p);
            const me = id === snap.userId;
            const r = snap.rivals.find((x) => x.id === id);
            if (!me && !r) return null;
            const color = me ? allianceColor(myAlliance) : allianceColor(allianceIdOf(r?.allianceName ?? null));
            const guarded = r && (r.shieldUntil > now || r.curfew);
            return (
              <g key={id} className={`map-place${picked === id ? " picked" : ""}`} onClick={() => !me && setPicked(id)} role="button" aria-label={me ? "Ton domaine" : r?.name}>
                {color && <circle cx={cx} cy={cy} r={cell * 0.48} fill={color} opacity={0.35} />}
                <text x={cx} y={cy} className="map-icon">
                  {me ? "⭐" : r?.isLord ? r.blazon : "🛡️"}
                </text>
                {guarded && (
                  <text x={cx + cell * 0.32} y={cy - cell * 0.28} className="map-badge">
                    {r?.curfew ? "🌙" : "🔰"}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <Marches snap={snap} now={now} run={run} />
      {rival ? (
        <>
          <p className="raid-state">
            📍 {rival.name} est à {(placeDistance(map.places[rival.id]) ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} cases de chez toi.
          </p>
          {rival.allied ? (
            <p className="note">C&apos;est un allié : tu peux lui envoyer des renforts depuis l&apos;onglet Alliance.</p>
          ) : (
            <div className="list">
              <RivalRow
                r={rival}
                now={now}
                busy={busy}
                onRaid={(t, troops) => act(t, { type: "raid", target: t, troops })}
                distance={placeDistance(map.places[rival.id]) ?? undefined}
                onSpy={(t) => act(t, { type: "spy", target: t })}
                spyPrice={spyPrice}
                stone={live.stone}
                onSabotage={(t) => act(t, { type: "sabotage", target: t })}
                stagesDone={stagesDoneAt(worldFrom(snap.worksite), now)}
                me={live}
              />
            </div>
          )}
        </>
      ) : (
        <p className="empty">Touche un domaine sur la carte.</p>
      )}
    </>
  );
}

/** B11 : messages courts, canal général ou d'alliance, avec réactions. */
function Chat({ userId, hasAlliance, now }: { userId: string; hasAlliance: boolean; now: number }) {
  const [channel, setChannel] = useState<ChatChannel>(hasAlliance ? "alliance" : "general");
  const { view, error, send, react } = useChat(channel);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    if (await send(draft)) setDraft("");
    setSending(false);
  };
  return (
    <>
      <div className="subtabs" role="group" aria-label="Canaux">
        <button className="btn" aria-pressed={channel === "general"} onClick={() => setChannel("general")}>
          🌍 Général
        </button>
        <button className="btn" aria-pressed={channel === "alliance"} onClick={() => setChannel("alliance")} disabled={!hasAlliance} title={hasAlliance ? undefined : "Rejoins une alliance pour son canal"}>
          🤝 Alliance
        </button>
      </div>
      {!view ? (
        <p className="empty">On déroule les parchemins…</p>
      ) : !view.available ? (
        <p className="empty">Tu n&apos;as pas d&apos;alliance.</p>
      ) : (
        <ul className="chat">
          {view.messages.length === 0 && <li className="empty">Aucun message pour l&apos;instant. Lance la conversation !</li>}
          {view.messages.map((m) => (
            <li key={m.id} className={m.userId === userId ? "me" : undefined}>
              <div>
                <strong>{m.name}</strong> <span className="when">{agoText(m.at, now)}</span>
              </div>
              <div className="chat-body">{m.body}</div>
              <div className="chat-reactions">
                {CHAT_REACTIONS.map((emoji) => {
                  const who = m.reactions[emoji] ?? [];
                  return (
                    <button key={emoji} className={`chat-react${who.includes(userId) ? " on" : ""}${who.length ? "" : " idle"}`} onClick={() => void react(m.id, emoji)} aria-label={`Réagir ${emoji}`}>
                      {emoji}
                      {who.length > 0 && <span className="num"> {who.length}</span>}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      {view?.available && (
        <form className="chat-form" onSubmit={submit}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={CHAT_MAX_LENGTH} placeholder={channel === "general" ? "Un mot pour tout le royaume…" : "Un mot pour ton alliance…"} aria-label="Message" />
          <button className="btn btn-primary" disabled={sending || !draft.trim()}>
            Envoyer
          </button>
        </form>
      )}
      {error && <p className="note">{error}</p>}
    </>
  );
}

/** B7 : déroulé d'une bataille, round par round. */
function RoundsReport({ log, open = false }: { log: NonNullable<ChronicleEntry["details"]["log"]>; open?: boolean }) {
  return (
    <details className="rounds" open={open}>
      <summary>Déroulé en {log.length} round{log.length > 1 ? "s" : ""}</summary>
      <ol>
        {log.map((r, i) => (
          <li key={i}>
            <strong>Round {i + 1}</strong> · l&apos;assaillant perd {armyIcons(r.attackerLost, "rien")}, le défenseur perd {armyIcons(r.defenderLost, "rien")}. Restent{" "}
            <span className="num">{formatNumber(r.attackerLeft)}</span> contre <span className="num">{formatNumber(r.defenderLeft)}</span>.
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Caserne et fortifications du joueur. */
function Garrison({ live, run }: { live: PlayerState; run: ReturnType<typeof useGame>["run"] }) {
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState("");
  const presets = [1, 10, 50, 100, 500];
  const pickCustom = (text: string) => {
    setCustom(text);
    const n = Math.floor(Number(text));
    if (Number.isSafeInteger(n) && n >= 1) setQty(n);
  };
  const buy = (kind: "unit" | "defense", id: string) => void run({ type: "army", kind, id, qty });
  const rows = (kind: "unit" | "defense", defs: readonly CombatantDef<string>[]) =>
    defs.map((d) => {
      const n = ((kind === "unit" ? live.troops : live.defenses) as Record<string, number>)[d.id] ?? 0;
      return (
        <div key={d.id} className="row">
          <div className="row-icon" aria-hidden>
            {d.icon}
          </div>
          <div>
            <div className="row-title">
              {d.name}
              {n > 0 && <span className="row-count num">{n}</span>}
              {kind === "unit" && (live.wounded as Record<string, number> | undefined)?.[d.id] ? (
                <span className="badge" title="À l'infirmerie : ils reviennent bientôt">🩹 {(live.wounded as Record<string, number>)[d.id]}</span>
              ) : null}
              {levelOf(live, d.id as CombatantId) > 0 && <span className="badge">niv. {levelOf(live, d.id as CombatantId)}</span>}
            </div>
            <div className="row-desc num">
              ⚔️ {d.attack} · ❤️ {d.hp} · {d.description}
            </div>
            {d.bonus && <div className="row-desc strong-vs">{strengths(d.bonus)}</div>}
          </div>
          <button className="btn btn-primary" disabled={d.cost * qty > live.stone} onClick={() => buy(kind, d.id)}>
            +{qty}
            <span className="cost num">{formatNumber(d.cost * qty)} 🪨</span>
          </button>
        </div>
      );
    });
  return (
    <>
      <div className="garrison-head">
        <h3 className="section-title">Ta garnison</h3>
        <span className="num">
          valeur {formatNumber(armyWorth(live))} 🪨
        </span>
      </div>
      {live.healAt > 0 && Object.keys(live.wounded ?? {}).length > 0 && (
        <p className="note num">
          🩹 Infirmerie : {formatNumber(Object.values(live.wounded ?? {}).reduce((a, b) => a + (b ?? 0), 0))} blessés reviennent{" "}
          {new Date(live.healAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Ils ne se battent pas d&apos;ici là.
        </p>
      )}
      <div className="qty" role="group" aria-label="Quantité">
        {presets.map((q) => (
          <button
            key={q}
            className="btn"
            aria-pressed={qty === q && custom === ""}
            onClick={() => {
              setQty(q);
              setCustom("");
            }}
          >
            ×{q}
          </button>
        ))}
        <input
          className={`input input-qty${custom !== "" ? " input-active" : ""}`}
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="×…"
          value={custom}
          onChange={(e) => pickCustom(e.target.value)}
          aria-label="Quantité au choix"
        />
      </div>
      <div className="list">{rows("unit", UNITS)}</div>
      <div className="list" style={{ marginTop: 8 }}>
        {rows("defense", DEFENSES)}
      </div>
    </>
  );
}

function strengths(bonus: Partial<Record<Category, number>>): string {
  return (
    "Fort contre " +
    (Object.entries(bonus) as [Category, number][]).map(([c, m]) => `${CATEGORY_LABELS[c]} (×${m})`).join(" et ")
  );
}
