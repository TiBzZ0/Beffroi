"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { setS2Map } from "@/lib/game/s2/rules";
import { setAnnexed, setCamps, setLordNames, setVassals } from "@/lib/game/s2/convoys";
import { setTrades } from "@/lib/game/s2/players";
import type { S2WorldView } from "@/lib/game/types";

/** Vague B : suzerains et noms des seigneurs, pour que le calcul des routes du navigateur suive celui du serveur. */
function syncLords(world: S2WorldView, me: string): void {
  setVassals(Object.fromEntries(world.lords.filter((l) => l.vassal).map((l) => [l.id, { owner: l.vassal!.owner, alliance: l.vassal!.alliance, until: l.vassal!.until }])));
  setLordNames(Object.fromEntries(world.lords.map((l) => [l.id, l.name])));
  // Mêmes registres que le serveur, pour l'aperçu : fiefs annexés, camps de bandits, mes routes commerciales.
  setAnnexed(Object.fromEntries(world.lords.filter((l) => l.annexed).map((l) => [l.id, { alliance: l.annexed!.alliance, since: l.annexed!.since, members: l.annexed!.members }])));
  setCamps((world.camps ?? []).map((c) => ({ id: c.id, pos: c.pos, from: c.from })));
  setTrades({ [me]: (world.trades ?? []).filter((t) => t.active && t.since !== undefined).map((t) => ({ to: t.to, name: t.name, pos: t.pos, since: t.since! })) });
}
import { S2MapScreen } from "@/components/s2-map";
import { placeOf, S2Domain, S2Lands, S2ResourceBar, type Place } from "@/components/s2-domain";
import { S2Guide, S2Tutorial } from "@/components/s2-tutorial";
import { setIronArmy } from "@/lib/game/companies";
import { RANKS } from "@/lib/game/s2/map";
import { VALUE } from "@/lib/game/s2/economy";
import { signOut } from "@/app/(auth)/actions";
import {
  setSeasonRules,
  setS2Geometry,
  MAX_ALLIANCE_SIZE,
  HALL,
  fortressBonus,
  HALL_ALL,
  ONLINE_MS,
  COMBATANTS,
  LEVEL_BONUS,
  UNIT_SPEED,
  SPY_INTEL_MS,
  MAX_TITHE,
  ADVISED_TITHE,
  DONOR_TIER_ECUS,
  DONOR_TIER_BONUS,
  CURFEW_MINUTES,
  LOT_ECUS,
  MASTER_BONUSES,
  type MasterBonusKind,
  ACADEMY_SPEED,
  RESEARCH_QUEUE_MAX,
  RESEARCH_REFUND,
  STAGES,
  LEGACY,
  TOTAL_STAGES,
  stageDef,
  embellishmentOf,
  UNITS,
  SPY_LEVEL_MAX,
  WINGS,
  type CombatantDef,
  type CombatantId,
  type HallUnit,
  MAP_SPAWN_RADIUS,
  mapDistance,
} from "@/lib/game/config";
import {
  donorThresholds,
  advance,
  spyRisk,
  spyTravelMs,
  armySpeedBonus,
  spyCost,
  academyCost,
  levelOf,
  queuedLevel,
  researchCost,
  researchTime,
  stagesDoneAt,
  travelMs,
  counterCost,
  spyBase,
  researchBase,
  rumorCost,
  type SabotageAim,
  type PlayerState,
  INBOX_CATEGORIES,
  type InboxCategory,
} from "@/lib/game/engine";
import { formatNumber } from "@/lib/game/format";
import { armySize, armyValue, cleanArmy, type Army } from "@/lib/game/battle";
import { worldFrom, type GameAction, type AwaySummary, type LotView, type AllianceSummary, type ChronicleEntry, type EventView, type GameSnapshot, type RivalView } from "@/lib/game/types";
import { useChat, useGame, useLeaderboard, usePush, useTick } from "./use-game";
import { BRANCHES, lineageMark, NODE_BY_ID, NODES, nodeBlocker, nodeEffect, RANK_COST, RANK_REQUIRED, RENOWN, RENOWN_CAPPED, RESPEC_FEE, respecBlocker, spentIn, type BranchId } from "@/lib/game/lineage";
import { allocation, BARRACKS_MAX, companyEta, barracksMs, barracksBlocker, barracksCost, barracksLevel, COMPANY_CAP, maxCompanies, RECRUIT_MS, recruitPrice, recruitSlots, trainBlocker, trainCost, trainMs, TRAIN_MAX } from "@/lib/game/companies";
import { CAPTAIN_COST, CAPTAINS_MAX, captainLevel, captainOf, HUNT_TARGETS, RARITY_LABEL, RELICS, RELICS_MAX, relicOf, TRAITS } from "@/lib/game/captains";
import { ALTERATIONS, riftCompanyBlocker, riftFightBlocker, riftOf, RIFT_IDLE_MS, RIFT_MAX_COMPANIES, SHAPES, type AlterationId } from "@/lib/game/rift";
import { CHAT_MAX_LENGTH, CHAT_REACTIONS, type ChatChannel } from "@/lib/game/chat-config";
import { changelogFor } from "@/lib/game/changelog";

type Tab = "ateliers" | "chantier" | "armee" | "carte" | "raids" | "alliance" | "messages" | "classement" | "heritage" | "lignee" | "faille";
/** U3 : sept onglets, certains avec des sous-onglets. */
type Group = "domaine" | "chantier" | "armee" | "carte" | "alliance" | "messages" | "rangs";
const GROUPS: Record<Group, Tab[]> = {
  domaine: ["ateliers"],
  chantier: ["chantier"],
  armee: ["armee"],
  carte: ["carte", "raids", "faille"],
  alliance: ["alliance"],
  messages: ["messages"],
  rangs: ["classement", "lignee", "heritage"],
};
const SUBTAB_LABELS: Partial<Record<Tab, string>> = { ateliers: "Concessions", carte: "Carte", raids: "Cibles", faille: "🌀 Faille", classement: "Classements", lignee: "Lignée", heritage: "Héritage" };
const groupOf = (t: Tab): Group => (Object.keys(GROUPS) as Group[]).find((g) => GROUPS[g].includes(t)) ?? "domaine";
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
  // Saison 2 : le lieu où l'on travaille (château ou concession), gardé d'une visite à l'autre.
  const [place, setPlace] = useState<Place>(() => {
    try {
      return localStorage.getItem("beffroi.place") ?? "chateau";
    } catch {
      return "chateau";
    }
  });
  const selectPlace = (p: Place) => {
    setPlace(p);
    try {
      localStorage.setItem("beffroi.place", p);
    } catch {}
    if (groupOf(tab) !== "domaine") selectTab("ateliers");
  };
  const group = groupOf(tab);
  const selectGroup = (g: Group) => selectTab(g === group ? tab : (lastSub[g] ?? GROUPS[g][0]));

  if (!snap) return <div className="loading">On allume les torches…</div>;

  if (!snap.s2) return <div className="loading">La saison se prépare…</div>;

  const now = game.serverNow();
  const world = worldFrom(snap.worksite);
  const stagesDone = stagesDoneAt(world, now);
  // Règles de la saison en cours (géométrie, armée en fer, carte des concessions).
  setSeasonRules(snap.season.number);
  setS2Geometry(true);
  setIronArmy(true);
  setS2Map(snap.s2.map);
  syncLords(snap.s2, snap.userId);
  const live: PlayerState = advance(snap.state, now, world);
  const here = placeOf(live.s2, place);
  const researchDone = tab !== "armee" && researchEnds.some((e) => e <= now && e > armySeenAt);
  const eventLive = isCombatEvent(snap.event) && !!snap.event?.active && snap.event.endsAt > now;
  const subtabs = GROUPS[group].filter((t) => t !== "faille" || !!snap.rift);

  return (
    <SnapContext.Provider value={{ snap, live, now, moveFocus, showMove: (key) => setMoveFocus({ key, at: now }), go: (where, id, army) => {
      setFocus({ id, army, at: now });
      selectTab(where);
    } }}>
    <div className="game">
      <S2Tutorial seasonId={snap.season.id} />
      {game.away && <AwayModal away={game.away} event={snap.event} onClose={game.dismissAway} />}
      <TopBar snap={snap} now={now} />
      <S2Guide seasonId={snap.season.id} live={live} tab={tab} stages={stagesDone} />
      <Movements snap={snap} live={live} now={now} run={game.run} />
      <LastDayBanner snap={snap} now={now} />
      <SeasonEndCard snap={snap} />
      <PushPrompt raided={(snap.chronicle ?? []).some((c) => c.kind === "raid" && c.targetId === snap.userId) || (game.away?.raidsLost.length ?? 0) > 0} />
      <div className="layout s2-layout">
        <aside className="s2-lands-col">
          <S2Lands snap={snap} live={live} now={now} place={here} select={selectPlace} openMap={() => selectTab("carte")} run={game.run} />
        </aside>
        <aside className="s2-side-col">
          <Hero snap={snap} live={live} game={game} />
        </aside>
        <section className={`panel dom-${group} s2-main`}>
          <S2ResourceBar live={live} now={now} place={group === "domaine" ? here : "chateau"} map={snap.s2.map} />
          <div className="tabs" role="tablist">
            <TabButton id="domaine" tab={group} setTab={selectGroup} label="🏰 Domaine" />
            <TabButton id="chantier" tab={group} setTab={selectGroup} label="⛪ Chantier" />
            <TabButton id="armee" tab={group} setTab={selectGroup} label="⚔️ Armée" dot={researchDone} />
            <TabButton id="carte" tab={group} setTab={selectGroup} label={eventLive ? "🗺️ Carte ⚡" : "🗺️ Carte"} dot={eventLive} />
            <TabButton id="alliance" tab={group} setTab={selectGroup} label="🤝 Alliance" dot={snap.invites.length > 0} />
            <TabButton id="messages" tab={group} setTab={selectGroup} label="✉️ Messages" dot={tab !== "messages" && unreadCount(snap, live, now) > 0} />
            <TabButton id="rangs" tab={group} setTab={selectGroup} label="🏆 Rangs" />
          </div>
          {subtabs.length > 1 && (
            <div className="subtabs group-subtabs" role="group" aria-label="Sections">
              {subtabs.map((t) => (
                <button key={t} className="btn btn-small" aria-pressed={tab === t} onClick={() => selectTab(t)} data-tuto={`tab-${t}`}>
                  {SUBTAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}
          <div className="tab-body" role="tabpanel">
            {tab === "ateliers" && <S2Domain snap={snap} live={live} now={now} run={game.run} place={here} select={selectPlace} />}
            {tab === "chantier" && <Worksite snap={snap} live={live} run={game.run} />}
            {tab === "armee" && <Army snap={snap} live={live} now={now} run={game.run} />}
            {tab === "carte" && <S2MapScreen snap={snap} live={live} now={now} run={game.run} />}
            {tab === "raids" && <Raids snap={snap} live={live} now={now} run={game.run} focus={focus} />}
            {tab === "alliance" && <AllianceTab snap={snap} live={live} now={now} run={game.run} />}
            {tab === "messages" && <Inbox snap={snap} live={live} now={now} run={game.run} userId={userId} />}
            {tab === "classement" && <Ranking boards={leaderboard} userId={userId} />}
            {tab === "heritage" && <Heritage snap={snap} run={game.run} />}
            {tab === "lignee" && <Lineage snap={snap} now={now} run={game.run} />}
            {tab === "faille" && snap.rift && <Rift snap={snap} live={live} now={now} run={game.run} />}
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

/** B3 : ce qui s'est passé pendant l'absence (30 minutes ou plus). */
function AwayModal({ away, event, onClose, s2 = false }: { away: AwaySummary; event: EventView | null | undefined; onClose: () => void; s2?: boolean }) {
  const lines: string[] = [];
  lines.push(s2 ? `⛏️ Tes concessions ont livré ${formatNumber(away.produced)} en valeur pierre.` : `⛏️ Tes ateliers ont produit ${formatNumber(away.produced)} pierres.`);
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
  if (event) lines.push(event.kind === "colosse" ? "🗿 Un colosse est en cours, va le frapper dans Carte › Cibles." : "🐫 Une caravane passe, va la piller dans Carte › Cibles.");
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

/** Notes de version : plus de fenêtre au démarrage, une pastille sur le bouton tant qu'il y a du nouveau. */
function ChangelogButton({ season }: { season: number }) {
  const [open, setOpen] = useState(false);
  const last = changelogFor(season).at(-1)?.id ?? 0;
  // Rendu seulement côté navigateur (le jeu attend sa première synchronisation) : on peut lire le stockage tout de suite.
  const [seen, setSeen] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("beffroi.changes") ?? 0);
    } catch {
      return last;
    }
  });
  const fresh = last > seen;
  const show = () => {
    setOpen(true);
    try {
      localStorage.setItem("beffroi.changes", String(last));
    } catch {
      // pas de stockage : la pastille reviendra
    }
    setSeen(last);
  };
  return (
    <>
      <button className="btn btn-ghost changelog-btn" title={fresh ? "Du nouveau dans le jeu" : "Ce qui change"} aria-label={fresh ? "Voir ce qui change (nouveautés non lues)" : "Voir ce qui change (patchnote)"} onClick={show}>
        📜
        {fresh && <span className="dot" aria-hidden />}
      </button>
      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Ce qui change" onClick={() => setOpen(false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <h2>📜 Ce qui change</h2>
            {[...changelogFor(season)].reverse().map((c) => (
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
          {lineageMark(snap.state.lineage) && <span title="Lignée"> {lineageMark(snap.state.lineage)}</span>}
          {snap.renown && (
            <span className="badge badge-renown num" title="Renom disponible">
              🎖️ {snap.renown.available}
            </span>
          )}
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
        <ChangelogButton season={snap.season.number} />
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
  const label = (id: string) => HALL_ALL.find((h) => h.id === id)?.title ?? id;
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

/** L2, L3 : la Lignée, trois branches de nœuds achetés en renom. */
export function Lineage({ snap, now, run }: { snap: GameSnapshot; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  const [branch, setBranch] = useState<BranchId>(() => {
    const top = (snap.state.lineage?.nodes ?? []).map((id) => NODE_BY_ID.get(id)?.branch).find(Boolean);
    return top ?? "batisseur";
  });
  const [open, setOpen] = useState<string | null>(null);
  const r = snap.renown ?? { earned: 0, available: 0, today: {} };
  const l = snap.state.lineage;
  const nodes = l?.nodes ?? [];
  const act = async (action: Parameters<typeof run>[0]) => {
    setBusy(true);
    await run(action);
    setBusy(false);
  };
  return (
    <>
      <div className="block-head">
        <h3 className="section-title">🎖️ Lignée</h3>
        <Info>
          Le renom se gagne en jouant : raids gagnés (3), défenses réussies (2), seigneurs battus (1), reconnaissances réussies (1), quêtes du jour (3),
          participation à un événement (2, et 3 de plus sur le podium), étape finie avec au moins un palier de don (10). Rien pour un raid dans ta propre
          alliance ou contre un compte de la même adresse. Les limites du jour se remettent à zéro à minuit, heure de Paris. Chaque branche a quatre rangs :
          pour prendre un nœud du rang 2, 3 ou 4, il faut avoir dépensé 6, 24 ou 50 renom dans la branche. Un seul nœud de rang 4 dans toute la Lignée : son
          icône s&apos;affiche à côté de ton nom. Changer de voie rend tout sauf 10 renom, une fois par jour. C&apos;est un essai : tout repart de zéro avec la
          saison suivante.
        </Info>
      </div>
      <div className="lin-head">
        <span className="chip num chip-gain">🎖️ {r.available} disponible{r.available > 1 ? "s" : ""}</span>
        <span className="chip num">{r.earned - r.available} dépensé{r.earned - r.available > 1 ? "s" : ""}</span>
        <Btn className="btn btn-small" busy={busy} reason={respecBlocker(l, now)} onClick={() => void act({ type: "lineage_respec" })}>
          🔄 Changer de voie <span className="cost num">−{RESPEC_FEE} 🎖️</span>
        </Btn>
      </div>
      <div className="report-chips lin-gauges">
        {RENOWN_CAPPED.map((k) => (
          <span key={k} className={`chip num${(r.today[k] ?? 0) >= (RENOWN[k].cap ?? 0) ? " chip-full" : ""}`}>
            {RENOWN[k].icon} {RENOWN[k].label} {r.today[k] ?? 0}/{RENOWN[k].cap}
          </span>
        ))}
        {(["quest", "event", "podium", "stage"] as const).filter((k) => (r.today[k] ?? 0) > 0).map((k) => (
          <span key={k} className="chip num">
            {RENOWN[k].icon} {RENOWN[k].label} +{r.today[k]}
          </span>
        ))}
      </div>
      <div className="subtabs lin-tabs" role="group" aria-label="Branches">
        {BRANCHES.map((b) => (
          <button key={b.id} className="btn btn-small" aria-pressed={branch === b.id} onClick={() => setBranch(b.id)}>
            {b.icon} {b.name}
            <span className="num"> {spentIn(nodes, b.id)}</span>
          </button>
        ))}
      </div>
      <div className="lin-grid">
        {BRANCHES.map((b) => (
          <div key={b.id} className={`lin-col${branch === b.id ? " on" : ""}`}>
            <h4 className="hall-sub lin-col-title">
              {b.icon} {b.name} <span className="num">· {spentIn(nodes, b.id)} 🎖️</span>
            </h4>
            {([1, 2, 3, 4] as const).map((rank) => (
              <div key={rank} className="lin-rank">
                <div className="lin-rank-label num">
                  Rang {rank}
                  {RANK_REQUIRED[rank] > 0 ? ` · dès ${RANK_REQUIRED[rank]}` : ""}
                </div>
                {NODES.filter((n) => n.branch === b.id && n.rank === rank).map((n) => {
                  const owned = nodes.includes(n.id);
                  const why = owned ? null : nodeBlocker(l, n.id, r.available);
                  const state = owned ? "owned" : why ? "locked" : "open";
                  const isOpen = open === n.id;
                  return (
                    <div key={n.id} className={`lin-node ${state}${isOpen ? " expanded" : ""}`}>
                      <button className="lin-node-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : n.id)}>
                        <span aria-hidden>{n.icon}</span>
                        <span className="lin-node-name">{n.name}</span>
                        <span className="num lin-node-cost">{owned ? "✓" : `${RANK_COST[rank]} 🎖️`}</span>
                      </button>
                      {isOpen && (
                        <div className="lin-node-body">
                          <p className="row-desc">{nodeEffect(n)}</p>
                          {!owned && (
                            <Btn className="btn btn-primary btn-small" busy={busy} reason={why} onClick={() => void act({ type: "lineage_buy", node: n.id })}>
                              Prendre <span className="cost num">{RANK_COST[rank]} 🎖️</span>
                            </Btn>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
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
              <Btn className="btn btn-primary" busy={busy} reason={maxed ? "Niveau maximal atteint." : cost > ecus ? "Pas assez d'écus." : null} onClick={() => void buy(l.id)}>
                {maxed ? "Max" : `Niv. ${level + 1}`}
                {!maxed && <span className="cost num">{cost} 🪙</span>}
              </Btn>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TabButton<T extends string>({ id, tab, setTab, label, dot }: { id: T; tab: T; setTab: (t: T) => void; label: string; dot?: boolean }) {
  return (
    <button className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-tuto={`group-${id}`}>
      {label}
      {dot && <span className="dot" aria-label="nouveautés" />}
    </button>
  );
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

function Hero({ snap, live, game }: { snap: GameSnapshot; live: PlayerState; game: ReturnType<typeof useGame> }) {
  const now = game.serverNow();
  const w = snap.worksite;
  const finished = w.stage >= TOTAL_STAGES;
  const embellish = embellishmentOf(w.stage);
  const pct = finished ? 100 : Math.min(100, (w.progress / Math.max(1, w.target)) * 100);

  return (
    <section className="panel hero hero-s2">
      <DailyCard daily={snap.daily} now={now} run={game.run} />
      <EventBanner e={snap.event} now={now} />
      <Status state={live} now={now} />
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
      {!finished && <ShareLine snap={snap} />}
      {!finished && !snap.state.titheSet && <TitheBanner run={game.run} />}
      <ResearchLine state={snap.state} now={now} />
    </section>
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
            <div key={s.name} className={`stage${done ? " done" : current ? "" : " upcoming"}`} title={s.description}>
              <div className="stage-head">
                <span className="stage-name">
                  {i < STAGES.length ? `${i + 1}. ` : "✨ "}
                  {s.name}
                </span>
                <span className="stage-status">
                  {done ? `✓${at ? ` ${new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}` : current ? `${Math.floor(pct)} %` : "—"}
                </span>
              </div>
              <div className="stage-bonus">🎁 {s.bonusLabel}</div>
              {snap.masters?.[i] && <div className="stage-bonus">👑 Maître d&apos;œuvre : {snap.masters[i]}</div>}
              {current && (
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
              {current && <div className="row-desc">{s.description}</div>}
            </div>
          );
        })}
      </div>
      {(snap.lots ?? []).length > 0 && <Lots lots={snap.lots ?? []} now={snap.serverNow} run={run} />}
      <div className="row-title">{finished ? "🪨 Orner" : "🪨 Verser"}</div>
      <div className="contrib" data-tuto="contribute">
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
      <div className="report-chips rival-chips">
        <span className="chip num" title="Tout ce que tu as versé cette saison">🪨 {formatNumber(snap.state.totalContributed)}</span>
        <span className="chip num" title="Bâtisseurs actifs cette semaine">👷 {w.activePlayers}</span>
      </div>
      <Info>Chaque étape vaut plusieurs heures de la production des bâtisseurs actifs de la semaine (24 h pour un embellissement), fixée à son ouverture.</Info>
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
          <strong>👑 Maître d&apos;œuvre !</strong> Bonus de 24 h (production par défaut) :
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
                🧱 {formatNumber(l.myGiven ?? 0)} / {formatNumber(l.myShare)}
                {(l.myGiven ?? 0) >= l.myShare * 0.25 ? " · ✓ prime" : ` · prime à ${formatNumber(l.myShare * 0.25)}`}
              </div>
            )}
            {l.master && l.masterChoice && l.masterUntil && l.masterUntil > now && (
              <div className="note num">👑 {MASTER_BONUSES[l.masterChoice].label} · {new Date(l.masterUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
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
  const tiers = donorThresholds(snap.state, share.stage);
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
        Dîme : <span className="num">{value} %</span>
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
          {boards.rift && (
            <div>
              <h3 className="section-title">🌀 Faille de la semaine</h3>
              <Board rows={boards.rift} userId={userId} empty="Personne n'a encore franchi d'étage." unit="count" />
            </div>
          )}
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
          <p className="empty">🏛️ Premier podium à la fin de cette saison.</p>
        ) : (
          hall.map((season) => (
            <div key={season.season} className="hall-season">
              <h3 className="section-title">
                Saison {season.season} · terminée le {new Date(season.endsAt).toLocaleDateString("fr-FR")}
              </h3>
              <ul className="hall-list">
                {HALL_ALL.map((h) => {
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

/** Onglet Armée : les compagnies, la Forge et l'espionnage. */
function Army({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [view, setView] = useState<ArmyView>("garnison");
  const views: [ArmyView, string][] = [
    ["garnison", "Compagnies"],
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
            Une bataille dure 4 rounds au plus : tes compagnies contre la garnison d&apos;un seigneur. Chaque type de troupe a ses forces et ses faiblesses, et à
            nombre voisin, c&apos;est le nombre de compagnies qui décide. Une partie des pertes revient de l&apos;infirmerie au bout de 30 minutes.
          </Info>
          <Companies live={live} now={now} run={run} renown={snap.renown?.available ?? 0} />
        </>
      )}
      {view === "espionnage" && <Spies snap={snap} live={live} now={now} run={run} />}
      {view === "forge" && <Forge live={live} now={now} run={run} stagesDone={stagesDoneAt(worldFrom(snap.worksite), now)} base={researchBase(live, worldFrom(snap.worksite), now)} />}
    </>
  );
}

/** Saison 2 : les seigneurs sont sur la carte ; ici, la liste par rang, et un bouton pour aller les voir. */
function S2LordList({ snap, now }: { snap: GameSnapshot; now: number }) {
  const go = useContext(SnapContext)?.go;
  const order: Record<string, number> = { hobereau: 0, baron: 1, comte: 2, duc: 3 };
  const lords = [...(snap.s2?.lords ?? [])].sort((a, b) => order[a.rank] - order[b.rank] || a.companies - b.companies);
  return (
    <>
      <Info>
        Les seigneurs tiennent un fief sur la carte. Bats leur garnison pour emporter une part de leur fief (pierre, fer, or) et du fer par compagnie vaincue ; la
        garnison se reforme ensuite. Ils n&apos;attaquent jamais les joueurs. Touche leur écu sur la carte pour voir leur garnison et lancer l&apos;attaque.
      </Info>
      <div className="list">
        {lords.map((l) => (
          <div key={l.id} className="row">
            <div className="row-icon" aria-hidden>
              🛡️
            </div>
            <div>
              <div className="row-title">
                {l.name} <span className="badge">{RANKS[l.rank].name}</span>
              </div>
              <div className="row-desc num">
                {l.reformAt > now ? `Garnison en reformation : ${countdown(l.reformAt - now)}` : `${l.companies} compagnie${l.companies > 1 ? "s" : ""} en garnison`} · case ({l.pos[0]}, {l.pos[1]})
              </div>
            </div>
            {go && (
              <button className="btn btn-small" onClick={() => go("carte", l.id)}>
                🗺️ Voir
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Raids({ snap, live, now, run, focus }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; focus?: Focus | null }) {
  const fresh = focus && now - focus.at < 5000 ? focus : null;
  const [view, setView] = useState<RaidView>(() => (fresh && snap.rivals.find((r) => r.id === fresh.id && !r.isLord) ? "joueurs" : "seigneurs"));
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (target: string, action: Parameters<typeof run>[0]) => {
    setBusy(target);
    await run(action);
    setBusy(null);
  };
  const players = snap.rivals.filter((r) => !r.isLord && !r.allied);
  const castles = snap.s2?.castles ?? [];
  const mine = castles.find((c) => c.me)?.pos;
  const distanceTo = (id: string) => {
    const there = castles.find((c) => c.id === id)?.pos;
    return mine && there ? mapDistance(mine, there) : MAP_SPAWN_RADIUS;
  };
  const views: [RaidView, string][] = [
    ["seigneurs", `Seigneurs (${snap.s2?.lords.length ?? 0})`],
    ["joueurs", `Joueurs (${players.length})`],
  ];

  return (
    <>
      <div className="subtabs" role="group" aria-label="Sections des cibles">
        {views.map(([id, label]) => (
          <button key={id} className="btn" aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {snap.event?.kind === "tournoi" && snap.event.active && <TourneyCard e={snap.event} live={live} now={now} run={run} />}
      {snap.event && snap.event.kind !== "tournoi" && (
        <EventCard
          e={snap.event}
          now={now}
          busy={busy !== null}
          onAttack={() => act("event", { type: "event_attack" })}
          history={(snap.chronicle ?? []).filter((c) => c.kind === "event" && c.details.phase === "attack" && c.details.eventId === snap.event?.id)}
          me={snap.userId}
        />
      )}
      {view === "seigneurs" && <S2LordList snap={snap} now={now} />}
      {view === "joueurs" && (
        <>
          <Info>
            On ne pille pas les autres joueurs pour l&apos;instant : les raids reviendront avec la prochaine vague, sur les concessions et les convois. Tu peux
            déjà espionner, poser une taupe ou saboter une académie ou un guet, payés en or.
          </Info>
          <div className="list">
            {players.length === 0 && <p className="empty">Aucun autre joueur hors de ton alliance.</p>}
            {players.map((r) => (
              <PlayerRow key={r.id} r={r} live={live} now={now} busy={busy} distance={distanceTo(r.id)} focus={fresh?.id === r.id} act={act} spyPrice={spyCost(live, worldFrom(snap.worksite), now)} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

const SABOTAGE_AIMS: [SabotageAim, string, string][] = [
  ["academie", "🎓 Académie", "un niveau perdu, recherche retardée"],
  ["guet", "🔭 Guet", "aucune alerte d'approche pendant 1 h"],
];

/** Un autre joueur dans Cibles : renseignement et sabotage, sans raid. */
function PlayerRow({ r, live, now, busy, distance, focus, act, spyPrice }: { r: RivalView; live: PlayerState; now: number; busy: string | null; distance: number; focus: boolean; act: (target: string, action: GameAction) => Promise<void>; spyPrice: number }) {
  const [aiming, setAiming] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);
  const gold = live.s2?.gold ?? 0;
  const short = (price: number) => (gold < price ? "Pas assez d'or." : null);
  const intel = r.intelUntil > now;
  const sabotagePrice = r.sabotageCost ?? 0;
  return (
    <div className="row" ref={rowRef}>
      <div className="row-icon" aria-hidden>
        🛡️
      </div>
      <div>
        <div className="row-title">
          {r.name}
          {r.mark ? ` ${r.mark}` : ""}
          {r.allianceName && <span className="badge">🤝 {r.allianceName}</span>}
          {r.atWar && <span className="badge badge-revenge">⚔️ en guerre</span>}
          {(r.titles ?? []).map((t) => (
            <span key={t} className="badge badge-title">
              {t}
            </span>
          ))}
          <Presence lastSeen={r.lastSeen} now={now} />
        </div>
        <div className="row-desc army-line num" title={r.armyHint ? "Vue de loin : envoie un espion pour voir l'armée exacte" : "Armée exacte"}>
          {r.armyHint ? `Armée ${r.armyHint} que la tienne` : intel ? `🕵️ ${armyIcons(r.army)} (rapport encore ${duration(r.intelUntil - now)})` : armyIcons(r.army)}
        </div>
        {(r.rumorUnmasked || (r.moleUntil ?? 0) > now) && (
          <div className="row-desc num">{[r.rumorUnmasked ? "🗣️ rumeur démasquée" : null, (r.moleUntil ?? 0) > now ? `🐀 ${duration((r.moleUntil ?? 0) - now)}` : null].filter(Boolean).join(" · ")}</div>
        )}
        {intel && <SpyReport r={r} now={now} />}
      </div>
      <div className="row-actions">
        <Btn
          busy={busy !== null}
          reason={short(spyPrice)}
          onClick={() => act(r.id, { type: "spy", target: r.id })}
          title="L'espion part sur la route ; son rapport dure 1 h et profite à ton alliance. Ce qu'il voit dépend de l'écart entre ton niveau d'espionnage et celui de la cible."
        >
          🕵️ Espion
          <span className="cost num">
            {formatNumber(spyPrice)} 🪙 · {countdown(spyTravelMs(distance))}
            {r.spyGap !== null && r.spyGap !== undefined ? ` · 👁️ ${Math.round(spyRisk(r.spyGap, distance) * 100)} %` : ""}
          </span>
        </Btn>
        {r.moleUntil !== undefined && r.moleUntil <= now && (
          <Btn
            busy={busy !== null}
            reason={short(r.molePrice ?? 0)}
            onClick={() => act(r.id, { type: "mole", target: r.id })}
            title="La taupe s'installe tout de suite pour 2 h : elle te prévient quand il fait partir une armée. Il faut un niveau d'espionnage au moins un cran au-dessus du sien. Elle peut être démasquée, à demi-risque, à chaque alerte."
          >
            🐀 Taupe
            <span className="cost num">{formatNumber(r.molePrice ?? 0)} 🪙</span>
          </Btn>
        )}
        {r.sabotageBlocker !== undefined && (
          <Btn busy={busy !== null} reason={short(sabotagePrice)} onClick={() => setAiming(!aiming)} title="Choisis ce que vise ton saboteur. La réussite dépend de l'écart de niveau d'espionnage ; raté, il est toujours repéré.">
            🧨 Sabotage
            <span className="cost num">{formatNumber(sabotagePrice)} 🪙</span>
          </Btn>
        )}
      </div>
      {aiming && r.sabotageBlockers && (
        <div className="row-actions">
          {SABOTAGE_AIMS.map(([aim, label, desc]) => (
            <Btn
              key={aim}
              busy={busy !== null}
              reason={r.sabotageBlockers![aim] ?? short(sabotagePrice)}
              title={desc}
              onClick={() => {
                setAiming(false);
                void act(r.id, { type: "sabotage", target: r.id, aim });
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

/** Onglet Alliance : fondation, invitations, alliés et renforts. */
export function AllianceTab({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
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

/** Titre de bloc avec son seul ⓘ à droite. */
function BlockHead({ title, info }: { title: React.ReactNode; info?: React.ReactNode }) {
  return (
    <div className="block-head">
      <h3 className="section-title">{title}</h3>
      {info ? <Info>{info}</Info> : null}
    </div>
  );
}

/** U1 : compte à rebours, mm:ss sous une heure, « 1 h 12 » au-dessus. */
function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}\u00a0h\u00a0${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** U1 : heure à la seconde. */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** U1 : nom lisible d'une cible de marche ou d'espion. */
function targetName(snap: GameSnapshot, id: string): string {
  if (id === "fortress" || id.startsWith("fortress:")) return (snap.fortresses ?? [snap.fortress]).find((f) => (f.idx ?? 0) === (id === "fortress" ? 0 : Number(id.slice(9))))?.name ?? snap.fortress.name;
  if (id.startsWith("event:")) return snap.event?.kind === "colosse" ? "Colosse" : "Caravane";
  if (id.startsWith("mine:")) return "Filon";
  if (id.startsWith("treasure:")) return "Trésor";
  if (id.startsWith("camp:") || snap.s2?.camps?.some((k) => k.id === id)) return "Camp de bandits";
  if (id.startsWith("convoy:")) return "Convoi";
  if (id.startsWith("siege:")) return "Beffroi";
  if (id.startsWith("hall:")) return snap.map?.halls?.find((h) => `hall:${h.id}` === id)?.name ?? "Halle";
  // Vague B : contrat d'un seigneur (« jour:seigneur »).
  const contract = /^\d+:(.+)$/.exec(id);
  if (contract) return `Contrat de ${snap.s2?.lords.find((l) => l.id === contract[1])?.name ?? "seigneur"}`;
  return snap.rivals.find((r) => r.id === id)?.name ?? snap.s2?.lords.find((l) => l.id === id)?.name ?? snap.s2?.castles.find((c) => c.id === id)?.name ?? "?";
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

const MARCH_ICON: Record<string, string> = { raid: "⚔️", reinforce: "🛡️", station: "🛡️", hall_station: "🛡️", fortress: "🏰", hall_siege: "🏛️", event: "🎪", pillage: "⛏️", contract: "📜", intercept: "🏇", camp: "🏕️" };

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
  const nameOf = (key: string) => (key === "fortress" || key.startsWith("fortress:") ? ((snap.fortresses ?? []).find((f) => `fortress:${f.idx}` === key)?.name ?? snap.fortress.name) : key.startsWith("hall:") ? "une halle" : (snap.rivals.find((r) => r.id === key)?.name ?? "?"));
  const base = spyBase(live, worldFrom(snap.worksite), now);
  const purse = live.s2 ? live.s2.gold : live.stone;
  const coin = live.s2 ? "🪙" : "🪨";
  const poor = live.s2 ? "Pas assez d'or." : "Pas assez de pierre.";
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
          reason={purse < counterCost(base) ? poor : null}
          onClick={() => act({ type: "counter" })}
          title="Pendant 6 h, quiconque espionne, sabote ou pose une taupe chez toi a deux crans de moins. Un espion repéré chez toi rapporte des chiffres faussés. Racheter prolonge."
        >
          🛡️ Contre
          <span className="cost num">{counter ? `${duration((live.counterUntil ?? 0) - now)} · ` : ""}{formatNumber(counterCost(base))} {coin}</span>
        </Btn>
        {(["fort", "faible"] as const).map((mode) => (
          <Btn
            key={mode}
            busy={busy}
            reason={purse < rumorCost(base) ? poor : null}
            onClick={() => act({ type: "rumor", mode })}
            title={`Pendant 2 h, tout le monde voit ton armée ${mode === "fort" ? "deux fois plus grosse" : "deux fois plus petite"}, rapports d'espion compris, sauf ceux d'un espion au moins deux crans au-dessus de toi.`}
          >
            🗣️ {mode === "fort" ? "Fort" : "Faible"}
            <span className="cost num">{rumor?.mode === mode ? `${duration(rumor.until - now)} · ` : ""}{formatNumber(rumorCost(base))} {coin}</span>
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

const SPY_RESEARCH = { icon: "🕵️", name: "Espionnage" };

/** Forge : académie militaire et améliorations des troupes et fortifications (une recherche à la fois). */
function Forge({ live, now, run, stagesDone, base }: { live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; stagesDone: number; base: number }) {
  // File de recherche : l'état local n'est pas encore « réglé », on ignore ce qui est déjà fini.
  const queue = live.research.filter((r) => r.endsAt > now);
  const full = queue.length >= RESEARCH_QUEUE_MAX;
  const academyPrice = academyCost(live, base);
  const rows = (defs: readonly CombatantDef<string>[]) =>
    defs.map((d) => {
      const id = d.id as CombatantId;
      const lv = levelOf(live, id);
      const next = queuedLevel(live, id) + 1;
      const cost = researchCost(live, id, base);
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
                <div className="row-desc num">{wings.length ? wings.map((w) => `${w.icon} ${t.wings[w.id]}`).join("  ") : "Aucune aile en service"}</div>
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
              <Btn className="btn btn-primary" busy={busy} reason={t.blocker} onClick={() => act({ type: "hall", op: "siege", hall: t.id, wing: target || undefined })}>
                ⚔️ Assaut
                <span className="cost num">≈ {Math.round(t.chance * 100)} %</span>
              </Btn>
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
  const siegeNote = g.targets.length > 0 ? (
    <>
      {" "}⚔️ {"En guerre, une halle peut être prise d'assaut : l'aile visée est hors service 24 h, rien n'est détruit ni volé. La halle est ensuite à l'abri 24 h."}
    </>
  ) : null;
  const h = g.hall;
  if (!h) {
    return (
      <div className="hall">
        <BlockHead
          title={title}
          info={
            <>
          {g.lodge
            ? "Seul, tu peux fonder une petite loge près de ton domaine : 4 étapes et deux ailes au plus. Si tu rejoins une alliance qui a sa halle, la moitié de ce que tu lui as versé y passe."
            : "Un chantier propre à l'alliance, posé sur la carte près de vos domaines. La fondation puis chaque étape terminée donnent un niveau d'aile : production, stock à l'abri, renforts, guet, écuries ou infirmerie. Il y a dix étapes, et dix-huit niveaux possibles."}{" "}
          {g.lodge ? "Ouvre le chantier, puis verse-lui la somme de fondation." : "Une fois le chantier ouvert, toute l'alliance peut y verser, dons et part de dîme compris."}
              {siegeNote}
            </>
          }
        />
        {g.dormantLodge && <p className="note">💤 Loge en attente : la moitié de tes versements rejoindra la halle à sa fondation.</p>}
        <div className="row-actions">
          <Btn className="btn btn-primary" busy={busy} reason={g.chief ? null : `Seul le chef${g.chiefName ? ` (${g.chiefName})` : ""} peut la fonder.`} onClick={() => act({ type: "hall", op: "found" })}>
            🏗️ Fonder
            <span className="cost num">≈ {formatNumber(g.foundCost)} 🪨</span>
          </Btn>
        </div>
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
      <BlockHead
        title={title}
        info={
          <>
            Le reste de ta dîme ({Math.round((live.tithe ?? 0) * 100)} % de ta production) continue d&apos;aller au beffroi. Ce qui est versé ici ne compte ni pour le beffroi, ni
            pour les lots, ni pour les paliers de don, et ne peut être ni repris ni pillé.
            {founding ? " Chantier de fondation : versez ensemble la somme affichée. Une fois fondée, chaque étape donnera un niveau d'aile." : ""}
            {!g.lodge && !founding ? " 🛡️ Les murs valent 10 % de la pierre reçue. Seule une alliance en guerre avec la vôtre peut assiéger la halle. Un assaut réussi met une aile hors service 24 h, sans rien détruire." : ""}
            {siegeNote}
          </>
        }
      />
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
        <div className="report-chips rival-chips">
          <span className="chip num">manque {formatNumber(Math.max(0, h.cost - h.progress))} 🪨</span>
          <span className="chip num chip-gain">ta part {formatNumber(h.gifts.find((x) => x.id === snap.userId)?.amount ?? 0)}</span>
        </div>
      )}
      <label className="hall-tithe">
        Dîme vers {g.lodge ? "la loge" : "la halle"} :{" "}
        <select className="input" value={tithe} disabled={busy} onChange={(e) => act({ type: "hall", op: "tithe", percent: Number(e.target.value) })}>
          {Array.from({ length: 11 }, (_, i) => i * 5).map((p) => (
            <option key={p} value={p}>
              {p} %
            </option>
          ))}
        </select>
      </label>
      <h4 className="hall-sub">
        Ailes · {h.placed}/{h.available} niveaux placés{h.masterLevels > 0 ? ` (dont ${h.masterLevels} offert${h.masterLevels > 1 ? "s" : ""} par le beffroi)` : ""}
      </h4>
      {free > 0 && <p className="note num">✨ {free} à placer{g.chief ? "" : ` par ${g.chiefName ?? "le chef"} (propose ton choix dans le canal d'alliance)`}</p>}
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
                <div className="row-title row-title-one">
                  <span className="row-name">{w.name}</span>
                  <span className="row-count num">{lvl}/3</span>
                </div>
                <div className="row-desc one-line" title={`${lvl > 0 ? w.levels[lvl - 1] : "—"}${lvl < 3 ? ` → ${w.levels[lvl]}` : ""}`}>
                  {down > now ? `🔥 ${duration(down - now)} · ` : ""}
                  {lvl > 0 ? w.levels[lvl - 1] : "—"}
                  {lvl < 3 ? ` → ${w.levels[lvl]}` : ""}
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
        <p className="note num">💰 {h.gifts.map((x) => `${x.id === snap.userId ? "toi" : x.name} ${formatNumber(x.amount)}`).join(" · ")}</p>
      )}
      {!g.lodge && !founding && (
        <>
          <h4 className="hall-sub">🛡️ Garnison</h4>
          <p className="row-desc num">
            🧱 {armyIcons(h.walls as Record<string, number>, "aucun")}
            {h.immuneUntil > now ? ` · 🛡️ ${duration(h.immuneUntil - now)}` : ""}
          </p>
          <p className="row-desc num">
            ⛺ {h.garrison.length === 0 ? "aucune troupe" : h.garrison.map((x) => `${x.id === snap.userId ? "toi" : x.name} ${armyIcons(x.troops as Record<string, number>)}`).join(" · ")}
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
            <p className="row-desc">Aucune troupe à poster.</p>
          )}
          {h.garrison.some((x) => x.id === snap.userId) && (
            <button className="btn" disabled={busy} onClick={() => act({ type: "hall", op: "recall" })}>
              ↩️ Rappeler
            </button>
          )}
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
      <BlockHead
        title="Ton alliance"
        info={
          a ? (
            <>
              Entre alliés, pas de pillage. Les troupes envoyées chez un allié défendent son domaine et partent en raid avec lui (butin et pertes sont
              partagés au prorata de la valeur des troupes engagées par chacun).
            </>
          ) : null
        }
      />
      {a ? (
        <>
          <p className="row-desc">
            🤝 <strong>{a.name}</strong> · {a.members.map((m) => (m.id === snap.userId ? "toi" : m.name)).join(", ")} ({a.members.length}/{MAX_ALLIANCE_SIZE})
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
                ✉️ <strong>{inv.allianceName}</strong> · {inv.inviterName}
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
          🛡️{" "}
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
            {g.name} · {armyIcons(g.troops)}
          </div>
          <button className="btn" disabled={busy} onClick={() => act({ type: "recall", host: g.id })}>
            Rappeler
          </button>
        </div>
      ))}
      {a && (
        <button className="btn btn-ghost alliance-leave" disabled={busy} onClick={() => act({ type: "alliance_leave" })}>
          🚪 Quitter
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
      <BlockHead
        title="Guerre"
        info={
          w ? (
            <>
              Pendant la guerre, plus de bouclier entre vous (le repos de 5 min reste, et pas deux fois de suite la même cible) : chaque pierre pillée compte. Les
              vainqueurs se partagent une prime égale à la moitié du butin total.
            </>
          ) : null
        }
      />
      {w ? (
        <div className="war-card">
          <div className="row-title">⚔️ Contre {w.enemyName}</div>
          <div className="war-score num">
            <span>
              🤝 <strong>{formatNumber(w.myScore)}</strong>
            </span>
            <span>
              ⚔️ <strong>{formatNumber(w.enemyScore)}</strong>
            </span>
          </div>
          <div className="row-desc num">{w.startsAt > now ? `⏳ début dans ${duration(w.startsAt - now)} · 24 h` : `⏳ ${duration(w.endsAt - now)}`}</div>
        </div>
      ) : others.length === 0 ? (
        <p className="empty">Aucune alliance adverse.</p>
      ) : (
        <div className="list">
          {others.map((a) => (
            <div key={a.id} className="row">
              <div className="row-icon" aria-hidden>
                🏳️
              </div>
              <div>
                <div className="row-title">{a.name}</div>
                <div className="row-desc num">👥 {a.size}</div>
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={() => declare(a.id)} title="Déclare la guerre pour 24 h, à partir de 2 h après la déclaration.">
                ⚔️ Guerre
                <span className="cost">24 h</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Les forteresses (une en saison 1, quatre en saison 2) : les prendre, les garder. */
function Fortress({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const list = snap.fortresses?.length ? snap.fortresses : [snap.fortress];
  return (
    <>
      {list.map((f, i) => (
        <FortressCard key={f.idx ?? 0} snap={snap} live={live} now={now} run={run} f={f} first={i === 0} many={list.length > 1} />
      ))}
    </>
  );
}

function FortressCard({ snap, live, now, run, f, first, many }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; f: GameSnapshot["fortress"]; first: boolean; many: boolean }) {
  const idx = f.idx ?? 0;
  const key = idx === 0 ? "fortress" : `fortress:${idx}`;
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
      {first && (
        <BlockHead
          title={many ? "Forteresses" : "Forteresse"}
          info={many ? "Quatre forteresses aux points cardinaux, chacune avec son bonus pour l'alliance qui la tient (ils se cumulent). Une forteresse prise n'est défendue que par les troupes que les membres de l'alliance y envoient ; elle ouvre aussi une route commerciale depuis vos châteaux." : "La forteresse n'est défendue que par les troupes que les membres de l'alliance qui la tient y envoient. L'alliance qui la tient gagne +20 % de production."}
        />
      )}
      <div className="row">
        <div className="row-icon" aria-hidden>
          🏰
        </div>
        <div>
          <div className="row-title">
            {f.name}
            {f.mine && <span className="badge badge-level-1">à vous</span>}
          </div>
          <div className="row-desc num">{f.holderName ? `👑 ${f.holderName}` : "👑 personne (garnison neutre, à pleine force à chaque assaut)"} · {fortressBonus(idx)}</div>
          <div className="row-desc army-line num">
            {intel ? `🕵️ ${armyIcons(f.army)} · ${duration(f.intelUntil! - now)}` : f.exact ? armyIcons(f.army) : `≈ ${armyIcons(f.army)}`}
          </div>
          {!f.mine && !f.blocker && <TravelTo place="fortress" pos={f.pos} army={live.troops as Record<string, number>} />}
        </div>
        {!f.mine && (
          <div className="row-actions">
            <Btn className="btn btn-primary" busy={busy} reason={f.blocker} onClick={() => act({ type: "fortress_attack", fort: idx })}>
              ⚔️ Siège
              <span className="cost num">
                {f.exact ? "" : "~"}
                {Math.round(f.chance * 100)} %
              </span>
            </Btn>
            {!intel && (
              <Btn busy={busy} reason={(live.s2 ? live.s2.gold : live.stone) < spyPrice ? "Pas assez pour payer l'espion." : null} onClick={() => act({ type: "spy", target: key })} title="L'espion part sur la route ; son rapport montre la garnison et les murs pendant 1 h. Il peut être repéré.">
                🕵️ Espion
                <span className="cost num">{formatNumber(spyPrice)} 🪨</span>
              </Btn>
            )}
          </div>
        )}
      </div>
      {f.mine && (
        <>
          {f.garrison.length === 0 && <p className="status-burn">⚠️ Forteresse sans défenseur : le premier assaut la prend.</p>}
          {f.garrison.length > 0 && (
            <p className="row-desc num">
              ⛺{" "}
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
              <TravelTo place="fortress" pos={f.pos} army={{ [chosen.id]: Math.min(qty, live.troops[chosen.id] ?? 0) }} reinforce />
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => act({ type: "fortress_station", unit: chosen.id, qty: Math.min(qty, live.troops[chosen.id] ?? 0), fort: idx })}
              >
                Poster
              </button>
            </div>
          ) : (
            <p className="row-desc">Aucune troupe à poster.</p>
          )}
        </>
      )}
      {hasGarrison && (
        <button className="btn" disabled={busy} onClick={() => act({ type: "fortress_recall", fort: idx })}>
          ↩️ Rappeler ({armyIcons(f.myGarrison)})
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
          <div className="row-desc">Aucune troupe à envoyer.</div>
        )}
        {travel}
      </div>
      <button className="btn btn-primary" disabled={busy || !chosen} onClick={send}>
        🛡️ Renfort
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
  return `🗿 ${who} ${you ? "as frappé" : "a frappé"} le Colosse : ${armyIcons(d.defenderLost ?? {}, "personne")} fauchés, ${formatNumber(d.dealt ?? 0)} de dégâts (pertes : ${lost}).`;
}

/** Événement en cours (ou le prochain) en tête de l'onglet Raids, avec ses derniers assauts. */
const EVENT_ICONS: Record<EventView["kind"], string> = { colosse: "🗿", tournoi: "🏆" };
const isCombatEvent = (e: EventView | null | undefined) => !!e && e.kind === "colosse";

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

/** Événements sans combat (foire, fête, étoiles, trêve, marchand) : un bandeau sous le compteur, et les achats du marchand. */
/** Annonce d'un événement qui commence dans le quart d'heure. */
function EventBanner({ e, now }: { e: EventView | null; now: number }) {
  if (!e || e.active || e.startsAt - now > 15 * 60_000 || e.startsAt <= now) return null;
  return (
    <div className="event-banner">
      {EVENT_ICONS[e.kind]} Dans {duration(e.startsAt - now)} : <strong>{e.name}</strong>
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
          <span style={{ width: `${Math.round(e.armyLeft * 100)}%` }} />
        </div>
        <div className="row-desc num">
          {e.attackers} combattant{e.attackers > 1 ? "s" : ""} · ta part des dégâts : {Math.round(e.mine * 100)} % · un assaut rapporte environ {formatNumber(Math.floor((e.take * 2) / VALUE.fer))} ⚔️ fer de prime
        </div>
        <div className="row-desc">
          {e.blocker ?? `Un assaut devrait faucher environ ${formatNumber(e.take)} points de son armée.`}
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy || e.blocker !== null} onClick={onAttack}>
        Attaquer
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
    if (d.phase === "attack") text = eventAttackText(e, me);
    else text = d.success ? `🗿 Le Colosse est tombé ! Une prime en fer est versée à ceux qui l'ont touché (${shares}).` : "🗿 Le Colosse s'en va invaincu.";
  } else if (e.kind === "fortress") {
    text = e.details.success
      ? `🏰 ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "as pris" : "a pris"} la forteresse pour ${allianceName(e.details.alliance)} !`
      : `🏰 ${who(e.actorId, e.actorName, true)} ${e.actorId === me ? "t'es brisé" : "s'est brisé"} sur les murs de la forteresse.`;
  } else if (e.kind === "sabotage") {
    const d = e.details as { success?: boolean; aim?: string; named?: boolean; spotted?: boolean };
    const part = d.aim === "guet" ? "guet" : "académie";
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
    const site = (d as { pillage?: boolean; site?: string }).pillage ? (d as { site?: string }).site ?? "une concession" : null;
    if (site) {
      icon = "⛏️";
      if (attacker) title = won ? `Pillage de ${site}` : `Pillage repoussé à ${site}`;
      else if (e.targetId === me) title = won ? `${e.actorName} pille ${site}` : `Pillage de ${e.actorName} repoussé`;
      else title = won ? `${e.actorName} pille ${e.targetName}` : `${e.targetName} repousse ${e.actorName}`;
    } else if (attacker) title = won ? `Victoire sur ${e.targetName}` : `Défaite contre ${e.targetName}`;
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
    if (d.phase === "attack") {
      icon = "🗿";
      cat = personal ? "combats" : "royaume";
      title = `${d.success ? "Succès" : "Échec"} : Colosse`;
      if ((d.dealt ?? 0) > 0) chips.push({ t: `${short(d.dealt ?? 0)} dégâts` });
      if (personal) lossChip(attacker ? d.attackerLost : d.defenderLost);
    } else {
      icon = "🗿";
      cat = share > 0 ? "chantier" : "royaume";
      title = d.success ? "Le Colosse est tombé" : "Le Colosse repart";
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
      const part = aim === "guet" ? "guet" : "académie";
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
  } else if (e.kind === "renown") {
    // L1 : chaque gain de renom, en ligne courte.
    if (!attacker) return { key: `c${e.id}`, cat: "royaume", icon: "", title: "", chips: [], at: 0 };
    const rd = d as { amount?: number; label?: string };
    cat = "chantier";
    icon = "🎖️";
    title = rd.label ?? "Renom";
    chips.push({ t: `🎖️ +${rd.amount ?? 0}`, tone: "gain" });
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
  // Saison 2 : brigands sur les concessions trop pleines.
  for (const [i, l] of (live.s2?.log ?? []).entries()) out.push({ key: `s2log${l.at}-${l.key ?? i}`, cat: l.cat ?? "chantier", icon: [...l.text][0] ?? "⚠️", title: l.text.length > 48 ? `${l.text.slice(0, 46)}…` : l.text, chips: [], at: l.at, text: l.text });
  for (const [i, l] of (live.spyLog ?? []).entries()) out.push({ key: `log${l.at}-${i}`, cat: "espionnage", icon: "🐀", title: l.text.length > 48 ? `${l.text.slice(0, 46)}…` : l.text, chips: [], at: l.at, text: l.text });
  for (const r of snap.rivals) {
    if (!(r.intelUntil > now)) continue;
    out.push({ key: `intel-${r.id}-${r.intelUntil}`, cat: "espionnage", icon: "📜", title: `Rapport sur ${r.name}`, chips: [{ t: `valable ${countdown(r.intelUntil - now)}` }], at: r.intelUntil - SPY_INTEL_MS, rival: r, target: r.id });
  }
  // H1, U2 : écus de clôture de la saison passée, un rapport « Chantier ».
  const rw = snap.seasonRewards;
  if (rw && rw.total > 0) {
    const label = (id: string) => HALL_ALL.find((h) => h.id === id)?.title ?? id;
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

/** F1, F2 : la faille, étages à garnison fixe et altérations de la semaine. */
export function Rift({ snap, live, now, run }: { snap: GameSnapshot; live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"] }) {
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const view = snap.rift!;
  const rs = riftOf(live, now);
  const e = rs.exp;
  const act = async (a: Extract<Parameters<typeof run>[0], { type: "rift" }>) => {
    setBusy(true);
    await run(a);
    setBusy(false);
  };
  const unitOf = (id: string) => UNITS.find((u) => u.id === id);
  const alloc = allocation(live);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= RIFT_MAX_COMPANIES ? p : [...p, id]));
  const chosen = picked.filter((id) => !riftCompanyBlocker(live, id, now));
  return (
    <>
      <div className="block-head">
        <h3 className="section-title">🌀 La faille</h3>
        <Info>
          Des étages à garnison fixe, les mêmes pour tout le monde. Chaque étage a une ou deux altérations, connues d&apos;avance pour la semaine : choisis tes
          compagnies en conséquence. Envoie de 1 à {RIFT_MAX_COMPANIES} compagnies ; elles montent étage par étage tant qu&apos;elles gagnent, et tu choisis après
          chaque étage de continuer ou de rentrer. Les pertes sont réelles. Au retour, une compagnie se repose une heure avant de repartir. Premier passage d&apos;un étage
          dans la semaine : du renom (la moitié du numéro de l&apos;étage, 2 au moins), et un coffre de 10 minutes de production tous les 5 étages. Tous les 10 étages, un gardien, plus
          solide : seul, ou avec des alliés devant le même étage pour un renom double. Remise à zéro chaque lundi à 4 h.
        </Info>
      </div>
      <p className="row-desc num">
        Ton plus haut étage cette semaine : <strong>{rs.best}</strong> · remise à zéro dans {countdown(view.endsAt - now)}
      </p>
      {e ? (
        <div className="row rift-exp">
          <div className="row-icon" aria-hidden>
            🌀
          </div>
          <div>
            <div className="row-title">
              {e.status === "out" ? `En route, arrivée dans ${countdown(e.arriveAt - now)}` : e.status === "wait" ? `Devant l'étage ${e.floor}` : `Sur le retour, au domaine dans ${countdown(e.returnAt - now)}`}
            </div>
            <div className="row-desc num">
              {armyIcons(e.troops as Record<string, number>)}
              {Object.keys(e.wounded).length > 0 ? ` · 🩹 ${armyIcons(e.wounded as Record<string, number>)}` : ""}
            </div>
            {e.status === "wait" && <div className="row-desc num">Rentre seule dans {countdown(e.lastAt + RIFT_IDLE_MS - now)} sans ordre.</div>}
            {e.fights.length > 0 && (
              <ul className="rift-fights num">
                {e.fights
                  .slice(-4)
                  .reverse()
                  .map((f) => (
                    <li key={f.at}>
                      {f.won ? "✅" : "❌"} Étage {f.floor} : pertes {armyIcons(f.lost as Record<string, number>, "aucune")}
                      {f.dead?.length ? ` · ⚰️ ${f.dead.join(", ")}` : ""}
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div className="row-actions">
            {e.status === "wait" && (
              <Btn className="btn btn-primary" busy={busy} reason={riftFightBlocker(live, now, view.floors[0]?.allies?.length ?? 0)} onClick={() => void act({ type: "rift", op: "fight" })}>
                {view.floors[0]?.guardian ? "👹" : "⚔️"} Étage {e.floor}
                {view.floors[0]?.chance !== undefined && <span className="cost num">{Math.round(view.floors[0].chance * 100)} %</span>}
              </Btn>
            )}
            {e.status !== "back" && (
              <button className="btn" disabled={busy} onClick={() => void act({ type: "rift", op: "return" })}>
                ↩️ Rentrer
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <h3 className="section-title">Compagnies à envoyer ({chosen.length}/{RIFT_MAX_COMPANIES})</h3>
          <div className="list">
            {(live.companies ?? []).map((c, i) => {
              const u = unitOf(c.unit);
              const why = riftCompanyBlocker(live, c.id, now);
              const rest = (rs.rest[c.id] ?? 0) > now ? rs.rest[c.id] : 0;
              return (
                <label key={c.id} className={`row rift-pick${why ? " is-off" : ""}`}>
                  <input type="checkbox" checked={chosen.includes(c.id)} disabled={!!why || busy} onChange={() => toggle(c.id)} />
                  <div>
                    <div className="row-title row-title-one">
                      <span className="row-name">
                        {u?.icon} {i + 1}. {u?.plural}
                      </span>
                      <span className="badge">⭐ {c.train}</span>
                    </div>
                    <div className="row-desc num one-line">
                      {formatNumber(alloc.get(c.id)?.men ?? 0)} hommes{why ? ` · ${rest ? `repos ${countdown(rest - now)}` : why}` : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <Btn className="btn btn-primary" busy={busy} reason={chosen.length === 0 ? "Choisis au moins une compagnie." : null} onClick={() => void act({ type: "rift", op: "send", ids: chosen }).then(() => setPicked([]))}>
            🌀 Partir vers l&apos;étage {rs.best + 1}
          </Btn>
        </>
      )}
      <h3 className="section-title">Prochains étages</h3>
      <div className="list">
        {view.floors.map((f) => (
          <div key={f.floor} className="row rift-floor">
            <div className="row-icon" aria-hidden>
              {f.guardian ? "👹" : "🚪"}
            </div>
            <div>
              <div className="row-title row-title-one">
                <span className="row-name">Étage {f.floor}</span>
                <span className="badge">⭐ {f.train}</span>
                {f.guardian && <span className="badge">Gardien</span>}
              </div>
              <div className="row-desc">{SHAPES[f.shape]?.name ?? (f.shape === "horde" ? "Horde" : "Champions")} : {armyIcons(f.army as Record<string, number>)}</div>
              {f.alterations.map((a) => {
                const alt = ALTERATIONS[a as AlterationId];
                return alt ? (
                  <div key={a} className="row-desc">
                    {alt.icon} <strong>{alt.name}</strong> : {alt.text}
                  </div>
                ) : null;
              })}
              {f.guardian && <div className="row-desc">👹 Gardien : jouable seul. À plusieurs joueurs de ton alliance, chacun devant cet étage, la bataille est commune et chacun reçoit le renom en double. Récompense : un capitaine et une relique rare au moins pour chacun.</div>}
              {f.allies && <div className="row-desc">{f.allies.length ? `🤝 Devant avec toi : ${f.allies.join(", ")}` : "🤝 Aucun allié n'attend encore devant."}</div>}
              {f.first && <div className="row-desc">🪦 Gravé : {f.first}</div>}
            </div>
          </div>
        ))}
      </div>
      {view.top.length > 0 && (
        <>
          <h3 className="section-title">🏆 Cette semaine</h3>
          <ol className="ranking">
            {view.top.map((r, i) => (
              <li key={i} className={r.me ? "me" : undefined}>
                <span className="rank">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
                <span>{r.name}</span>
                <span className="num">étage {r.floor}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

/** C3, F3 : capitaines (recrutés en renom, un trait parmi trois) et reliques trouvées dans la faille. */
function CaptainsPanel({ live, run, renown }: { live: PlayerState; run: ReturnType<typeof useGame>["run"]; renown: number }) {
  const [busy, setBusy] = useState(false);
  const [hunt, setHunt] = useState<string>("cavalerie");
  const act = async (a: Extract<Parameters<typeof run>[0], { type: "captain" }>) => {
    setBusy(true);
    await run(a);
    setBusy(false);
  };
  const companies = live.companies ?? [];
  const label = (id: string | null) => {
    const i = companies.findIndex((c) => c.id === id);
    const u = i >= 0 ? UNITS.find((x) => x.id === companies[i].unit) : undefined;
    return i >= 0 ? `${u?.icon ?? ""} ${i + 1}. ${u?.plural ?? ""}` : "En réserve";
  };
  const offer = live.captainOffer ?? [];
  const captains = live.captains ?? [];
  const relics = live.relics ?? [];
  const where = (value: string | null, onPick: (v: string | null) => void, aria: string) => (
    <select className="input" aria-label={aria} value={value ?? ""} disabled={busy} onChange={(e) => onPick(e.target.value || null)}>
      <option value="">En réserve</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {label(c.id)}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <div className="block-head">
        <h3 className="section-title">🎖️ Capitaines</h3>
        <Info>
          Un capitaine coûte {CAPTAIN_COST} renom ; tu choisis son trait parmi trois. Un par compagnie au plus, et il change de compagnie quand elle est au
          domaine. Il gagne de l&apos;expérience dans la faille (bataille gagnée 1, perdue 0,5) : niveaux 1 à 5 à 0, 3, 8, 15 et 25, chacun +4 % d&apos;attaque et de
          points de vie pour sa compagnie. Si sa compagnie perd plus de 80 % de ses hommes, il a une chance sur quatre de tomber.
        </Info>
      </div>
      {offer.length > 0 ? (
        <div className="list">
          {offer.map((t) => (
            <div key={t} className="row">
              <div className="row-icon" aria-hidden>
                {TRAITS[t].icon}
              </div>
              <div>
                <div className="row-title">{TRAITS[t].name}</div>
                <div className="row-desc">{TRAITS[t].text}</div>
                {t === "chasseur" && (
                  <select className="input" aria-label="Catégorie visée" value={hunt} onChange={(e) => setHunt(e.target.value)}>
                    {HUNT_TARGETS.map((h) => (
                      <option key={h.id} value={h.id}>
                        contre {h.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <Btn className="btn btn-primary btn-small" busy={busy} onClick={() => void act({ type: "captain", op: "pick", trait: t, ...(t === "chasseur" ? { target: hunt } : {}) })}>
                Choisir
              </Btn>
            </div>
          ))}
        </div>
      ) : (
        <Btn className="btn" busy={busy} reason={renown < CAPTAIN_COST ? `Il faut ${CAPTAIN_COST} renom (tu en as ${renown}).` : captains.length >= CAPTAINS_MAX ? `${CAPTAINS_MAX} capitaines au plus.` : null} onClick={() => void act({ type: "captain", op: "draw" })}>
          🎖️ Recruter un capitaine
          <span className="cost num">{CAPTAIN_COST} 🎖️</span>
        </Btn>
      )}
      {captains.length > 0 && (
        <div className="list">
          {captains.map((k) => (
            <div key={k.id} className="row">
              <div className="row-icon" aria-hidden>
                {TRAITS[k.trait].icon}
              </div>
              <div>
                <div className="row-title row-title-one">
                  <span className="row-name">{k.name}</span>
                  <span className="badge">niv. {captainLevel(k)}</span>
                </div>
                <div className="row-desc">
                  {TRAITS[k.trait].name}
                  {k.target ? ` (contre ${HUNT_TARGETS.find((h) => h.id === k.target)?.label ?? k.target})` : ""} · {k.xp.toLocaleString("fr-FR")} bataille{k.xp > 1 ? "s" : ""}
                </div>
                {where(k.company, (v) => void act({ type: "captain", op: "assign", id: k.id, company: v }), `Compagnie de ${k.name}`)}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="block-head">
        <h3 className="section-title">🏺 Reliques ({relics.length}/{RELICS_MAX})</h3>
        <Info>
          Trouvées dans la faille tous les 5 étages, de plus en plus rares en montant, et auprès des gardiens. Une relique par compagnie ; elle se perd si la
          compagnie est dissoute. Au-delà de {RELICS_MAX}, la plus ancienne en réserve est perdue.
        </Info>
      </div>
      {relics.length === 0 ? (
        <p className="empty">Aucune relique pour l&apos;instant.</p>
      ) : (
        <div className="list">
          {relics.map((r) => {
            const d = RELICS[r.kind];
            return (
              <div key={r.id} className="row">
                <div className="row-icon" aria-hidden>
                  {d.icon}
                </div>
                <div>
                  <div className="row-title row-title-one">
                    <span className="row-name">{d.name}</span>
                    <span className={`badge rarity-${d.rarity}`}>{RARITY_LABEL[d.rarity]}</span>
                  </div>
                  <div className="row-desc">
                    {d.text}
                    {r.target ? ` (contre ${HUNT_TARGETS.find((h) => h.id === r.target)?.label ?? r.target})` : ""}
                  </div>
                  <div className="company-more">
                    {where(r.company, (v) => void act({ type: "captain", op: "relic", id: r.id, company: v }), `Compagnie de ${d.name}`)}
                    <Btn className="btn btn-small" busy={busy} onClick={() => void act({ type: "captain", op: "drop", id: r.id })}>
                      ✖ Jeter
                    </Btn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Barre d'avancement d'un chantier ou d'un entraînement. */
function WorkBar({ start, until, now }: { start: number; until: number; now: number }) {
  const pct = Math.min(100, Math.max(0, ((now - start) / Math.max(1, until - start)) * 100));
  return (
    <div className="bar bar-thin" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** C1 à C4 : caserne, compagnies, recrutement, entraînement et fortifications en niveaux (saison 1 et suivantes). */
export function Companies({ live, now, run, renown = 0 }: { live: PlayerState; now: number; run: ReturnType<typeof useGame>["run"]; renown?: number }) {
  // Saison 2 : l'armée se paie en fer.
  const armyPurse = live.s2 ? live.s2.iron : live.stone;
  const armyState = live.s2 ? { ...live, stone: live.s2.iron } : live;
  const armyIcon = live.s2 ? "⚔️" : "🪨";
  const armyWord = live.s2 ? "fer" : "pierre";
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [newUnit, setNewUnit] = useState<string>("piquier");
  const act = async (a: Extract<Parameters<typeof run>[0], { type: "company" }>) => {
    setBusy(true);
    await run(a);
    setBusy(false);
  };
  const alloc = allocation(live);
  const eta = companyEta(live);
  const list = live.companies ?? [];
  const lv = barracksLevel(live);
  const works = live.works ?? {};
  const unitOf = (id: string) => UNITS.find((u) => u.id === id)!;
  return (
    <>
      <div className="block-head">
        <h3 className="section-title">🏯 Caserne niv. {lv}</h3>
        <Info>
          Ton armée se compose de compagnies : une compagnie, un seul type de troupe, un effectif maximal et un entraînement de 0 à 10 (+8 % d&apos;attaque et
          de points de vie par niveau, en plus de la Forge). Les hommes se paient tout de suite mais arrivent un par un dans la file de la caserne, commande après commande : quand toutes les files sont prises, une nouvelle commande attend que l&apos;une se libère. Une
          compagnie à l&apos;entraînement ne peut pas sortir. La caserne a deux files au départ et ajoute une compagnie par niveau (8 au plus), une troisième file au niveau 3 et une
          quatrième au niveau 6. Les fortifications se bâtissent par niveaux et se relèvent toujours après une bataille.
        </Info>
      </div>
      <div className="row">
        <div className="row-icon" aria-hidden>
          🏯
        </div>
        <div>
          <div className="row-title">
            {list.length}/{maxCompanies(live)} compagnies · {recruitSlots(live)} file{recruitSlots(live) > 1 ? "s" : ""}
          </div>
          <div className="row-desc num">
            {works.barracks ? `🔨 niveau ${works.barracks.level} dans ${countdown(works.barracks.until - now)}` : lv >= BARRACKS_MAX ? "Niveau maximal" : `Niveau ${lv + 1} : ${countdown(barracksMs(lv + 1))} de travaux`}
          </div>
          {works.barracks && <WorkBar start={works.barracks.until - barracksMs(works.barracks.level)} until={works.barracks.until} now={now} />}
        </div>
        {lv < BARRACKS_MAX && !works.barracks && (
          <Btn className="btn btn-primary" busy={busy} reason={barracksBlocker(live)} onClick={() => void act({ type: "company", op: "barracks" })}>
            🔨 Niv. {lv + 1}
            <span className="cost num">{formatNumber(barracksCost(live))} 🪨</span>
          </Btn>
        )}
      </div>
      <div className="list">
        {list.map((c, i) => {
          const u = unitOf(c.unit);
          const a = alloc.get(c.id) ?? { men: 0, home: 0, queued: 0 };
          const cap = COMPANY_CAP[c.unit];
          const room = Math.max(0, cap - a.men - a.queued);
          // Recruter ce que la pierre permet, jusqu'à remplir la compagnie.
          const take = Math.min(room, Math.floor(armyPurse / Math.max(1, recruitPrice(c.unit, 1))));
          const training = c.trainUntil > now;
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="row company" data-tuto={i === 0 ? "company" : undefined}>
              <div className="row-icon" aria-hidden>
                {u.icon}
              </div>
              <div>
                <div className="row-title row-title-one">
                  <span className="row-name">
                    {i + 1}. {u.plural}
                  </span>
                  <span className="badge">⭐ {c.train}</span>
                </div>
                <div className="bar bar-thin" aria-hidden>
                  <span style={{ width: `${Math.min(100, (a.men / cap) * 100)}%` }} />
                </div>
                <div className="row-desc num one-line">
                  {formatNumber(a.men)}/{formatNumber(cap)} · {formatNumber(recruitPrice(c.unit, 1))} {armyIcon} l&apos;homme
                  {a.home < a.men ? ` · 🚶 ${formatNumber(a.men - a.home)} dehors` : ""}
                  {a.queued > 0 ? ` · ⏳ +${formatNumber(a.queued)}${(() => {
                    const e = eta.get(c.id);
                    if (!e) return "";
                    // Derrière une autre commande dans la file : on dit quand ses hommes commencent à arriver.
                    return e.next - now > RECRUIT_MS[c.unit] + 1000 ? `, en file : début dans ${countdown(e.next - now)}` : `, fini dans ${countdown(Math.max(0, e.last - now))}`;
                  })()}` : ""}
                  {training ? ` · 🎯 ${countdown(c.trainUntil - now)}` : ""}
                </div>
                {training && <WorkBar start={c.trainUntil - trainMs(c)} until={c.trainUntil} now={now} />}
                {(captainOf(live, c.id) || relicOf(live, c.id)) && (
                  <div className="row-desc one-line">
                    {(() => {
                      const k = captainOf(live, c.id);
                      const r = relicOf(live, c.id);
                      return [k ? `${TRAITS[k.trait].icon} ${k.name} niv. ${captainLevel(k)}` : "", r ? `${RELICS[r.kind].icon} ${RELICS[r.kind].name}` : ""].filter(Boolean).join(" · ");
                    })()}
                  </div>
                )}
                {isOpen && (
                  <div className="company-more">
                    <Btn className="btn btn-small" busy={busy} reason={c.trainUntil > 0 ? "Elle est à l'entraînement." : null} onClick={() => void act({ type: "company", op: "dissolve", id: c.id })}>
                      ✖ Dissoudre
                    </Btn>
                    <select className="input" aria-label="Changer de type" value="" disabled={busy} onChange={(e) => e.target.value && void act({ type: "company", op: "retype", id: c.id, unit: e.target.value })}>
                      <option value="">Changer de type…</option>
                      {UNITS.filter((x) => x.id !== c.unit).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.icon} {x.plural}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="row-actions">
                {room > 0 && (
                  <Btn className="btn btn-primary btn-small" busy={busy} reason={take <= 0 ? `Pas assez de ${armyWord} : ${formatNumber(recruitPrice(c.unit, 1))} ${armyIcon} l'homme.` : null} onClick={() => void act({ type: "company", op: "recruit", id: c.id, qty: Math.max(1, take) })}>
                    +{formatNumber(Math.max(1, take))}
                    <span className="cost num">
                      {formatNumber(recruitPrice(c.unit, Math.max(1, take)))} {armyIcon} · {countdown(Math.max(1, take) * RECRUIT_MS[c.unit])}
                    </span>
                  </Btn>
                )}
                {c.train < TRAIN_MAX && !training && (
                  <Btn className="btn btn-small" busy={busy} reason={trainBlocker(armyState, c.id, now)} onClick={() => void act({ type: "company", op: "train", id: c.id })}>
                    🎯 ⭐{c.train + 1}
                    <span className="cost num">
                      {formatNumber(trainCost(c))} {armyIcon} · {countdown(trainMs(c))}
                    </span>
                  </Btn>
                )}
                <button className="btn btn-ghost btn-small company-more-btn" aria-expanded={isOpen} aria-label="Plus" onClick={() => setOpen(isOpen ? null : c.id)}>
                  ⋯
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {list.length < maxCompanies(live) && (
        <div className="reinforce">
          <select className="input" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} aria-label="Type de la nouvelle compagnie">
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.icon} {u.plural} ({formatNumber(COMPANY_CAP[u.id])} hommes · {formatNumber(recruitPrice(u.id, 1))} {armyIcon} l&apos;homme)
              </option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={busy} onClick={() => void act({ type: "company", op: "create", unit: newUnit })}>
            ➕ Compagnie
          </button>
        </div>
      )}
      <CaptainsPanel live={live} run={run} renown={renown} />
    </>
  );
}
