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
export const BASE_PROD: Record<Resource, number> = { pierre: 1_000, fer: 500, or: 250 };
/** Marché : une monnaie contre une autre au tiers de sa valeur de référence. */
export const MARKET_RATE = 1 / 3;
/** Or en plus à chaque convoi arrivé : 3 % de sa charge, en valeur de référence. */
export const CONVOY_GOLD = 0.03;
/** Région désert : +10 % sur l'or des convois. */
/** Désert : +10 % de butin sur les convois interceptés (S8). */
export const DESERT_LOOT_BONUS = 0.1;

/** REF(j) : production d'une concession typique d'un joueur actif au jour j, en valeur pierre par heure. */
const REF_POINTS: [number, number][] = [[0, 1_000], [3, 4_500], [7, 6_500], [14, 9_000]];
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
export const CONCESSION_GOLD = [10_000, 25_000, 50_000];
export const LOCAL_STOCK_HOURS = 4;

export function concessionLevelFactor(level: number): number {
  return 1 + 0.15 * (Math.max(1, level) - 1);
}
/** Prix du niveau n (2 à 15) d'une concession, en pierre. */
/**
 * Durée d'un chantier : 5 s au premier niveau, puis une montée régulière jusqu'à `topMs` au dernier.
 * Le début de partie va vite, les derniers niveaux se préparent.
 */
export function rampMs(level: number, top: number, topMs: number): number {
  const n = Math.min(top, Math.max(1, level));
  return Math.round(5_000 * Math.pow(topMs / 5_000, top > 1 ? (n - 1) / (top - 1) : 1));
}
const H = 3_600_000;
/** Prix du niveau n (2 à 15) d'une concession, en valeur pierre : bon marché au début, cher à la fin. */
export function concessionCost(level: number): number {
  return Math.round(40 * Math.pow(2.1, Math.max(0, level - 2)));
}
export function concessionBuildMs(level: number): number {
  return rampMs(level - 1, 14, 8 * H);
}

export type BuildingId = "outils" | "charronnerie" | "relais" | "entrepot";
export const BUILDING_MAX = 20;
export const BUILDING_SLOTS = 2;
export const BUILDINGS: Record<BuildingId, { name: string; icon: string; base: number; text: string }> = {
  outils: { name: "Outils", icon: "🛠️", base: 500, text: "+3 % de production de toutes les concessions par niveau" },
  charronnerie: { name: "Charronnerie", icon: "🛞", base: 400, text: "Charge d'un convoi : un intervalle de production de base, +10 % par niveau" },
  relais: { name: "Relais", icon: "🐎", base: 400, text: "Un convoi toutes les 15 min, 20 s de moins par niveau ; convois 3 % plus rapides par niveau" },
  entrepot: { name: "Entrepôt", icon: "🏚️", base: 300, text: "Stock local de toutes les concessions +30 min de production par niveau" },
};
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export function buildingCost(id: BuildingId, level: number): number {
  return Math.round((BUILDINGS[id].base / 10) * Math.pow(1.85, level - 1));
}
export function buildingMs(level: number): number {
  return rampMs(level, BUILDING_MAX, 12 * H);
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
  /** Bâtiments de la concession (atelier, écurie, grenier), et le chantier en cours. */
  cb?: Partial<Record<ConcBuildingId, number>>;
  cwork?: { id: ConcBuildingId; level: number; until: number };
  /** Convois à la main : la concession garde tout jusqu'à ce que le joueur en envoie un. */
  manual?: boolean;
  /** Brigands : prochain passage (stock au-dessus de 90 % depuis une heure), et avis déjà donné. */
  banditAt?: number;
  warned?: boolean;
  /** Réserve de chantier, en valeur pierre : ce que le château lui a envoyé, pour ses améliorations. */
  fund?: number;
  /** Vague B : dernier pillage par un joueur (une fois toutes les 6 h par concession). */
  raidedAt?: number;
}
export type ConcBuildingId = "atelier" | "ecurie" | "grenier" | "tour";
export const CONC_BUILDINGS: Record<ConcBuildingId, { name: string; icon: string; per: number; text: string }> = {
  atelier: { name: "Atelier", icon: "⚒️", per: 0.08, text: "+8 % de production de cette concession par niveau" },
  ecurie: { name: "Écurie", icon: "🐴", per: 0.1, text: "+10 % de charge des convois de cette concession par niveau" },
  grenier: { name: "Grenier", icon: "🌾", per: 0.25, text: "+25 % de stock local de cette concession par niveau" },
  tour: { name: "Tour de site", icon: "🗼", per: 1, text: "+1 case de vue autour du site, et 200 piquiers et 150 arbalétriers qui gardent le stock contre le pillage, par niveau (5 au plus, dès le niveau 1 de la concession)" },
};
export const CONC_BUILDING_IDS = Object.keys(CONC_BUILDINGS) as ConcBuildingId[];
export const CONC_BUILDING_MAX = 10;
/** Niveau maximal d'un bâtiment de concession (la tour de site s'arrête à 5). */
export const concBuildingMax = (id: ConcBuildingId) => (id === "tour" ? 5 : CONC_BUILDING_MAX);
export const concBuildingCost = (level: number) => Math.round(30 * Math.pow(2.2, level - 1));
export const concBuildingMs = (level: number) => rampMs(level, CONC_BUILDING_MAX, 4 * H);
const cbLevel = (c: Concession, id: ConcBuildingId) => c.cb?.[id] ?? 0;
/** Paliers d'une concession selon son niveau : un nom, et un dessin plus riche sur la carte. */
export const TIERS = [
  { from: 1, name: "Campement" },
  { from: 5, name: "Exploitation" },
  { from: 10, name: "Manufacture" },
  { from: 15, name: "Grand domaine" },
];
export function tierOf(level: number): number {
  let t = 0;
  TIERS.forEach((x, i) => {
    if (level >= x.from) t = i;
  });
  return t;
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
  dest?: "beffroi" | "concession" | "commerce";
  /** Vague B : charge déjà perdue en route (règle du tiers : jamais plus d'un tiers de la charge de départ). */
  lost?: number;
  /** S8 : déjà attaqué par un joueur (une attaque de joueur au plus par convoi). */
  hit?: boolean;
  /** S8 : déjà saboté. */
  sabotaged?: boolean;
}
/** Une ligne de la boîte de rapports ; `key` regroupe les lignes d'une même heure (patrouilles). */
export interface S2Log {
  at: number;
  text: string;
  cat?: "combats";
  key?: string;
  sum?: number;
  n?: number;
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
  /** Ce qui s'est passé sur les concessions et les routes (brigands, patrouilles, pillages), pour la boîte de réception. */
  log?: S2Log[];
  /** Vague B : hostilité de chaque seigneur envers le joueur (valeur à l'instant `at`). */
  host?: Record<string, { v: number; at: number }>;
  /** Sauf-conduits payés : seigneur → fin du passage libre. */
  safe?: Record<string, number>;
  /** Rancunes : expéditions promises contre un convoi du joueur, à partir de `due`. */
  grudge?: { lord: string; due: number }[];
  /** Dernier passage compté dans la zone de chaque seigneur (l'hostilité de passage monte au plus une fois par heure). */
  crossAt?: Record<string, number>;
  /** Dernière expédition de chaque seigneur hostile (rythme des expéditions). */
  expAt?: Record<string, number>;
  /** Seigneurs dont le joueur est le suzerain : seigneur → fin de la vassalité. */
  vassals?: Record<string, number>;
  /** Contrats déjà pris aujourd'hui. */
  contracts?: { day: number; taken: string[] };
  /** S8 : routes commerciales proposées (château d'un autre joueur, ou forteresse `fort:<n>`), depuis `at`. */
  trade?: { to: string; at: number }[];
  /** Expéditions parties contre le joueur : le fief du seigneur garde une garnison réduite jusqu'à `back`. */
  sent?: { lord: string; at: number; back: number; n: number; to?: Pos }[];
  /** S8 : convois pris dans une embuscade d'un autre joueur (le serveur en rend le butin et les pertes à l'embusqué). */
  ambushed?: { id: string; at: number; res: Resource; taken: number; lost: Record<string, number>; won: boolean }[];
  /** Vague C : compagnies de mercenaires louées à un seigneur, affectées à l'escorte d'une concession. */
  mercs?: { lord: string; unit: string; men: number; train: number; until: number; conc: string }[];
  /** Vague C : hostilité retirée par les rivalités, par seigneur (30 points : sauf-conduit offert). */
  rivalDrop?: Record<string, number>;
  /** Fixé par le serveur à chaque lecture, jamais lu de la base : qui est le joueur, et son alliance. */
  who?: { id: string; alliance: number | null };
  /** S10, Lignée (fixés à chaque calcul, jamais lus de la base) : Cave profonde, heures de stock local en plus. */
  stockBonusHours?: number;
  /** Charpentiers : convois plus rapides (part). */
  convoySpeed?: number;
  /** Forteresse de l'Ouest (fixé à chaque calcul) : part des attaques de patrouille évitées. */
  patrolCut?: number;
  /** Grands chariots : charge des convois en plus (part, ajoutée à la charronnerie). */
  loadBonus?: number;
  /** Marchandage, Grand marchand (fixés à chaque calcul) : or des routes commerciales en plus (part). */
  tradeBonus?: number;
  /** Grand marchand (fixé à chaque calcul) : les convois de commerce ne peuvent pas être attaqués. */
  tradeSafe?: boolean;
  /** Architecte royal (fixé à chaque calcul) : un convoi par jour passe intact. */
  archShield?: boolean;
  /** Forteresses tenues par l'alliance (fixé à chaque calcul) : 4 cases de passage libre autour de chacune. */
  safeZones?: Pos[];
  /** Or rapporté par les routes commerciales sur la saison (classement des marchands). */
  traded?: number;
  /** Jour (UTC, en jours depuis 1970) où l'Architecte royal a déjà protégé un convoi. */
  archDay?: number;
}

export function newS2State(now: number): S2State {
  return { castle: null, region: null, iron: 30_000, gold: 0, conc: [], convoys: [], bld: { outils: 0, charronnerie: 0, relais: 0, entrepot: 0 }, works: [], bought: 0, at: now, produced: 0 };
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
  /** Vague B : risques de la route d'un convoi, réglés à son arrivée ; renvoie la charge perdue. Peut écrire dans `st`. */
  risk?: (st: S2State, v: Convoy) => number;
  /** Vague B : l'escorte de la concession défend contre les brigands ; vrai si elle les repousse. */
  guard?: (st: S2State, c: Concession, at: number) => boolean;
  /** Vague B : convois en plus partis entre `from` et `to` (tribut des vassaux, routes commerciales, fiefs annexés). */
  extra?: (st: S2State, from: number, to: number) => void;
}

/**
 * Places de concession : la première, la deuxième dès la première étape du beffroi ou dès qu'une concession passe
 * Exploitation (niveau 5), puis celles achetées en or.
 */
export function concessionSlots(s: S2State, ctx: Pick<S2Context, "stageConcessions">): number {
  const second = ctx.stageConcessions >= 1 || s.conc.some((c) => c.level >= SECOND_SLOT_LEVEL) ? 1 : 0;
  return Math.min(CONCESSIONS_MAX, 1 + second + s.bought);
}
export const SECOND_SLOT_LEVEL = 5;

/** Bonus de région, en part (s'ajoute aux autres bonus). */
const regionBonus = (s: S2State, res: Resource) =>
  (s.region === "montagne" && res === "pierre") || (s.region === "collines" && res === "fer") || (s.region === "cote" && res === "or") ? 0.1 : 0;
/** Grand domaine (niveau 15) : +10 % dans la somme des bonus. */
const DOMAIN_BONUS = 0.1;

/** Production horaire d'une concession, hors multiplicateur commun. */
export function concessionRate(s: S2State, c: Concession, map: S2Map): number {
  const site = map.sites[c.site];
  if (!site) return 0;
  // Base × taille × niveau × (1 + somme des bonus : outils, atelier, région, grand domaine), puis le rythme.
  const bonus = 0.03 * s.bld.outils + CONC_BUILDINGS.atelier.per * cbLevel(c, "atelier") + regionBonus(s, site.type) + (c.level >= CONCESSION_MAX_LEVEL ? DOMAIN_BONUS : 0);
  return BASE_PROD[site.type] * siteFactor(site.places) * concessionLevelFactor(c.level) * (1 + bonus) * PACES[c.pace ?? "normal"].prod;
}
/** Convois : un départ toutes les 15 min au début (5 min au plus court), chargé d'un intervalle de production de base. */
export const CONVOY_BASE_MIN = 15;
/** Charge d'un convoi : 15 min de production de base de la concession, +10 % par niveau de charronnerie. */
export function convoyLoad(s: S2State, c: Concession, map: S2Map): number {
  const site = map.sites[c.site];
  // La charge suit le niveau de la concession ; charronnerie, écurie et Grands chariots s'additionnent.
  return site ? (BASE_PROD[site.type] * CONVOY_BASE_MIN) / 60 * siteFactor(site.places) * concessionLevelFactor(c.level) * (1 + 0.1 * s.bld.charronnerie + CONC_BUILDINGS.ecurie.per * cbLevel(c, "ecurie") + (s.loadBonus ?? 0)) : 0;
}
export function convoyIntervalMs(s: S2State): number {
  return Math.round(Math.max(5, CONVOY_BASE_MIN - s.bld.relais / 3) * 60_000);
}
export function localCap(s: S2State, c: Concession, map: S2Map): number {
  return concessionRate(s, c, map) * (LOCAL_STOCK_HOURS + 0.5 * s.bld.entrepot + (s.stockBonusHours ?? 0)) * PACES[c.pace ?? "normal"].stock * (1 + CONC_BUILDINGS.grenier.per * cbLevel(c, "grenier"));
}
/** Trajet d'un convoi : 30 s par case (Tchebychev), plafonné à 15 min, plus rapide avec le relais et en Plaine. */
export function convoyTravelMs(s: S2State, from: Pos, to: Pos): number {
  const base = Math.min(15, 0.5 * cheb(from, to)) * 60_000;
  return Math.round(base / ((1 + 0.03 * s.bld.relais) * (s.region === "plaine" ? 1.1 : 1) * (1 + (s.convoySpeed ?? 0))));
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
  const mult = ctx.multiplier ?? (() => 1);
  // Instants où quelque chose change : chantiers finis, bonus communs.
  const cuts = [...st.works.map((w) => w.until), ...st.conc.map((c) => c.upUntil ?? 0), ...st.conc.map((c) => c.cwork?.until ?? 0), st.launchUntil ?? 0, ...(ctx.breakpoints ?? [])].filter((t) => t > st.at && t < now);
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
          if (c.pace !== "prudent" && at >= (ctx.banditsFrom ?? 0) && c.stock >= BANDIT_HIGH * cap - 1e-6 && roll(c.id, at) < BANDIT_CHANCE && ctx.guard?.(st, c, at)) {
            log(st, at, `🛡️ Brigands repoussés à ${name} par l'escorte.`);
          } else if (c.pace !== "prudent" && at >= (ctx.banditsFrom ?? 0) && c.stock >= BANDIT_HIGH * cap - 1e-6 && roll(c.id, at) < BANDIT_CHANCE) {
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
          dispatch(st, ctx.map, c, take, dep, !!ctx.belfryDone);
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
    st.conc = st.conc.map((c) => (c.cwork && c.cwork.until <= end ? { ...c, cb: { ...c.cb, [c.cwork.id]: Math.max(cbLevel(c, c.cwork.id), c.cwork.level) }, cwork: undefined } : c));
    const done = st.works.filter((w) => w.until <= end);
    for (const w of done) st.bld[w.id] = Math.max(st.bld[w.id], w.level);
    st.works = st.works.filter((w) => w.until > end);
    cursor = end;
  }
  // Vague B : tribut des vassaux, en convois.
  ctx.extra?.(st, s.at, now);
  // Arrivées, dans l'ordre : les risques de la route se règlent à l'arrivée (patrouilles, expéditions).
  const still: Convoy[] = [];
  let produced = 0;
  for (const v0 of [...st.convoys].sort((a, b) => a.arrive - b.arrive)) {
    let v = v0;
    if (v.arrive <= now && ctx.risk) {
      const lost = ctx.risk(st, v);
      if (lost > 0) v = { ...v, load: Math.max(0, v.load - lost), lost: (v.lost ?? 0) + lost };
    }
    if (v.arrive <= now) {
      if (v.dest === "concession") {
        // Ravitaillement : la réserve de la concession grossit, rien n'arrive au château.
        st.conc = st.conc.map((c) => (c.id === v.conc ? { ...c, fund: (c.fund ?? 0) + v.load * VALUE[v.res] } : c));
        continue;
      }
      if (v.dest === "commerce") {
        // Route commerciale : le convoi ne porte rien, il rapporte de l'or à l'arrivée.
        arrived.or += v.load;
        st.traded = (st.traded ?? 0) + v.load;
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
  dispatch(st, map, c, take, now, false);
  return { ok: true, value: st };
}

/**
 * Fait partir `take` du stock de `c` : d'abord vers la réserve de la concession choisie, autant qu'elle en accepte,
 * le reste vers le beffroi ou le château.
 */
function dispatch(st: S2State, map: S2Map, c: Concession, take: number, dep: number, belfryDone: boolean) {
  const site = map.sites[c.site];
  if (!site || !st.castle) return;
  let left = take;
  const target = c.destConc ? st.conc.find((x) => x.id === c.destConc) : undefined;
  const targetSite = target ? map.sites[target.site] : undefined;
  if (target && targetSite) {
    const part = Math.min(left, Math.max(0, fundRoom(st, target)) / VALUE[site.type]);
    if (part >= 1) {
      st.convoys.push({ conc: target.id, res: site.type, load: part, depart: dep, arrive: dep + convoyTravelMs(st, site.pos, targetSite.pos), from: site.pos, to: targetSite.pos, dest: "concession" });
      left -= part;
    }
  }
  if (left < 1e-9) return;
  const to = c.dest === "beffroi" && !belfryDone ? S2_BELFRY : st.castle;
  st.convoys.push({ conc: c.id, res: site.type, load: left, depart: dep, arrive: dep + convoyTravelMs(st, site.pos, to), from: site.pos, to, ...(to === st.castle ? {} : { dest: "beffroi" as const }) });
}

/** Règle le rythme et la destination d'une concession ; l'effet vaut dès le convoi suivant. */
/** Lancement : multiplicateur des 24 premières heures (ramené à 1 : plus de bonus de départ, seulement la pierre offerte). */
/** Retiré à l'équilibrage : un ×3 qui retombe au bout de 24 h donne une chute de production brutale. */
export const LAUNCH_MULT = 1;
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
const LOG_MAX = 40;
function roll(id: string, at: number): number {
  let h = 2166136261 ^ Math.floor(at / 1000);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
function log(st: S2State, at: number, text: string) {
  st.log = [...(st.log ?? []), { at: Math.round(at), text }].slice(-LOG_MAX);
}
/**
 * Ajoute une ligne de rapport. Avec `key`, la ligne de même clé est remplacée : `amount` s'ajoute à sa somme,
 * et `render(somme, nombre)` refait son texte (rapports de patrouille regroupés par heure).
 */
export function pushLog(st: S2State, at: number, text: string, opts: { cat?: "combats"; key?: string; amount?: number; render?: (sum: number, n: number) => string } = {}): void {
  const list = [...(st.log ?? [])];
  const i = opts.key ? list.findIndex((l) => l.key === opts.key) : -1;
  if (i >= 0) {
    const old = list[i];
    const sum = (old.sum ?? 0) + (opts.amount ?? 0);
    const n = (old.n ?? 1) + 1;
    list[i] = { ...old, at: Math.round(at), sum, n, text: opts.render ? opts.render(sum, n) : text };
  } else list.push({ at: Math.round(at), text: opts.render ? opts.render(opts.amount ?? 0, 1) : text, ...(opts.cat ? { cat: opts.cat } : {}), ...(opts.key ? { key: opts.key, sum: opts.amount ?? 0, n: 1 } : {}) });
  st.log = list.slice(-LOG_MAX);
}
/** Tirage reproductible entre 0 et 1, d'après une clé et un instant. */
export function rollAt(key: string, at: number): number {
  return roll(key, at);
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

/** Bâtiment d'une concession : payé sur place (réserve puis stock), un chantier à la fois, jamais au-dessus du niveau de la concession. */
export function concBuildBlocker(s: S2State, id: string, b: unknown, map: S2Map, now: number): string | null {
  const c = s.conc.find((x) => x.id === id);
  if (!c) return "Concession inconnue.";
  if (typeof b !== "string" || !(b in CONC_BUILDINGS)) return "Bâtiment inconnu.";
  if (c.cwork && c.cwork.until > now) return "Un chantier est déjà en cours dans cette concession.";
  const level = cbLevel(c, b as ConcBuildingId) + 1;
  if (level > concBuildingMax(b as ConcBuildingId)) return "Niveau maximal.";
  if (level > c.level) return `Monte d'abord la concession au niveau ${level}.`;
  if (b !== "atelier" && b !== "tour" && c.level < TIERS[1].from) return `${CONC_BUILDINGS[b as ConcBuildingId].name} : à partir du palier Exploitation (niveau ${TIERS[1].from}).`;
  if (concBuildingCost(level) > concessionBudget(c, map) + 1e-6) return "Réserve et stock de la concession insuffisants : envoie-lui des ressources.";
  return null;
}
export function concBuild(s: S2State, id: string, b: ConcBuildingId, map: S2Map, now: number): R<S2State> {
  const why = concBuildBlocker(s, id, b, map, now);
  if (why) return fail(why);
  const c = s.conc.find((x) => x.id === id)!;
  const level = cbLevel(c, b) + 1;
  const cost = concBuildingCost(level);
  const fromFund = Math.min(c.fund ?? 0, cost);
  const value = VALUE[map.sites[c.site]?.type ?? "pierre"];
  const next: Concession = { ...c, fund: (c.fund ?? 0) - fromFund, stock: Math.max(0, c.stock - (cost - fromFund) / value), cwork: { id: b, level, until: now + concBuildingMs(level) } };
  return { ok: true, value: { ...s, conc: s.conc.map((x) => (x.id === id ? next : x)) } };
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

function cleanCb(cb: unknown, work: unknown): Pick<Concession, "cb" | "cwork"> {
  const out: Pick<Concession, "cb" | "cwork"> = {};
  if (cb && typeof cb === "object") {
    const levels: Partial<Record<ConcBuildingId, number>> = {};
    for (const id of CONC_BUILDING_IDS) {
      const n = Math.floor(Number((cb as Record<string, unknown>)[id]));
      if (Number.isFinite(n) && n > 0) levels[id] = Math.min(CONC_BUILDING_MAX, n);
    }
    if (Object.keys(levels).length) out.cb = levels;
  }
  const w = work as { id?: unknown; level?: unknown; until?: unknown } | null;
  if (w && typeof w === "object" && typeof w.id === "string" && w.id in CONC_BUILDINGS && Number(w.until) > 0) out.cwork = { id: w.id as ConcBuildingId, level: Math.min(CONC_BUILDING_MAX, Math.max(1, Math.floor(Number(w.level) || 1))), until: Number(w.until) };
  return out;
}
const num = (v: unknown, min = 0) => (Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : min);
const pos = (v: unknown): Pos | null => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(Number(x))) ? [Number(v[0]), Number(v[1])] : null);
const RES: Resource[] = ["pierre", "fer", "or"];
const REGION_IDS: RegionId[] = ["froid", "montagne", "plaine", "collines", "desert", "cote", "foret"];

/** Vague B : hostilité, sauf-conduits, rancunes, expéditions et vassaux (clés limitées aux identifiants courts). */
function cleanRelations(r: Record<string, unknown>): Pick<S2State, "host" | "safe" | "grudge" | "expAt" | "vassals" | "contracts" | "trade" | "sent" | "rivalDrop" | "mercs" | "ambushed" | "crossAt"> {
  const out: Pick<S2State, "host" | "safe" | "grudge" | "expAt" | "vassals" | "contracts" | "trade" | "sent" | "rivalDrop" | "mercs" | "ambushed" | "crossAt"> = {};
  const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v as Record<string, unknown>).slice(0, 40) : []);
  const host = rec(r.host).flatMap(([k, v]) => {
    const x = (v ?? {}) as { v?: unknown; at?: unknown };
    return num(x.v) > 0 ? [[k, { v: Math.min(100, num(x.v)), at: num(x.at) }] as const] : [];
  });
  if (host.length) out.host = Object.fromEntries(host);
  for (const key of ["safe", "expAt", "vassals", "rivalDrop", "crossAt"] as const) {
    const list = rec(r[key]).filter(([, v]) => num(v) > 0).map(([k, v]) => [k, num(v)] as const);
    if (list.length) out[key] = Object.fromEntries(list);
  }
  const k = r.contracts as { day?: unknown; taken?: unknown } | undefined;
  if (k && Number.isInteger(Number(k.day)) && Array.isArray(k.taken)) out.contracts = { day: Number(k.day), taken: (k.taken as unknown[]).map(String).slice(-10) };
  if (Array.isArray(r.trade)) {
    const t = (r.trade as { to?: unknown; at?: unknown }[]).filter((x) => x && typeof x.to === "string").slice(0, 6).map((x) => ({ to: String(x.to).slice(0, 64), at: num(x.at) }));
    if (t.length) out.trade = t;
  }
  if (Array.isArray(r.ambushed)) {
    const t = (r.ambushed as Record<string, unknown>[]).filter((x) => x && typeof x.id === "string" && RES.includes(x.res as Resource)).slice(-20).map((x) => ({ id: String(x.id), at: num(x.at), res: x.res as Resource, taken: num(x.taken), lost: Object.fromEntries(Object.entries((x.lost ?? {}) as Record<string, unknown>).filter(([, n]) => num(n) > 0).map(([k, n]) => [k, num(n)])), won: x.won === true }));
    if (t.length) out.ambushed = t;
  }
  if (Array.isArray(r.mercs)) {
    const t = (r.mercs as Record<string, unknown>[]).filter((x) => x && typeof x.lord === "string" && typeof x.unit === "string" && typeof x.conc === "string" && num(x.men) > 0).slice(0, 6).map((x) => ({ lord: String(x.lord), unit: String(x.unit), men: Math.floor(num(x.men)), train: num(x.train), until: num(x.until), conc: String(x.conc) }));
    if (t.length) out.mercs = t;
  }
  if (Array.isArray(r.sent)) {
    const t = (r.sent as { lord?: unknown; at?: unknown; back?: unknown; n?: unknown; to?: unknown }[]).filter((x) => x && typeof x.lord === "string").slice(-10).map((x) => ({ lord: String(x.lord), at: num(x.at), back: num(x.back), n: Math.max(1, Math.floor(num(x.n, 1))), ...(Array.isArray((x as { to?: unknown }).to) && (x as { to: unknown[] }).to.length === 2 ? { to: [Math.floor(num((x as { to: unknown[] }).to[0])), Math.floor(num((x as { to: unknown[] }).to[1]))] as Pos } : {}) }));
    if (t.length) out.sent = t;
  }
  if (Array.isArray(r.grudge)) {
    const g = (r.grudge as { lord?: unknown; due?: unknown }[]).filter((x) => x && typeof x.lord === "string").slice(0, 10).map((x) => ({ lord: String(x.lord), due: num(x.due) }));
    if (g.length) out.grudge = g;
  }
  return out;
}

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
        return { id: String(x.id), site: Math.floor(num(x.site)), level: Math.min(CONCESSION_MAX_LEVEL, Math.max(1, Math.floor(num(x.level, 1)))), stock: num(x.stock), next: num(x.next) || now, ...(num(x.upUntil) > 0 ? { upUntil: num(x.upUntil) } : {}), ...(x.pace === "prudent" || x.pace === "intensif" ? { pace: x.pace } : {}), ...(x.dest === "beffroi" ? { dest: "beffroi" as const } : {}), ...(num(x.fund) > 0 ? { fund: num(x.fund) } : {}), ...(typeof x.destConc === "string" ? { destConc: x.destConc } : {}), ...(num(x.banditAt) > 0 ? { banditAt: num(x.banditAt) } : {}), ...(x.warned === true ? { warned: true } : {}), ...(x.manual === true ? { manual: true } : {}), ...(num(x.raidedAt) > 0 ? { raidedAt: num(x.raidedAt) } : {}), ...cleanCb(x.cb, x.cwork) };
      }),
    convoys: (Array.isArray(r.convoys) ? r.convoys : [])
      .filter((v) => v && typeof v === "object" && RES.includes((v as Convoy).res))
      .map((v) => {
        const x = v as Record<string, unknown>;
        return { conc: String(x.conc), res: x.res as Resource, load: num(x.load), depart: num(x.depart), arrive: num(x.arrive), from: pos(x.from) ?? [0, 0], to: pos(x.to) ?? [0, 0], ...(x.dest === "beffroi" || x.dest === "concession" || x.dest === "commerce" ? { dest: x.dest } : {}), ...(num(x.lost) > 0 ? { lost: num(x.lost) } : {}), ...(x.hit === true ? { hit: true } : {}), ...(x.sabotaged === true ? { sabotaged: true } : {}) };
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
    ...(num(r.archDay) > 0 ? { archDay: Math.floor(num(r.archDay)) } : {}),
    ...(num(r.traded) > 0 ? { traded: num(r.traded) } : {}),
    ...(Array.isArray(r.log) ? { log: (r.log as Record<string, unknown>[]).filter((l) => l && typeof l.text === "string").slice(-LOG_MAX).map((l) => ({ at: num(l.at), text: String(l.text).slice(0, 200), ...(l.cat === "combats" ? { cat: "combats" as const } : {}), ...(typeof l.key === "string" ? { key: l.key.slice(0, 80), sum: num(l.sum), n: Math.max(1, Math.floor(num(l.n, 1))) } : {}) })) } : {}),
    ...cleanRelations(r),
  };
}
