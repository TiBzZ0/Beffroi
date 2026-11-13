"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
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
  UNIT_SPEED,
  SPY_INTEL_MS,
  TRIBUTE_MAX_SECONDS,
  TRIBUTE_RECHARGE,
  ELAN_PER_CLICK_MS,
  MAX_TITHE,
  ADVISED_TITHE,
  donorTiersFor,
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
  RESEARCH_REFUND,
  DEFENSES,
  GENERATORS,
  STAGES,
  LEGACY,
  TOTAL_STAGES,
  stageDef,
  embellishmentOf,
  UNITS,
  UPGRADES,
  SPY_LEVEL_MAX,
  WINGS,
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
  baseRate,
  tributeLeft,
  spyRisk,
  spyTravelMs,
  armySpeedBonus,
  masteryBonus,
  nextTiers,
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
  counterCost,
  rumorCost,
  type SabotageAim,
  type PlayerState,
  INBOX_CATEGORIES,
  type InboxCategory,
} from "@/lib/game/engine";
import { formatNumber, formatRate } from "@/lib/game/format";
import { armySize, armyValue, battle, cleanArmy, estimateChance, seededRng, type Army } from "@/lib/game/battle";
import { worldFrom, type AwaySummary, type LotView, type AllianceSummary, type ChronicleEntry, type EventView, type GameSnapshot, type RivalView } from "@/lib/game/types";
import { useChat, useGame, useLeaderboard, usePush, useTick } from "./use-game";
import { MapBoard, type BoardMarch, type BoardPlace } from "./kingdom-map";
import { CHAT_MAX_LENGTH, CHAT_REACTIONS, type ChatChannel } from "@/lib/game/chat-config";
import { CHANGELOG } from "@/lib/game/changelog";

type Tab = "ateliers" | "ameliorations" | "chantier" | "armee" | "carte" | "raids" | "alliance" | "messages" | "classement" | "heritage";
/** U3 : sept onglets, certains avec des sous-onglets. */
type Group = "domaine" | "chantier" | "armee" | "carte" | "alliance" | "messages" | "rangs";
const GROUPS: Record<Group, Tab[]> = {
  domaine: ["ateliers", "ameliorations"],
  chantier: ["chantier"],
  armee: ["armee"],
  carte: ["carte", "raids"],
  alliance: ["alliance"],
  messages: ["messages"],
  rangs: ["classement", "heritage"],
};
const SUBTAB_LABELS: Partial<Record<Tab, string>> = { ateliers: "Ateliers", ameliorations: "Savoirs", carte: "Carte", raids: "Cibles", classement: "Classements", heritage: "Héritage" };
const groupOf = (t: Tab): Group => (Object.keys(GROUPS) as Group[]).find((g) => GROUPS[g].includes(t)) ?? "domaine";
type Qty = 1 | 10 | "max";
const DAY_MS = 86_400_000;

export function Game({ userId }: { userId: string }) {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("ateliers");
  const [lastSub, setLastSub] = useState<Partial<Record<Group, Tab>>>({});
  const [focus, setFocus] = useState<Focus | null>(null);
  const [moveFocus, setMoveFocus] = useState<{ key: string; at: number } | null>(null);
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
    setLastSub((prev) => ({ ...prev, [groupOf(t)]: t }));
  };
  const group = groupOf(tab);
  const selectGroup = (g: Group) => selectTab(g === group ? tab : (lastSub[g] ?? GROUPS[g][0]));

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
    <SnapContext.Provider value={{ snap, live, now, moveFocus, showMove: (key) => setMoveFocus({ key, at: now }), go: (where, id, army) => {
      setFocus({ id, army, at: now });
      selectTab(where);
    } }}>
    <div className="game">
      <WhatsNew />
      {game.away && <AwayModal away={game.away} event={snap.event} onClose={game.dismissAway} />}
      <TopBar snap={snap} now={now} />
      <Movements snap={snap} live={live} now={now} run={game.run} />
      <LastDayBanner snap={snap} now={now} />
      <SeasonEndCard snap={snap} />
      <PushPrompt raided={(snap.chronicle ?? []).some((c) => c.kind === "raid" && c.targetId === snap.userId) || (game.away?.raidsLost.length ?? 0) > 0} />
      <div className="layout">
        <Hero snap={snap} rate={rate} clickGain={clickValue(live, world, stagesDone)} game={game} />
        <section className={`panel dom-${group}`}>
          <div className="tabs" role="tablist">
            <TabButton id="domaine" tab={group} setTab={selectGroup} label="🏭 Domaine" dot={affordableUpgrades > 0} />
            <TabButton id="chantier" tab={group} setTab={selectGroup} label="⛪ Chantier" />
            <TabButton id="armee" tab={group} setTab={selectGroup} label="⚔️ Armée" dot={researchDone} />
            <TabButton id="carte" tab={group} setTab={selectGroup} label={eventLive ? "🗺️ Carte ⚡" : "🗺️ Carte"} dot={eventLive || snap.rivals.some((r) => r.revenge && !r.blocker)} />
            <TabButton id="alliance" tab={group} setTab={selectGroup} label="🤝 Alliance" dot={snap.invites.length > 0} />
            <TabButton id="messages" tab={group} setTab={selectGroup} label="✉️ Messages" dot={tab !== "messages" && unreadCount(snap, live, now) > 0} />
            <TabButton id="rangs" tab={group} setTab={selectGroup} label="🏆 Rangs" />
          </div>
          {GROUPS[group].length > 1 && (
            <div className="subtabs group-subtabs" role="group" aria-label="Sections">
              {GROUPS[group].map((t) => (
                <button key={t} className="btn btn-small" aria-pressed={tab === t} onClick={() => selectTab(t)}>
                  {SUBTAB_LABELS[t]}
                  {t === "ameliorations" && affordableUpgrades > 0 ? " •" : ""}
                </button>
              ))}
            </div>
          )}
          <div className="tab-body" role="tabpanel">
            {tab === "ateliers" && <Generators live={live} stagesDone={stagesDone} snap={snap} run={game.run} />}
            {tab === "ameliorations" && <Upgrades live={live} run={game.run} />}
            {tab === "chantier" && <Worksite snap={snap} live={live} run={game.run} />}
            {tab === "armee" && <Army snap={snap} live={live} now={now} run={game.run} />}
            {tab === "carte" && <KingdomMap snap={snap} live={live} now={now} run={game.run} focus={focus} />}
            {tab === "raids" && <Raids snap={snap} live={live} now={now} run={game.run} focus={focus} />}
            {tab === "alliance" && <AllianceTab snap={snap} live={live} now={now} run={game.run} />}
            {tab === "messages" && <Inbox snap={snap} live={live} now={now} run={game.run} userId={userId} />}
            {tab === "classement" && <Ranking boards={leaderboard} userId={userId} />}
            {tab === "heritage" && <Heritage snap={snap} run={game.run} />}
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
    </SnapContext.Provider>
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

/** Quêtes du jour : trois quêtes, une récompense chacune, puis le coffre. */
function DailyCard({ daily, now, run }: { daily: GameSnapshot["daily"]; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  if (!daily || daily.quests.length === 0) return null;
  const act = async (key: string, op: "claim" | "swap" | "chest", index = 0) => {
    setBusy(key);
    await run({ type: "daily", op, index });
    setBusy(null);
  };
  const claimable = daily.quests.filter((q) => !q.claimed && q.progress >= q.goal).length;
  const allClaimed = daily.quests.every((q) => q.claimed);
  const chestReady = allClaimed && !daily.chest;
  const done = daily.quests.filter((q) => q.claimed).length;
  return (
    <div className="daily">
      <button className="daily-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          📅 Quêtes du jour <span className="num">{done}/{daily.quests.length}</span>
          {(claimable > 0 || chestReady) && <span className="dot" aria-label="récompense à prendre" />}
        </span>
        <span className="note">
          {daily.streak > 0 ? `🔥 Série : ${daily.streak} j · ` : ""}nouvelles dans {duration(Math.max(0, daily.resetAt - now))}
        </span>
      </button>
      {open && (
        <>
          <ul className="daily-list">
            {daily.quests.map((q, i) => {
              const ready = !q.claimed && q.progress >= q.goal;
              return (
                <li key={`${q.id}-${i}`} className={q.claimed ? "claimed" : ready ? "ready" : undefined}>
                  <span className="daily-icon" aria-hidden>
                    {q.claimed ? "✅" : q.icon}
                  </span>
                  <div className="daily-text">
                    <div>{q.label}</div>
                    {q.goal > 1 && !q.claimed && (
                      <div className="bar bar-thin">
                        <span style={{ width: `${Math.min(100, (q.progress / q.goal) * 100)}%` }} />
                      </div>
                    )}
                    <div className="note num">
                      {q.claimed ? "Récompense prise" : `${q.goal > 1 ? `${formatNumber(q.progress)} / ${formatNumber(q.goal)} · ` : ""}20 min de production`}
                    </div>
                  </div>
                  {ready ? (
                    <button className="btn btn-primary" disabled={busy !== null} onClick={() => void act(`c${i}`, "claim", i)}>
                      Prendre
                    </button>
                  ) : !q.claimed && !daily.swapped ? (
                    <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void act(`s${i}`, "swap", i)} title="Une fois par jour">
                      🔄
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className={`daily-chest${chestReady ? " ready" : ""}`}>
            <span>
              🎁 Coffre : +{Math.round(daily.chestBonus * 100)} % de production pendant 4 h
              {daily.chest ? (daily.boostUntil > now ? ` · encore ${duration(daily.boostUntil - now)}` : " · ouvert") : allClaimed ? "" : " · après les trois quêtes"}
            </span>
            {chestReady && (
              <button className="btn btn-primary" disabled={busy !== null} onClick={() => void act("chest", "chest")}>
                Ouvrir
              </button>
            )}
          </div>
        </>
      )}
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
  for (const i of away.stages) lines.push(`🏗️ Étape franchie : ${stageDef(i).name}.`);
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

/** Bouton « Ce qui change » : tout l'historique des règles, du plus récent au plus ancien. */
function ChangelogButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost" title="Ce qui change" aria-label="Voir ce qui change (patchnote)" onClick={() => setOpen(true)}>
        📜
      </button>
      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Ce qui change" onClick={() => setOpen(false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <h2>📜 Ce qui change</h2>
            {[...CHANGELOG].reverse().map((c) => (
              <section key={c.id}>
                <h3>{c.date}</h3>
                <ul>
                  {c.items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>
            ))}
            <button className="btn btn-primary" onClick={() => setOpen(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
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
        <ChangelogButton />
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

/** H3 : bandeau du dernier jour de la saison, avec le compte à rebours. */
function LastDayBanner({ snap, now }: { snap: GameSnapshot; now: number }) {
  const left = snap.season.endsAt - now;
  if (left <= 0 || left > DAY_MS) return null;
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return (
    <div className="notice notice-info">
      <strong>⏳ Dernier jour de la saison {snap.season.number} : fin dans {h} h {String(m).padStart(2, "0")}.</strong> Ensuite, ateliers, armées, halles, alliances
      et chantier repartent de zéro. Tes écus, les écus de clôture et ton héritage te suivent : passe à l&apos;onglet Héritage.
    </div>
  );
}

/** H1 : écran de fin de saison, le détail des écus de clôture (une fois, puis on peut le fermer). */
function SeasonEndCard({ snap }: { snap: GameSnapshot }) {
  const r = snap.seasonRewards;
  const key = r ? `beffroi-rewards-${r.season}` : "";
  const [hidden, setHidden] = useState(() => {
    try {
      return !!key && localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  if (!r || hidden) return null;
  const label = (id: string) => HALL.find((h) => h.id === id)?.title ?? id;
  const close = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* rien */
    }
    setHidden(true);
  };
  return (
    <div className="notice notice-info">
      <strong>🏁 Fin de la saison {r.season} : {r.total} écus pour toi.</strong>
      <ul>
        {r.details.stageEcus > 0 && <li>🏗️ {r.details.stages} étapes du beffroi achevées, avec au moins un palier de don : {r.details.stageEcus} écus</li>}
        {r.details.podium.map((p) => (
          <li key={`${p.category}-${p.rank}`}>
            🏆 {label(p.category)}, {p.rank === 1 ? "1re" : `${p.rank}e`} place : {p.ecus} écus
          </li>
        ))}
        {r.details.loginEcus > 0 && <li>📅 {r.details.days} jours de présence : {r.details.loginEcus} écus</li>}
      </ul>
      <p className="note">Dépense-les dans l&apos;onglet Héritage : les bonus achetés te suivent de saison en saison.</p>
      <button className="btn" onClick={close}>
        Fermer
      </button>
    </div>
  );
}

/** H2 : boutique d'héritage, bonus permanents payés en écus. */
function Heritage({ snap, run }: { snap: GameSnapshot; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  const ecus = snap.ecus ?? 0;
  const buy = async (kind: string) => {
    setBusy(true);
    await run({ type: "legacy_buy", kind });
    setBusy(false);
  };
  return (
    <>
      <Info>
        Les écus se gagnent pendant la saison (paliers de don, lots, quêtes, panthéon) et à sa clôture. Ici, ils achètent des bonus permanents, gardés
        d&apos;une saison à l&apos;autre quand tout le reste repart de zéro. Le niveau n coûte n fois le prix de base, et l&apos;effet est immédiat.
      </Info>
      <div className="garrison-head">
        <h3 className="section-title">🏛️ Héritage</h3>
        <span className="num">🪙 {ecus} écus</span>
      </div>
      <div className="list">
        {LEGACY.map((l) => {
          const level = Math.min(l.max, snap.state.legacy?.[l.id] ?? 0);
          const cost = l.base * (level + 1);
          const maxed = level >= l.max;
          return (
            <div key={l.id} className="row">
              <div className="row-icon" aria-hidden>
                {l.icon}
              </div>
              <div>
                <div className="row-title">
                  {l.name} <span className="badge">niv. {level}/{l.max}</span>
                </div>
                <div className="row-desc">{l.effect}</div>
              </div>
              <button className="btn btn-primary" disabled={busy || maxed || cost > ecus} onClick={() => void buy(l.id)}>
                {maxed ? "Au plus haut" : `Niveau ${level + 1}`}
                {!maxed && <span className="cost num">{cost} 🪙</span>}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TabButton<T extends string>({ id, tab, setTab, label, dot }: { id: T; tab: T; setTab: (t: T) => void; label: string; dot?: boolean }) {
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
  const finished = w.stage >= TOTAL_STAGES;
  const embellish = embellishmentOf(w.stage);
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
          {(snap.state.masterBonuses ?? [])
            .filter((b) => b.until > game.serverNow() && b.from <= game.serverNow())
            .map((b) => (
              <div key={b.kind} className="catch-up">👑 Maître d&apos;œuvre : {MASTER_BONUSES[b.kind].label} encore {duration(b.until - game.serverNow())}</div>
            ))}
          {(snap.state.dailyBoostUntil ?? 0) > game.serverNow() && (
            <div className="catch-up">
              🎁 Coffre du jour : +{Math.round((snap.state.dailyBoost ?? 0) * 100)} % de production encore {duration((snap.state.dailyBoostUntil ?? 0) - game.serverNow())}
            </div>
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
      <DailyCard daily={snap.daily} now={game.serverNow()} run={game.run} />
      <EventBanner e={snap.event} now={game.serverNow()} stone={snap.state.stone} run={game.run} />
      <Status state={snap.state} now={game.serverNow()} />
      <div className="mini-site">
        <Belfry done={Math.min(w.stage, STAGES.length)} pct={pct} />
        <h3>{finished ? "Le beffroi est achevé !" : embellish > 0 ? `Embellissement : ${stageDef(w.stage).name}` : `Chantier : ${stageDef(w.stage).name}`}</h3>
        <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="bar-caption num">
          <span>{finished ? `${formatNumber(w.total)} pierres versées` : `${formatNumber(w.progress)} / ${formatNumber(w.target)}`}</span>
          <span>{finished ? `${STAGES.length}/${STAGES.length}` : embellish > 0 ? `embellissement ${embellish}` : `étape ${w.stage + 1}/${STAGES.length}`}</span>
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

  // B9 : l'achat le plus rentable (production gagnée par pierre dépensée) parmi les bâtiments connus,
  // paliers de corps de métier et de compagnonnage compris : on regarde aussi l'achat qui complète la tranche.
  const rate = productionPerSecond(live, world, stagesDone);
  const best = GENERATORS.slice(0, visibleCount)
    .filter((g) => owned(live, g.id) > 0 || live.totalProduced >= g.baseCost * 0.5)
    .flatMap((g) => {
      const t = nextTiers(live, g.id);
      return [...new Set([1, t.mastery.missing, t.companion?.missing ?? 1])].map((q) => {
        const after = { ...live, generators: { ...live.generators, [g.id]: owned(live, g.id) + q } };
        return { id: g.id, qty: q, value: (productionPerSecond(after, world, stagesDone) - rate) / generatorCost(live, g.id, q) };
      });
    })
    .sort((a, b) => b.value - a.value)[0];
  const mastery = masteryBonus(live);
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
      {mastery > 0 && (
        <p className="mastery-line num">
          🛠️ Corps de métier : +{Math.round(mastery * 100)} % de production (une tranche par lot complet de 50 bâtiments d&apos;un type)
        </p>
      )}
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
                  {!hidden && g.id === best?.id && (
                    <span className="badge badge-best" title="La meilleure production gagnée par pierre dépensée, paliers compris">
                      ⭐ le plus rentable{best.qty > 1 ? ` : prends-en ${best.qty}` : ""}
                    </span>
                  )}
                </div>
                <div className="row-desc num">
                  {hidden ? "Continue de bâtir pour le découvrir." : `${g.description} ${formatRate(each)}/s chacun${n > 0 ? ` · total ${formatRate(each * n)}/s` : ""}`}
                  {!hidden && cost > live.stone && rate > 0 ? ` · à toi dans ${duration(((cost - live.stone) / rate) * 1000)}` : ""}
                </div>
                {!hidden && n > 0 && <TierLine live={live} id={g.id} />}
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

/** Prochains paliers d'un bâtiment : corps de métier et compagnonnage. */
function TierLine({ live, id }: { live: PlayerState; id: GeneratorId }) {
  const t = nextTiers(live, id);
  const companion = t.companion;
  const big = companion ? GENERATORS.find((g) => g.id === companion.target) : undefined;
  return (
    <div className="row-tier num">
      🛠️ encore {t.mastery.missing} pour +{t.mastery.bonus * 100} % de production
      {companion && big && ` · 🤝 encore ${companion.missing} pour +${companion.bonus * 100} % aux ${big.plural}`}
    </div>
  );
}

/** E1 : la recherche Espionnage, à la Forge. */
function SpyResearchRow({ live, base, stagesDone, full, queued, run }: { live: PlayerState; base: number; stagesDone: number; full: boolean; queued: boolean; run: ReturnType<typeof useGame>["run"] }) {
  const lv = live.spyLevel ?? 0;
  const next = queuedLevel(live, "espionnage") + 1;
  const cost = researchCost(live, "espionnage", base);
  const maxed = next > SPY_LEVEL_MAX;
  return (
    <div className="row">
      <div className="row-icon" aria-hidden>
        🕵️
      </div>
      <div>
        <div className="row-title">
          Espionnage <span className="badge">niv. {lv}</span>
        </div>
        <div className="row-desc num">
          Sert à espionner et à se protéger : seul compte l&apos;écart avec la cible.{maxed ? " Niveau maximal." : ` Niveau ${next} en ${duration(researchTime(live, "espionnage", stagesDone))}.`}
        </div>
      </div>
      {!maxed && (
        <button className="btn btn-primary" disabled={full || cost > live.stone} onClick={() => void run({ type: "research", id: "espionnage" })}>
          {queued ? "En file" : "Améliorer"}
          <span className="cost num">{formatNumber(cost)} 🪨</span>
        </button>
      )}
    </div>
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
  const finished = w.stage >= TOTAL_STAGES;
  // G1 : les huit étapes du beffroi, puis les embellissements finis et celui en cours.
  const shown = Array.from({ length: Math.max(STAGES.length, Math.min(w.stage + 1, TOTAL_STAGES)) }, (_, i) => stageDef(i));

  return (
    <>
      <div className="stages">
        {shown.map((s, i) => {
          const done = i < w.stage;
          const current = i === w.stage;
          const pct = done ? 100 : current ? Math.min(100, (w.progress / Math.max(1, w.target)) * 100) : 0;
          const at = w.stageCompletedAt[i];
          return (
            <div key={s.name} className={`stage${done ? " done" : current ? "" : " upcoming"}`}>
              <div className="stage-head">
                <span className="stage-name">
                  {i < STAGES.length ? `${i + 1}. ` : "✨ "}
                  {s.name}
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
        Tu as versé {formatNumber(snap.state.totalContributed)} pierres. {w.activePlayers} bâtisseur{w.activePlayers > 1 ? "s" : ""} actif{w.activePlayers > 1 ? "s" : ""} cette semaine. Chaque étape vaut plusieurs heures de leur production (24 h pour un embellissement), fixée à son ouverture.
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
      <Info>
        Chaque alliance (ou joueur seul) a son lot : 4 heures de la production de ses membres. Lot fini : ceux qui ont versé au moins 25 % de leur part
        gagnent +10 % de production jusqu&apos;à la fin de l&apos;étape suivante et {LOT_ECUS} écus. Le premier lot fini désigne le maître d&apos;œuvre.
      </Info>
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
  const tiers = donorTiersFor(share.stage);
  const next = share.tiers < tiers.length ? tiers[share.tiers] : null;
  const goal = next !== null ? share.size * next : share.size;
  const pct = Math.min(100, (share.given / Math.max(1, goal)) * 100);
  return (
    <div className="share-line">
      <div className="bar-caption num">
        <span>
          {next !== null
            ? `Ta part : palier ${share.tiers + 1}/${tiers.length} à ${next * 100} %, ${formatNumber(share.given)} / ${formatNumber(goal)}`
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
        <Info>
          Ta part de chantier vaut autant d&apos;heures de ta production que l&apos;étape (4 h, 12 h ou 24 h), mesurée au début de l&apos;étape. À {tiers.map((t) => `${t * 100} %`).join(", ").replace(/, ([^,]*)$/, " et $1")} versés, tu gagnes +{DONOR_TIER_BONUS * 100} % de production jusqu&apos;à la fin de la saison et {DONOR_TIER_ECUS.join(", ")} écus.
          {bonus > 0 ? ` Tes paliers te rapportent déjà +${bonus} %.` : ""} Tes écus achètent des bonus permanents dans l&apos;onglet Héritage.
        </Info>
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
      <Info>
        Cette part de ta production, même hors ligne, part d&apos;office au chantier au lieu de ton stock. Elle compte comme un don. On conseille {ADVISED_TITHE * 100} %.
      </Info>
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
          <Info>
            À la fin de la saison, le podium de chaque catégorie entre au Panthéon, et chaque premier porte son titre à côté de son nom pendant toute la
            saison suivante. Les seigneurs voisins n&apos;y figurent pas.
          </Info>
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

/** U3 : partout le même format, mm:ss sous une heure, « 1 h 12 » au-dessus. */
function duration(msLeft: number): string {
  return countdown(msLeft);
}

/** Jauge d'élan : tant qu'elle n'est pas vide, la production est augmentée. */
function ElanGauge({ left, bonus }: { left: number; bonus: number }) {
  const pct = Math.round((left / ELAN_MAX_MS) * 100);
  return (
    <div className="elan" title="Chaque coup ajoute 3 s d'élan (10 minutes au plus). Tant qu'il en reste, ta production est augmentée.">
      <span>
        ⚡ Élan {left > 0 ? `+${Math.round(bonus * 100)} % · ${left >= 60_000 ? `${Math.floor(left / 60_000)} min ${String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}` : `${Math.ceil(left / 1000)} s`}` : "vide : frappe pour l'allumer"}
      </span>
      <div className="bar">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** G5 : jauge du « Tribut des seigneurs ». */
function TributeGauge({ live, now }: { live: PlayerState; now: number }) {
  const left = tributeLeft(live, now);
  const pct = Math.round((left / TRIBUTE_MAX_SECONDS) * 100);
  const fullIn = ((TRIBUTE_MAX_SECONDS - left) / TRIBUTE_RECHARGE) * 1000;
  return (
    <div className="elan tribute" title="Les seigneurs ne cèdent que ce que contient cette réserve : 2 h de ta production de base au plus, 1 h au plus par raid. Elle se recharge de 20 minutes par heure.">
      <span>
        🏰 Tribut des seigneurs : {Math.floor(left / 60)} min / 2 h{fullIn > 1000 ? ` · pleine dans ${duration(fullIn)}` : " · pleine"}
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
        const def = r.id === "espionnage" ? SPY_RESEARCH : COMBATANTS.get(r.id);
        const level = (r.id === "espionnage" ? (state.spyLevel ?? 0) : levelOf(state, r.id)) + (state.research ?? []).filter((q) => q.endsAt <= now && q.id === r.id).length + queue.slice(0, i + 1).filter((q) => q.id === r.id).length;
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

type RaidView = "seigneurs" | "joueurs";
type ArmyView = "garnison" | "forge" | "espionnage";

/** B8 : onglet Armée, avec la garnison et la Forge, sorties de l'onglet Raids. */
function Army({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [view, setView] = useState<ArmyView>("garnison");
  const views: [ArmyView, string][] = [
    ["garnison", "Garnison"],
    ["forge", live.research.some((r) => r.endsAt > now) ? `Forge ⏳${live.research.length}` : "Forge"],
    ["espionnage", "Espionnage"],
  ];
  return (
    <>
      <div className="subtabs" role="group" aria-label="Sections de l'armée">
        {views.map(([id, label]) => (
          <button key={id} className="btn btn-small" aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {view === "garnison" && (
        <>
          <Info>
            Un raid est une bataille de 4 rounds au plus : toutes tes troupes (et les renforts de tes alliés) contre les troupes, fortifications et 3 gardes
            de la cible. Chaque unité a ses forces et ses faiblesses, compose ton armée selon ce que tu vois en face. Tu gagnes si plus personne ne
            riposte en face. Une partie des troupes perdues revient de l&apos;infirmerie au bout de 30 minutes.
          </Info>
          <TributeGauge live={live} now={now} />
          <Garrison live={live} run={run} />
          <CurfewCard live={live} now={now} run={run} />
        </>
      )}
      {view === "espionnage" && <Spies snap={snap} live={live} now={now} run={run} />}
      {view === "forge" && <Forge live={live} now={now} run={run} stagesDone={stagesDoneAt(worldFrom(snap.worksite), now)} base={baseRate(live, worldFrom(snap.worksite), now)} />}
    </>
  );
}

function Raids({ snap, live, now, run, focus }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; focus?: Focus | null }) {
  const fresh = focus && now - focus.at < 5000 ? focus : null;
  const [view, setView] = useState<RaidView>(() => (fresh && snap.rivals.find((r) => r.id === fresh.id && !r.isLord) ? "joueurs" : "seigneurs"));
  const [level, setLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const spyPrice = spyCost(live, worldFrom(snap.worksite), now);
  const act = async (target: string, action: Parameters<typeof run>[0]) => {
    setBusy(target);
    await run(action);
    setBusy(null);
  };
  const spy = (target: string) => act(target, { type: "spy", target });
  const raid = (target: string, troops?: Record<string, number>, allies?: boolean) => act(target, { type: "raid", target, troops, allies });
  const mine = snap.map?.places[snap.userId];
  const distanceTo = (id: string) => (mine && snap.map?.places[id] ? mapDistance(mine, snap.map.places[id]) : undefined);
  const players = snap.rivals.filter((r) => !r.isLord && !r.allied);
  const lords = snap.rivals.filter((r) => r.isLord && (level === null || r.difficulty === level));
  const sabotage = (target: string, aim: SabotageAim) => act(target, { type: "sabotage", target, aim });
  const mole = (target: string) => act(target, { type: "mole", target });
  const row = (r: RivalView) => (
    <RivalRow key={r.id} focus={fresh?.id === r.id ? fresh : undefined} r={r} now={now} busy={busy} onRaid={raid} onSpy={spy} spyPrice={spyPrice} stone={live.stone} onSabotage={sabotage} onMole={mole} stagesDone={stagesDoneAt(worldFrom(snap.worksite), now)} me={live} distance={distanceTo(r.id)} />
  );
  const views: [RaidView, string][] = [
    ["seigneurs", `Seigneurs (${snap.rivals.filter((r) => r.isLord).length})`],
    ["joueurs", `Joueurs (${players.length})`],
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
      {view === "seigneurs" && (
        <Info>
          Un raid réussi vole 25 % (40 % en revanche) de la pierre non sécurisée (les 2 dernières heures de production sont à l&apos;abri, mais jamais plus
          de la moitié du stock), incendie les ateliers 30 min et ruine quelques bâtiments ; la victime reçoit 4 h de bouclier (10 min pour un seigneur) et un
          droit de revanche (+50 % de dégâts). Les seigneurs difficiles ne frappent que ceux qui les ont attaqués. De loin, tu ne vois qu&apos;un ordre de grandeur
          des armées et ta chance en un mot. Un espion part sur la route et rapporte ce qu&apos;il a vu pendant 1 h, à toute ton alliance : plus ton niveau
          d&apos;espionnage dépasse celui de la cible, plus il en voit (armée, mouvements, stock, Forge) et moins il risque d&apos;être repéré. Ta garnison,
          tes espions et la Forge sont dans l&apos;onglet Armée.
        </Info>
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
      <GuildHall snap={snap} live={live} now={now} run={run} />
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
      <Info>
        Pendant 8 heures par jour, tu ne peux ni attaquer ni être attaqué, ni saboter ni être saboté, seigneurs et guerre compris. Ta production et ta dîme continuent. Un changement prend effet 24 heures plus tard.
      </Info>
      <label className="note" htmlFor="curfew">
        Plage :{" "}
        <select id="curfew" className="input" disabled={busy} value={localHour} onChange={(e) => pick(e.target.value)}>
          <option value="">aucune</option>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {h} h à {(h + CURFEW_MINUTES / 60) % 24} h
            </option>
          ))}
        </select>
      </label>
      <p className="note">
        {current === null ? "Aucun en vigueur" : `En vigueur ${span(current)}`}
        {next ? ` · dès ${new Date(next.from).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })} : ${next.start === null ? "aucun" : span(next.start)}` : ""}
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
  onMole,
  stagesDone = 0,
  me,
  distance,
  focus,
}: {
  focus?: Focus;
  r: RivalView;
  now: number;
  busy: string | null;
  onRaid: (id: string, troops?: Record<string, number>, allies?: boolean) => void;
  onSpy: (id: string) => void;
  spyPrice: number;
  stone: number;
  onSabotage: (id: string, aim: SabotageAim) => void;
  onMole?: (id: string) => void;
  stagesDone?: number;
  me?: PlayerState;
  distance?: number;
}) {
  const [sim, setSim] = useState<number | null>(null);
  const [composing, setComposing] = useState(!!focus);
  const [chosen, setChosen] = useState<Record<string, number> | null>(focus?.army ?? null);
  const [aiming, setAiming] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);
  const sabotagePrice = r.sabotageCost ?? 0;
  const intel = r.intelUntil > now;
  // La pierre du rival progresse en direct entre deux nouvelles du serveur.
  const stone = r.stone + (r.rate * Math.max(0, now - r.stoneAt)) / 1000;
  // Mêmes règles que le serveur : plafond PvP, coefficient d'équité, stock à l'abri des étapes.
  const loot = lootOf(stone, r.rate, r.revenge, { lord: r.isLord, cap: r.lootCap, factor: r.fairness, stagesDone, extraSecured: r.lootSafe, securedFactor: r.granaryCut ? 0.5 : 1 });
  const shielded = r.shieldUntil > now;
  const pct = Math.round(r.chance * 100);
  return (
    <div className="row" ref={rowRef}>
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
          {r.stoneKnown === false ? "stock inconnu" : `${formatNumber(stone)} pierres`} · {formatRate(r.rate)}/s
          {shielded ? ` · bouclier ${duration(r.shieldUntil - now)}` : ""}
          {r.burnedUntil > now ? " · 🔥" : ""}
        </div>
        <div className="row-desc army-line num" title={r.armyHint ? "Vue de loin : envoie un espion pour voir l'armée exacte" : "Armée exacte"}>
          {r.armyHint
            ? `Armée ${r.armyHint} que la tienne${intel ? " (ton espion n'a rien pu voir de plus)" : ""}`
            : intel
              ? `🕵️ ${armyIcons(r.army)} (rapport encore ${duration(r.intelUntil - now)})`
              : armyIcons(r.army)}
        </div>
        {(r.rumorUnmasked || r.granaryCut || (r.moleUntil ?? 0) > now) && (
          <div className="row-desc num">
            {[r.rumorUnmasked ? "🗣️ rumeur démasquée" : null, r.granaryCut ? "🧨 grenier saboté" : null, (r.moleUntil ?? 0) > now ? `🐀 ${duration((r.moleUntil ?? 0) - now)}` : null].filter(Boolean).join(" · ")}
          </div>
        )}
        {intel && <SpyReport r={r} now={now} />}
        <div className="report-chips rival-chips">
          <span className="chip num chip-gain" title={r.stoneKnown === false ? "Il faut un espion plus fort que sa garde" : "Butin estimé"}>
            💰 {r.stoneKnown === false ? "?" : formatNumber(loot)}
          </span>
          {(r.ransom ?? 0) > 0 && (
            <span className="chip num" title="Rançon estimée">
              rançon {formatNumber(r.ransom ?? 0)}
            </span>
          )}
          {(r.fairness ?? 1) < 1 && (
            <span className="chip num" title={r.isLord ? "Seigneur plus petit que toi : butin réduit" : "Cible plus petite : butin réduit"}>
              ⚖️ ×{(r.fairness ?? 1).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
            </span>
          )}
          {r.isLord && r.lootCap !== undefined && r.stoneKnown !== false && loot >= Math.floor(r.lootCap) && (
            <span className="chip" title="Plafonné par ton tribut des seigneurs">
              🏰 tribut
            </span>
          )}
        </div>
        {composing && me && (
          <SendArmy
            now={now}
            me={me}
            r={r}
            intel={intel}
            distance={distance ?? MAP_SPAWN_RADIUS}
            chosen={chosen ?? (me.troops as Record<string, number>)}
            setChosen={setChosen}
            busy={busy !== null}
            onSend={(troops, allies) => {
              setComposing(false);
              onRaid(r.id, troops, allies);
            }}
            onClose={() => setComposing(false)}
          />
        )}
        {sim !== null && me && <Simulator me={me} army={(chosen ?? me.troops) as Army} r={r} intel={intel} seed={sim} onReplay={() => setSim(sim + 1)} onClose={() => setSim(null)} />}
      </div>
      <div className="row-actions">
        <Btn className="btn btn-primary" reason={r.blocker} busy={busy !== null} onClick={() => (me ? setComposing(!composing) : onRaid(r.id))}>
          ⚔️ Raid
          <span className="cost num">{r.chance >= 0 ? `${pct} %` : r.chanceWord ? r.chanceWord : "🌫️"}</span>
        </Btn>
        {me && sim === null && r.chance >= 0 && (
          <button className="btn" onClick={() => setSim(1)} title="Joue une bataille pour de faux avec ton armée contre celle que tu vois en face.">
            🎲 Simuler
          </button>
        )}
        {!r.allied && !(r.isLord && r.difficulty === 1) && (
          <Btn
            busy={busy !== null}
            reason={!r.isLord && myStone < spyPrice ? "Pas assez de pierre." : null}
            onClick={() => onSpy(r.id)}
            title="L'espion part sur la route ; son rapport dure 1 h et profite à ton alliance. Ce qu'il voit dépend de l'écart entre ton niveau d'espionnage et celui de la cible."
          >
            🕵️ Espion
            <span className="cost num">
              {r.isLord ? "gratuit" : `${formatNumber(spyPrice)} 🪨`} · {countdown(spyTravelMs(distance ?? MAP_SPAWN_RADIUS))}
              {r.spyGap !== null && r.spyGap !== undefined ? ` · 👁️ ${Math.round(spyRisk(r.spyGap, distance ?? MAP_SPAWN_RADIUS) * 100)} %` : ""}
            </span>
          </Btn>
        )}
        {onMole && r.moleUntil !== undefined && r.moleUntil <= now && (
          <Btn
            busy={busy !== null}
            reason={myStone < (r.molePrice ?? 0) ? "Pas assez de pierre." : null}
            onClick={() => onMole(r.id)}
            title="La taupe s'installe tout de suite pour 2 h : elle te prévient quand il fait partir une armée, perd son bouclier, entre ou sort de couvre-feu. Il faut un niveau d'espionnage au moins un cran au-dessus du sien. Elle peut être démasquée, à demi-risque, à chaque alerte."
          >
            🐀 Taupe
            <span className="cost num">{formatNumber(r.molePrice ?? 0)} 🪨</span>
          </Btn>
        )}
        {r.sabotageBlocker !== undefined && (
          <Btn busy={busy !== null} reason={myStone < sabotagePrice ? "Pas assez de pierre." : null} onClick={() => setAiming(!aiming)} title="Choisis ce que vise ton saboteur. La réussite dépend de l'écart de niveau d'espionnage ; raté, il est toujours repéré.">
            🧨 Sabotage
            <span className="cost num">{formatNumber(sabotagePrice)} 🪨</span>
          </Btn>
        )}
      </div>
      {aiming && r.sabotageBlockers && (
        <div className="row-actions">
          {SABOTAGE_AIMS.map(([aim, label, desc]) => (
            <Btn
              key={aim}
              busy={busy !== null}
              reason={r.sabotageBlockers![aim] ?? (myStone < sabotagePrice ? "Pas assez de pierre." : null)}
              title={desc}
              onClick={() => {
                setAiming(false);
                onSabotage(r.id, aim);
              }}
            >
              {label}
            </Btn>
          ))}
        </div>
      )}
    </div>
  );
}

const SABOTAGE_AIMS: [SabotageAim, string, string][] = [
  ["academie", "🎓 Académie", "un niveau perdu, recherche retardée"],
  ["grenier", "🌾 Grenier", "stock à l'abri ÷ 2 pendant 2 h"],
  ["guet", "🔭 Guet", "aucune alerte d'approche pendant 1 h"],
];

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
  now,
}: {
  now: number;
  me: PlayerState;
  r: RivalView;
  intel: boolean;
  distance: number;
  chosen: Record<string, number>;
  setChosen: (a: Record<string, number>) => void;
  busy: boolean;
  onSend: (troops: Record<string, number>, allies: boolean) => void;
  onClose: () => void;
}) {
  const [withAllies, setWithAllies] = useState(true);
  const have = me.troops as Record<string, number>;
  // R3 : renforts de mes alliés présents chez moi, emmenés si la case est cochée.
  const guests = sumGroups(Object.values(me.stationed ?? {}) as Record<string, number>[]);
  const hasGuests = Object.keys(guests).length > 0;
  const army = Object.fromEntries(UNITS.map((u) => [u.id, Math.min(have[u.id] ?? 0, Math.max(0, Math.floor(chosen[u.id] ?? 0)))]).filter(([, n]) => (n as number) > 0)) as Record<string, number>;
  const all = withAllies && hasGuests ? sumGroups([army, guests]) : army;
  const out = travelMs(all as Army, distance, armySpeedBonus(me));
  const chance = estimateChance(all as Army, r.army as Army, { attackBonus: r.revenge ? REVENGE_ATTACK_BONUS : 1, attackerLevels: me.levels, fortune: true });
  const away = (me.marches ?? []).length;
  return (
    <div className="simulator send-army">
      <p>
        <strong>Composer l&apos;armée</strong> · {distance.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} cases
      </p>
      <TravelLine army={all as Army} out={out} now={now} bonus={armySpeedBonus(me)} />
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
      {hasGuests && (
        <label className="send-line">
          <span>
            🤝 Renforts de mes alliés <span className="num">({armyIcons(guests)})</span>
          </span>
          <input type="checkbox" checked={withAllies} onChange={(e) => setWithAllies(e.target.checked)} />
        </label>
      )}
      <p className="note">
        {r.chance < 0
          ? r.chanceWord
            ? `Chance ${r.chanceWord} (avec toute ton armée). Pour un pourcentage précis, envoie un espion.`
            : "Chance cachée par le brouillard : envoie un espion."
          : `Chance estimée : ${Math.round(chance * 100)} %.`} Les troupes envoyées, renforts compris, ne défendent plus ton domaine pendant le trajet.
        {away > 0 ? ` Armées déjà en route : ${away}/${MAX_MARCHES}.` : ""}
      </p>
      <div className="qty">
        <button className="btn" onClick={() => setChosen({ ...have })}>
          Tout envoyer
        </button>
        <button className="btn btn-primary" disabled={busy || Object.keys(army).length === 0 || away >= MAX_MARCHES} onClick={() => onSend(army, withAllies && hasGuests)}>
          🏇 Envoyer
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/** U1 : l'état du jeu à portée des cartes qui n'en reçoivent qu'une partie (temps de trajet). */
const SnapContext = createContext<{
  snap: GameSnapshot;
  live: PlayerState;
  now: number;
  go?: (where: "carte" | "raids", id: string, army?: Record<string, number>) => void;
  /** U1 : ligne du tableau des mouvements à ouvrir et montrer. */
  moveFocus?: { key: string; at: number } | null;
  showMove?: (key: string) => void;
} | null>(null);

/** U2 : cible à ouvrir après un bouton de rapport (carte, ou fiche avec l'armée prête). */
interface Focus {
  id: string;
  army?: Record<string, number>;
  at: number;
}

/** U1 : temps de trajet exact vers un lieu (« fortress », « hall:<id> », un joueur) ou une position. */
function TravelTo({ place, pos, army, reinforce = false }: { place?: string; pos?: readonly [number, number]; army: Record<string, number>; reinforce?: boolean }) {
  const ctx = useContext(SnapContext);
  const map = ctx?.snap.map;
  const mine = map?.places[ctx?.snap.userId ?? ""];
  if (!ctx || !map || !mine) return null;
  const to = pos ?? (place === "fortress" ? map.fortress : place?.startsWith("hall:") ? map.halls?.find((h) => `hall:${h.id}` === place)?.pos : place ? map.places[place] : undefined);
  const clean = cleanArmy(army as Army);
  if (!to || armySize(clean) === 0) return null;
  const bonus = armySpeedBonus(ctx.live, reinforce);
  return <TravelLine army={clean} out={travelMs(clean, mapDistance(mine, to), bonus)} now={ctx.now} bonus={bonus} />;
}

/** U1 : caravane et colosse, toute l'armée part : durée et arrivée sous le bouton. */
function EventTravel({ e, now }: { e: EventView; now: number }) {
  const live = useContext(SnapContext)?.live;
  const pos: [number, number] | undefined = e.path
    ? (() => {
        const f = Math.min(1, Math.max(0, (now - e.startsAt) / Math.max(1, e.endsAt - e.startsAt)));
        return [e.path.from[0] + (e.path.to[0] - e.path.from[0]) * f, e.path.from[1] + (e.path.to[1] - e.path.from[1]) * f];
      })()
    : e.pos;
  if (!live || !pos) return null;
  return <TravelTo pos={pos} army={live.troops as Record<string, number>} />;
}

/** U1 : durée de l'aller à la seconde, heures d'arrivée et de retour, et ce qui fixe la vitesse. */
function TravelLine({ army, out, now, bonus }: { army: Army; out: number; now: number; bonus: number }) {
  const ids = (Object.entries(army) as [string, number][]).filter(([, n]) => n > 0).map(([id]) => id);
  const slowest = ids.length ? ids.reduce((a, b) => ((UNIT_SPEED[b] ?? 1) < (UNIT_SPEED[a] ?? 1) ? b : a)) : null;
  const pace = slowest && ids.some((id) => (UNIT_SPEED[id] ?? 1) !== (UNIT_SPEED[slowest] ?? 1)) ? `au pas des ${COMBATANTS.get(slowest as CombatantId)?.plural.toLowerCase() ?? slowest}` : null;
  return (
    <p className="travel-line num">
      ⏱️ aller <strong>{countdown(out)}</strong> · arrivée {clock(now + out)} · retour {clock(now + 2 * out)}
      {pace ? ` · ${pace}` : ""}
      {bonus > 0 ? ` · écuries +${Math.round(bonus * 100)} %` : ""}
    </p>
  );
}

function sumGroups(groups: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups) for (const [id, n] of Object.entries(g)) if (n > 0) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** U5 : bouton court ; grisé, il dit pourquoi au toucher au lieu de l'écrire en permanence. */
function Btn({ reason, className = "btn", onClick, children, title, busy = false }: { reason?: string | null; className?: string; onClick: () => void; children: React.ReactNode; title?: string; busy?: boolean }) {
  const [why, setWhy] = useState(false);
  if (reason) {
    return (
      <span className="btn-wrap">
        <button
          className={`${className} is-blocked`}
          aria-disabled="true"
          title={reason}
          onClick={() => {
            setWhy(true);
            setTimeout(() => setWhy(false), 3500);
          }}
        >
          {children}
        </button>
        {why && (
          <span className="why" role="status">
            {reason}
          </span>
        )}
      </span>
    );
  }
  return (
    <button className={className} disabled={busy} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

/** U3 : explication repliée derrière un ⓘ. */
function Info({ children }: { children: React.ReactNode }) {
  return (
    <details className="info">
      <summary aria-label="Explications">ⓘ Comment ça marche</summary>
      <div className="note">{children}</div>
    </details>
  );
}

/** U1 : compte à rebours, mm:ss sous une heure, « 1 h 12 » au-dessus. */
function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** U1 : heure à la seconde. */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** U1 : nom lisible d'une cible de marche ou d'espion. */
function targetName(snap: GameSnapshot, id: string): string {
  if (id === "fortress") return snap.fortress.name;
  if (id.startsWith("event:")) return snap.event?.kind === "colosse" ? "Colosse" : "Caravane";
  if (id.startsWith("mine:")) return "Filon";
  if (id.startsWith("treasure:")) return "Trésor";
  if (id.startsWith("camp:")) return "Camp de bandits";
  if (id.startsWith("convoy:")) return "Convoi";
  if (id.startsWith("siege:")) return "Beffroi";
  if (id.startsWith("hall:")) return snap.map?.halls?.find((h) => `hall:${h.id}` === id)?.name ?? "Halle";
  return snap.rivals.find((r) => r.id === id)?.name ?? "?";
}

type MoveTone = "attack" | "out" | "back" | "ally" | "spy" | "camp";
interface MoveRow {
  key: string;
  tone: MoveTone;
  icon: string;
  from: string;
  to: string;
  /** Identifiants des deux bouts, quand ils sont sur la carte (toucher le nom centre la carte). */
  fromId?: string;
  toId?: string;
  troops: string;
  end: number;
  /** Heure de retour prévue, pour un aller. */
  back?: number;
  load?: number;
  verdict?: string;
  recall?: string;
}

const MARCH_ICON: Record<string, string> = { raid: "⚔️", reinforce: "🛡️", station: "🛡️", hall_station: "🛡️", fortress: "🏰", hall_siege: "🏛️", event: "🎪" };

/** U1 : tableau des mouvements, visible depuis tous les onglets. */
export function Movements({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem("beffroi.movesOpen");
      if (v !== null) return v === "1";
    } catch {}
    return typeof window !== "undefined" && window.innerWidth > 720;
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem("beffroi.movesOpen", o ? "0" : "1");
      } catch {}
      return !o;
    });
  };
  const me = "Chez moi";
  const ctx = useContext(SnapContext);
  const go = ctx?.go;
  const focusKey = ctx?.moveFocus && now - ctx.moveFocus.at < 8000 ? ctx.moveFocus.key : null;
  const focusAt = ctx?.moveFocus?.at;
  // U1 : une armée touchée sur la carte ouvre le tableau et montre sa ligne.
  useEffect(() => {
    if (!focusAt) return;
    const t = setTimeout(() => document.getElementById(`move-${ctx?.moveFocus?.key}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
    return () => clearTimeout(t);
  }, [focusAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = (name: string, id?: string) =>
    go && id && snap.map?.places[id] ? (
      <button className="link-btn" onClick={() => go("carte", id)}>
        {name}
      </button>
    ) : (
      name
    );
  const rows: MoveRow[] = [];
  for (const i of snap.incoming ?? []) {
    if (i.arriveAt <= now) continue;
    rows.push({ key: `in-${i.id}`, tone: "attack", icon: "⚔️", from: i.from ?? "Inconnu", fromId: i.from ? snap.rivals.find((r) => r.name === i.from)?.id : undefined, to: me, troops: i.troops ? armyIcons(i.troops as Record<string, number>, "?") : "?", end: i.arriveAt });
  }
  for (const m of snap.state.marches ?? []) {
    const name = targetName(snap, m.target);
    const helping = m.kind === "reinforce" || m.kind === "station" || m.kind === "hall_station";
    const troops = armyIcons(m.troops, "—");
    if (m.status === "back") {
      if (m.returnAt <= now) continue;
      const verdict = m.outcome === "won" ? "🏆" : m.outcome === "lost" ? "💀" : m.outcome === "turned" ? "⤺" : m.outcome === "recalled" ? "↩" : undefined;
      rows.push({ key: m.id, tone: "back", icon: "↩️", from: name, fromId: m.target, to: me, troops, end: m.returnAt, load: m.loot + m.ransom, verdict });
    } else if (m.status === "camp") {
      rows.push({ key: m.id, tone: "camp", icon: "⛺", from: me, to: name, toId: m.target, troops, end: m.returnAt, recall: m.id });
    } else {
      rows.push({ key: m.id, tone: helping ? "ally" : "out", icon: MARCH_ICON[m.kind] ?? "⚔️", from: me, to: name, toId: m.target, troops, end: m.arriveAt, back: m.arriveAt + (m.arriveAt - m.departAt), recall: m.arriveAt > now ? m.id : undefined });
    }
  }
  for (const a of snap.allyMoves ?? []) {
    const troops = armyIcons(a.troops as Record<string, number>, "—");
    if (a.status === "out") rows.push({ key: `ally-${a.id}`, tone: "ally", icon: "🛡️", from: a.from, fromId: snap.rivals.find((r) => r.name === a.from)?.id, to: me, troops, end: a.arriveAt });
    else rows.push({ key: `ally-${a.id}`, tone: "ally", icon: "↩️", from: me, to: a.from, toId: snap.rivals.find((r) => r.name === a.from)?.id, troops, end: a.returnAt });
  }
  for (const sp of live.spies ?? []) {
    if (sp.arriveAt <= now) continue;
    rows.push({ key: `spy-${sp.id}`, tone: "spy", icon: "🕵️", from: me, to: targetName(snap, sp.target), toId: sp.target, troops: "🕵️1", end: sp.arriveAt });
  }
  for (const m of live.moles ?? []) {
    if (m.until <= now) continue;
    rows.push({ key: `mole-${m.id}`, tone: "spy", icon: "🐀", from: me, to: targetName(snap, m.target), toId: m.target, troops: "taupe", end: m.until });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => (a.tone === "attack" ? 0 : 1) - (b.tone === "attack" ? 0 : 1) || a.end - b.end);
  const attacks = rows.filter((r) => r.tone === "attack").length;
  const next = Math.min(...rows.map((r) => r.end));
  return (
    <section className={`moves${attacks > 0 ? " moves-alert" : ""}`} aria-label="Mouvements">
      <button className="moves-head" aria-expanded={open || !!focusKey} onClick={toggle}>
        <span className="moves-long">
          🧭 {rows.length} mouvement{rows.length > 1 ? "s" : ""} · prochain <span className="num">{countdown(next - now)}</span>
          {attacks > 0 ? <strong className="moves-warn"> · ⚠️ {attacks} attaque{attacks > 1 ? "s" : ""}</strong> : null}
        </span>
        <span className="moves-short num">
          🧭 {rows.length} · {countdown(next - now)}
          {attacks > 0 ? <strong className="moves-warn"> · ⚠️ {attacks}</strong> : null}
        </span>
        <span aria-hidden>{open || focusKey ? "▴" : "▾"}</span>
      </button>
      {(open || focusKey) && (
        <ul className="moves-list">
          {rows.map((r) => (
            <li key={r.key} id={`move-${r.key}`} className={`move move-${r.tone}${focusKey === r.key ? " move-focus" : ""}`}>
              <span className="move-icon" aria-hidden>
                {r.icon}
              </span>
              <span className="move-route">
                {place(r.from, r.fromId)} → {place(r.to, r.toId)}
                {r.verdict ? ` ${r.verdict}` : ""}
              </span>
              <span className="move-time num">
                <strong>{countdown(r.end - now)}</strong>
                <small>
                  {clock(r.end)}
                  {r.back ? ` · retour ${clock(r.back)}` : ""}
                </small>
              </span>
              <span className="move-troops num">
                {r.troops}
                {r.load ? ` · +${formatNumber(r.load)} 🪨` : ""}
              </span>
              <span className="move-action">
                {r.recall && (
                  <button className="btn btn-small" onClick={() => void run({ type: "march_recall", id: r.recall! })}>
                    Rappeler
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** E7 : bloc Espionnage de l'onglet Armée : niveau, espions en route, espions surpris chez moi. */
function Spies({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  const moles = (live.moles ?? []).filter((m) => m.until > now);
  const nameOf = (key: string) => (key === "fortress" ? snap.fortress.name : key.startsWith("hall:") ? "une halle" : (snap.rivals.find((r) => r.id === key)?.name ?? "?"));
  const base = baseRate(live, worldFrom(snap.worksite), now);
  const counter = (live.counterUntil ?? 0) > now;
  const rumor = live.rumor && live.rumor.until > now ? live.rumor : null;
  const act = async (action: Parameters<typeof run>[0]) => {
    setBusy(true);
    await run(action);
    setBusy(false);
  };
  return (
    <div className="spies">
      <h3 className="section-title">🕵️ Espionnage · niveau {live.spyLevel ?? 0}</h3>
      {moles.length === 0 ? (
        <p className="note">🐀 Aucune taupe.</p>
      ) : (
        <ul className="num">
          {moles.map((m) => (
            <li key={m.id}>
              🐀 {nameOf(m.target)} · {duration(m.until - now)}
            </li>
          ))}
        </ul>
      )}
      <div className="row-actions">
        <Btn
          busy={busy}
          reason={live.stone < counterCost(base) ? "Pas assez de pierre." : null}
          onClick={() => act({ type: "counter" })}
          title="Pendant 6 h, quiconque espionne, sabote ou pose une taupe chez toi a deux crans de moins. Un espion repéré chez toi rapporte des chiffres faussés. Racheter prolonge."
        >
          🛡️ Contre
          <span className="cost num">{counter ? `${duration((live.counterUntil ?? 0) - now)} · ` : ""}{formatNumber(counterCost(base))} 🪨</span>
        </Btn>
        {(["fort", "faible"] as const).map((mode) => (
          <Btn
            key={mode}
            busy={busy}
            reason={live.stone < rumorCost(base) ? "Pas assez de pierre." : null}
            onClick={() => act({ type: "rumor", mode })}
            title={`Pendant 2 h, tout le monde voit ton armée ${mode === "fort" ? "deux fois plus grosse" : "deux fois plus petite"}, rapports d'espion compris, sauf ceux d'un espion au moins deux crans au-dessus de toi.`}
          >
            🗣️ {mode === "fort" ? "Fort" : "Faible"}
            <span className="cost num">{rumor?.mode === mode ? `${duration(rumor.until - now)} · ` : ""}{formatNumber(rumorCost(base))} 🪨</span>
          </Btn>
        ))}
      </div>
      {((live.granaryCutUntil ?? 0) > now || (live.blindUntil ?? 0) > now) && (
        <p className="note num">
          {(live.granaryCutUntil ?? 0) > now ? `🧨 Grenier saboté · ${duration((live.granaryCutUntil ?? 0) - now)} ` : ""}
          {(live.blindUntil ?? 0) > now ? `🧨 Guet aveugle · ${duration((live.blindUntil ?? 0) - now)}` : ""}
        </p>
      )}
    </div>
  );
}

/** Ce que montre le rapport d'espion, selon l'écart de niveau (E4). */
function SpyReport({ r, now }: { r: RivalView; now: number }) {
  const gap = r.spyGap;
  if (gap === null || gap === undefined) return null;
  const lines: string[] = [];
  lines.push(`Écart de niveau d'espionnage : ${gap > 0 ? "+" : ""}${gap}`);
  if (r.moves) {
    lines.push(r.moves.length ? `Armées dehors : ${r.moves.map((m) => `${armyIcons(m.troops, "?")} vers ${m.target}, ${m.status === "back" ? `retour dans ${duration(m.returnAt - now)}` : m.status === "camp" ? "postée" : `arrivée dans ${duration(m.arriveAt - now)}`}`).join(" ; ")}` : "Aucune armée dehors");
    if (r.guests && Object.keys(r.guests).length) lines.push(`Renforts reçus : ${armyIcons(r.guests)}`);
  }
  if (r.stoneKnown && !r.isLord && r.shieldUntil > now) lines.push(`Bouclier encore ${duration(r.shieldUntil - now)}`);
  if (r.levels) {
    const lv = Object.entries(r.levels).filter(([, n]) => n > 0).map(([id, n]) => `${COMBATANTS.get(id as CombatantId)?.icon ?? id} ${n}`);
    lines.push(`Forge : ${lv.length ? lv.join("  ") : "aucun niveau"} · espionnage ${r.spyLevel ?? 0}`);
    if (r.researchQueue?.length) lines.push(`Recherches : ${r.researchQueue.map((q) => `${q.id === "espionnage" ? "🕵️" : (COMBATANTS.get(q.id as CombatantId)?.icon ?? q.id)} fin dans ${duration(q.endsAt - now)}`).join(", ")}`);
    if (r.wounded && Object.keys(r.wounded).length && (r.healAt ?? 0) > now) lines.push(`Blessés : ${armyIcons(r.wounded)}, de retour dans ${duration((r.healAt ?? 0) - now)}`);
    if (r.curfewStart !== null && r.curfewStart !== undefined) lines.push(`Couvre-feu de ${localTime(r.curfewStart)} à ${localTime((r.curfewStart + CURFEW_MINUTES) % 1440)}`);
  }
  return (
    <div className="row-desc spy-report num">
      {lines.map((l) => (
        <div key={l}>🕵️ {l}</div>
      ))}
    </div>
  );
}

/** B7 : simulateur avant l'attaque, une bataille pour de faux contre l'armée vue en face (rien n'est perdu). */
function Simulator({ me, army, r, intel, seed, onReplay, onClose }: { me: PlayerState; army: Army; r: RivalView; intel: boolean; seed: number; onReplay: () => void; onClose: () => void }) {
  const attack = army;
  const opts = { attackBonus: r.revenge ? REVENGE_ATTACK_BONUS : 1, attackerLevels: me.levels, fortune: true };
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

const SPY_RESEARCH = { icon: "🕵️", name: "Espionnage" };

/** Forge : académie militaire et améliorations des troupes et fortifications (une recherche à la fois). */
function Forge({ live, now, run, stagesDone, base }: { live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; stagesDone: number; base: number }) {
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
          <Btn className="btn btn-primary" reason={full ? "La file de recherche est pleine." : cost > live.stone ? "Pas assez de pierre." : null} onClick={() => void run({ type: "research", id: d.id })}>
            {queue.length > 0 ? "En file" : "Niveau +1"}
            <span className="cost num">{formatNumber(cost)} 🪨</span>
          </Btn>
        </div>
      );
    });
  return (
    <>
      <Info>
        Chaque niveau donne +{Math.round(LEVEL_BONUS * 100)} % d&apos;attaque et de points de vie au type amélioré, en attaque comme en défense. Jusqu&apos;à 3
        recherches en file, et chaque niveau prend plus de temps que le précédent. L&apos;académie accélère les recherches, mais les rivaux peuvent la
        saboter : un bon niveau d&apos;espionnage les en dissuade.
      </Info>
      <div className="row">
        <div className="row-icon" aria-hidden>
          🎓
        </div>
        <div>
          <div className="row-title">
            Académie militaire <span className="badge">niv. {live.academy ?? 0}</span>
          </div>
          <div className="row-desc">
            ⏩ +{Math.round((live.academy ?? 0) * ACADEMY_SPEED * 100)} % (+{Math.round(ACADEMY_SPEED * 100)} % par niveau)
            {live.sabotageImmuneUntil > now ? ` · 🛡️ ${duration(live.sabotageImmuneUntil - now)}` : ""}
          </div>
        </div>
        <Btn className="btn btn-primary" reason={academyPrice > live.stone ? "Pas assez de pierre." : null} onClick={() => void run({ type: "academy" })}>
          Agrandir
          <span className="cost num">{formatNumber(academyPrice)} 🪨</span>
        </Btn>
      </div>
      <SpyResearchRow live={live} base={base} stagesDone={stagesDone} full={full} queued={queue.length > 0} run={run} />
      <h3 className="section-title">
        File de recherche ({queue.length}/{RESEARCH_QUEUE_MAX})
      </h3>
      {queue.length === 0 ? (
        <p className="raid-state">🔨 Aucune recherche en cours.</p>
      ) : (
        <ol className="research-queue">
          {queue.map((r, i) => {
            const def = r.id === "espionnage" ? SPY_RESEARCH : COMBATANTS.get(r.id);
            const level = (r.id === "espionnage" ? (live.spyLevel ?? 0) : levelOf(live, r.id)) + queue.slice(0, i + 1).filter((q) => q.id === r.id).length;
            return (
              <li key={`${r.id}-${r.endsAt}`}>
                {i === 0 ? "⏳" : "⌛"} {def?.icon} {def?.name} {level} · {duration(r.endsAt - now)}{" "}
                <button className="btn btn-small" onClick={() => void run({ type: "research_cancel", endsAt: r.endsAt })} title="Annule cette recherche : la moitié de son prix te revient, et les suivantes avancent d'autant.">
                  ↩️ Annuler{r.cost ? ` +${formatNumber(Math.floor(r.cost * RESEARCH_REFUND))} 🪨` : ""}
                </button>
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
/** Halle de guilde (H1 à H6), ou loge d'un joueur seul. */
function GuildHall({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState(1);
  const [aim, setAim] = useState<Record<number, string>>({});
  const g = snap.guild;
  if (!g) return null;
  const available = UNITS.filter((u) => (live.troops[u.id] ?? 0) > 0);
  const chosen = available.find((u) => u.id === unit) ?? available[0];
  const sieges = g.targets.length > 0 && (
    <>
      <h4 className="hall-sub">⚔️ Halles ennemies</h4>
      <Info>En guerre, une halle peut être prise d&apos;assaut : l&apos;aile visée est hors service 24 h, rien n&apos;est détruit ni volé. La halle est ensuite à l&apos;abri 24 h.</Info>
      <div className="list">
        {g.targets.map((t) => {
          const wings = WINGS.filter((w) => (t.wings[w.id] ?? 0) > 0);
          const target = aim[t.id] ?? wings[0]?.id ?? "";
          return (
            <div key={t.id} className="row">
              <div className="row-icon" aria-hidden>
                🏛️
              </div>
              <div>
                <div className="row-title">Halle · {t.name}</div>
                <div className="row-desc">
                  {wings.length ? wings.map((w) => `${w.icon} ${t.wings[w.id]}`).join("  ") : "Aucune aile en service."} · chance ≈ {Math.round(t.chance * 100)} %
                  {t.blocker ? ` · ${t.blocker}` : ""}
                </div>
                {wings.length > 0 && (
                  <select className="input" value={target} onChange={(e) => setAim({ ...aim, [t.id]: e.target.value })} aria-label="Aile visée">
                    {wings.map((w) => (
                      <option key={w.id} value={w.id}>
                        Viser : {w.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {!t.blocker && <TravelTo place={`hall:${t.id}`} army={live.troops as Record<string, number>} />}
              <button className="btn btn-primary" disabled={busy || t.blocker !== null} onClick={() => act({ type: "hall", op: "siege", hall: t.id, wing: target || undefined })}>
                Assaut
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
  const act = async (action: Parameters<typeof run>[0]) => {
    setBusy(true);
    await run(action);
    setBusy(false);
  };
  const title = g.lodge ? "🏛️ Ta loge" : "🏛️ Halle de guilde";
  const h = g.hall;
  if (!h) {
    return (
      <div className="hall">
        <h3 className="section-title">{title}</h3>
        <p className="note">
          {g.lodge
            ? "Seul, tu peux fonder une petite loge près de ton domaine : 4 étapes et deux ailes au plus. Si tu rejoins une alliance qui a sa halle, la moitié de ce que tu lui as versé y passe."
            : "Un chantier propre à l'alliance, posé sur la carte près de vos domaines. La fondation puis chaque étape terminée donnent un niveau d'aile : production, stock à l'abri, renforts, guet, écuries ou infirmerie. Il y a dix étapes, et dix-huit niveaux possibles."}
        </p>
        {g.dormantLodge && <p className="note">Ta loge attend : la moitié de ce que tu lui as versé rejoindra la halle dès qu&apos;elle sera fondée.</p>}
        {g.chief ? (
          <>
            <p className="note num">
              {g.lodge ? "Ouvre le chantier, puis verse-lui" : "Ouvre le chantier : toute l'alliance pourra y verser, dons et part de dîme compris,"} environ {formatNumber(g.foundCost)} pierres pour la fonder.
            </p>
            <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: "hall", op: "found" })}>
              Ouvrir le chantier {g.lodge ? "de ma loge" : "de la halle"}
            </button>
          </>
        ) : (
          <p className="note">Seul le chef{g.chiefName ? ` (${g.chiefName})` : ""} peut la fonder.</p>
        )}
        {sieges}
      </div>
    );
  }
  const done = h.stage >= h.maxStages;
  const founding = h.stage < 0;
  const pct = done ? 100 : Math.min(100, (h.progress / Math.max(1, h.cost)) * 100);
  const free = h.available - h.placed;
  const tithe = Math.round((live.hallTithe ?? 0.25) * 100);
  const kinds = WINGS.filter((w) => (h.wings[w.id] ?? 0) > 0).length;
  const give = (n: number) => {
    if (n >= 1) void act({ type: "hall", op: "give", amount: Math.floor(n) });
    setAmount("");
  };
  return (
    <div className="hall">
      <h3 className="section-title">{title}</h3>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="bar-caption num">
        <span>{done ? `${formatNumber(h.received)} pierres reçues` : `${formatNumber(h.progress)} / ${formatNumber(h.cost)} (${pct.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %)`}</span>
        <span>{founding ? "fondation" : done ? `achevée (${h.maxStages}/${h.maxStages})` : `étape ${h.stage + 1}/${h.maxStages}`}</span>
      </div>
      <form
        className="alliance-form"
        onSubmit={(e) => {
          e.preventDefault();
          give(Number(amount.replace(/\s/g, "")));
        }}
      >
        <input className="input num" inputMode="numeric" value={amount} placeholder="Pierres à verser" onChange={(e) => setAmount(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !(Number(amount.replace(/\s/g, "")) >= 1)}>
          Verser
        </button>
        <button type="button" className="btn" disabled={busy || live.stone < 1} onClick={() => give(live.stone / 10)}>
          10 %
        </button>
        <button type="button" className="btn" disabled={busy || live.stone < 1} onClick={() => give(live.stone / 2)}>
          50 %
        </button>
      </form>
      {!done && (
        <p className="note num">
          Il manque {formatNumber(Math.max(0, h.cost - h.progress))} pierres. Ta part déjà versée : {formatNumber(h.gifts.find((x) => x.id === snap.userId)?.amount ?? 0)}.
        </p>
      )}
      <label className="hall-tithe">
        Part de ta dîme pour {g.lodge ? "ta loge" : "la halle"} :{" "}
        <select className="input" value={tithe} disabled={busy} onChange={(e) => act({ type: "hall", op: "tithe", percent: Number(e.target.value) })}>
          {Array.from({ length: 11 }, (_, i) => i * 5).map((p) => (
            <option key={p} value={p}>
              {p} %
            </option>
          ))}
        </select>
      </label>
      <Info>
        Le reste de ta dîme ({Math.round((live.tithe ?? 0) * 100)} % de ta production) continue d&apos;aller au beffroi. Ce qui est versé ici ne compte ni pour le beffroi, ni
        pour les lots, ni pour les paliers de don, et ne peut être ni repris ni pillé.
      </Info>
      {founding && <p className="note">Chantier de fondation : versez ensemble la somme affichée. Une fois fondée, chaque étape donnera un niveau d&apos;aile.</p>}
      <h4 className="hall-sub">
        Ailes · {h.placed}/{h.available} niveaux placés{h.masterLevels > 0 ? ` (dont ${h.masterLevels} offert${h.masterLevels > 1 ? "s" : ""} par le beffroi)` : ""}
      </h4>
      {free > 0 && <p className="note">{g.chief ? `${free} niveau${free > 1 ? "x" : ""} à placer.` : `${free} niveau${free > 1 ? "x" : ""} à placer par ${g.chiefName ?? "le chef"} : propose ton choix dans le canal d'alliance.`}</p>}
      <div className="list">
        {WINGS.map((w) => {
          const lvl = h.wings[w.id] ?? 0;
          const down = h.disabled[w.id] ?? 0;
          const blocked = lvl >= 3 || (g.lodge && lvl === 0 && kinds >= 2);
          return (
            <div key={w.id} className={`row${lvl === 0 ? " hall-off" : ""}`}>
              <div className="row-icon" aria-hidden>
                {w.icon}
              </div>
              <div>
                <div className="row-title">
                  {w.name}
                  <span className="row-count num">{lvl}/3</span>
                </div>
                <div className="row-desc">
                  {down > now ? `🔥 Hors service encore ${duration(down - now)} · ` : ""}
                  {lvl > 0 ? w.levels[lvl - 1] : "Pas encore bâtie."}
                  {lvl < 3 ? ` · niveau ${lvl + 1} : ${w.levels[lvl]}` : ""}
                </div>
              </div>
              {g.chief && free > 0 && !blocked && (
                <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: "hall", op: "place", wing: w.id })}>
                  +1
                </button>
              )}
            </div>
          );
        })}
      </div>
      {h.gifts.length > 0 && (
        <p className="note num">Versements : {h.gifts.map((x) => `${x.id === snap.userId ? "toi" : x.name} ${formatNumber(x.amount)}`).join(" · ")}</p>
      )}
      {!g.lodge && !founding && (
        <>
          <h4 className="hall-sub">🛡️ Garnison</h4>
          <p className="row-desc num">
            Murs : {armyIcons(h.walls as Record<string, number>, "aucun")} (10 % de la pierre reçue)
            {h.immuneUntil > now ? ` · à l'abri des assauts encore ${duration(h.immuneUntil - now)}` : ""}
          </p>
          <p className="row-desc num">
            Troupes postées :{" "}
            {h.garrison.length === 0 ? "aucune" : h.garrison.map((x) => `${x.id === snap.userId ? "toi" : x.name} ${armyIcons(x.troops as Record<string, number>)}`).join(" · ")}
          </p>
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
              <TravelTo pos={h.pos} army={{ [chosen.id]: Math.min(qty, live.troops[chosen.id] ?? 0) }} reinforce />
              <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: "hall", op: "station", unit: chosen.id, qty: Math.min(qty, live.troops[chosen.id] ?? 0) })}>
                Poster
              </button>
            </div>
          ) : (
            <p className="row-desc">Aucune troupe chez toi à poster à la halle.</p>
          )}
          {h.garrison.some((x) => x.id === snap.userId) && (
            <button className="btn" disabled={busy} onClick={() => act({ type: "hall", op: "recall" })}>
              Rappeler mes troupes de la halle
            </button>
          )}
          <Info>Seule une alliance en guerre avec la vôtre peut assiéger la halle. Un assaut réussi met une aile hors service 24 h, sans rien détruire.</Info>
        </>
      )}
      {sieges}
    </div>
  );
}

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
          <Info>
            Entre alliés, pas de pillage. Les troupes envoyées chez un allié défendent son domaine et partent en raid avec lui (butin et pertes sont
            partagés au prorata de la valeur des troupes engagées par chacun).
          </Info>
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
          {!f.mine && !f.blocker && <TravelTo place="fortress" army={live.troops as Record<string, number>} />}
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
              <button className="btn" disabled={busy || live.stone < spyPrice} onClick={() => act({ type: "spy", target: "fortress" })} title="L'espion part sur la route ; son rapport montre la garnison et les murs pendant 1 h. Il peut être repéré.">
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
              <TravelTo place="fortress" army={{ [chosen.id]: Math.min(qty, live.troops[chosen.id] ?? 0) }} reinforce />
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
  const travel = chosen ? <TravelTo place={r.id} army={{ [chosen.id]: Math.min(qty, max) }} reinforce /> : null;
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
        {travel}
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
      <TravelTo pos={camp ? e.camps?.find((c) => c.id === camp)?.pos : e.pos} army={army} />
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
      {!e.blocker && <EventTravel e={e} now={now} />}
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

/** Une ligne de chronique me concerne-t-elle (moi, mon alliance, un combat où j'étais) ? */
function concernsMe(e: ChronicleEntry, me: string, myAlliance: number | null): boolean {
  const d = e.details;
  if (e.actorId === me || e.targetId === me) return true;
  if (d.members?.includes(me) || (d.shares && me in d.shares) || (d.allyShares && me in d.allyShares)) return true;
  if (myAlliance === null) return false;
  return d.alliance === myAlliance || d.target === myAlliance || d.a === myAlliance || d.b === myAlliance || d.winner === myAlliance;
}

/** Récit d'une ligne de chronique, en une phrase (détail d'un rapport). */
function chronicleText(e: ChronicleEntry, me: string, rivals: RivalView[], alliances: AllianceSummary[]): string {
  const allianceName = (id: number | null | undefined) => alliances.find((a) => a.id === id)?.name ?? "une alliance disparue";
  const nameOf = (id: string) => (id === me ? "toi" : (rivals.find((r) => r.id === id)?.name ?? "un allié"));
  const who = (id: string | null, name: string, cap = false) => (id === me ? (cap ? "Tu" : "toi") : name);
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
    const you = e.actorId === me;
    if (d.phase === "attack") text = eventAttackText(e, me);
    else if (d.phase === "camp")
      text = d.success
        ? `🏕️ ${who(e.actorId, e.actorName, true)} ${you ? "as vidé" : "a vidé"} un camp de bandits : ${formatNumber(d.stolen ?? 0)} pierres.`
        : `🏕️ Les bandits ont repoussé ${you ? "ton armée" : `l'armée de ${e.actorName}`}.`;
    else if (d.phase === "treasure")
      text = d.success
        ? `💰 ${who(e.actorId, e.actorName, true)} ${you ? "as chassé" : "a chassé"} ${e.targetId === me ? "ton armée" : `l'armée de ${e.targetName}`} du trésor.`
        : `💰 ${e.targetId === me ? "Ton armée a" : `L'armée de ${e.targetName} a`} tenu le trésor face à ${you ? "toi" : e.actorName}.`;
    else if (d.phase === "group")
      text = d.event === "convoi"
        ? d.success
          ? `👑 L'escorte du convoi a repoussé l'embuscade (${(d.members ?? []).map(nameOf).slice(0, 4).join(", ")}).`
          : `👑 L'embuscade a eu raison de l'escorte du convoi.`
        : d.success
          ? `🏰 Les défenseurs du beffroi ont tenu le siège (${(d.members ?? []).map(nameOf).slice(0, 4).join(", ")}).`
          : "🏰 Les défenseurs du beffroi ont cédé au siège.";
    else if (d.event === "caravane")
      text = (d.stolen ?? 0) > 0 ? `🐪 La caravane marchande est repartie, allégée de ${formatNumber(d.stolen ?? 0)} pierres (${shares}).` : "🐪 La caravane marchande est repartie intacte.";
    else text = d.success ? `🗿 Le Colosse est tombé ! ${formatNumber(d.bounty ?? 0)} pierres versées à ceux qui l'ont touché (${shares}).` : "🗿 Le Colosse s'en va invaincu.";
  } else if (e.kind === "fortress") {
    text = e.details.success
      ? `🏰 ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "as pris" : "a pris"} la forteresse pour ${allianceName(e.details.alliance)} !`
      : `🏰 ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "t'es brisé" : "s'est brisé"} sur les murs de la forteresse.`;
  } else if (e.kind === "sabotage") {
    const d = e.details as { success?: boolean; aim?: string; named?: boolean; spotted?: boolean };
    const part = d.aim === "grenier" ? "grenier" : d.aim === "guet" ? "guet" : "académie";
    const target = e.targetId === me ? `ton ${part === "académie" ? "académie" : part}` : `${part === "académie" ? "l'académie" : `le ${part}`} de ${e.targetName}`;
    const hidden = e.actorId !== me && d.named === false;
    text = d.success
      ? e.actorId === me
        ? `🧨 Tu as saboté ${target}.`
        : `🧨 ${hidden || d.named === undefined ? "Un saboteur" : `Un saboteur de ${e.actorName}`} a frappé ${target}.`
      : hidden
        ? `🧨 Un saboteur inconnu a été pris en train de saboter ${target}.`
        : `🧨 ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "as été pris" : "a été pris"} en train de saboter ${target}.`;
  } else if (e.kind === "spy") {
    const d = e.details as { fortress?: boolean; hall?: string };
    const where = d.fortress ? "la forteresse" : d.hall ? d.hall : e.targetId === me ? "ton domaine" : e.targetName || "un seigneur";
    const mole = (e.details as { mole?: boolean }).mole;
    text = e.actorId === me
      ? `${mole ? "🐀 Ta taupe a été démasquée" : "🕵️ Ton espion a été surpris"} chez ${where}.`
      : `${mole ? "🐀" : "🕵️"} ${e.actorId ? who(e.actorId, e.actorName, true) : mole ? "Une taupe inconnue" : "Un espion inconnu"} ${mole ? "a été démasqué avec sa taupe chez" : "a été surpris à espionner"} ${where}.`;
  } else if (e.kind === "lot") {
    const d = e.details as { stage?: number; name?: string; master?: boolean };
    const stageName = stageDef(d.stage ?? 0).name;
    text = d.master
      ? `👑 ${d.name} finit son lot de « ${stageName} » le premier et devient maître d'œuvre !`
      : `🏗️ ${d.name} finit son lot de « ${stageName} ».`;
  } else if (e.kind === "hall_siege") {
    const d = e.details as { success?: boolean; target?: number; wing?: string | null };
    const wing = WINGS.find((w) => w.id === d.wing)?.name;
    text = d.success
      ? `🏛️ ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "as pris" : "a pris"} d'assaut la halle de ${allianceName(d.target)}${wing ? ` : aile « ${wing} » hors service 24 h` : ""}.`
      : `🏛️ ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "t'es brisé" : "s'est brisé"} sur les murs de la halle de ${allianceName(d.target)}.`;
  } else if (e.kind === "hall") {
    text = `🏛️ ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "as fondé" : "a fondé"} la halle de ${allianceName(e.details.alliance)}.`;
  } else if (e.kind === "stage") {
    const d = e.details;
    text = `⛪ « ${d.name ?? stageDef(d.stage ?? 0).name} » est achevé${(d.ecus ?? 0) > 0 ? ` : ${d.ecus} écus pour chaque donateur` : ""}.`;
  } else if (e.kind === "quest") {
    const d = e.details;
    text = `${d.icon ?? "📜"} Quête accomplie : ${d.label ?? ""}${(d.amount ?? 0) > 0 ? `, +${formatNumber(d.amount ?? 0)} pierres` : ""}${(d.ecus ?? 0) > 0 ? `, +${d.ecus} écus` : ""}.`;
  } else if (e.kind === "chest") {
    text = `🎁 Coffre du jour ouvert : +${Math.round(((e.details as { bonus?: number }).bonus ?? 0) * 100)} % de production pendant 4 heures.`;
  } else if (e.kind === "ecus") {
    text = `🎖️ Palier de don : +${e.details.ecus ?? 0} écus et +${(e.details.tiers ?? 1) * DONOR_TIER_BONUS * 100} % de production.`;
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
  return text;
}

/** U2 : date à partir de laquelle les rapports comptent comme non lus (mise en ligne de la boîte). */
const INBOX_EPOCH = Date.parse("2026-11-13T15:00:00Z");
const INBOX_KEEP_MS = 7 * 24 * 3_600_000;
const INBOX_MAX = 100;
const INBOX_LABELS: Record<InboxCategory, string> = { combats: "⚔️ Combats", espionnage: "🕵️ Espionnage", alliance: "🤝 Alliance", chantier: "⛪ Chantier", royaume: "👑 Royaume" };

interface Chip {
  t: string;
  tone?: "gain" | "loss";
}
interface Report {
  key: string;
  cat: InboxCategory;
  icon: string;
  title: string;
  chips: Chip[];
  at: number;
  entry?: ChronicleEntry;
  text?: string;
  rival?: RivalView;
  /** Cible à espionner ou à regarder sur la carte. */
  target?: string;
}

const short = (n: number) => formatNumber(Math.floor(n));
const worth = (a?: Record<string, number>) => (a ? armyValue(cleanArmy(a as Army)) : 0);

/** U2 : un rapport en une ligne : icône, titre court, pastilles chiffrées. */
function reportOf(e: ChronicleEntry, me: string, myAlliance: number | null, rivals: RivalView[], alliances: AllianceSummary[]): Report {
  const d = e.details;
  const mine = concernsMe(e, me, myAlliance);
  const personal = e.actorId === me || e.targetId === me || !!d.members?.includes(me) || !!(d.shares && me in d.shares) || !!(d.allyShares && me in d.allyShares);
  const allyOf = (id: string | null) => !!id && rivals.some((r) => r.id === id && r.allied);
  const aName = (id: number | null | undefined) => alliances.find((a) => a.id === id)?.name ?? "?";
  const chips: Chip[] = [];
  let cat: InboxCategory = "royaume";
  let icon = "📜";
  let title = "";
  const attacker = e.actorId === me;
  const lossChip = (lost?: Record<string, number>) => {
    const v = worth(lost);
    if (v > 0) chips.push({ t: `💀 −${short(v)}`, tone: "loss" });
  };
  if (e.kind === "raid") {
    icon = "⚔️";
    cat = personal ? "combats" : allyOf(e.actorId) || allyOf(e.targetId) ? "alliance" : "royaume";
    const won = d.success !== false;
    if (attacker) title = won ? `Victoire sur ${e.targetName}` : `Défaite contre ${e.targetName}`;
    else if (e.targetId === me) title = won ? `Pillé par ${e.actorName}` : `Raid de ${e.actorName} repoussé`;
    else title = won ? `${e.actorName} pille ${e.targetName}` : `${e.targetName} repousse ${e.actorName}`;
    if (won && (d.stolen ?? 0) > 0) chips.push({ t: `${attacker ? "+" : e.targetId === me ? "−" : ""}${short(d.stolen ?? 0)} 🪨`, tone: attacker ? "gain" : e.targetId === me ? "loss" : undefined });
    if ((d.ransom ?? 0) > 0) chips.push({ t: `rançon ${short(d.ransom ?? 0)}`, tone: attacker ? "gain" : undefined });
    if (personal) lossChip(attacker ? d.attackerLost : d.defenderLost);
    const ruined = Object.values(d.destroyed ?? {}).reduce((a, b) => a + b, 0);
    if (ruined > 0) chips.push({ t: `🏚️ ${ruined}`, tone: e.targetId === me ? "loss" : undefined });
    if (d.revenge) chips.push({ t: "revanche" });
  } else if (e.kind === "fortress" || e.kind === "hall_siege") {
    icon = e.kind === "fortress" ? "🏰" : "🏛️";
    const ours = myAlliance !== null && (d.alliance === myAlliance || d.target === myAlliance);
    cat = personal ? "combats" : ours ? "alliance" : "royaume";
    const place = e.kind === "fortress" ? "la forteresse" : `halle de ${aName(d.target)}`;
    title = d.success ? `${attacker ? "Tu prends" : `${e.actorName} prend`} ${place}` : `Assaut brisé sur ${place}`;
    if (personal) lossChip(attacker ? d.attackerLost : d.defenderLost);
  } else if (e.kind === "event") {
    const share = d.shares?.[me] ?? 0;
    if (d.phase === "attack" || d.phase === "camp" || d.phase === "treasure" || d.phase === "group") {
      icon = d.phase === "camp" ? "🏕️" : d.phase === "treasure" ? "💰" : d.event === "convoi" ? "👑" : d.event === "siege" ? "🏰" : d.event === "colosse" ? "🗿" : "🐪";
      cat = personal ? "combats" : "royaume";
      const what = d.phase === "camp" ? "camp de bandits" : d.phase === "treasure" ? "trésor" : d.event === "convoi" ? "convoi" : d.event === "siege" ? "beffroi assiégé" : d.event === "colosse" ? "Colosse" : "caravane";
      title = `${d.success ? "Succès" : "Échec"} : ${what}`;
      if ((d.stolen ?? 0) > 0) chips.push({ t: `+${short(d.stolen ?? 0)} 🪨`, tone: attacker ? "gain" : undefined });
      if ((d.dealt ?? 0) > 0) chips.push({ t: `${short(d.dealt ?? 0)} dégâts` });
      if (personal) lossChip(attacker ? d.attackerLost : d.defenderLost);
    } else {
      icon = d.event === "colosse" ? "🗿" : "🐪";
      cat = share > 0 ? "chantier" : "royaume";
      title = d.event === "colosse" ? (d.success ? "Le Colosse est tombé" : "Le Colosse repart") : "La caravane repart";
      if (share > 0) chips.push({ t: `ta part ${short(share)}`, tone: "gain" });
      if ((d.bounty ?? 0) > 0) chips.push({ t: `prime ${short(d.bounty ?? 0)}` });
      if ((d.stolen ?? 0) > 0) chips.push({ t: `${short(d.stolen ?? 0)} pris` });
    }
  } else if (e.kind === "spy" || e.kind === "sabotage") {
    const mole = (d as { mole?: boolean }).mole;
    icon = e.kind === "sabotage" ? "🧨" : mole ? "🐀" : "🕵️";
    cat = personal ? "espionnage" : "royaume";
    if (e.kind === "sabotage") {
      const aim = (d as { aim?: string }).aim;
      const part = aim === "grenier" ? "grenier" : aim === "guet" ? "guet" : "académie";
      title = attacker ? `Sabotage : ${part} de ${e.targetName}` : e.targetId === me ? `Sabotage de ton ${part}` : `Sabotage chez ${e.targetName}`;
      chips.push({ t: d.success ? "réussi" : "pris", tone: (d.success ? attacker : !attacker) ? "gain" : "loss" });
    } else {
      title = attacker ? (mole ? "Ta taupe démasquée" : "Ton espion surpris") : e.targetId === me ? (mole ? "Taupe démasquée chez toi" : "Espion surpris chez toi") : `Espion surpris chez ${e.targetName || "un seigneur"}`;
      if (e.targetId === me && e.actorId) chips.push({ t: e.actorName });
    }
  } else if (e.kind === "war") {
    icon = d.phase === "start" ? "⚔️" : "🏆";
    const ours = myAlliance !== null && (d.a === myAlliance || d.b === myAlliance);
    cat = ours ? "alliance" : "royaume";
    title = d.phase === "start" ? `Guerre : ${aName(d.a)} – ${aName(d.b)}` : d.winner != null ? `${aName(d.winner)} gagne la guerre` : "Guerre sans vainqueur";
    if (d.phase !== "start") chips.push({ t: `${short(d.scoreA ?? 0)} – ${short(d.scoreB ?? 0)}` });
    if ((d.bounty ?? 0) > 0) chips.push({ t: `prime ${short(d.bounty ?? 0)}`, tone: ours && d.winner === myAlliance ? "gain" : undefined });
  } else if (e.kind === "lot") {
    const l = d as { name?: string; master?: boolean };
    icon = l.master ? "👑" : "🏗️";
    cat = attacker ? "chantier" : allyOf(e.actorId) ? "alliance" : "royaume";
    title = l.master ? `${attacker ? "Tu deviens" : `${l.name} devient`} maître d'œuvre` : `${attacker ? "Ton" : `${l.name} :`} lot fini`;
  } else if (e.kind === "hall") {
    icon = "🏛️";
    cat = myAlliance !== null && d.alliance === myAlliance ? "alliance" : "royaume";
    title = `Halle fondée : ${aName(d.alliance)}`;
  } else if (e.kind === "stage") {
    icon = "⛪";
    cat = "chantier";
    title = `${d.name ?? stageDef(d.stage ?? 0).name} achevé`;
    if ((d.ecus ?? 0) > 0) chips.push({ t: `🪙 ${d.ecus}`, tone: "gain" });
  } else if (e.kind === "quest" || e.kind === "chest" || e.kind === "ecus") {
    if (!attacker) return { key: `c${e.id}`, cat: "royaume", icon: "", title: "", chips: [], at: 0 };
    cat = "chantier";
    if (e.kind === "quest") {
      icon = d.icon ?? "📜";
      title = "Quête accomplie";
      if ((d.amount ?? 0) > 0) chips.push({ t: `+${short(d.amount ?? 0)} 🪨`, tone: "gain" });
    } else if (e.kind === "chest") {
      icon = "🎁";
      title = "Coffre du jour ouvert";
      chips.push({ t: `+${Math.round(((d as { bonus?: number }).bonus ?? 0) * 100)} % 4 h`, tone: "gain" });
    } else {
      icon = "🎖️";
      title = "Palier de don atteint";
    }
    if ((d.ecus ?? 0) > 0) chips.push({ t: `🪙 +${d.ecus}`, tone: "gain" });
  } else {
    icon = "🎁";
    cat = attacker ? "chantier" : "royaume";
    title = `Don de ${attacker ? "toi" : e.actorName}`;
    chips.push({ t: `${short(d.amount ?? 0)} 🪨`, tone: attacker ? "gain" : undefined });
  }
  void mine;
  const other = attacker ? e.targetId : e.actorId;
  const rival = other ? rivals.find((r) => r.id === other) : undefined;
  return { key: `c${e.id}`, cat, icon, title, chips, at: e.at, entry: e, rival, target: rival?.id };
}

function readLocal(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("beffroi.readReports") ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** U2 : tous les rapports du joueur, rangés par catégorie et du plus récent au plus ancien. */
function buildReports(snap: GameSnapshot, live: PlayerState, now: number): Report[] {
  const me = snap.userId;
  const myAlliance = snap.alliance?.id ?? null;
  const out: Report[] = (snap.chronicle ?? []).map((e) => reportOf(e, me, myAlliance, snap.rivals, snap.alliances));
  for (const [i, l] of (live.spyLog ?? []).entries()) out.push({ key: `log${l.at}-${i}`, cat: "espionnage", icon: "🐀", title: l.text.length > 48 ? `${l.text.slice(0, 46)}…` : l.text, chips: [], at: l.at, text: l.text });
  for (const r of snap.rivals) {
    if (!(r.intelUntil > now)) continue;
    out.push({ key: `intel-${r.id}-${r.intelUntil}`, cat: "espionnage", icon: "📜", title: `Rapport sur ${r.name}`, chips: [{ t: `valable ${countdown(r.intelUntil - now)}` }], at: r.intelUntil - SPY_INTEL_MS, rival: r, target: r.id });
  }
  // H1, U2 : écus de clôture de la saison passée, un rapport « Chantier ».
  const rw = snap.seasonRewards;
  if (rw && rw.total > 0) {
    const label = (id: string) => HALL.find((h) => h.id === id)?.title ?? id;
    const lines = [
      rw.details.stageEcus > 0 ? `🏗️ ${rw.details.stages} étapes du beffroi avec un palier de don : ${rw.details.stageEcus} écus` : null,
      ...rw.details.podium.map((p) => `🏆 ${label(p.category)}, ${p.rank === 1 ? "1re" : `${p.rank}e`} place : ${p.ecus} écus`),
      rw.details.loginEcus > 0 ? `📅 ${rw.details.days} jours de présence : ${rw.details.loginEcus} écus` : null,
    ].filter(Boolean);
    out.push({ key: `close-${rw.season}`, cat: "chantier", icon: "🏁", title: `Clôture de la saison ${rw.season}`, chips: [{ t: `🪙 +${rw.total}`, tone: "gain" }], at: live.seasonStart || now, text: lines.join(" · ") });
  }
  const recent = out.filter((r) => r.at > now - INBOX_KEEP_MS).sort((a, b) => b.at - a.at);
  return INBOX_CATEGORIES.flatMap((c) => recent.filter((r) => r.cat === c).slice(0, INBOX_MAX));
}

function isUnread(r: Report, live: PlayerState, local: Set<string>): boolean {
  return r.at > Math.max(INBOX_EPOCH, live.inboxRead?.[r.cat] ?? 0) && !local.has(r.key);
}

/** U2 : nombre de rapports non lus, Royaume excepté, pour la pastille de l'onglet. */
function unreadCount(snap: GameSnapshot, live: PlayerState, now: number): number {
  const local = readLocal();
  return buildReports(snap, live, now).filter((r) => r.cat !== "royaume" && isUnread(r, live, local)).length;
}

/** U2 : l'onglet Messages, boîte de réception (Rapports) et Discussion. */
export function Inbox({ snap, live, now, run, userId }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; userId: string }) {
  const [part, setPart] = useState<"rapports" | "discussion">("rapports");
  const [cat, setCat] = useState<InboxCategory>("combats");
  const [open, setOpen] = useState<string | null>(null);
  const [local, setLocal] = useState(readLocal);
  const go = useContext(SnapContext)?.go;
  const reports = buildReports(snap, live, now);
  const unread = (c: InboxCategory) => reports.filter((r) => r.cat === c && isUnread(r, live, local)).length;
  const list = reports.filter((r) => r.cat === cat);
  const markRead = (key: string) => {
    if (local.has(key)) return;
    const next = new Set(local).add(key);
    setLocal(next);
    try {
      localStorage.setItem("beffroi.readReports", JSON.stringify([...next].slice(-400)));
    } catch {}
  };
  const toggle = (r: Report) => {
    markRead(r.key);
    setOpen(open === r.key ? null : r.key);
  };
  return (
    <>
      <div className="subtabs" role="group" aria-label="Messages">
        <button className="btn btn-small" aria-pressed={part === "rapports"} onClick={() => setPart("rapports")}>
          📜 Rapports
        </button>
        <button className="btn btn-small" aria-pressed={part === "discussion"} onClick={() => setPart("discussion")}>
          💬 Discussion
        </button>
      </div>
      {part === "discussion" ? (
        <Chat userId={userId} hasAlliance={!!snap.alliance} now={now} />
      ) : (
        <>
          <div className="inbox-cats" role="group" aria-label="Catégories">
            {INBOX_CATEGORIES.map((c) => {
              const n = unread(c);
              return (
                <button key={c} className="btn btn-small" aria-pressed={cat === c} onClick={() => setCat(c)} title={INBOX_LABELS[c].slice(INBOX_LABELS[c].indexOf(" ") + 1)}>
                  <span aria-hidden>{INBOX_LABELS[c].split(" ")[0]}</span>
                  <span className="inbox-word"> {INBOX_LABELS[c].slice(INBOX_LABELS[c].indexOf(" ") + 1)}</span>
                  {n > 0 && <span className="inbox-count num">{n}</span>}
                </button>
              );
            })}
            <button className="btn btn-ghost btn-small inbox-all" disabled={unread(cat) === 0} onClick={() => void run({ type: "inbox_read", category: cat })}>
              Tout lu
            </button>
          </div>
          {list.length === 0 ? (
            <p className="empty">Rien ici pour l&apos;instant.</p>
          ) : (
            <ul className="reports">
              {list.map((r) => {
                const fresh = isUnread(r, live, local);
                const e = r.entry;
                return (
                  <li key={r.key} className={`report${fresh ? " unread" : ""}`}>
                    <button className="report-line" aria-expanded={open === r.key} onClick={() => toggle(r)}>
                      <span className="report-icon" aria-hidden>
                        {r.icon}
                      </span>
                      <span className="report-title">{r.title}</span>
                      <span className="report-meta">
                        <span className="report-chips">
                          {r.chips.map((c, i) => (
                            <span key={i} className={`chip num${c.tone ? ` chip-${c.tone}` : ""}`}>
                              {c.t}
                            </span>
                          ))}
                        </span>
                        <span className="report-time num">{clockShort(r.at, now)}</span>
                      </span>
                    </button>
                    {open === r.key && (
                      <div className="report-body">
                        {e && <p>{chronicleText(e, snap.userId, snap.rivals, snap.alliances)}</p>}
                        {r.text && <p>{r.text}</p>}
                        {e?.details.log && e.details.log.length > 0 && <RoundsReport log={e.details.log} details={e.details} open />}
                        {!e && r.rival && <SpyReport r={r.rival} now={now} />}
                        {r.target && r.rival && (
                          <div className="row-actions">
                            {go && (
                              <button className="btn btn-small" onClick={() => go("carte", r.target!)}>
                                🗺️ Carte
                              </button>
                            )}
                            {go && !r.rival.allied && e?.kind === "raid" && e.targetId === snap.userId && r.rival.revenge && (
                              <button className="btn btn-small btn-primary" onClick={() => go("raids", r.target!)}>
                                ⚔️ Revanche
                              </button>
                            )}
                            {go && !r.rival.allied && e?.kind === "raid" && e.actorId === snap.userId && e.details.attackerStart && (
                              <button className="btn btn-small" onClick={() => go("raids", r.target!, e.details.attackerStart)}>
                                🔁 Renvoyer
                              </button>
                            )}
                            {!r.rival.allied && (
                              <button className="btn btn-small" onClick={() => void run({ type: "spy", target: r.target! })}>
                                🕵️ Espionner
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** U2 : heure courte d'un rapport (hh:mm aujourd'hui, sinon jour et heure). */
function clockShort(at: number, now: number): string {
  const d = new Date(at);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
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
function readMapNames(): boolean {
  try {
    return localStorage.getItem("beffroi-map-names") === "1";
  } catch {
    return false;
  }
}

function KingdomMap({ snap, live, now, run, focus }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; focus?: Focus | null }) {
  const [picked, setPicked] = useState<string | null>(() => (focus && now - focus.at < 5000 ? focus.id : null));
  const showMove = useContext(SnapContext)?.showMove;
  const [busy, setBusy] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [names, setNames] = useState(readMapNames);
  const scroller = useRef<HTMLDivElement>(null);
  const map = snap.map;
  const mine = map?.places[snap.userId];
  // En gros plan, on centre la vue sur mon domaine.
  useEffect(() => {
    const el = scroller.current;
    if (!zoomed || !el || !map || !mine) return;
    const fx = (mine[0] - 0.5) / map.size;
    const fy = (map.size - mine[1] + 0.5) / map.size;
    el.scrollLeft = fx * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = fy * el.scrollHeight * 0.92 - el.clientHeight / 2;
  }, [zoomed, map, mine]);
  if (!map) return <p className="empty">On déplie la carte…</p>;
  const toggleNames = () => {
    setNames((v) => {
      try {
        localStorage.setItem("beffroi-map-names", v ? "0" : "1");
      } catch {
        /* préférence non retenue */
      }
      return !v;
    });
  };
  const ev = snap.event;
  // La caravane et le convoi avancent en direct le long de leur route.
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
  // Taille des domaines : hameau, village ou manoir selon la production parmi les joueurs.
  const myRate = rateAt(live, worldFrom(snap.worksite), now);
  const rates = [myRate, ...snap.rivals.filter((r) => !r.isLord).map((r) => r.rate)].sort((a, b) => a - b);
  const tierOf = (rate: number): 1 | 2 | 3 => {
    const rank = rates.findIndex((x) => x >= rate) / Math.max(1, rates.length - 1);
    return rank >= 0.7 ? 3 : rank >= 0.3 ? 2 : 1;
  };
  const places: BoardPlace[] = [];
  for (const [id, p] of Object.entries(map.places)) {
    const pos: [number, number] = [p[0], p[1]];
    if (id === snap.userId) {
      places.push({ id, pos, kind: "me", name: snap.username, color: allianceColor(myAlliance), tier: tierOf(myRate) });
      continue;
    }
    const r = snap.rivals.find((x) => x.id === id);
    if (!r) continue;
    places.push({
      id,
      pos,
      kind: r.isLord ? "lord" : "player",
      name: r.name,
      color: r.isLord ? undefined : allianceColor(allianceIdOf(r.allianceName)),
      tier: r.isLord ? 1 : tierOf(r.rate),
      difficulty: r.difficulty,
      aggressive: r.isLord && !r.retaliateOnly && (r.difficulty ?? 1) > 1,
      blazon: r.blazon,
      shielded: r.shieldUntil > now,
      curfew: r.curfew,
      allied: r.allied,
      atWar: r.atWar,
    });
  }
  const marches: BoardMarch[] = !mine
    ? []
    : (snap.state.marches ?? []).flatMap((m) => {
        const camp = m.target.startsWith("camp:") ? ev?.camps?.find((c) => `camp:${ev?.id}:${c.id}` === m.target) : undefined;
        const target =
          m.target === "fortress"
            ? map.fortress
            : m.target.startsWith("convoy:") || m.target.startsWith("siege:")
              ? ev?.pos
              : m.target.startsWith("event:") || m.target.startsWith("mine:") || m.target.startsWith("treasure:")
                ? evPos
                : camp
                  ? camp.pos
                  : m.target.startsWith("hall:")
                    ? map.halls?.find((h) => `hall:${h.id}` === m.target)?.pos
                    : map.places[m.target];
        if (!target) return [];
        const f =
          m.status === "camp"
            ? 1
            : m.status === "out"
              ? Math.min(1, Math.max(0, (now - m.departAt) / Math.max(1, m.arriveAt - m.departAt)))
              : Math.min(1, Math.max(0, (m.returnAt - now) / Math.max(1, m.arriveAt - m.departAt)));
        return [{ id: m.id, from: [mine[0], mine[1]], to: [target[0], target[1]], f, status: m.status }];
      });
  // E7 : mes espions en route, comme de petites armées.
  const spyMarches: BoardMarch[] = !mine
    ? []
    : (live.spies ?? []).flatMap((sp) => {
        const to = sp.target === "fortress" ? map.fortress : sp.target.startsWith("hall:") ? map.halls?.find((h) => `hall:${h.id}` === sp.target)?.pos : map.places[sp.target];
        if (!to || sp.arriveAt <= now) return [];
        const f = Math.min(1, Math.max(0, (now - sp.departAt) / Math.max(1, sp.arriveAt - sp.departAt)));
        return [{ id: `spy-${sp.id}`, from: [mine[0], mine[1]] as [number, number], to: [to[0], to[1]] as [number, number], f, status: "out" as const }];
      });
  marches.push(...spyMarches);
  const incoming = (snap.incoming ?? []).map((i) => {
    const from = i.from ? snap.rivals.find((r) => r.name === i.from) : undefined;
    const at = from ? map.places[from.id] : undefined;
    return { id: i.id, from: at ? ([at[0], at[1]] as [number, number]) : null };
  });
  const pickedPos = picked ? map.places[picked] : undefined;
  const pickedDistance = placeDistance(pickedPos);
  const army = cleanArmy({ ...live.troops } as Army);
  const travel =
    pickedPos && pickedDistance !== null
      ? { to: [pickedPos[0], pickedPos[1]] as [number, number], label: `≈ ${Math.round(travelMs(armySize(army) > 0 ? army : ({ piquier: 1 } as Army), pickedDistance, armySpeedBonus(live)) / 60_000)} min` }
      : null;
  return (
    <>
      <div className="map-tools">
        <button className="btn" aria-pressed={names} onClick={toggleNames}>
          🏷️ Noms
        </button>
        <button className="btn" aria-pressed={zoomed} onClick={() => setZoomed((z) => !z)}>
          {zoomed ? "🗺️ Ensemble" : "🔍 Zoom"}
        </button>
      </div>
      <div className={`kingdom-map${zoomed ? " zoomed" : ""}`}>
        <div className="map-scroll" ref={scroller}>
          <MapBoard
            size={map.size}
            belfry={[map.belfry[0], map.belfry[1]]}
            fortress={[map.fortress[0], map.fortress[1]]}
            fortressName={snap.fortress.name}
            fortressColor={allianceColor(snap.fortress.holderId)}
            stagesDone={stagesDoneAt(worldFrom(snap.worksite), now)}
            stagesTotal={STAGES.length}
            places={places}
            event={ev}
            now={now}
            marches={marches}
            incoming={incoming}
            onMarch={(id) => showMove?.(id)}
            picked={picked}
            onPick={setPicked}
            showNames={names || zoomed}
            travel={travel}
            meColor={allianceColor(myAlliance)}
            halls={(map.halls ?? []).map((h) => ({
              id: h.id,
              pos: [h.pos[0], h.pos[1]] as [number, number],
              name: h.name,
              color: h.allianceId !== null ? allianceColor(h.allianceId) : undefined,
              stage: h.stage,
              maxStages: h.lodge ? 4 : 10,
              lodge: h.lodge,
              mine: h.allianceId !== null ? h.allianceId === myAlliance : snap.guild?.lodge === true && !!snap.guild.hall && snap.guild.hall.pos[0] === h.pos[0] && snap.guild.hall.pos[1] === h.pos[1],
            }))}
          />
        </div>
        <ul className="map-legend" aria-label="Légende">
          <li>
            <svg viewBox="-20 -24 40 40" aria-hidden>
              <use href="#mg-house1" style={{ ["--roof" as string]: allianceColor(myAlliance) ?? "var(--map-roof)" }} />
            </svg>
            Joueurs (toit aux couleurs de l&apos;alliance)
          </li>
          <li>
            <svg viewBox="-20 -24 40 40" aria-hidden>
              <use href="#mg-lord2" />
            </svg>
            Seigneurs (plus grands, plus redoutables)
          </li>
          <li>
            <svg viewBox="-20 -22 40 40" aria-hidden>
              <use href="#mg-flag" />
            </svg>
            Ton armée en route
          </li>
          <li>
            <svg viewBox="-20 -14 40 30" aria-hidden>
              <path d="M-17 10 A17 17 0 0 1 17 10" className="map-shield" />
            </svg>
            Sous bouclier
          </li>
        </ul>
      </div>
      {rival ? (
        <>
          <p className="raid-state num">
            📍 {rival.name} · {(pickedDistance ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} cases{travel ? ` · ${travel.label}` : ""}
          </p>
          {rival.allied ? (
            <p className="note">🤝 Allié : renforts depuis l&apos;onglet Alliance.</p>
          ) : (
            <div className="list">
              <RivalRow
                r={rival}
                now={now}
                busy={busy}
                onRaid={(t, troops, allies) => act(t, { type: "raid", target: t, troops, allies })}
                distance={pickedDistance ?? undefined}
                onSpy={(t) => act(t, { type: "spy", target: t })}
                spyPrice={spyPrice}
                stone={live.stone}
                onSabotage={(t, aim) => act(t, { type: "sabotage", target: t, aim })}
                onMole={(t) => act(t, { type: "mole", target: t })}
                stagesDone={stagesDoneAt(worldFrom(snap.worksite), now)}
                me={live}
              />
            </div>
          )}
        </>
      ) : (
        <p className="empty">Touche un lieu pour ouvrir sa fiche.</p>
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
function RoundsReport({ log, open = false, details }: { log: NonNullable<ChronicleEntry["details"]["log"]>; open?: boolean; details?: ChronicleEntry["details"] }) {
  // R10 : avec les armées de départ, on montre ce qu'il reste de chaque camp, type par type, après chaque round.
  const aStart = details?.attackerStart;
  const dStart = details?.defenderStart;
  const left = (start: Record<string, number>, upTo: number, side: "attackerLost" | "defenderLost") => {
    const out = { ...start };
    for (const r of log.slice(0, upTo)) for (const [id, n] of Object.entries(r[side])) out[id] = Math.max(0, (out[id] ?? 0) - (n ?? 0));
    return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
  };
  return (
    <details className="rounds" open={open}>
      <summary>{aStart ? "Rapport de combat" : "Déroulé"} en {log.length} round{log.length > 1 ? "s" : ""}</summary>
      {aStart && dStart && (
        <p className="num">
          Au départ : l&apos;assaillant {armyIcons(aStart, "rien")}, le défenseur {armyIcons(dStart, "rien")}.
        </p>
      )}
      <ol>
        {log.map((r, i) => (
          <li key={i}>
            <strong>Round {i + 1}</strong> · l&apos;assaillant perd {armyIcons(r.attackerLost, "rien")}, le défenseur perd {armyIcons(r.defenderLost, "rien")}.{" "}
            {aStart && dStart ? (
              <>
                Restent {armyIcons(left(aStart, i + 1, "attackerLost"), "personne")} contre {armyIcons(left(dStart, i + 1, "defenderLost"), "personne")}.
              </>
            ) : (
              <>
                Restent <span className="num">{formatNumber(r.attackerLeft)}</span> contre <span className="num">{formatNumber(r.defenderLeft)}</span>.
              </>
            )}
          </li>
        ))}
      </ol>
      {details && (details.attackerLost || details.defenderLost) && (
        <p className="num">
          Bilan : l&apos;assaillant perd {armyIcons(details.attackerLost ?? {}, "rien")}
          {details.attackerWounded && Object.keys(details.attackerWounded).length ? ` (dont blessés ${armyIcons(details.attackerWounded)})` : ""}, le défenseur perd{" "}
          {armyIcons(details.defenderLost ?? {}, "rien")}
          {details.defenderWounded && Object.keys(details.defenderWounded).length ? ` (dont blessés ${armyIcons(details.defenderWounded)})` : ""}
          {(details.stolen ?? 0) > 0 ? ` · butin ${formatNumber(details.stolen ?? 0)} 🪨` : ""}
          {(details.ransom ?? 0) > 0 ? ` · rançon ${formatNumber(details.ransom ?? 0)} 🪨` : ""}.
        </p>
      )}
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
              {n > 0 && (
                <span className="row-count num" title={`${n.toLocaleString("fr-FR")} ${d.name.toLowerCase()}, d'une valeur de ${formatNumber(n * d.cost)} pierres`}>
                  {formatNumber(n)} · {formatNumber(n * d.cost)} 🪨
                </span>
              )}
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
          <Btn className="btn btn-primary" reason={d.cost * qty > live.stone ? "Pas assez de pierre." : null} onClick={() => buy(kind, d.id)}>
            +{qty}
            <span className="cost num">{formatNumber(d.cost * qty)} 🪨</span>
          </Btn>
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
          🩹 {formatNumber(Object.values(live.wounded ?? {}).reduce((a, b) => a + (b ?? 0), 0))} blessés · retour {new Date(live.healAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
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
