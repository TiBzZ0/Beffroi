// Saison 2, vague B : combats sur les routes. Escortes, patrouilles des seigneurs, brigands, expéditions de
// rancune, règle du tiers, hostilité, sauf-conduits et vassalité. Règles pures et reproductibles (mêmes entrées,
// même issue), partagées par le serveur et le navigateur.

import { armySize, battle, cleanArmy, effectivePower, seededRng, type Army, type Boost, type Levels } from "../battle";
import { allocation, COMPANY_CAP, trainLevels, type ArmyHolder, type Escort } from "../companies";
import type { UnitId } from "../config";
import { pushLog, REF, RESOURCE_ICON, rollAt, VALUE, type Concession, type Convoy, type S2State } from "./economy";
import { garrisonUnits, lordTrain, patrolUnit } from "./lords";
import { cheb, RANKS, type MapLord, type Pos, type Rank, type Resource, type S2Map } from "./map";

const H = 3_600_000;
const DAY = 24 * H;

// ---------------------------------------------------------------------------
// Combat d'une escorte
// ---------------------------------------------------------------------------

/** Un camp d'un combat de route : ses hommes, ses niveaux, ses bonus. */
export interface Side {
  army: Army;
  levels?: Levels;
  boost?: Boost;
}

/** Chance du premier camp : Pa² / (Pa² + Pb²), P étant la puissance effective donnée par le moteur de bataille. */
export function fightChance(us: Side, them: Side): number {
  if (armySize(cleanArmy(us.army)) === 0) return 0;
  if (armySize(cleanArmy(them.army)) === 0) return 1;
  const a = effectivePower(us.army, them.army, us.levels, them.levels, us.boost, them.boost);
  const b = effectivePower(them.army, us.army, them.levels, us.levels, them.boost, us.boost);
  if (a <= 0) return 0;
  if (b <= 0) return 1;
  return (a * a) / (a * a + b * b);
}

const half = (a: Army): Army => Object.fromEntries(Object.entries(a).map(([k, n]) => [k, Math.floor((n ?? 0) / 2)]).filter(([, n]) => (n as number) > 0));

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface FightResult {
  won: boolean;
  chance: number;
  /** Pertes de chaque camp : le perdant subit celles du moteur, le vainqueur la moitié. */
  lost: Army;
  foeLost: Army;
}

/** Combat reproductible : l'issue se tire avec `fightChance`, les pertes viennent du moteur de bataille. */
export function routeFight(us: Side | null, them: Side, key: string): FightResult {
  if (!us || armySize(cleanArmy(us.army)) === 0) return { won: false, chance: 0, lost: {}, foeLost: {} };
  const chance = fightChance(us, them);
  const won = rollAt(key, 0) < chance;
  const r = battle(us.army, them.army, seededRng(hash(key)), { attackerLevels: us.levels, defenderLevels: them.levels, attackerBoost: us.boost, defenderBoost: them.boost });
  return { won, chance, lost: won ? half(r.attackerLost) : retreat(r.attackerLost, us.army), foeLost: won ? retreat(r.defenderLost, them.army) : half(r.defenderLost) };
}

/** Sur la route, on ne se bat pas jusqu'au dernier : le perdant se replie après avoir perdu la moitié de ses hommes. */
export const ROUTE_LOSS_MAX = 0.5;
function retreat(lost: Army, army: Army): Army {
  const total = armySize(cleanArmy(army));
  const dead = armySize(lost);
  if (dead <= total * ROUTE_LOSS_MAX || dead === 0) return lost;
  const k = (total * ROUTE_LOSS_MAX) / dead;
  return cleanArmy(Object.fromEntries((Object.entries(lost) as [string, number][]).map(([u, n]) => [u, Math.floor(n * k)])) as Army);
}

const company = (unit: UnitId, n = 1): Army => ({ [unit]: COMPANY_CAP[unit] * n }) as Army;

/** Patrouille d'un seigneur : une compagnie du type le plus fréquent de sa garnison, à son entraînement. */
export function patrolSide(l: MapLord, seasonStart: number, at: number): Side {
  return { army: company(patrolUnit(l.id, l.rank)), levels: trainLevels(lordTrain(l.rank, seasonStart, at)) };
}
/** Brigands : comme une patrouille de hobereau (une compagnie de miliciens). */
export function banditSide(seasonStart: number, at: number): Side {
  return { army: company("milicien"), levels: trainLevels(lordTrain("hobereau", seasonStart, at)) };
}
/** Expédition de rancune : de vraies compagnies de la garnison, une (hobereau, baron) ou deux (comte, duc). */
export function expeditionCompanies(l: MapLord): number {
  return l.rank === "comte" || l.rank === "duc" ? 2 : 1;
}
/** Compagnies d'une expédition battue par l'escorte : elles ne reviennent qu'avec la reformation (12 h). */
export const EXPEDITION_REFORM_MS = 12 * H;
export function expeditionSide(l: MapLord, seasonStart: number, at: number): Side {
  const n = expeditionCompanies(l);
  const army: Record<string, number> = {};
  for (const u of garrisonUnits(l.id, l.rank, l.companies).slice(0, n)) army[u] = (army[u] ?? 0) + COMPANY_CAP[u];
  return { army: army as Army, levels: trainLevels(lordTrain(l.rank, seasonStart, at)) };
}

// ---------------------------------------------------------------------------
// Routes et règle du tiers
// ---------------------------------------------------------------------------

/** Cases d'un trajet en ligne droite (Bresenham), départ et arrivée compris. */
export function line(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  let [x, y] = a;
  const dx = Math.abs(b[0] - x);
  const dy = -Math.abs(b[1] - y);
  const sx = x < b[0] ? 1 : -1;
  const sy = y < b[1] ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 200; guard++) {
    out.push([x, y]);
    if (x === b[0] && y === b[1]) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** Zones de seigneurs traversées par un trajet, dans l'ordre, chacune une fois, avec la part du trajet où on y entre. */
export function zonesOnRoute(map: S2Map, from: Pos, to: Pos): { lord: MapLord; t: number }[] {
  const cells = line(from, to);
  const seen = new Set<string>();
  const out: { lord: MapLord; t: number }[] = [];
  cells.forEach((c, i) => {
    for (const l of map.lords) {
      if (seen.has(l.id) || cheb(c, l.pos) > RANKS[l.rank].zone) continue;
      seen.add(l.id);
      out.push({ lord: l, t: cells.length > 1 ? i / (cells.length - 1) : 0 });
    }
  });
  return out;
}

/** Règle du tiers : un convoi ne perd jamais plus d'un tiers de sa charge (un quart après « Le grand bourdon »). */
export const LOSS_CAP = 1 / 3;
export const LOSS_CAP_BOURDON = 1 / 4;
export const BOURDON_STAGE = 5;
export function lossCap(stagesDone: number): number {
  return stagesDone >= BOURDON_STAGE ? LOSS_CAP_BOURDON : LOSS_CAP;
}
/** « La tour de guet » : escortes +15 % de dégâts. */
export const WATCH_STAGE = 2;
export const WATCH_ESCORT_BONUS = 0.15;

/** Chance qu'une patrouille attaque à chaque traversée de zone, selon le rang ; jamais plus de 60 %. */
export const PATROL_CHANCE: Record<Rank, number> = { hobereau: 0.1, baron: 0.2, comte: 0.3, duc: 0.4 };
export const PATROL_CHANCE_MAX = 0.6;

// ---------------------------------------------------------------------------
// Hostilité, sauf-conduits, rancunes, vassalité
// ---------------------------------------------------------------------------

export const HOSTILITY = { cross: 2, intercept: 10, pillage: 15, vassal: 10, betray: 30, safe: -10 } as const;
export const HOSTILITY_DECAY_PER_DAY = 10;
export const HOSTILITY_RANK: Record<Rank, number> = { hobereau: 0.75, baron: 1, comte: 1.25, duc: 1.5 };
/** Ennemi juré : la moitié de chaque hausse gagne les seigneurs à 8 cases ou moins. */
export const HOSTILITY_SPREAD_RADIUS = 8;
export const HOSTILITY_LEVELS = [
  { min: 0, name: "Neutre", icon: "🙂", chance: 1, price: 1 as number | null, every: 0 },
  { min: 25, name: "Méfiant", icon: "🤨", chance: 1.5, price: 1.5 as number | null, every: 0 },
  { min: 50, name: "Hostile", icon: "😠", chance: 2, price: 2 as number | null, every: 8 * H },
  { min: 75, name: "Ennemi juré", icon: "☠️", chance: 2, price: null as number | null, every: 3 * H },
];
export function hostilityLevel(v: number): number {
  let lv = 0;
  HOSTILITY_LEVELS.forEach((x, i) => {
    if (v >= x.min) lv = i;
  });
  return lv;
}
/** Hostilité d'un seigneur à l'instant `t` : elle baisse de 10 par jour. */
export function hostilityAt(s: S2State, lordId: string, t: number): number {
  const h = s.host?.[lordId];
  if (!h) return 0;
  return Math.max(0, Math.min(100, h.v - (HOSTILITY_DECAY_PER_DAY * Math.max(0, t - h.at)) / DAY));
}
/** Change l'hostilité (hausses multipliées par le rang, et propagées par un ennemi juré). Écrit dans `s`. */
export function addHostility(s: S2State, map: S2Map, lord: MapLord, amount: number, t: number): void {
  const set = (l: MapLord, d: number) => {
    const v = Math.max(0, Math.min(100, hostilityAt(s, l.id, t) + d));
    const host = { ...(s.host ?? {}) };
    if (v > 0) host[l.id] = { v, at: t };
    else delete host[l.id];
    s.host = host;
  };
  const before = hostilityAt(s, lord.id, t);
  const d = amount > 0 ? amount * HOSTILITY_RANK[lord.rank] : amount;
  set(lord, d);
  if (amount > 0 && hostilityLevel(before) >= 3) {
    for (const other of map.lords) if (other.id !== lord.id && cheb(other.pos, lord.pos) <= HOSTILITY_SPREAD_RADIUS) set(other, (amount / 2) * HOSTILITY_RANK[other.rank]);
  }
  // Vague C : le rival se réjouit. Son hostilité baisse d'autant ; à 30 points baissés, il offre un sauf-conduit de 24 h.
  const rival = amount > 0 ? rivalOf(map, lord.id) : undefined;
  if (rival) {
    const drop = Math.min(d, hostilityAt(s, rival.id, t));
    if (drop > 0) set(rival, -drop);
    const total = (s.rivalDrop?.[rival.id] ?? 0) + drop;
    const rivalDrop = { ...(s.rivalDrop ?? {}) };
    if (total >= RIVAL_GIFT_AT) {
      delete rivalDrop[rival.id];
      s.safe = { ...(s.safe ?? {}), [rival.id]: Math.max(s.safe?.[rival.id] ?? 0, t + RIVAL_SAFE_MS) };
    } else if (total > 0) rivalDrop[rival.id] = total;
    s.rivalDrop = rivalDrop;
  }
}

/** Vague C : rivalités. Paires de seigneurs voisins (8 cases au plus), un rival au plus par seigneur. */
export const RIVAL_RADIUS = 8;
export const RIVAL_GIFT_AT = 30;
export const RIVAL_SAFE_MS = 24 * H;
const rivalCache = new WeakMap<S2Map, Map<string, MapLord>>();
export function rivalOf(map: S2Map, lordId: string): MapLord | undefined {
  let pairs = rivalCache.get(map);
  if (!pairs) {
    pairs = new Map();
    // Les paires les plus proches d'abord ; à distance égale, l'ordre des identifiants (même tirage partout).
    const cand: { a: MapLord; b: MapLord; d: number }[] = [];
    for (const a of map.lords) for (const b of map.lords) if (a.id < b.id && cheb(a.pos, b.pos) <= RIVAL_RADIUS) cand.push({ a, b, d: cheb(a.pos, b.pos) });
    cand.sort((x, y) => x.d - y.d || (x.a.id + x.b.id).localeCompare(y.a.id + y.b.id));
    for (const { a, b } of cand) {
      if (pairs.has(a.id) || pairs.has(b.id)) continue;
      pairs.set(a.id, b);
      pairs.set(b.id, a);
    }
    rivalCache.set(map, pairs);
  }
  return pairs.get(lordId);
}
/** Version pure de `addHostility`. */
export function withHostility(s: S2State, map: S2Map, lord: MapLord, amount: number, t: number): S2State {
  const next = { ...s };
  addHostility(next, map, lord, amount, t);
  return next;
}

/** Prix d'un sauf-conduit, en or : la moitié de la perte attendue d'une route sans escorte, majorée par l'hostilité. */
export const SAFE_HOURS: Record<Rank, number> = { hobereau: 0.4, baron: 0.8, comte: 1.2, duc: 1.6 };
export const SAFE_MS = 24 * H;
export function safePrice(s: S2State, lord: MapLord, seasonStart: number, now: number): number | null {
  const mult = HOSTILITY_LEVELS[hostilityLevel(hostilityAt(s, lord.id, now))].price;
  if (mult === null) return null;
  return Math.ceil((SAFE_HOURS[lord.rank] * REF((now - seasonStart) / DAY) * mult) / VALUE.or);
}
export function safeBlocker(s: S2State, lord: MapLord | undefined, seasonStart: number, now: number): string | null {
  if (!lord) return "Seigneur inconnu.";
  if (!s.castle) return "Pose d'abord ton château.";
  if ((s.vassals?.[lord.id] ?? 0) > now) return "Ce seigneur est ton vassal : ses patrouilles te laissent passer.";
  const price = safePrice(s, lord, seasonStart, now);
  if (price === null) return "Ennemi juré : il ne vend plus de sauf-conduit.";
  if (price > s.gold) return "Pas assez d'or.";
  return null;
}
/** Paie un sauf-conduit : 24 h de passage libre (prolongées si on en avait déjà un), hostilité −10. */
export function buySafe(s: S2State, map: S2Map, lordId: string, seasonStart: number, now: number): { ok: true; value: { s: S2State; price: number } } | { ok: false; error: string } {
  const lord = map.lords.find((l) => l.id === lordId);
  const why = safeBlocker(s, lord, seasonStart, now);
  if (why) return { ok: false, error: why };
  const price = safePrice(s, lord!, seasonStart, now)!;
  const next: S2State = { ...s, gold: s.gold - price, safe: { ...(s.safe ?? {}), [lord!.id]: Math.max(now, s.safe?.[lord!.id] ?? 0) + SAFE_MS } };
  addHostility(next, map, lord!, HOSTILITY.safe, now);
  return { ok: true, value: { s: next, price } };
}

/** Rancune : un seigneur pillé envoie une expédition dans les 12 h (deux si hostile, ou après une trahison). */
export const GRUDGE_MS = 12 * H;
/** Vassalité : 24 h, un quart de la production des concessions du seigneur part chez le suzerain. */
export const VASSAL_MS = 24 * H;
export const VASSAL_SHARE = 0.25;

/**
 * Ce qui suit l'attaque d'un joueur contre la garnison d'un seigneur : sauf-conduit rompu le cas échéant (hostilité
 * +30, rancune sur deux convois) ; en cas de victoire, hostilité (pillage + vassalité), rancune et vassalité de 24 h.
 */
export function afterLordAttack(s: S2State, map: S2Map, lordId: string, at: number, won: boolean): S2State {
  const lord = map.lords.find((l) => l.id === lordId);
  if (!lord) return s;
  const next: S2State = { ...s };
  // Attaquer un seigneur dont on a le sauf-conduit le rompt, sans remboursement.
  const betrayed = (s.safe?.[lordId] ?? 0) > at;
  if (betrayed) {
    const safe = { ...(s.safe ?? {}) };
    delete safe[lordId];
    next.safe = safe;
    addHostility(next, map, lord, HOSTILITY.betray, at);
  }
  if (!won) {
    if (betrayed) next.grudge = [...(s.grudge ?? []), ...[0, 1].map((i) => ({ lord: lordId, due: at + Math.floor(rollAt(`grudge:${lordId}`, at) * GRUDGE_MS) + i * 60_000 }))].slice(-10);
    return next;
  }
  addHostility(next, map, lord, HOSTILITY.pillage + HOSTILITY.vassal, at);
  // Deux rancunes en attente au plus par seigneur : battre plusieurs fois le même ne les empile pas.
  const pending = (s.grudge ?? []).filter((g) => g.lord === lordId).length;
  const n = Math.max(0, Math.min(betrayed || hostilityLevel(hostilityAt(next, lordId, at)) >= 2 ? 2 : 1, 2 - pending));
  const due = at + Math.floor(rollAt(`grudge:${lordId}`, at) * GRUDGE_MS);
  next.grudge = [...(s.grudge ?? []), ...Array.from({ length: n }, (_, i) => ({ lord: lordId, due: due + i * 60_000 }))].slice(-10);
  next.vassals = { ...(s.vassals ?? {}), [lordId]: at + VASSAL_MS };
  return next;
}

/** Suzerain de chaque seigneur (fixé par le serveur, envoyé au navigateur). */
export interface Vassal {
  owner: string;
  alliance: number | null;
  until: number;
}
let vassalOf: Record<string, Vassal> = {};
export function setVassals(v: Record<string, Vassal>): void {
  vassalOf = v;
}

/** Vague C : seigneurs annexés par une alliance (chute), avec le nombre de ses membres pour partager la production. */
export interface Annexed {
  alliance: number;
  since: number;
  members: number;
}
let annexedBy: Record<string, Annexed> = {};
export function setAnnexed(a: Record<string, Annexed>): void {
  annexedBy = a;
}
export function annexedOf(lordId: string): Annexed | undefined {
  return annexedBy[lordId];
}
/** Chute : une alliance qui fait trois fois d'un même seigneur son vassal l'annexe jusqu'à la fin de la saison. */
export const ANNEX_AFTER = 3;

// ---------------------------------------------------------------------------
// Ce qui arrive à un convoi en route
// ---------------------------------------------------------------------------

export interface RouteContext {
  map: S2Map;
  seasonStart: number;
  stagesDone: number;
  /** Escorte de la concession (état courant), ou null. */
  escort: (concId: string, at?: number) => Side | null;
  /** Pertes de l'escorte d'une concession (morts, et blessés qui rentrent au château). */
  hurt: (concId: string, lost: Army, won: boolean, at: number) => void;
  /** Durée de marche d'une expédition de seigneur (par défaut 10 min par case). */
  march?: (from: Pos, to: Pos) => number;
}

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const siteName = (map: S2Map, st: S2State, v: Convoy) => {
  if (v.conc.startsWith("vassal:")) return `du tribut de ${lordName({ id: v.conc.slice(7) })}`;
  if (v.conc.startsWith("annex:")) return `du fief de ${lordName({ id: v.conc.slice(6) })}`;
  if (v.conc.startsWith("trade:")) return "de commerce";
  const c = st.conc.find((x) => x.id === v.conc);
  const site = c ? map.sites[c.site] : undefined;
  return site ? `de ${site.name || site.type}` : "";
};

/** Passage libre dans la zone d'un seigneur : vassal du joueur ou de son alliance, ou sauf-conduit. */
export function freePass(st: S2State, lordId: string, t: number): boolean {
  const a = annexedBy[lordId];
  if (a && a.since <= t && st.who?.alliance !== null && st.who?.alliance === a.alliance) return true;
  const v = vassalOf[lordId];
  if (v && v.until > t && st.who && (v.owner === st.who.id || (v.alliance !== null && v.alliance === st.who.alliance))) return true;
  if ((st.vassals?.[lordId] ?? 0) > t && (!v || v.owner === st.who?.id)) return true;
  return (st.safe?.[lordId] ?? 0) > t;
}

/**
 * Règle les dangers de la route d'un convoi à son arrivée : patrouilles des zones traversées (au plus une par zone),
 * puis une expédition de rancune s'il y en a une d'échue. Chaque combat perdu coûte la part de la règle du tiers.
 * Écrit l'hostilité et les rapports dans `st` ; renvoie la charge perdue.
 */
export function convoyRisk(st: S2State, v: Convoy, rc: RouteContext): number {
  const load0 = v.load + (v.lost ?? 0);
  const cap = load0 * lossCap(rc.stagesDone) - (v.lost ?? 0);
  if (cap <= 1e-9 || v.load <= 0) return 0;
  let lost = 0;
  const span = Math.max(0, v.arrive - v.depart);
  const res = v.res as Resource;
  const what = `Convoi ${siteName(rc.map, st, v)}`.trim();
  // Vague C, Grand marchand : les convois de commerce ne sont jamais attaqués.
  if (st.tradeSafe && v.conc.startsWith("trade:")) return 0;
  // Architecte royal : le premier convoi du jour qui devait perdre une part de sa charge arrive intact.
  let shielded = false;
  const lose = () => {
    const day = Math.floor(v.arrive / DAY);
    if (!shielded && st.archShield && st.archDay !== day) {
      shielded = true;
      st.archDay = day;
      pushLog(st, v.arrive, `📐 ${what} : l'Architecte royal lui a fait prendre un autre chemin, il arrive intact.`, { cat: "combats" });
    }
    if (shielded) return 0;
    const take = Math.min(cap - lost, load0 * lossCap(rc.stagesDone));
    lost += Math.max(0, take);
    return Math.max(0, take);
  };
  const cells = line(v.from, v.to);
  // Autour d'une forteresse tenue par l'alliance : ni patrouille, ni embuscade, ni bandits.
  const sheltered = (c: Pos) => (st.safeZones ?? []).some((z) => cheb(z, c) <= FORT_SAFE_REACH);
  for (const { lord, t } of zonesOnRoute(rc.map, v.from, v.to)) {
    const at = Math.round(v.depart + t * span);
    if (freePass(st, lord.id, at)) continue;
    if (sheltered(cells[Math.min(cells.length - 1, Math.round(t * (cells.length - 1)))])) continue;
    addHostility(st, rc.map, lord, HOSTILITY.cross, at);
    const lv = HOSTILITY_LEVELS[hostilityLevel(hostilityAt(st, lord.id, at))];
    const chance = Math.min(PATROL_CHANCE_MAX, PATROL_CHANCE[lord.rank] * lv.chance) * (1 - (st.patrolCut ?? 0));
    const key = `p:${v.conc}:${v.depart}:${lord.id}`;
    if (rollAt(key, 0) >= chance) continue;
    const fight = routeFight(rc.escort(v.conc, at), patrolSide(lord, rc.seasonStart, at), key);
    if (armySize(fight.lost) > 0) rc.hurt(v.conc, fight.lost, fight.won, at);
    const taken = fight.won ? 0 : lose();
    const name = lordName(lord);
    pushLog(st, at, "", {
      cat: "combats",
      key: `patrol:${lord.id}:${Math.floor(at / H)}`,
      amount: taken,
      render: (sum, n) => `🛡️ ${n > 1 ? `${n} convois attaqués` : `${what} attaqué`} par les patrouilles de ${name} : ${sum > 0 ? `−${fmt(sum)} ${RESOURCE_ICON[res]}` : "repoussées par l'escorte"}.`,
    });
    if (lost >= cap - 1e-9) return lost;
  }
  // S8 : embuscades posées par d'autres joueurs à une case de la route (une attaque de joueur au plus par convoi).
  if (!v.hit && st.who) {
    for (const a of ambushes) {
      if (a.owner === st.who.id || (a.alliance !== null && a.alliance === st.who.alliance)) continue;
      const i = cells.findIndex((c) => cheb(c, a.pos) <= AMBUSH_REACH && !sheltered(c));
      if (i < 0) continue;
      const at = Math.round(v.depart + (cells.length > 1 ? i / (cells.length - 1) : 0) * span);
      if (at < a.from || at >= a.until || newbieUntil(st) > at) continue;
      const fight = routeFight(rc.escort(v.conc, at), a.side, `amb:${a.id}:${v.conc}:${v.depart}`);
      if (armySize(fight.lost) > 0) rc.hurt(v.conc, fight.lost, fight.won, at);
      const taken = fight.won ? 0 : Math.min(lose(), load0 / 3);
      st.ambushed = [...(st.ambushed ?? []), { id: a.id, at, res, taken, lost: fight.foeLost as Record<string, number>, won: !fight.won }].slice(-20);
      pushLog(st, at, `🏹 ${what} : embuscade de ${a.name} ${fight.won ? "repoussée par l'escorte" : `, −${fmt(Math.floor(taken))} ${RESOURCE_ICON[res]}`}.`.replace(" ,", ","), { cat: "combats" });
      break;
    }
    if (lost >= cap - 1e-9) return lost;
  }
  // Camps de bandits à une case de la route : 15 % d'attaque par camp.
  for (const camp of camps) {
    const i = cells.findIndex((c) => cheb(c, camp.pos) <= CAMP_REACH && !sheltered(c));
    if (i < 0) continue;
    const at = Math.round(v.depart + (cells.length > 1 ? i / (cells.length - 1) : 0) * span);
    if (!campActive(camp, at) || rollAt(`camp:${camp.id}:${v.conc}:${v.depart}`, 0) >= CAMP_CHANCE) continue;
    const fight = routeFight(rc.escort(v.conc, at), campSide(camp, at), `cf:${camp.id}:${v.conc}:${v.depart}`);
    if (armySize(fight.lost) > 0) rc.hurt(v.conc, fight.lost, fight.won, at);
    const taken = fight.won ? 0 : lose();
    pushLog(st, at, `🏕️ ${what} : attaqué par les bandits d'un camp ${fight.won ? "et défendu par l'escorte" : `, −${fmt(taken)} ${RESOURCE_ICON[res]}`}.`.replace(" ,", ","), { cat: "combats" });
    if (lost >= cap - 1e-9) return lost;
  }
  // Rancune échue, ou expédition régulière d'un seigneur hostile.
  // Un vassal ne se venge pas de son suzerain : la rancune attend la fin de la vassalité.
  const due = (st.grudge ?? []).filter((g) => g.due <= v.arrive && !((st.vassals?.[g.lord] ?? 0) > v.arrive)).sort((a, b) => a.due - b.due)[0];
  let foe: MapLord | undefined;
  if (due) {
    foe = rc.map.lords.find((l) => l.id === due.lord);
    st.grudge = (st.grudge ?? []).filter((g) => g !== due);
  } else {
    for (const l of rc.map.lords) {
      const every = HOSTILITY_LEVELS[hostilityLevel(hostilityAt(st, l.id, v.arrive))].every;
      if (every > 0 && v.arrive - (st.expAt?.[l.id] ?? 0) >= every && !freePass(st, l.id, v.arrive)) {
        foe = l;
        break;
      }
    }
  }
  if (foe) {
    st.expAt = { ...(st.expAt ?? {}), [foe.id]: v.arrive };
    const key = `x:${v.conc}:${v.depart}:${foe.id}`;
    const side = expeditionSide(foe, rc.seasonStart, v.arrive);
    const fight = routeFight(rc.escort(v.conc, v.arrive), side, key);
    if (armySize(fight.lost) > 0) rc.hurt(v.conc, fight.lost, fight.won, v.arrive);
    // Le fief garde une garnison réduite le temps de l'aller-retour ; battues par l'escorte, ses compagnies attendent la reformation.
    const trip = rc.march ? rc.march(foe.pos, v.to) : cheb(foe.pos, v.to) * 10 * 60_000;
    const n = expeditionCompanies(foe);
    st.sent = [...(st.sent ?? []).filter((x) => x.back > v.arrive - DAY), { lord: foe.id, at: v.arrive - trip, back: fight.won ? v.arrive + EXPEDITION_REFORM_MS : v.arrive + trip, n, to: [v.to[0], v.to[1]] as Pos }].slice(-10);
    const taken = fight.won ? 0 : lose();
    pushLog(st, v.arrive, `⚔️ ${what} : expédition de ${lordName(foe)} ${fight.won ? "repoussée par l'escorte" : `, −${fmt(taken)} ${RESOURCE_ICON[res]}`}.`.replace(" ,", ","), { cat: "combats" });
  }
  return lost;
}

/** Brigands sur un stock plein : l'escorte de la concession défend comme contre une patrouille de hobereau. */
export function banditGuard(st: S2State, c: Concession, at: number, rc: RouteContext): boolean {
  const key = `b:${c.id}:${at}`;
  const fight = routeFight(rc.escort(c.id, at), banditSide(rc.seasonStart, at), key);
  if (armySize(fight.lost) > 0) rc.hurt(c.id, fight.lost, fight.won, at);
  return fight.won;
}

/** Tribut des vassaux : chaque heure pleine, un quart de la production de leurs concessions part vers le château. */
export function vassalConvoys(st: S2State, map: S2Map, seasonStart: number, from: number, to: number, travel: (a: Pos, b: Pos) => number): void {
  if (!st.castle || !st.vassals) return;
  for (const [lordId, until] of Object.entries(st.vassals)) {
    const lord = map.lords.find((l) => l.id === lordId);
    const v = vassalOf[lordId];
    if (!lord || (v && v.owner !== st.who?.id)) continue;
    const start = Math.max(from, until - VASSAL_MS);
    for (let h = Math.ceil(start / H) * H; h <= Math.min(to, until); h += H) {
      if (h <= from) continue;
      const day = Math.max(0, (h - seasonStart) / DAY);
      const byRes: Partial<Record<Resource, number>> = {};
      for (const siteId of lord.conc) {
        const res = map.sites[siteId]?.type ?? "pierre";
        byRes[res] = (byRes[res] ?? 0) + (REF(day) / VALUE[res]) * VASSAL_SHARE;
      }
      for (const [res, load] of Object.entries(byRes) as [Resource, number][]) {
        st.convoys.push({ conc: `vassal:${lordId}`, res, load, depart: h, arrive: h + travel(lord.pos, st.castle), from: lord.pos, to: st.castle });
      }
    }
  }
}

/** Vague C : un fief annexé partage toute sa production entre les membres de l'alliance, en convois horaires. */
export function annexConvoys(st: S2State, map: S2Map, seasonStart: number, from: number, to: number, travel: (a: Pos, b: Pos) => number): void {
  if (!st.castle || st.who?.alliance === null || st.who?.alliance === undefined) return;
  for (const lord of map.lords) {
    const a = annexedBy[lord.id];
    if (!a || a.alliance !== st.who.alliance) continue;
    for (let h = Math.ceil(Math.max(from, a.since) / H) * H; h <= to; h += H) {
      if (h <= from) continue;
      const day = Math.max(0, (h - seasonStart) / DAY);
      const byRes: Partial<Record<Resource, number>> = {};
      for (const siteId of lord.conc) {
        const res = map.sites[siteId]?.type ?? "pierre";
        byRes[res] = (byRes[res] ?? 0) + REF(day) / VALUE[res] / Math.max(1, a.members);
      }
      for (const [res, load] of Object.entries(byRes) as [Resource, number][]) st.convoys.push({ conc: `annex:${lord.id}`, res, load, depart: h, arrive: h + travel(lord.pos, st.castle), from: lord.pos, to: st.castle });
    }
  }
}

// ---------------------------------------------------------------------------
// Embuscades posées par les joueurs (S8)
// ---------------------------------------------------------------------------

/** Une armée postée sur une case attaque, pendant 4 h, les convois ennemis qui passent à une case. */
export const AMBUSH_MS = 4 * H;
export const AMBUSH_REACH = 1;
/** Passage libre à 4 cases d'une forteresse tenue par l'alliance du joueur. */
export const FORT_SAFE_REACH = 4;
export interface Ambush {
  id: string;
  owner: string;
  name: string;
  alliance: number | null;
  pos: Pos;
  from: number;
  until: number;
  side: Side;
}
let ambushes: Ambush[] = [];
/** Embuscades en place (fixées par le serveur d'après les marches de tous les joueurs). */
export function setAmbushes(a: Ambush[]): void {
  ambushes = a;
}
const newbieUntil = (s: S2State) => (s.launchUntil ? s.launchUntil - 24 * H + 48 * H : 0);

// ---------------------------------------------------------------------------
// Camps de bandits sur la carte
// ---------------------------------------------------------------------------

/** Trois camps à la fois, à 3 cases au plus d'une route active ; un camp détruit réapparaît ailleurs 6 h plus tard. */
export const CAMP_COUNT = 3;
export const CAMP_CHANCE = 0.15;
export const CAMP_REACH = 1;
export const CAMP_SPAWN_RANGE = 3;
export const CAMP_RESPAWN_MS = 6 * H;
/** Entraînement de la garnison : 0, +1 tous les 4 jours depuis l'apparition du camp. */
export const CAMP_TRAIN_EVERY_MS = 4 * DAY;
/** Butin : 1 h × REF(j) en fer. */
export const CAMP_IRON_HOURS = 1;

export interface Camp {
  id: string;
  pos: Pos;
  /** Apparition (le camp n'attaque pas avant). */
  from: number;
  /** Destruction, s'il a été détruit. */
  until?: number;
}
let camps: Camp[] = [];
export function setCamps(c: Camp[]): void {
  camps = c;
}
export function campsList(): Camp[] {
  return camps;
}
export function campActive(c: Camp, t: number): boolean {
  return c.from <= t && (c.until === undefined || t < c.until);
}
export function campTrain(c: Camp, t: number): number {
  return Math.floor(Math.max(0, t - c.from) / CAMP_TRAIN_EVERY_MS);
}
export function campSide(c: Camp, t: number): Side {
  return { army: company("milicien"), levels: trainLevels(campTrain(c, t)) };
}
export function campLoot(seasonStart: number, t: number): number {
  return Math.round((CAMP_IRON_HOURS * REF(Math.max(0, (t - seasonStart) / DAY))) / VALUE.fer);
}

/** Une case libre à 3 cases au plus d'une des routes, hors du centre et loin des sites, seigneurs, châteaux et camps. */
export function campSpot(map: S2Map, routes: { from: Pos; to: Pos }[], taken: Pos[], seed: string): Pos | null {
  const size = 41;
  const center: Pos = [20, 20];
  const busy = [...map.sites.map((x) => x.pos), ...map.lords.map((l) => l.pos), ...taken];
  for (let k = 0; k < 60; k++) {
    const r = (i: number) => rollAt(`${seed}:${k}:${i}`, 0);
    let p: Pos;
    if (routes.length > 0) {
      const route = routes[Math.floor(r(0) * routes.length)];
      const cells = line(route.from, route.to);
      const c = cells[Math.floor(r(1) * cells.length)];
      p = [c[0] + Math.floor(r(2) * (2 * CAMP_SPAWN_RANGE + 1)) - CAMP_SPAWN_RANGE, c[1] + Math.floor(r(3) * (2 * CAMP_SPAWN_RANGE + 1)) - CAMP_SPAWN_RANGE];
    } else p = [Math.floor(r(2) * size), Math.floor(r(3) * size)];
    if (p[0] < 0 || p[1] < 0 || p[0] >= size || p[1] >= size) continue;
    if (cheb(p, center) <= 7) continue;
    if (busy.some((b) => cheb(b, p) <= 1)) continue;
    return p;
  }
  return null;
}

/** Nom d'un seigneur pour les rapports (renseigné par le serveur et le navigateur). */
let lordNames: Record<string, string> = {};
export function setLordNames(names: Record<string, string>): void {
  lordNames = names;
}
export function lordName(l: Pick<MapLord, "id">): string {
  return lordNames[l.id] ?? l.id;
}

// ---------------------------------------------------------------------------
// Pillage d'une concession par un joueur
// ---------------------------------------------------------------------------

/** Butin : 25 % du stock local et 15 % de la réserve, au plus le tiers des deux (le quart après le grand bourdon). */
export const PILLAGE_STOCK = 0.25;
export const PILLAGE_FUND = 0.15;
export const PILLAGE_EVERY_MS = 6 * H;
/** Protection des débutants : 48 h après la pose du château. */
export const NEWBIE_MS = 48 * H;

export function protectedUntil(s: S2State): number {
  // La pose du château fixe le lancement à +24 h : la protection court 48 h depuis la pose.
  return s.launchUntil ? s.launchUntil - 24 * H + NEWBIE_MS : 0;
}

export function pillageLoot(c: Concession, map: S2Map, stagesDone: number): { res: Resource; stock: number; fund: number } {
  const res = map.sites[c.site]?.type ?? "pierre";
  let stock = c.stock * PILLAGE_STOCK;
  let fund = (c.fund ?? 0) * PILLAGE_FUND;
  const capValue = (c.stock * VALUE[res] + (c.fund ?? 0)) * lossCap(stagesDone);
  const value = stock * VALUE[res] + fund;
  if (value > capValue && value > 0) {
    stock *= capValue / value;
    fund *= capValue / value;
  }
  return { res, stock: Math.floor(stock), fund: Math.floor(fund) };
}

/** Pourquoi on ne peut pas piller cette concession maintenant (null : c'est possible). */
export function pillageBlocker(target: S2State | undefined, concId: string, now: number, rel: { allied: boolean; sameIp: boolean }): string | null {
  if (!target?.castle) return "Ce joueur n'a pas encore de château.";
  const c = target.conc.find((x) => x.id === concId);
  if (!c) return "Concession inconnue.";
  if (rel.allied) return "On ne pille pas un allié.";
  if (rel.sameIp) return "On ne pille pas un compte de la même adresse.";
  if (protectedUntil(target) > now) return "Joueur arrivé depuis moins de 48 h : il est protégé.";
  if ((c.raidedAt ?? 0) + PILLAGE_EVERY_MS > now) return "Concession déjà pillée il y a moins de 6 h.";
  return null;
}

/** Applique un pillage réussi à la concession victime. */
export function pillaged(s: S2State, concId: string, loot: { stock: number; fund: number }, at: number): S2State {
  return { ...s, conc: s.conc.map((c) => (c.id === concId ? { ...c, stock: Math.max(0, c.stock - loot.stock), fund: Math.max(0, (c.fund ?? 0) - loot.fund), raidedAt: at } : c)) };
}

/** Ressource d'une concession (pour les textes). */
export function concRes(map: S2Map, c: Concession): Resource {
  return map.sites[c.site]?.type ?? "pierre";
}

export type { Rank };

// ---------------------------------------------------------------------------
// Escortes
// ---------------------------------------------------------------------------

type EscortHolder = ArmyHolder & { s2?: S2State };

/** Pourquoi on ne peut pas affecter cette compagnie à l'escorte de cette concession (null : c'est possible). */
export function escortBlocker(s: EscortHolder, concId: string, companyId: string, now: number): string | null {
  if (!s.s2?.conc.some((c) => c.id === concId)) return "Concession inconnue.";
  const c = (s.companies ?? []).find((x) => x.id === companyId);
  if (!c) return "Compagnie inconnue.";
  if ((s.escorts ?? []).some((e) => e.company === companyId)) return "Cette compagnie escorte déjà une autre route.";
  if (s.rift?.exp?.by?.[companyId] !== undefined) return "Cette compagnie est dans la faille.";
  if (c.trainUntil > now) return "Elle est à l'entraînement.";
  if ((allocation(s).get(companyId)?.home ?? 0) <= 0) return "Aucun homme de cette compagnie n'est au château.";
  return null;
}

/** Affecte une compagnie à l'escorte d'une route (ses hommes présents quittent le château) ; remplace l'escorte précédente. */
export function setEscort<S extends EscortHolder>(s: S, concId: string, companyId: string | null, now: number): { ok: true; value: S } | { ok: false; error: string } {
  let next: S = s;
  const old = (s.escorts ?? []).find((e) => e.conc === concId);
  if (old) next = releaseEscort(next, old.company);
  if (!companyId) return old ? { ok: true, value: next } : { ok: false, error: "Cette route n'a pas d'escorte." };
  const why = escortBlocker(next, concId, companyId, now);
  if (why) return { ok: false, error: why };
  const c = (next.companies ?? []).find((x) => x.id === companyId)!;
  const men = allocation(next).get(companyId)?.home ?? 0;
  const troops = { ...next.troops, [c.unit]: Math.max(0, (next.troops[c.unit] ?? 0) - men) };
  return { ok: true, value: { ...next, troops, escorts: [...(next.escorts ?? []), { company: companyId, conc: concId, men }] } };
}

/** Les hommes d'une escorte rentrent au château. */
export function releaseEscort<S extends EscortHolder>(s: S, companyId: string): S {
  const e = (s.escorts ?? []).find((x) => x.company === companyId);
  if (!e) return s;
  const c = (s.companies ?? []).find((x) => x.id === companyId);
  const troops = c ? { ...s.troops, [c.unit]: (s.troops[c.unit] ?? 0) + e.men } : s.troops;
  return { ...s, troops, escorts: (s.escorts ?? []).filter((x) => x.company !== companyId) };
}

/** Escortes relues de la base : une par concession et par compagnie connues. */
export function cleanEscorts(raw: unknown, companies: { id: string }[], conc: { id: string }[]): Escort[] {
  if (!Array.isArray(raw)) return [];
  const out: Escort[] = [];
  for (const x of raw as Record<string, unknown>[]) {
    if (!x || typeof x !== "object") continue;
    const company = String(x.company ?? "");
    const concId = String(x.conc ?? "");
    const men = Math.max(0, Math.floor(Number(x.men) || 0));
    if (men <= 0 || !companies.some((c) => c.id === company) || !conc.some((c) => c.id === concId)) continue;
    if (out.some((e) => e.company === company || e.conc === concId)) continue;
    out.push({ company, conc: concId, men });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contrats des seigneurs
// ---------------------------------------------------------------------------

export type ContractKind = "escorte" | "interception" | "camp";
export interface Contract {
  /** `jour:seigneur` : un contrat par seigneur et par jour. */
  id: string;
  lord: string;
  kind: ContractKind;
  /** Seigneur rival visé par une interception. */
  rival?: string;
  /** Où l'armée doit aller. */
  pos: Pos;
  /** Récompense en or ; le renom est fixe (3). */
  gold: number;
}
export const CONTRACTS_MAX = 3;
/** Récompense : 2 h de REF(j) en or, selon le rang du seigneur et la difficulté du contrat. */
export const CONTRACT_HOURS = 2;
export const CONTRACT_RANK_PAY: Record<Rank, number> = { hobereau: 0.75, baron: 1, comte: 1.5, duc: 2 };
export const CONTRACT_KIND_PAY: Record<ContractKind, number> = { escorte: 1, camp: 1.25, interception: 1.5 };
/** En dessous, le serveur refuse le départ : l'armée n'a aucune chance. */
export const CONTRACT_MIN_CHANCE = 0.05;

/** Pourquoi un contrat ne peut pas être pris, ou `null`. */
export function contractBlocker(s: S2State, id: string, day: number, list: Contract[]): string | null {
  if (list.some((c) => c.id === id)) return null;
  if (s.contracts?.day === day && s.contracts.taken.includes(id)) return "Contrat déjà pris aujourd'hui.";
  return "Ce seigneur ne te propose pas de contrat aujourd'hui.";
}
export const CONTRACT_TEXT: Record<ContractKind, { icon: string; title: (lord: string, rival?: string) => string; text: string }> = {
  escorte: { icon: "🛡️", title: (l) => `Escorter un convoi de ${l}`, text: "Ton armée accompagne son convoi jusqu'au beffroi ; des brigands l'attendent en route." },
  interception: { icon: "⚔️", title: (l, r) => `Intercepter un convoi de ${r ?? "son rival"} pour ${l}`, text: "Ton armée attaque l'escorte d'un convoi rival. Le rival t'en voudra (+10 d'hostilité)." },
  camp: { icon: "🏕️", title: (l) => `Détruire un camp de bandits près de ${l}`, text: "Une compagnie de bandits tient le camp ; elle s'entraîne un peu plus tous les 4 jours." },
};

/** Les contrats du jour : chaque seigneur neutre envers le joueur en propose au plus un, trois au plus en tout. */
export function contractsFor(s: S2State, map: S2Map, playerId: string, day: number, seasonStart: number, now: number): Contract[] {
  if (!s.castle) return [];
  const done = new Set(s.contracts?.day === day ? s.contracts.taken : []);
  const neutral = map.lords.filter((l) => hostilityLevel(hostilityAt(s, l.id, now)) === 0);
  const ranked = neutral.map((l) => ({ l, k: hash(`${playerId}:${day}:${l.id}`) })).sort((a, b) => a.k - b.k).slice(0, CONTRACTS_MAX);
  const gold = (CONTRACT_HOURS * REF((now - seasonStart) / DAY)) / VALUE.or;
  return ranked
    .map(({ l, k }): Contract => {
      const kind = (["escorte", "interception", "camp"] as const)[k % 3];
      const pay = Math.round(gold * CONTRACT_RANK_PAY[l.rank] * CONTRACT_KIND_PAY[kind]);
      const rival = kind === "interception" ? [...map.lords].filter((x) => x.id !== l.id).sort((a, b) => cheb(a.pos, l.pos) - cheb(b.pos, l.pos))[0] : undefined;
      const pos: Pos = kind === "interception" && rival ? rival.pos : kind === "camp" ? [Math.min(40, Math.max(0, l.pos[0] + ((k >> 3) % 5) - 2)), Math.min(40, Math.max(0, l.pos[1] + ((k >> 6) % 5) - 2))] : l.pos;
      return { id: `${day}:${l.id}`, lord: l.id, kind, ...(rival ? { rival: rival.id } : {}), pos, gold: pay };
    })
    .filter((c) => !done.has(c.id));
}

/** Adversaire d'un contrat, au moment du combat. */
export function contractFoe(c: Contract, map: S2Map, seasonStart: number, at: number): Side {
  const rival = c.rival ? map.lords.find((l) => l.id === c.rival) : undefined;
  if (c.kind === "interception" && rival) return patrolSide(rival, seasonStart, at);
  // Escorte : une bande de brigands sur la route ; camp : sa garnison, un peu plus aguerrie.
  const side = banditSide(seasonStart, at);
  return c.kind === "camp" ? { ...side, army: { milicien: COMPANY_CAP.milicien, piquier: Math.floor(COMPANY_CAP.piquier / 2) } } : side;
}

/** Prend un contrat du jour (il ne se reprend pas). */
export function takeContract(s: S2State, day: number, id: string): S2State {
  const taken = s.contracts?.day === day ? s.contracts.taken : [];
  return { ...s, contracts: { day, taken: [...taken, id].slice(-10) } };
}

/** Dangers d'une route pour l'écran : chaque zone traversée, la chance d'attaque d'une patrouille, le passage libre. */
export function routeDangers(s: S2State, map: S2Map, from: Pos, to: Pos, now: number): { lord: MapLord; chance: number; free: boolean; level: number }[] {
  return zonesOnRoute(map, from, to).map(({ lord }) => {
    const level = hostilityLevel(hostilityAt(s, lord.id, now));
    const free = freePass(s, lord.id, now);
    return { lord, level, free, chance: free ? 0 : Math.min(PATROL_CHANCE_MAX, PATROL_CHANCE[lord.rank] * HOSTILITY_LEVELS[level].chance) };
  });
}

/** Où vont les convois d'une concession (château, beffroi, ou une autre concession). */
export function routeEnd(s: S2State, map: S2Map, c: Concession, belfry: Pos): Pos | null {
  if (c.destConc) {
    const o = s.conc.find((x) => x.id === c.destConc);
    if (o && map.sites[o.site]) return map.sites[o.site].pos;
  }
  return c.dest === "beffroi" ? belfry : s.castle;
}
