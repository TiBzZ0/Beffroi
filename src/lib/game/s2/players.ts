// S8 : les joueurs contre les convois (interception, sabotage), la vision des convois et les routes commerciales.
// Règles pures, partagées par le navigateur (aperçu) et le serveur (qui fait foi).

import { DESERT_LOOT_BONUS, REF, VALUE, type Convoy, type S2State } from "./economy";
import { line, lossCap, WATCH_STAGE } from "./convoys";
import { cheb, REGION_BONUS, type Pos, type S2Map } from "./map";

const H = 3_600_000;
const DAY = 24 * H;

// ---------------------------------------------------------------------------
// Où est un convoi, et qui le voit
// ---------------------------------------------------------------------------

/** Case où se trouve un convoi à l'instant `t` (interpolée le long de la ligne droite). */
export function convoyAt(v: Pick<Convoy, "from" | "to" | "depart" | "arrive">, t: number): Pos {
  const cells = line(v.from, v.to);
  const span = Math.max(1, v.arrive - v.depart);
  const k = Math.min(1, Math.max(0, (t - v.depart) / span));
  return cells[Math.min(cells.length - 1, Math.round(k * (cells.length - 1)))];
}

/** Portée de vision autour de ses sites (château et concessions) ; « La tour de guet » ajoute 4 cases. */
export const CONVOY_VISION = 5;
export const WATCH_VISION = 4;
export function visionRange(stagesDone: number): number {
  return CONVOY_VISION + (stagesDone >= WATCH_STAGE ? WATCH_VISION : 0);
}

/** Les cases d'où le joueur voit les convois des autres : son château et les sites de ses concessions. */
export function watchPoints(s: S2State | undefined, map: S2Map): Pos[] {
  if (!s?.castle) return [];
  return [s.castle, ...s.conc.map((c) => map.sites[c.site]?.pos).filter((p): p is Pos => !!p)];
}

/** Un convoi d'un autre joueur est visible s'il passe à portée d'un de ses sites. */
export function convoyVisible(points: Pos[], range: number, at: Pos): boolean {
  return points.some((p) => cheb(p, at) <= range);
}

// ---------------------------------------------------------------------------
// Interception
// ---------------------------------------------------------------------------

/** Butin d'une interception : un tiers de la charge de départ (règle du tiers), +10 % pour un attaquant du Désert. */
export const INTERCEPT_SHARE = 1 / 3;

/**
 * Premier point du trajet que l'armée atteint avant le convoi : le combat a lieu quand le convoi y passe.
 * `travel(cells)` donne la durée de marche de l'armée pour une distance. Renvoie null si l'armée arrive trop tard partout.
 */
export function interceptPoint(v: Pick<Convoy, "from" | "to" | "depart" | "arrive">, castle: Pos, travel: (cells: number) => number, now: number): { at: number; cell: Pos } | null {
  if (v.arrive <= now) return null;
  const cells = line(v.from, v.to);
  const n = cells.length - 1;
  if (n < 1) return null;
  const span = Math.max(1, v.arrive - v.depart);
  // Le dernier point est l'arrivée : le convoi est déjà à l'abri.
  for (let i = 1; i < n; i++) {
    const pass = v.depart + (span * i) / n;
    if (pass <= now) continue;
    if (now + travel(cheb(castle, cells[i])) <= pass) return { at: Math.round(pass), cell: cells[i] };
  }
  return null;
}

/** Pourquoi on ne peut pas intercepter ce convoi (null : c'est possible). */
export function interceptBlocker(target: S2State | undefined, v: Convoy | undefined, rel: { allied: boolean; sameIp: boolean; newbieUntil: number }, now: number): string | null {
  if (!target?.castle) return "Ce joueur n'a pas encore de château.";
  if (!v || v.arrive <= now) return "Ce convoi est déjà arrivé.";
  if (rel.allied) return "On n'attaque pas le convoi d'un allié.";
  if (rel.sameIp) return "On n'attaque pas un compte de la même adresse.";
  if (rel.newbieUntil > now) return "Joueur arrivé depuis moins de 48 h : ses convois sont protégés.";
  if (v.hit) return "Ce convoi a déjà été attaqué par un joueur.";
  return null;
}

/** Ce que l'attaque d'un joueur prend à un convoi : la part de la règle du tiers qui reste. */
export function interceptTake(v: Convoy, stagesDone: number): number {
  const load0 = v.load + (v.lost ?? 0);
  const room = load0 * lossCap(stagesDone) - (v.lost ?? 0);
  return Math.max(0, Math.min(v.load, room, load0 * INTERCEPT_SHARE));
}

/** Butin de l'attaquant : ce qui est pris, +10 % s'il est du Désert. */
export function interceptLoot(taken: number, attacker: S2State | undefined): number {
  return taken * (attacker?.region === "desert" ? 1 + DESERT_LOOT_BONUS : 1);
}

/** Applique une interception au convoi visé (identifié par sa concession et son départ). */
export function hitConvoy(s: S2State, conc: string, depart: number, taken: number): S2State {
  return { ...s, convoys: s.convoys.map((v) => (v.conc === conc && v.depart === depart ? { ...v, load: Math.max(0, v.load - taken), lost: (v.lost ?? 0) + taken, hit: true } : v)) };
}

// ---------------------------------------------------------------------------
// Sabotage
// ---------------------------------------------------------------------------

export const SABOTAGE_CHANCE = 0.6;
export const SABOTAGE_DELAY_MS = 15 * 60_000;
export const SABOTAGE_SHARE = 0.15;

/** Prix d'un sabotage : 1 h × REF(j) / 4 en or. */
export function sabotagePrice(seasonStart: number, now: number): number {
  return Math.round(REF(Math.max(0, (now - seasonStart) / DAY)) / 4 / VALUE.or);
}

/** Chance de réussite : 60 %, +10 % pour un saboteur de la Forêt, moins la vigilance de la cible (sentinelles, Lignée). */
export function sabotageChance(attacker: S2State | undefined, guard = 0): number {
  return Math.max(0.05, Math.min(0.95, SABOTAGE_CHANCE + (attacker?.region === "foret" ? REGION_BONUS : 0) - guard));
}

/** Pourquoi on ne peut pas saboter ce convoi (null : c'est possible). */
export function sabotageBlocker(me: S2State | undefined, target: S2State | undefined, v: Convoy | undefined, rel: { allied: boolean; sameIp: boolean; newbieUntil: number }, price: number, now: number): string | null {
  if (!me?.castle) return "Pose d'abord ton château.";
  const why = interceptBlocker(target, v, rel, now);
  if (why && !(v?.hit && why.includes("déjà été attaqué"))) return why;
  if (v?.sabotaged) return "Ce convoi a déjà été visé par un saboteur : son escorte veille.";
  if (me.gold < price) return `Il faut ${price.toLocaleString("fr-FR")} 🪙 pour payer le saboteur.`;
  return null;
}

/** Un sabotage réussi : le convoi part 15 min plus tard et perd 15 % de sa charge (dans la règle du tiers). */
export function sabotaged(s: S2State, conc: string, depart: number, stagesDone: number): { s: S2State; destroyed: number } {
  let destroyed = 0;
  const convoys = s.convoys.map((v) => {
    if (v.conc !== conc || v.depart !== depart) return v;
    const load0 = v.load + (v.lost ?? 0);
    destroyed = Math.max(0, Math.min(v.load, load0 * lossCap(stagesDone) - (v.lost ?? 0), load0 * SABOTAGE_SHARE));
    return { ...v, load: v.load - destroyed, lost: (v.lost ?? 0) + destroyed, arrive: v.arrive + SABOTAGE_DELAY_MS, sabotaged: true };
  });
  return { s: { ...s, convoys }, destroyed };
}

// ---------------------------------------------------------------------------
// Routes commerciales
// ---------------------------------------------------------------------------

/** Or par case de longueur et par convoi (un par heure) : 0,05 h × REF(j) / 4, +10 % en Côte. */
export const TRADE_HOURS_PER_CELL = 0.05;
export const TRADE_MAX = 3;

/** Une route active : l'autre bout (château d'un joueur consentant, ou forteresse de l'alliance), depuis quand. */
export interface TradeRoute {
  to: string;
  name: string;
  pos: Pos;
  since: number;
  /** Fin de la route (forteresse perdue), si elle est connue. */
  until?: number;
}
let tradeRoutes: Record<string, TradeRoute[]> = {};
/** Routes actives de chaque joueur (fixées par le serveur, et par le navigateur pour le joueur). */
export function setTrades(t: Record<string, TradeRoute[]>): void {
  tradeRoutes = t;
}
export function tradesOf(playerId: string | undefined): TradeRoute[] {
  return playerId ? (tradeRoutes[playerId] ?? []) : [];
}

export function tradePay(s: S2State, from: Pos, to: Pos, seasonStart: number, t: number): number {
  const ref = REF(Math.max(0, (t - seasonStart) / DAY));
  return (TRADE_HOURS_PER_CELL * ref * cheb(from, to) * (s.region === "cote" ? 1 + REGION_BONUS : 1)) / 4 / VALUE.or;
}

/** Chaque heure pleine, un convoi part vers l'autre bout de chaque route active ; il rapporte de l'or à l'arrivée. */
export function tradeConvoys(st: S2State, seasonStart: number, from: number, to: number, travel: (a: Pos, b: Pos) => number): void {
  if (!st.castle) return;
  for (const r of tradesOf(st.who?.id)) {
    const start = Math.max(from, r.since);
    const end = Math.min(to, r.until ?? Infinity);
    for (let h = Math.ceil(start / H) * H; h <= end; h += H) {
      if (h <= from) continue;
      const pay = tradePay(st, st.castle, r.pos, seasonStart, h);
      if (pay <= 0) continue;
      st.convoys.push({ conc: `trade:${r.to}`, res: "or", load: pay, depart: h, arrive: h + travel(st.castle, r.pos), from: st.castle, to: r.pos, dest: "commerce" });
    }
  }
}

/** Les routes actives : celles que les deux bouts ont proposées (ou une forteresse tenue par l'alliance). */
export function activeTrades(players: { id: string; name: string; s2?: S2State; alliance: number | null }[], forts: { key: string; name: string; pos: Pos; holder: number | null }[]): Record<string, TradeRoute[]> {
  const byId = new Map(players.map((p) => [p.id, p]));
  const out: Record<string, TradeRoute[]> = {};
  for (const p of players) {
    if (!p.s2?.castle) continue;
    const list: TradeRoute[] = [];
    for (const t of p.s2.trade ?? []) {
      if (t.to.startsWith("fort:")) {
        const f = forts.find((x) => x.key === t.to);
        if (f && p.alliance !== null && f.holder === p.alliance) list.push({ to: t.to, name: f.name, pos: f.pos, since: t.at });
        continue;
      }
      const o = byId.get(t.to);
      const back = o?.s2?.trade?.find((x) => x.to === p.id);
      if (o?.s2?.castle && back) list.push({ to: o.id, name: o.name, pos: o.s2.castle, since: Math.max(t.at, back.at) });
    }
    if (list.length) out[p.id] = list.slice(0, TRADE_MAX);
  }
  return out;
}

/** Propose (ou retire) une route commerciale vers un autre château ou une forteresse. */
export function setTradeOffer(s: S2State, to: string, on: boolean, now: number, selfId?: string): { ok: true; value: S2State } | { ok: false; error: string } {
  if (!s.castle) return { ok: false, error: "Pose d'abord ton château." };
  if (!to || to === selfId) return { ok: false, error: "Choisis un autre château." };
  const list = s.trade ?? [];
  if (!on) return { ok: true, value: { ...s, trade: list.filter((t) => t.to !== to) } };
  if (list.some((t) => t.to === to)) return { ok: false, error: "Route déjà proposée." };
  if (list.length >= TRADE_MAX) return { ok: false, error: `${TRADE_MAX} routes commerciales au plus.` };
  return { ok: true, value: { ...s, trade: [...list, { to, at: now }] } };
}
