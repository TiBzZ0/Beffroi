// Saison 2, S1, S3, S4 : monnaies, concessions, bâtiments d'appui et convois automatiques.
// Le domaine ne produit plus rien : chaque concession produit dans un stock local, et un convoi part vers le château
// à chaque intervalle. Tout se calcule à la lecture (comme `advance`), sans tâche de fond.

import { cheb, S2_BELFRY, siteFactor, type Pos, type RegionId, type Resource, type S2Map } from "./map";

// ---------------------------------------------------------------------------
// Monnaies et courbe de référence
// ---------------------------------------------------------------------------

/** Valeur de référence en pierre : 1 or = 2 fer = 4 pierre. */
export const VALUE: Record<Resource, number> = { pierre: 1, fer: 2, or: 4 };
export const RESOURCE_ICON: Record<Resource, string> = { pierre: "🪨", fer: "⚔️", or: "🪙" };
export const RESOURCE_LABEL: Record<Resource, string> = { pierre: "pierre", fer: "fer", or: "or" };
/** Production de base d'une concession, par heure. */
export const BASE_PROD: Record<Resource, number> = { pierre: 100, fer: 50, or: 25 };
/** Marché : une monnaie contre une autre au tiers de sa valeur de référence. */
export const MARKET_RATE = 1 / 3;
/** Or en plus à chaque convoi arrivé : 3 % de sa charge, en valeur de référence. */
export const CONVOY_GOLD = 0.03;

/** REF(j) : production d'une concession typique d'un joueur actif au jour j, en valeur pierre par heure. */
const REF_POINTS: [number, number][] = [[0, 100], [3, 400], [7, 1200], [14, 3000]];
export function REF(day: number): number {
  const d = Math.max(0, day);
  for (let i = 1; i < REF_POINTS.length; i++) {
    const [d1, r1] = REF_POINTS[i];
    if (d <= d1) {
      const [d0, r0] = REF_POINTS[i - 1];
      return r0 * Math.pow(r1 / r0, (d - d0) / (d1 - d0));
    }
  }
  // Au-delà du dernier point : on prolonge la dernière pente.
  const [d0, r0] = REF_POINTS[REF_POINTS.length - 2];
  const [d1, r1] = REF_POINTS[REF_POINTS.length - 1];
  return r1 * Math.pow(r1 / r0, (d - d1) / (d1 - d0));
}

/** Marché : ce que rapporte `amount` de `from` en `to`. */
export function marketQuote(from: Resource, to: Resource, amount: number): number {
  if (from === to) return 0;
  return Math.floor((amount * VALUE[from] * MARKET_RATE) / VALUE[to]);
}

// ---------------------------------------------------------------------------
// Concessions et bâtiments d'appui
// ---------------------------------------------------------------------------

export const CONCESSION_MAX_LEVEL = 15;
export const CONCESSIONS_MAX = 5;
/** Concessions achetées en or : la 3e, la 4e, la 5e. */
export const CONCESSION_GOLD = [1_500, 5_000, 15_000];
export const LOCAL_STOCK_HOURS = 4;

export function concessionLevelFactor(level: number): number {
  return 1 + 0.2 * (Math.max(1, level) - 1);
}
/** Prix du niveau n (2 à 15) d'une concession, en pierre. */
export function concessionCost(level: number): number {
  return Math.round(300 * Math.pow(1.5, level - 1));
}
export function concessionBuildMs(level: number): number {
  return Math.round(5 * 60_000 * Math.pow(1.3, level - 1));
}

export type BuildingId = "outils" | "charronnerie" | "relais" | "entrepot";
export const BUILDING_MAX = 20;
export const BUILDING_SLOTS = 2;
export const BUILDINGS: Record<BuildingId, { name: string; icon: string; base: number; text: string }> = {
  outils: { name: "Outils", icon: "🛠️", base: 500, text: "+5 % de production de toutes les concessions par niveau" },
  charronnerie: { name: "Charronnerie", icon: "🛞", base: 400, text: "Charge d'un convoi : 60 min de production de base, +10 % par niveau" },
  relais: { name: "Relais", icon: "🐎", base: 400, text: "Un convoi toutes les 60 min, 2 min de moins par niveau ; convois 3 % plus rapides par niveau" },
  entrepot: { name: "Entrepôt", icon: "🏚️", base: 300, text: "Stock local +30 min par niveau ; stock à l'abri au château +15 min par niveau" },
};
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export function buildingCost(id: BuildingId, level: number): number {
  return Math.round(BUILDINGS[id].base * Math.pow(1.5, level - 1));
}
export function buildingMs(level: number): number {
  return Math.round(10 * 60_000 * Math.pow(1.25, level - 1));
}

// ---------------------------------------------------------------------------
// État du joueur
// ---------------------------------------------------------------------------

export interface Concession {
  id: string;
  site: number;
  level: number;
  /** Stock local au moment `S2State.at`. */
  stock: number;
  /** Prochain départ de convoi. */
  next: number;
  /** Amélioration en cours vers `level + 1`. */
  upUntil?: number;
  /** Rythme : prudent (−20 %, stock ×2) ou intensif (+25 %, 5 % de la valeur en or à chaque convoi). Absent : normal. */
  pace?: Pace;
  /** Destination des convois : absent pour le château. */
  dest?: Dest;
  /** Convois envoyés à une autre de ses concessions (sa réserve de chantier) ; prime sur `dest`. */
  destConc?: string;
  /** Convois à la main : la concession garde tout jusqu'à ce que le joueur en envoie un. */
  manual?: boolean;
  /** Brigands : prochain passage (stock au-dessus de 90 % depuis une heure), et avis déjà donné. */
  banditAt?: number;
  warned?: boolean;
  /** Réserve de chantier, en valeur pierre : ce que le château lui a envoyé, pour ses améliorations. */
  fund?: number;
}
export type Pace = "prudent" | "normal" | "intensif";
export type Dest = "chateau" | "beffroi";
export const PACES: Record<Pace, { name: string; prod: number; stock: number; text: string }> = {
  prudent: { name: "Prudent", prod: 0.8, stock: 2, text: "Production −20 %, stock local ×2 : pour s'absenter." },
  normal: { name: "Normal", prod: 1, stock: 1, text: "Le rythme de base." },
  intensif: { name: "Intensif", prod: 1.25, stock: 1, text: "Production +25 %, mais chaque convoi coûte 5 % de sa valeur en or. Sans or, retour en normal." },
};
/** Intensif : part de la valeur d'un convoi payée en or au départ. */
export const INTENSIVE_GOLD = 0.05;
export interface Convoy {
  conc: string;
  res: Resource;
  load: number;
  depart: number;
  arrive: number;
  from: Pos;
  to: Pos;
  /** Convoi parti vers le beffroi (sa charge compte comme un don à l'arrivée), ou du château vers la concession `conc` (sa réserve). */
  dest?: "beffroi" | "concession";
}
export interface S2Work {
  id: BuildingId;
  level: number;
  until: number;
}
export interface S2State {
  castle: Pos | null;
  region: RegionId | null;
  iron: number;
  gold: number;
  conc: Concession[];
  convoys: Convoy[];
  bld: Record<BuildingId, number>;
  works: S2Work[];
  /** Concessions achetées en or (0 à 3). */
  bought: number;
  /** Instant jusqu'où le calcul a été fait. */
  at: number;
  /** Production livrée sur la saison, en valeur pierre (classement de richesse). */
  produced: number;
  /** Convois livrés au beffroi, en valeur pierre, pas encore versés au chantier. */
  giftOwed?: number;
  /** Lancement : production et charge ×LAUNCH_MULT jusqu'à cet instant (24 h après la pose du château). */
  launchUntil?: number;
  /** Ce qui s'est passé sur les concessions (brigands), pour la boîte de réception. */
  log?: { at: number; text: string }[];
  /** S10, Lignée (fixés à chaque calcul, jamais lus de la base) : Cave profonde, heures de stock local en plus. */
  stockBonusHours?: number;
  /** Charpentiers : convois plus rapides (part). */
  convoySpeed?: number;
  /** Grands chariots : charge des convois en plus (part, ajoutée à la charronnerie). */
  loadBonus?: number;
}

export function newS2State(now: number): S2State {
  return { castle: null, region: null, iron: 3_000, gold: 0, conc: [], convoys: [], bld: { outils: 0, charronnerie: 0, relais: 0, entrepot: 0 }, works: [], bought: 0, at: now, produced: 0 };
}

/** Ce qui vient d'ailleurs que de l'état : la carte, et les bonus de l'instant. */
export interface S2Context {
  map: S2Map;
  /** Concessions gagnées par les étapes du beffroi (la 2e à la première étape). */
  stageConcessions: number;
  /** Multiplicateur de production commun (élan, bonus du jour, dons au beffroi…), par segment. */
  multiplier?: (t: number) => number;
  /** Instants où ce multiplicateur change. */
  breakpoints?: number[];
  /** Beffroi achevé : les convois qui devaient y aller rentrent au château. */
  belfryDone?: boolean;
  /** Pas de brigands avant cet instant (48 h après l'arrivée du joueur). */
  banditsFrom?: number;
}

export function concessionSlots(s: S2State, ctx: Pick<S2Context, "stageConcessions">): number {
  return Math.min(CONCESSIONS_MAX, 1 + ctx.stageConcessions + s.bought);
}

const regionBonus = (s: S2State, res: Resource) =>
  (s.region === "montagne" && res === "pierre") || (s.region === "collines" && res === "fer") || (s.region === "cote" && res === "or") ? 1.1 : 1;

/** Production horaire d'une concession, hors multiplicateur commun. */
export function concessionRate(s: S2State, c: Concession, map: S2Map): number {
  const site = map.sites[c.site];
  if (!site) return 0;
  return BASE_PROD[site.type] * siteFactor(site.places) * concessionLevelFactor(c.level) * (1 + 0.05 * s.bld.outils) * regionBonus(s, site.type) * PACES[c.pace ?? "normal"].prod;
}
/** Charge d'un convoi : 60 min de production de base de la concession, +10 % par niveau de charronnerie. */
export function convoyLoad(s: S2State, c: Concession, map: S2Map): number {
  const site = map.sites[c.site];
  return site ? BASE_PROD[site.type] * siteFactor(site.places) * (1 + 0.1 * s.bld.charronnerie + (s.loadBonus ?? 0)) : 0;
}
export function convoyIntervalMs(s: S2State): number {
  return Math.max(20, 60 - 2 * s.bld.relais) * 60_000;
}
export function localCap(s: S2State, c: Concession, map: S2Map): number {
  return concessionRate(s, c, map) * (LOCAL_STOCK_HOURS + 0.5 * s.bld.entrepot + (s.stockBonusHours ?? 0)) * PACES[c.pace ?? "normal"].stock;
}
/** Trajet d'un convoi : 2 min par case (Tchebychev), plafonné à 45 min, plus rapide avec le relais et en Plaine. */
export function convoyTravelMs(s: S2State, from: Pos, to: Pos): number {
  const base = Math.min(45, 2 * cheb(from, to)) * 60_000;
  return Math.round(base / ((1 + 0.03 * s.bld.relais) * (s.region === "plaine" ? 1.1 : 1) * (1 + (s.convoySpeed ?? 0))));
}
/** Stock du château à l'abri des raids : 15 min de production par niveau d'entrepôt (au moins 30 min). */
export function safeHours(s: S2State): number {
  return 0.5 + 0.25 * s.bld.entrepot;
}

/** Production horaire totale, en valeur pierre (sert aux plafonds de butin, aux quêtes, aux classements). */
export function productionValue(s: S2State, map: S2Map): number {
  return s.conc.reduce((a, c) => a + concessionRate(s, c, map) * VALUE[map.sites[c.site]?.type ?? "pierre"], 0);
}

/** Stock local plein : la concession s'arrête (« stock plein, améliore ta charronnerie »). */
export function stockFull(s: S2State, c: Concession, map: S2Map): boolean {
  return c.stock >= localCap(s, c, map) - convoyLoad(s, c, map) - 1e-6 && concessionRate(s, c, map) * (convoyIntervalMs(s) / 3_600_000) > convoyLoad(s, c, map);
}

// ---------------------------------------------------------------------------
// Calcul paresseux
// ---------------------------------------------------------------------------

export interface Arrivals {
  pierre: number;
  fer: number;
  or: number;
  /** Livré au beffroi, en valeur pierre (compte comme un don). */
  beffroi?: number;
}

/**
 * Fait avancer la saison 2 du joueur jusqu'à `now` : production des concessions, départs et arrivées de convois,
 * chantiers finis. Renvoie le nouvel état et ce qui est arrivé au château (à verser dans la pierre, le fer et l'or).
 */
export function settleS2(s: S2State, ctx: S2Context, now: number): { s: S2State; arrived: Required<Arrivals> } {
  const arrived: Required<Arrivals> = { pierre: 0, fer: 0, or: 0, beffroi: 0 };
  if (now <= s.at || !s.castle) return { s: s.castle ? s : { ...s, at: Math.max(s.at, now) }, arrived };
  let st: S2State = { ...s, bld: { ...s.bld }, conc: s.conc.map((c) => ({ ...c })), convoys: [...s.convoys], works: [...s.works] };
  const castle = st.castle!;
  const mult = ctx.multiplier ?? (() => 1);
  // Instants où quelque chose change : chantiers finis, bonus communs.
  const cuts = [...st.works.map((w) => w.until), ...st.conc.map((c) => c.upUntil ?? 0), st.launchUntil ?? 0, ...(ctx.breakpoints ?? [])].filter((t) => t > st.at && t < now);
  cuts.sort((a, b) => a - b);
  let cursor = st.at;
  for (const end of [...cuts, now]) {
    const launch = cursor < (st.launchUntil ?? 0) ? LAUNCH_MULT : 1;
    const m = mult(cursor) * launch;
    const interval = convoyIntervalMs(st);
    for (const c of st.conc) {
      const site = ctx.map.sites[c.site];
      if (!site) continue;
      let rate = (concessionRate(st, c, ctx.map) * m) / 3_600_000;
      let cap = localCap(st, c, ctx.map);
      const load = convoyLoad(st, c, ctx.map) * launch;
      let t = cursor;
      const name = site.name || site.type;
      // Le stock monte jusqu'à `to` ; au passage des 90 %, un avis, et les brigands rôdent une heure plus tard.
      const grow = (to: number) => {
        const before = c.stock;
        c.stock = Math.min(cap, c.stock + rate * (to - t));
        const hi = BANDIT_HIGH * cap;
        if (before < hi && c.stock >= hi && rate > 0) {
          const tc = t + (hi - before) / rate;
          if (!c.warned) {
            c.warned = true;
            log(st, tc, `⚠️ Stock presque plein à ${name} : des brigands rôdent.`);
          }
          c.banditAt ??= tc + BANDIT_EVERY_MS;
        }
        t = to;
      };
      // Sous 70 %, l'avis pourra revenir.
      const settled = () => {
        if (c.stock < BANDIT_CLEAR * cap) delete c.warned;
      };
      if (c.stock >= BANDIT_HIGH * cap) c.banditAt ??= t + BANDIT_EVERY_MS;
      // Départs et passages des brigands dans le segment, dans l'ordre.
      while (Math.min(c.next, c.banditAt ?? Infinity) <= end) {
        if (c.banditAt !== undefined && c.banditAt < c.next) {
          const at = c.banditAt;
          grow(Math.max(at, t));
          if (c.pace !== "prudent" && at >= (ctx.banditsFrom ?? 0) && c.stock >= BANDIT_HIGH * cap - 1e-6 && roll(c.id, at) < BANDIT_CHANCE) {
            const stolen = c.stock * BANDIT_SHARE;
            c.stock -= stolen;
            log(st, at, `🗡️ Brigands à ${name} : −${Math.round(stolen).toLocaleString("fr-FR")} ${site.type}.`);
          }
          // Encore au-dessus de 90 % : ils repassent dans une heure ; sinon ils attendent le prochain passage des 90 %.
          if (c.stock >= BANDIT_HIGH * cap - 1e-6) c.banditAt = at + BANDIT_EVERY_MS;
          else delete c.banditAt;
          settled();
          continue;
        }
        const dep = Math.max(c.next, t);
        grow(dep);
        const take = c.manual ? 0 : Math.min(c.stock, load);
        if (take >= 1) {
          c.stock -= take;
          // Vers une autre concession tant que sa réserve a la place ; sinon le convoi rentre au château.
          const target = c.destConc ? st.conc.find((x) => x.id === c.destConc) : undefined;
          const targetSite = target ? ctx.map.sites[target.site] : undefined;
          if (target && targetSite && fundRoom(st, target) >= take * VALUE[site.type] - 1e-6) {
            st.convoys.push({ conc: target.id, res: site.type, load: take, depart: dep, arrive: dep + convoyTravelMs(st, site.pos, targetSite.pos), from: site.pos, to: targetSite.pos, dest: "concession" });
          } else {
            const to = c.dest === "beffroi" && !ctx.belfryDone ? S2_BELFRY : castle;
            st.convoys.push({ conc: c.id, res: site.type, load: take, depart: dep, arrive: dep + convoyTravelMs(st, site.pos, to), from: site.pos, to, ...(to === castle ? {} : { dest: "beffroi" as const }) });
          }
          if (c.pace === "intensif") {
            const fee = (take * VALUE[site.type] * INTENSIVE_GOLD) / VALUE.or;
            if (st.gold >= fee) st.gold -= fee;
            else {
              // Plus d'or : la concession repasse en normal.
              c.pace = undefined;
              rate = (concessionRate(st, c, ctx.map) * m) / 3_600_000;
              cap = localCap(st, c, ctx.map);
            }
          }
        }
        c.next = dep + interval;
        settled();
      }
      grow(end);
    }
    // Chantiers finis à `end`.
    st.conc = st.conc.map((c) => (c.upUntil && c.upUntil <= end ? { ...c, level: Math.min(CONCESSION_MAX_LEVEL, c.level + 1), upUntil: undefined } : c));
    const done = st.works.filter((w) => w.until <= end);
    for (const w of done) st.bld[w.id] = Math.max(st.bld[w.id], w.level);
    st.works = st.works.filter((w) => w.until > end);
    cursor = end;
  }
  // Arrivées.
  const still: Convoy[] = [];
  let produced = 0;
  for (const v of st.convoys) {
    if (v.arrive <= now) {
      if (v.dest === "concession") {
        // Ravitaillement : la réserve de la concession grossit, rien n'arrive au château.
        st.conc = st.conc.map((c) => (c.id === v.conc ? { ...c, fund: (c.fund ?? 0) + v.load * VALUE[v.res] } : c));
        continue;
      }
      if (v.dest === "beffroi") arrived.beffroi += v.load * VALUE[v.res];
      else arrived[v.res] += v.load;
      produced += v.load * VALUE[v.res];
      arrived.or += (v.load * VALUE[v.res] * CONVOY_GOLD) / VALUE.or;
    } else still.push(v);
  }
  st = { ...st, convoys: still, at: now, produced: st.produced + produced };
  return { s: st, arrived };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type R<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = <T>(error: string): R<T> => ({ ok: false, error });
let seq = 0;
const newId = (now: number) => `c${now.toString(36)}${(seq++ % 1296).toString(36)}`;

/** Places prises sur un site, par les joueurs (liste fournie par le serveur) et les seigneurs. */
export interface SiteOccupancy {
  taken: (siteId: number) => number;
}

export function takeConcessionBlocker(s: S2State, ctx: S2Context, siteId: number, occ: SiteOccupancy): string | null {
  const site = ctx.map.sites[siteId];
  if (!site) return "Site inconnu.";
  if (!s.castle) return "Pose d'abord ton château.";
  if (s.conc.length >= concessionSlots(s, ctx)) return "Plus de place pour une concession : achète-en une avec de l'or, ou fais avancer le beffroi.";
  if (occ.taken(siteId) >= site.places) return "Ce site est complet.";
  return null;
}

export function takeConcession(s: S2State, ctx: S2Context, siteId: number, occ: SiteOccupancy, now: number): R<S2State> {
  const why = takeConcessionBlocker(s, ctx, siteId, occ);
  if (why) return fail(why);
  // Le premier convoi part tout de suite, déjà chargé : on voit arriver sa première pierre sans attendre une heure.
  const c: Concession = { id: newId(now), site: siteId, level: 1, stock: 0, next: now };
  c.stock = convoyLoad(s, c, ctx.map);
  return { ok: true, value: { ...s, conc: [...s.conc, c] } };
}

/** Abandonner une concession : sans remboursement, niveau perdu, la place se libère. */
/** Convoi à la main : part tout de suite avec ce qu'il y a au stock, une charge au plus, vers la destination réglée. */
export function shipNow(s: S2State, id: string, map: S2Map, now: number): R<S2State> {
  const c0 = s.conc.find((x) => x.id === id);
  if (!c0) return fail("Concession inconnue.");
  if (!s.castle) return fail("Pose d'abord ton château.");
  const site = map.sites[c0.site];
  if (!site) return fail("Site inconnu.");
  const take = Math.min(c0.stock, convoyLoad(s, c0, map));
  if (take < 1) return fail("Rien à envoyer.");
  const c = { ...c0, stock: c0.stock - take };
  const st: S2State = { ...s, conc: s.conc.map((x) => (x.id === id ? c : x)), convoys: [...s.convoys] };
  const target = c.destConc ? st.conc.find((x) => x.id === c.destConc) : undefined;
  const targetSite = target ? map.sites[target.site] : undefined;
  if (target && targetSite && fundRoom(st, target) >= take * VALUE[site.type] - 1e-6) {
    st.convoys.push({ conc: target.id, res: site.type, load: take, depart: now, arrive: now + convoyTravelMs(st, site.pos, targetSite.pos), from: site.pos, to: targetSite.pos, dest: "concession" });
  } else {
    const to = c.dest === "beffroi" ? S2_BELFRY : s.castle;
    st.convoys.push({ conc: c.id, res: site.type, load: take, depart: now, arrive: now + convoyTravelMs(st, site.pos, to), from: site.pos, to, ...(to === s.castle ? {} : { dest: "beffroi" as const }) });
  }
  return { ok: true, value: st };
}

/** Règle le rythme et la destination d'une concession ; l'effet vaut dès le convoi suivant. */
/** Lancement : les 24 premières heures après la pose du château, production et charge des convois ×3. */
export const LAUNCH_MULT = 3;
export const LAUNCH_MS = 24 * 3_600_000;
/** Pierre offerte à la pose du château, pour bâtir tout de suite. */
export const START_STONE = 1_000;

/** Brigands (dès la vague A) : une heure après que le stock local a passé 90 %, puis toutes les heures tant qu'il y est encore. */
export const BANDIT_HIGH = 0.9;
export const BANDIT_CLEAR = 0.7;
export const BANDIT_CHANCE = 0.3;
export const BANDIT_SHARE = 0.2;
export const BANDIT_EVERY_MS = 3_600_000;
/** Pas de brigands pendant les 48 premières heures d'un joueur. */
export const BANDIT_GRACE_MS = 48 * 3_600_000;
const LOG_MAX = 30;
function roll(id: string, at: number): number {
  let h = 2166136261 ^ Math.floor(at / 1000);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
function log(st: S2State, at: number, text: string) {
  st.log = [...(st.log ?? []), { at: Math.round(at), text }].slice(-LOG_MAX);
}

export function setConcession(s: S2State, id: string, pace: unknown, dest: unknown, manual?: unknown): R<S2State> {
  const c = s.conc.find((x) => x.id === id);
  if (!c) return fail("Concession inconnue.");
  if (pace !== undefined && !(typeof pace === "string" && pace in PACES)) return fail("Rythme inconnu.");
  const toConc = typeof dest === "string" && s.conc.some((x) => x.id === dest) ? dest : null;
  if (toConc === id) return fail("Une concession ne s'envoie pas ses propres convois.");
  if (dest !== undefined && dest !== "chateau" && dest !== "beffroi" && !toConc) return fail("Destination inconnue.");
  if (pace === "intensif" && s.gold <= 0) return fail("Il faut de l'or pour le rythme intensif.");
  const next: Concession = { ...c };
  if (pace !== undefined) {
    if (pace === "normal") delete next.pace;
    else next.pace = pace as Pace;
  }
  if (manual === true) next.manual = true;
  else if (manual === false) delete next.manual;
  if (dest !== undefined) {
    delete next.dest;
    delete next.destConc;
    if (dest === "beffroi") next.dest = "beffroi";
    else if (toConc) next.destConc = toConc;
  }
  return { ok: true, value: { ...s, conc: s.conc.map((x) => (x.id === id ? next : x)) } };
}

export function dropConcession(s: S2State, id: string): R<S2State> {
  if (!s.conc.some((c) => c.id === id)) return fail("Concession inconnue.");
  if (s.conc.length <= 1) return fail("Garde au moins une concession.");
  return { ok: true, value: { ...s, conc: s.conc.filter((c) => c.id !== id).map((c) => (c.destConc === id ? { ...c, destConc: undefined } : c)), convoys: s.convoys } };
}

/** Ce qu'une concession peut mettre dans ses travaux, en valeur pierre : sa réserve, puis son stock local. */
export function concessionBudget(c: Concession, map: S2Map): number {
  return (c.fund ?? 0) + c.stock * VALUE[map.sites[c.site]?.type ?? "pierre"];
}

export function upgradeConcessionBlocker(s: S2State, id: string, map: S2Map, now: number): string | null {
  const c = s.conc.find((x) => x.id === id);
  if (!c) return "Concession inconnue.";
  if (c.upUntil && c.upUntil > now) return "Déjà en travaux.";
  if (c.level >= CONCESSION_MAX_LEVEL) return "Niveau maximal.";
  if (concessionCost(c.level + 1) > concessionBudget(c, map) + 1e-6) return "Réserve et stock de la concession insuffisants : envoie-lui des ressources.";
  return null;
}

/** L'amélioration se paie sur place : d'abord la réserve envoyée par le château, puis le stock local. */
export function upgradeConcession(s: S2State, id: string, map: S2Map, now: number): R<{ s: S2State; cost: number }> {
  const why = upgradeConcessionBlocker(s, id, map, now);
  if (why) return fail(why);
  const c = s.conc.find((x) => x.id === id)!;
  const cost = concessionCost(c.level + 1);
  const fromFund = Math.min(c.fund ?? 0, cost);
  const value = VALUE[map.sites[c.site]?.type ?? "pierre"];
  const next: Concession = { ...c, fund: (c.fund ?? 0) - fromFund, stock: Math.max(0, c.stock - (cost - fromFund) / value), upUntil: now + concessionBuildMs(c.level + 1) };
  return { ok: true, value: { s: { ...s, conc: s.conc.map((x) => (x.id === id ? next : x)) }, cost } };
}

/** Ravitaille une concession depuis le château : un convoi part tout de suite et remplit sa réserve à l'arrivée. */
export function supplyBlocker(s: S2State, id: string, have: Record<Resource, number>, res: unknown, amount: number): string | null {
  if (!s.castle) return "Pose d'abord ton château.";
  const c = s.conc.find((x) => x.id === id);
  if (!c) return "Concession inconnue.";
  if (res !== "pierre" && res !== "fer" && res !== "or") return "Ressource inconnue.";
  if (!Number.isInteger(amount) || amount < 1) return "Quantité invalide.";
  if (amount > have[res]) return "Pas assez au château.";
  const room = fundRoom(s, c);
  if (room <= 0) return c.level + (c.upUntil ? 1 : 0) >= CONCESSION_MAX_LEVEL ? "Concession au niveau maximal : plus besoin de réserve." : "Réserve pleine : elle couvre déjà les deux prochains niveaux.";
  if (amount * VALUE[res] > room + 1e-6) return `Trop : la réserve accepte encore ${Math.floor(room / VALUE[res]).toLocaleString("fr-FR")} ${res}.`;
  return null;
}
/** Place restante dans la réserve, en valeur pierre : le coût des deux prochains niveaux, moins la réserve et les ravitaillements en route. */
export function fundRoom(s: S2State, c: Concession): number {
  const base = c.level + (c.upUntil ? 1 : 0);
  let cap = 0;
  for (let n = base + 1; n <= Math.min(CONCESSION_MAX_LEVEL, base + 2); n++) cap += concessionCost(n);
  const inFlight = s.convoys.filter((v) => v.dest === "concession" && v.conc === c.id).reduce((a, v) => a + v.load * VALUE[v.res], 0);
  return cap - (c.fund ?? 0) - inFlight;
}
export function supplyConcession(s: S2State, id: string, map: S2Map, res: Resource, amount: number, now: number): S2State {
  const c = s.conc.find((x) => x.id === id)!;
  const to = map.sites[c.site]?.pos ?? s.castle!;
  return { ...s, convoys: [...s.convoys, { conc: id, res, load: amount, depart: now, arrive: now + convoyTravelMs(s, s.castle!, to), from: s.castle!, to, dest: "concession" }] };
}

export function buyConcessionBlocker(s: S2State): string | null {
  if (s.bought >= CONCESSION_GOLD.length) return "Tu as déjà acheté toutes les concessions possibles.";
  if (CONCESSION_GOLD[s.bought] > s.gold) return "Pas assez d'or.";
  return null;
}

export function buyConcession(s: S2State): R<S2State> {
  const why = buyConcessionBlocker(s);
  if (why) return fail(why);
  return { ok: true, value: { ...s, gold: s.gold - CONCESSION_GOLD[s.bought], bought: s.bought + 1 } };
}

function nextBuildingLevel(s: S2State, id: BuildingId): number {
  return Math.max(s.bld[id], ...s.works.filter((w) => w.id === id).map((w) => w.level)) + 1;
}

export function buildBlocker(s: S2State, id: BuildingId, stone: number, discount = 1): string | null {
  if (!BUILDINGS[id]) return "Bâtiment inconnu.";
  const level = nextBuildingLevel(s, id);
  if (level > BUILDING_MAX) return "Niveau maximal.";
  if (s.works.length >= BUILDING_SLOTS) return "Les deux places de chantier sont prises.";
  if (Math.ceil(buildingCost(id, level) * discount) > stone) return "Pas assez de pierre.";
  return null;
}

export function build(s: S2State, id: BuildingId, stone: number, now: number, discount = 1): R<{ s: S2State; cost: number }> {
  const why = buildBlocker(s, id, stone, discount);
  if (why) return fail(why);
  const level = nextBuildingLevel(s, id);
  return { ok: true, value: { s: { ...s, works: [...s.works, { id, level, until: now + buildingMs(level) }] }, cost: Math.ceil(buildingCost(id, level) * discount) } };
}

/** Marché : échange immédiat au tiers de la valeur de référence. */
export function exchangeBlocker(have: Arrivals, from: Resource, to: Resource, amount: number): string | null {
  if (from === to) return "Choisis deux monnaies différentes.";
  if (!(amount > 0) || !Number.isFinite(amount)) return "Quantité invalide.";
  if (have[from] < amount) return "Pas assez de " + RESOURCE_LABEL[from] + ".";
  if (marketQuote(from, to, amount) < 1) return "Trop peu pour obtenir quoi que ce soit.";
  return null;
}

/** Concessions qu'un joueur pourrait prendre pour la première : sites de pierre à 8 cases au plus, sinon la plus proche. */
export function firstConcessionSites(map: S2Map, castle: Pos, taken: (siteId: number) => number): number[] {
  const free = map.sites.filter((s) => s.type === "pierre" && taken(s.id) < s.places);
  const near = free.filter((s) => cheb(s.pos, castle) <= 8).map((s) => s.id);
  if (near.length) return near;
  const best = [...free].sort((a, b) => cheb(a.pos, castle) - cheb(b.pos, castle))[0];
  return best ? [best.id] : [];
}

// ---------------------------------------------------------------------------
// Lecture depuis la base (valeurs nettoyées)
// ---------------------------------------------------------------------------

const num = (v: unknown, min = 0) => (Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : min);
const pos = (v: unknown): Pos | null => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(Number(x))) ? [Number(v[0]), Number(v[1])] : null);
const RES: Resource[] = ["pierre", "fer", "or"];
const REGION_IDS: RegionId[] = ["froid", "montagne", "plaine", "collines", "desert", "cote", "foret"];

export function cleanS2(raw: unknown, now: number): S2State {
  const r = (raw ?? {}) as Record<string, unknown>;
  const base = newS2State(now);
  if (!raw || typeof raw !== "object") return base;
  const bld = (r.bld ?? {}) as Record<string, unknown>;
  return {
    castle: pos(r.castle),
    region: REGION_IDS.includes(r.region as RegionId) ? (r.region as RegionId) : null,
    iron: num(r.iron),
    gold: num(r.gold),
    conc: (Array.isArray(r.conc) ? r.conc : [])
      .filter((c) => c && typeof c === "object" && typeof (c as Concession).id === "string")
      .slice(0, CONCESSIONS_MAX)
      .map((c) => {
        const x = c as Record<string, unknown>;
        return { id: String(x.id), site: Math.floor(num(x.site)), level: Math.min(CONCESSION_MAX_LEVEL, Math.max(1, Math.floor(num(x.level, 1)))), stock: num(x.stock), next: num(x.next) || now, ...(num(x.upUntil) > 0 ? { upUntil: num(x.upUntil) } : {}), ...(x.pace === "prudent" || x.pace === "intensif" ? { pace: x.pace } : {}), ...(x.dest === "beffroi" ? { dest: "beffroi" as const } : {}), ...(num(x.fund) > 0 ? { fund: num(x.fund) } : {}), ...(typeof x.destConc === "string" ? { destConc: x.destConc } : {}), ...(num(x.banditAt) > 0 ? { banditAt: num(x.banditAt) } : {}), ...(x.warned === true ? { warned: true } : {}), ...(x.manual === true ? { manual: true } : {}) };
      }),
    convoys: (Array.isArray(r.convoys) ? r.convoys : [])
      .filter((v) => v && typeof v === "object" && RES.includes((v as Convoy).res))
      .map((v) => {
        const x = v as Record<string, unknown>;
        return { conc: String(x.conc), res: x.res as Resource, load: num(x.load), depart: num(x.depart), arrive: num(x.arrive), from: pos(x.from) ?? [0, 0], to: pos(x.to) ?? [0, 0], ...(x.dest === "beffroi" || x.dest === "concession" ? { dest: x.dest } : {}) };
      }),
    bld: Object.fromEntries(BUILDING_IDS.map((id) => [id, Math.min(BUILDING_MAX, Math.floor(num(bld[id])))])) as Record<BuildingId, number>,
    works: (Array.isArray(r.works) ? r.works : [])
      .filter((w) => w && typeof w === "object" && BUILDING_IDS.includes((w as S2Work).id))
      .slice(0, BUILDING_SLOTS)
      .map((w) => ({ id: (w as S2Work).id, level: Math.floor(num((w as S2Work).level, 1)), until: num((w as S2Work).until) })),
    bought: Math.min(CONCESSION_GOLD.length, Math.floor(num(r.bought))),
    at: num(r.at) || now,
    produced: num(r.produced),
    ...(num(r.giftOwed) > 0 ? { giftOwed: num(r.giftOwed) } : {}),
    ...(num(r.launchUntil) > 0 ? { launchUntil: num(r.launchUntil) } : {}),
    ...(Array.isArray(r.log) ? { log: (r.log as { at?: unknown; text?: unknown }[]).filter((l) => l && typeof l.text === "string").slice(-LOG_MAX).map((l) => ({ at: num(l.at), text: String(l.text).slice(0, 200) })) } : {}),
  };
}
