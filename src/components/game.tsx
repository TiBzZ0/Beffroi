"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/(auth)/actions";
import {
  CATEGORY_LABELS,
  MAX_ALLIANCE_SIZE,
  HALL,
  ONLINE_MS,
  DIFFICULTY_LABELS,
  COMBATANTS,
  LEVEL_BONUS,
  ACADEMY_SPEED,
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
} from "@/lib/game/config";
import {
  advance,
  armyWorth,
  clickValue,
  generatorCost,
  generatorRate,
  lootOf,
  spyCost,
  academyCost,
  levelOf,
  researchCost,
  researchTime,
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
import { worldFrom, type AllianceSummary, type ChronicleEntry, type EventView, type GameSnapshot, type RivalView } from "@/lib/game/types";
import { useGame, useLeaderboard, useTick } from "./use-game";

type Tab = "ateliers" | "ameliorations" | "chantier" | "raids" | "alliance" | "classement";
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
    watchRivals(tab === "raids" || tab === "alliance");
  }, [tab, watchRivals]);

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
            <TabButton id="alliance" tab={tab} setTab={setTab} label="Alliance" dot={snap.invites.length > 0} />
            <TabButton id="classement" tab={tab} setTab={setTab} label="Rangs" />
          </div>
          <div className="tab-body" role="tabpanel">
            {tab === "ateliers" && <Generators live={live} stagesDone={stagesDone} snap={snap} run={game.run} />}
            {tab === "ameliorations" && <Upgrades live={live} run={game.run} />}
            {tab === "chantier" && <Worksite snap={snap} live={live} run={game.run} />}
            {tab === "raids" && <Raids snap={snap} live={live} now={now} run={game.run} />}
            {tab === "alliance" && <AllianceTab snap={snap} live={live} now={now} run={game.run} />}
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
          <div className="hammer-hint">
            {paused ? `🔨 Marteau confisqué encore ${Math.ceil((snap.state.clickPausedUntil - game.serverNow()) / 1000)} s` : `Frappe la pierre : +${formatRate(clickGain)} par coup`}
          </div>
        </div>
        <div className="hammer-zone">
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
      <Status state={snap.state} now={game.serverNow()} />
      <div className="mini-site">
        <h3>{finished ? "Le beffroi est achevé !" : `Chantier : ${STAGES[w.stage].name}`}</h3>
        <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="bar-caption num">
          <span>{finished ? `${formatNumber(w.total)} pierres versées` : `${formatNumber(w.progress)} / ${formatNumber(w.target)}`}</span>
          <span>{finished ? `${STAGES.length}/${STAGES.length}` : `étape ${w.stage + 1}/${STAGES.length}`}</span>
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
                </div>
                <div className="row-desc num">
                  {hidden ? "Continue de bâtir pour le découvrir." : `${g.description} ${formatRate(each)}/s chacun${n > 0 ? ` · total ${formatRate(each * n)}/s` : ""}`}
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
          <button className="btn btn-primary" disabled={u.cost > live.stone} onClick={() => buy(u.id)}>
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
            const rows = h.id === "builder" ? boards.contributors.map((r) => ({ id: r.userId, name: r.username, value: r.total })) : (standings.find((st) => st.category === h.id)?.rows ?? []);
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

function formatValue(v: number, unit: "stone" | "time" | "count"): string {
  if (unit === "time") return duration(v);
  if (unit === "count") return String(v);
  return formatNumber(v);
}

function Board({ rows, userId, empty, unit = "stone" }: { rows: { userId: string; username: string; total: number }[]; userId: string; empty: string; unit?: "stone" | "time" | "count" }) {
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

type RaidView = "armee" | "forge" | "seigneurs" | "joueurs" | "chronique";

function Raids({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [view, setView] = useState<RaidView>("seigneurs");
  const [level, setLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cooldown = live.lastRaidAt + RAID_COOLDOWN_MS - now;
  const spyPrice = spyCost(live, worldFrom(snap.worksite), now);
  const act = async (target: string, action: Parameters<typeof run>[0]) => {
    setBusy(target);
    await run(action);
    setBusy(null);
  };
  const spy = (target: string) => act(target, { type: "spy", target });
  const raid = (target: string) => act(target, { type: "raid", target });
  const players = snap.rivals.filter((r) => !r.isLord && !r.allied);
  const lords = snap.rivals.filter((r) => r.isLord && (level === null || r.difficulty === level));
  const sabotage = (target: string) => act(target, { type: "sabotage", target });
  const row = (r: RivalView) => (
    <RivalRow key={r.id} r={r} now={now} busy={busy} onRaid={raid} onSpy={spy} spyPrice={spyPrice} stone={live.stone} onSabotage={sabotage} />
  );
  const views: [RaidView, string][] = [
    ["armee", "Armée"],
    ["forge", live.research ? "Forge ⏳" : "Forge"],
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
      {snap.event && <EventCard
          e={snap.event}
          now={now}
          busy={busy !== null}
          onAttack={() => act("event", { type: "event_attack" })}
          history={(snap.chronicle ?? []).filter((c) => c.kind === "event" && c.details.phase === "attack" && c.details.eventId === snap.event?.id)}
          me={snap.userId}
        />}
      <p className="raid-state">
        {cooldown > 0 ? `⏳ Tes troupes se reposent encore ${duration(cooldown)}.` : "⚔️ Tes troupes sont prêtes."}
      </p>
      {view === "armee" && (
        <>
          <p className="note raid-intro">
            Un raid est une bataille de 4 rounds au plus : toutes tes troupes (et les renforts de tes alliés) contre les troupes, fortifications et 3 gardes
            de la cible. Chaque unité a ses forces et ses faiblesses, compose ton armée selon ce que tu vois en face. Tu gagnes si plus personne ne
            riposte en face. Les pertes sont réelles des deux côtés (70 % des fortifications abattues se relèvent). Un raid réussi vole 25 % (40 % en
            revanche) de la pierre non sécurisée (la dernière demi-heure de production est à l&apos;abri, mais jamais plus de la moitié du stock),
            incendie les ateliers 30 min et ruine quelques bâtiments ; la victime reçoit 4 h de bouclier (10 min pour un seigneur) et un droit de revanche (+50 % de dégâts). Les
            seigneurs difficiles ne frappent que ceux qui les ont attaqués. De loin, tu ne vois qu&apos;une estimation (≈) des armées : un espion révèle
            l&apos;armée exacte pendant 1 h, mais il peut être repéré (surtout par les tours d&apos;archers).
          </p>
          <Garrison live={live} run={run} />
        </>
      )}
      {view === "forge" && <Forge live={live} now={now} run={run} />}
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

function RivalRow({
  r,
  now,
  busy,
  onRaid,
  onSpy,
  spyPrice,
  stone: myStone,
  onSabotage,
}: {
  r: RivalView;
  now: number;
  busy: string | null;
  onRaid: (id: string) => void;
  onSpy: (id: string) => void;
  spyPrice: number;
  stone: number;
  onSabotage: (id: string) => void;
}) {
  const sabotagePrice = r.sabotageCost ?? 0;
  const intel = r.intelUntil > now;
  // La pierre du rival progresse en direct entre deux nouvelles du serveur.
  const stone = r.stone + (r.rate * Math.max(0, now - r.stoneAt)) / 1000;
  const loot = lootOf(stone, r.rate, r.revenge);
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
          {r.blocker ?? (loot > 0 ? `Butin estimé : ${formatNumber(loot)} pierres` : "Rien à piller pour l'instant.")}
        </div>
      </div>
      <div className="row-actions">
        <button className="btn btn-primary" disabled={blocked || busy !== null} onClick={() => onRaid(r.id)}>
          Raider
          <span className="cost num">
            {intel ? "" : "~"}
            {pct} % de succès
          </span>
        </button>
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

/** Forge : académie militaire et améliorations des troupes et fortifications (une recherche à la fois). */
function Forge({ live, now, run }: { live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const research = live.research && live.research.endsAt > now ? live.research : null;
  const current = research ? COMBATANTS.get(research.id) : undefined;
  const academyPrice = academyCost(live);
  const rows = (defs: readonly CombatantDef<string>[]) =>
    defs.map((d) => {
      const id = d.id as CombatantId;
      const lv = levelOf(live, id);
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
              ⚔️ et ❤️ +{Math.round(lv * LEVEL_BONUS * 100)} % · niveau {lv + 1} en {duration(researchTime(live, id))}
            </div>
          </div>
          <button className="btn btn-primary" disabled={research !== null || cost > live.stone} onClick={() => void run({ type: "research", id: d.id })}>
            Améliorer
            <span className="cost num">{formatNumber(cost)} 🪨</span>
          </button>
        </div>
      );
    });
  return (
    <>
      <p className="note raid-intro">
        Chaque niveau donne +{Math.round(LEVEL_BONUS * 100)} % d&apos;attaque et de points de vie au type amélioré, en attaque comme en défense. Une seule
        recherche à la fois, et chaque niveau prend plus de temps que le précédent. L&apos;académie accélère les recherches, mais les rivaux peuvent la
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
      <p className="raid-state">
        {research && current ? `⏳ ${current.icon} ${current.name} niveau ${levelOf(live, research.id) + 1} : encore ${duration(research.endsAt - now)}.` : "🔨 Aucune recherche en cours."}
      </p>
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
            Encore {duration(w.endsAt - now)}. Pendant la guerre, ni pause ni bouclier entre vous : chaque pierre pillée compte. Les vainqueurs se
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
function EventCard({ e, now, busy, onAttack, history, me }: { e: EventView; now: number; busy: boolean; onAttack: () => void; history: ChronicleEntry[]; me: string }) {
  const icon = e.kind === "caravane" ? "🐪" : "🗿";
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
          <span style={{ width: `${Math.round((e.kind === "caravane" ? (e.prize > 0 ? e.pool / e.prize : 0) : e.armyLeft) * 100)}%` }} />
        </div>
        <div className="row-desc num">
          {e.kind === "caravane"
            ? `Chargement : ${formatNumber(e.pool)} / ${formatNumber(e.prize)} 🪨 · ${e.mine > 0 ? `tu as pris ${formatNumber(e.mine)} 🪨` : `un assaut réussi rapporte ${formatNumber(e.take)} 🪨`}`
            : `Prime : ${formatNumber(e.pool)} 🪨 · ${e.attackers} combattant${e.attackers > 1 ? "s" : ""} · ta part : ${Math.round(e.mine * 100)} %`}
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
          else text = d.success ? `🗿 Le Colosse est tombé ! ${formatNumber(d.bounty ?? 0)} pierres de prime partagées (${shares}).` : "🗿 Le Colosse s'en va invaincu.";
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
