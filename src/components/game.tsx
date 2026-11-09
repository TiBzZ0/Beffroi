"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/(auth)/actions";
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  COMBATANTS,
  DEFENSES,
  GENERATORS,
  RAID_COOLDOWN_MS,
  STAGES,
  UNITS,
  UPGRADES,
  type Category,
  type CombatantDef,
  type GeneratorId,
} from "@/lib/game/config";
import {
  advance,
  armyWorth,
  clickValue,
  generatorCost,
  generatorRate,
  maxAffordable,
  owned,
  productionMultiplier,
  rateAt,
  ruinCost,
  ruinsOf,
  stagesDoneAt,
  upgradeUnlocked,
  type PlayerState,
} from "@/lib/game/engine";
import { formatNumber, formatRate } from "@/lib/game/format";
import { worldFrom, type ChronicleEntry, type GameSnapshot, type RivalView } from "@/lib/game/types";
import { useGame, useLeaderboard, useTick } from "./use-game";

type Tab = "ateliers" | "ameliorations" | "chantier" | "raids" | "classement";
type Qty = 1 | 10 | "max";
const DAY_MS = 86_400_000;

export function Game({ userId }: { userId: string }) {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("ateliers");
  useTick(250);

  const snap = game.snap;
  const leaderboard = useLeaderboard(tab === "classement" && !!snap, snap?.worksite.total);

  if (!snap) return <div className="loading">On allume les torches…</div>;

  const now = game.serverNow();
  const world = worldFrom(snap.worksite);
  const stagesDone = stagesDoneAt(world, now);
  // État prévu « maintenant » : sert à savoir ce qui est achetable.
  const live: PlayerState = { ...advance(snap.state, now, world), stone: game.predictedStone() };
  const rate = rateAt(live, world, now);
  const affordableUpgrades = UPGRADES.filter((u) => !live.upgrades.includes(u.id) && upgradeUnlocked(live, u) && u.cost <= live.stone).length;

  return (
    <div className="game">
      <TopBar snap={snap} now={now} />
      <div className="layout">
        <Hero snap={snap} rate={rate} clickGain={clickValue(live, world, stagesDone)} game={game} />
        <section className="panel">
          <div className="tabs" role="tablist">
            <TabButton id="ateliers" tab={tab} setTab={setTab} label="Ateliers" />
            <TabButton id="ameliorations" tab={tab} setTab={setTab} label="Savoirs" dot={affordableUpgrades > 0} />
            <TabButton id="chantier" tab={tab} setTab={setTab} label="Chantier" />
            <TabButton id="raids" tab={tab} setTab={setTab} label="Raids" dot={snap.rivals.some((r) => r.revenge && !r.blocker)} />
            <TabButton id="classement" tab={tab} setTab={setTab} label="Rangs" />
          </div>
          <div className="tab-body" role="tabpanel">
            {tab === "ateliers" && <Generators live={live} stagesDone={stagesDone} snap={snap} run={game.run} />}
            {tab === "ameliorations" && <Upgrades live={live} run={game.run} />}
            {tab === "chantier" && <Worksite snap={snap} live={live} run={game.run} />}
            {tab === "raids" && <Raids snap={snap} live={live} now={now} run={game.run} />}
            {tab === "classement" && <Ranking boards={leaderboard} userId={userId} />}
          </div>
        </section>
      </div>
      {game.toast && (
        <div className="toast" role="status">
          {game.toast}
        </div>
      )}
    </div>
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
          <br />
          Saison {snap.season.number} · jour {day}/14
          <br />
          fin dans {days} j {hours} h
        </div>
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
          <div className="hammer-hint">Frappe la pierre : +{formatRate(clickGain)} par coup</div>
        </div>
        <div className="hammer-zone">
          <button className="hammer" onPointerDown={onHit} aria-label={`Tailler la pierre (+${formatRate(clickGain)})`}>
            🪨
          </button>
          {floaters.map((f) => (
            <span key={f.id} className="float" style={{ left: f.x, top: f.y - 20 }}>
              {f.text}
            </span>
          ))}
        </div>
      </div>
      <Status state={snap.state} now={game.serverNow()} />
      <div className="mini-site">
        <h3>{finished ? "Le beffroi est achevé !" : `Chantier : ${STAGES[w.stage].name}`}</h3>
        <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="bar-caption num">
          <span>{finished ? `${formatNumber(w.total)} pierres versées` : `${formatNumber(w.progress)} / ${formatNumber(w.target)}`}</span>
          <span>{finished ? "3/3" : `étape ${w.stage + 1}/3`}</span>
        </div>
      </div>
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

  const buy = async (id: GeneratorId, n: number) => {
    setBusy(id);
    await run({ type: "buy", generator: id, qty: n });
    setBusy(null);
  };
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
                </div>
                <div className="row-desc num">
                  {hidden ? "Continue de bâtir pour le découvrir." : `${g.description} ${formatRate(each)}/s chacun${n > 0 ? ` · total ${formatRate(each * n)}/s` : ""}`}
                </div>
              </div>
              <button className="btn btn-primary" disabled={hidden || cost > live.stone || busy !== null} onClick={() => buy(g.id, count)}>
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
  const [busy, setBusy] = useState(false);
  const available = UPGRADES.filter((u) => !live.upgrades.includes(u.id) && upgradeUnlocked(live, u)).sort((a, b) => a.cost - b.cost);
  const bought = UPGRADES.filter((u) => live.upgrades.includes(u.id));
  const nextLocked = UPGRADES.filter((u) => !live.upgrades.includes(u.id) && !upgradeUnlocked(live, u)).sort((a, b) => a.cost - b.cost)[0];

  const buy = async (id: string) => {
    setBusy(true);
    await run({ type: "upgrade", upgrade: id });
    setBusy(false);
  };

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
          <button className="btn btn-primary" disabled={u.cost > live.stone || busy} onClick={() => buy(u.id)}>
            Apprendre
            <span className="cost num">{formatNumber(u.cost)} 🪨</span>
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
      <p className="note num">
        Tu as versé {formatNumber(snap.state.totalContributed)} pierres. {w.activePlayers} bâtisseur{w.activePlayers > 1 ? "s" : ""} actif{w.activePlayers > 1 ? "s" : ""} cette semaine : la taille des étapes s&apos;adapte au nombre de joueurs.
      </p>
    </>
  );
}

function Ranking({ boards, userId }: { boards: ReturnType<typeof useLeaderboard>; userId: string }) {
  if (!boards) return <p className="empty">On consulte les registres…</p>;
  return (
    <>
      <h3 className="section-title">🏗️ Bâtisseurs du chantier</h3>
      <Board rows={boards.contributors} userId={userId} empty="Personne n'a encore versé de pierre. Sois le premier !" />
      <h3 className="section-title">⚔️ Pillards</h3>
      <Board rows={boards.plunderers} userId={userId} empty="Aucun pillage pour l'instant." />
      <p className="note">Classements de la saison en cours. Les seigneurs voisins n&apos;y figurent pas.</p>
    </>
  );
}

function Board({ rows, userId, empty }: { rows: { userId: string; username: string; total: number }[]; userId: string; empty: string }) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <ol className="ranking">
      {rows.map((r, i) => (
        <li key={r.userId} className={r.userId === userId ? "me" : undefined}>
          <span className="rank">{medals[i] ?? i + 1}</span>
          <span>{r.username}</span>
          <span className="num">{formatNumber(r.total)}</span>
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

function Raids({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const cooldown = live.lastRaidAt + RAID_COOLDOWN_MS - now;
  const raid = async (target: string) => {
    setBusy(target);
    await run({ type: "raid", target });
    setBusy(null);
  };
  const players = snap.rivals.filter((r) => !r.isLord);
  const lords = snap.rivals.filter((r) => r.isLord);

  return (
    <>
      <p className="note raid-intro">
        Un raid est une bataille de 4 rounds au plus : toutes tes troupes contre les troupes, fortifications et 3 gardes de la cible. Chaque unité a
        ses forces et ses faiblesses, compose ton armée selon ce que tu vois en face. Tu gagnes si plus personne ne riposte en face. Les pertes sont
        réelles des deux côtés (70 % des fortifications abattues se relèvent). Un raid réussi vole 25 % (40 % en revanche) de la pierre non sécurisée (la dernière
        demi-heure de production est à l&apos;abri, mais jamais plus de la moitié du stock), incendie les ateliers 2 h et ruine quelques bâtiments ; la victime reçoit 4 h de bouclier et un
        droit de revanche (+50 % de dégâts). Les seigneurs difficiles ne frappent que ceux qui les ont attaqués.
      </p>
      <Garrison live={live} run={run} />
      <p className="raid-state">
        {cooldown > 0 ? `⏳ Tes troupes se reposent encore ${duration(cooldown)}.` : "⚔️ Tes troupes sont prêtes."}
      </p>
      <h3 className="section-title">Seigneurs voisins</h3>
      <div className="list">
        {lords.map((r) => (
          <RivalRow key={r.id} r={r} now={now} busy={busy} onRaid={raid} />
        ))}
      </div>
      <h3 className="section-title">Joueurs</h3>
      <div className="list">
        {players.length === 0 && <p className="empty">Personne d&apos;autre au royaume pour l&apos;instant. Invite tes amis !</p>}
        {players.map((r) => (
          <RivalRow key={r.id} r={r} now={now} busy={busy} onRaid={raid} />
        ))}
      </div>
      <h3 className="section-title">Chronique</h3>
      <Chronicle entries={snap.chronicle ?? []} me={snap.userId} now={now} />
    </>
  );
}

function RivalRow({ r, now, busy, onRaid }: { r: RivalView; now: number; busy: string | null; onRaid: (id: string) => void }) {
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
        </div>
        <div className="row-desc num">
          {r.temper ? `${r.temper} · ` : ""}
          {r.retaliateOnly ? "ne frappe qu'en représailles · " : ""}
          {formatNumber(r.stone)} pierres · {formatRate(r.rate)}/s
          {shielded ? ` · bouclier ${duration(r.shieldUntil - now)}` : ""}
          {r.burnedUntil > now ? " · 🔥" : ""}
        </div>
        <div className="row-desc army-line num" title="Ce qui défendrait le domaine">
          {armyIcons(r.army)}
        </div>
        <div className="row-desc">
          {r.blocker ?? (r.loot > 0 ? `Butin estimé : ${formatNumber(r.loot)} pierres` : "Rien à piller pour l'instant.")}
        </div>
      </div>
      <button className="btn btn-primary" disabled={blocked || busy !== null} onClick={() => onRaid(r.id)}>
        Raider
        <span className="cost num">{pct} % de succès</span>
      </button>
    </div>
  );
}

/** « 🗡️12 🔱3 💂3 » dans l'ordre des unités. */
function armyIcons(army: Record<string, number>, empty = "personne"): string {
  const parts = [...COMBATANTS.values()].filter((c) => (army[c.id] ?? 0) > 0).map((c) => `${c.icon}${formatNumber(army[c.id])}`);
  return parts.length ? parts.join("  ") : empty;
}

function Chronicle({ entries, me, now }: { entries: ChronicleEntry[]; me: string; now: number }) {
  if (entries.length === 0) return <p className="empty">Le royaume est calme. Pour l&apos;instant…</p>;
  const ago = (t: number) => {
    const m = Math.floor((now - t) / 60_000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    if (m < 1440) return `il y a ${Math.floor(m / 60)} h`;
    return `il y a ${Math.floor(m / 1440)} j`;
  };
  const who = (id: string | null, name: string, cap = false) => (id === me ? (cap ? "Tu" : "toi") : name);
  return (
    <ul className="chronicle">
      {entries.map((e) => {
        let text: string;
        if (e.kind === "gift") {
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
            if (e.details.defenderLost) text += ` Pertes du défenseur : ${armyIcons(e.details.defenderLost, "aucune")}.`;
          }
        }
        return (
          <li key={e.id} className={e.targetId === me ? "hit" : undefined}>
            <span>{text}</span>
            <span className="when">{ago(e.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Caserne et fortifications du joueur. */
function Garrison({ live, run }: { live: PlayerState; run: ReturnType<typeof useGame>["run"] }) {
  const [qty, setQty] = useState<1 | 10>(1);
  const [busy, setBusy] = useState(false);
  const buy = async (kind: "unit" | "defense", id: string) => {
    setBusy(true);
    await run({ type: "army", kind, id, qty });
    setBusy(false);
  };
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
            </div>
            <div className="row-desc num">
              ⚔️ {d.attack} · ❤️ {d.hp} · {d.description}
            </div>
            {d.bonus && <div className="row-desc strong-vs">{strengths(d.bonus)}</div>}
          </div>
          <button className="btn btn-primary" disabled={busy || d.cost * qty > live.stone} onClick={() => buy(kind, d.id)}>
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
      <div className="qty" role="group" aria-label="Quantité">
        {([1, 10] as const).map((q) => (
          <button key={q} className="btn" aria-pressed={qty === q} onClick={() => setQty(q)}>
            ×{q}
          </button>
        ))}
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
