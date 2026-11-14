// F1, F2 : la faille (saison 1 et suivantes). Règles pures, sans base de données.
// Des étages à garnison fixe, les mêmes pour tout le monde, avec une ou deux altérations tirées pour la semaine.
// Une expédition de 1 à 4 compagnies monte étage par étage tant qu'elle gagne ; le joueur choisit après chaque étage.

import type { Army, BattleOptions, Boost, Levels } from "./battle";
import { armyFromBudget } from "./battle";
import { allocation, companiesOn, companyLevels, trainLevels, type ArmyHolder } from "./companies";
import type { CombatantDef, CombatantId, UnitId } from "./config";
import { afterBattle, armyBoost, hasTrait, relicShare, type Captain, type Relic, type RelicKind } from "./captains";

// ---------------------------------------------------------------------------
// Réglages (calés par simulation, voir rift.test.ts)
// ---------------------------------------------------------------------------

/**
 * Valeur en pierre de la garnison de l'étage 1, et croissance par étage : forte jusqu'à l'étage 10, faible ensuite,
 * où c'est l'entraînement de la garnison (+1 tous les 3 étages) qui fait la difficulté.
 */
export const RIFT_BASE_VALUE = 130_000;
export const RIFT_GROWTH_LOW = 1.31;
export const RIFT_GROWTH_HIGH = 1.02;
export const RIFT_GROWTH_SPLIT = 10;
/** Entraînement de la garnison : +1 tous les 3 étages, 10 au plus. */
export const RIFT_TRAIN_EVERY = 3;
/** Compagnies par expédition. */
export const RIFT_MAX_COMPANIES = 4;
/** Une expédition par compagnie toutes les 4 heures. */
export const RIFT_REST_MS = 4 * 3_600_000;
/** Sans ordre une heure après un étage, l'expédition rentre d'elle-même. */
export const RIFT_IDLE_MS = 3_600_000;
/** Tous les 10 étages, un gardien (deux joueurs d'une même alliance). */
export const RIFT_GUARDIAN_EVERY = 10;
/** Coffre de 10 minutes de production tous les 5 étages. */
export const RIFT_CHEST_EVERY = 5;
export const RIFT_CHEST_SECONDS = 600;

export type AlterationId = "brouillard" | "gel" | "sang" | "remparts" | "horde" | "champions" | "sainte" | "gregeois";

export const ALTERATIONS: Record<AlterationId, { icon: string; name: string; text: string }> = {
  brouillard: { icon: "🌫️", name: "Brouillard", text: "Les tireurs ne tirent qu'un round sur deux." },
  gel: { icon: "❄️", name: "Sol gelé", text: "Cavalerie à −50 % d'attaque." },
  sang: { icon: "🩸", name: "Nuit de sang", text: "Aucun blessé ne revient de cet étage." },
  remparts: { icon: "🧱", name: "Remparts anciens", text: "La garnison a des murailles." },
  horde: { icon: "👥", name: "Horde", text: "Garnison de miliciens, bien plus nombreuse." },
  champions: { icon: "🐎", name: "Champions", text: "Garnison de chevaliers seulement." },
  sainte: { icon: "✝️", name: "Terre sainte", text: "La fortune de la bataille est fixée à 1." },
  gregeois: { icon: "🔥", name: "Feu grégeois", text: "Béliers et chevaliers subissent +50 % de dégâts." },
};
export const ALTERATION_IDS = Object.keys(ALTERATIONS) as AlterationId[];

/** Formes de garnison : la composition change d'un étage à l'autre, pour qu'on choisisse la sienne. */
export const SHAPES: Record<string, { name: string; hint: string; troops: Partial<Record<UnitId, number>> }> = {
  lances: { name: "Forêt de lances", hint: "beaucoup de piquiers", troops: { piquier: 0.5, arbaletrier: 0.3, milicien: 0.2 } },
  archers: { name: "Archers", hint: "surtout des arbalétriers", troops: { arbaletrier: 0.6, piquier: 0.4 } },
  cavaliers: { name: "Cavalerie", hint: "surtout des chevaliers", troops: { chevalier: 0.6, arbaletrier: 0.2, piquier: 0.2 } },
  melee: { name: "Mêlée", hint: "miliciens, piquiers et chevaliers", troops: { milicien: 0.4, piquier: 0.3, chevalier: 0.3 } },
};
const SHAPE_IDS = Object.keys(SHAPES);

// ---------------------------------------------------------------------------
// La semaine (lundi 4 h, heure de Paris)
// ---------------------------------------------------------------------------

/** Décalage de Paris sur UTC à l'instant t, en millisecondes. */
function parisOffset(t: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** Semaine de la faille : clé (date du lundi), début et fin. */
export function riftWeek(now: number): { key: string; start: number; end: number } {
  const local = now + parisOffset(now) - 4 * 3_600_000;
  const day = new Date(local).getUTCDay(); // 0 = dimanche
  const back = (day + 6) % 7;
  const d = new Date(local);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
  const key = new Date(monday).toISOString().slice(0, 10);
  const startLocal = monday + 4 * 3_600_000;
  const endLocal = startLocal + 7 * 86_400_000;
  return { key, start: startLocal - parisOffset(startLocal), end: endLocal - parisOffset(endLocal) };
}

// ---------------------------------------------------------------------------
// Les étages
// ---------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function isGuardian(floor: number): boolean {
  return floor > 0 && floor % RIFT_GUARDIAN_EVERY === 0;
}

/** Altérations d'un étage pour la semaine : une, parfois deux (plus souvent en haut). */
export function floorAlterations(week: string, floor: number): AlterationId[] {
  const h = hash(`${week}:${floor}:alt`);
  const first = ALTERATION_IDS[h % ALTERATION_IDS.length];
  const two = (h >>> 8) % 100 < Math.min(70, 20 + floor * 2);
  if (!two) return [first];
  let second = ALTERATION_IDS[(h >>> 16) % ALTERATION_IDS.length];
  const clash = (a: AlterationId, b: AlterationId) => a === b || (a === "horde" && b === "champions") || (a === "champions" && b === "horde");
  for (let i = 1; clash(first, second) && i < ALTERATION_IDS.length; i++) second = ALTERATION_IDS[((h >>> 16) + i) % ALTERATION_IDS.length];
  return clash(first, second) ? [first] : [first, second];
}

export function floorShape(week: string, floor: number): string {
  return SHAPE_IDS[hash(`${week}:${floor}:shape`) % SHAPE_IDS.length];
}

export function floorValue(floor: number): number {
  const n = Math.max(1, floor);
  const low = Math.min(n, RIFT_GROWTH_SPLIT) - 1;
  const high = Math.max(0, n - RIFT_GROWTH_SPLIT);
  return RIFT_BASE_VALUE * RIFT_GROWTH_LOW ** low * RIFT_GROWTH_HIGH ** high;
}

export function floorTrain(floor: number): number {
  return Math.min(10, Math.floor((Math.max(1, floor) - 1) / RIFT_TRAIN_EVERY));
}

/** Niveau de fortification des Remparts anciens. */
export function floorWalls(floor: number): number {
  return Math.min(10, Math.ceil(floor / 3));
}

export interface Floor {
  floor: number;
  alterations: AlterationId[];
  shape: string;
  army: Army;
  levels: Levels;
  guardian: boolean;
}

export function riftFloor(week: string, floor: number): Floor {
  const alterations = floorAlterations(week, floor);
  const shape = floorShape(week, floor);
  const value = floorValue(floor) * (isGuardian(floor) ? 2.5 : 1);
  const troops = alterations.includes("horde") ? { milicien: 1 } : alterations.includes("champions") ? { chevalier: 1 } : SHAPES[shape].troops;
  const army: Record<string, number> = { ...armyFromBudget(value * (alterations.includes("horde") ? 1.5 : 1), troops as Partial<Record<CombatantId, number>>) };
  if (alterations.includes("remparts")) {
    const lv = floorWalls(floor);
    army.palissade = 100 * lv;
    army.tour = 20 * lv;
    army.muraille = 3 * lv;
  }
  return { floor, alterations, shape: alterations.includes("horde") ? "horde" : alterations.includes("champions") ? "champions" : shape, army: army as Army, levels: trainLevels(floorTrain(floor)), guardian: isGuardian(floor) };
}

/**
 * Options de bataille d'un étage. `gear` : part des hommes de chaque type dont la relique annule une altération
 * (Fers à glace, Torche de poix, Cuir mouillé), et le reste des bonus de l'expédition.
 */
export function riftBattleOpts(f: Floor, attackerLevels: Levels, gear: { ignore?: Partial<Record<"gel" | "brouillard" | "gregeois", Partial<Record<string, number>>>>; boost?: Boost; first?: Partial<Record<string, number>>; lucky?: boolean } = {}): BattleOptions {
  const has = (a: AlterationId) => f.alterations.includes(a);
  const mods = has("brouillard") || has("gel") || has("gregeois");
  const spared = (alt: "gel" | "brouillard" | "gregeois", id: string, side: string) => (side === "attacker" ? (gear.ignore?.[alt]?.[id] ?? 0) : 0);
  return {
    attackerLevels,
    defenderLevels: f.levels,
    fortune: has("sainte") ? false : gear.lucky ? { min: 0.95, max: 1.2 } : true,
    ...(gear.boost ? { attackerBoost: gear.boost } : {}),
    ...(gear.first ? { attackerFirst: gear.first } : {}),
    ...(mods
      ? {
          modKey: `${f.alterations.filter((a) => a === "brouillard" || a === "gel" || a === "gregeois").join(",")}|${JSON.stringify(gear.ignore ?? {})}`,
          dmgMod: (s: CombatantDef, t: CombatantDef, round: number, side: "attacker" | "defender") => {
            let m = 1;
            if (has("brouillard") && s.category === "tir" && round % 2 === 0) m *= spared("brouillard", s.id, side);
            if (has("gel") && s.category === "cavalerie") m *= 0.5 + 0.5 * spared("gel", s.id, side);
            // Le feu frappe les béliers et chevaliers de l'expédition (côté défenseur qui tire) ou de la garnison.
            if (has("gregeois") && (t.id === "belier" || t.id === "chevalier")) m *= 1 + 0.5 * (1 - (side === "defender" ? (gear.ignore?.gregeois?.[t.id] ?? 0) : 0));
            return m;
          },
        }
      : {}),
  };
}

/** Renom au premier passage d'un étage dans la semaine : 1 par tranche de 3 étages. */
export function floorRenown(floor: number): number {
  return Math.ceil(Math.max(1, floor) / 3);
}

// ---------------------------------------------------------------------------
// L'état du joueur
// ---------------------------------------------------------------------------

export interface RiftFight {
  floor: number;
  won: boolean;
  lost: Army;
  killed: Army;
  at: number;
  /** Capitaines tombés dans ce combat. */
  dead?: string[];
}

export interface RiftExpedition {
  /** Hommes de chaque compagnie encore debout. */
  by: Record<string, number>;
  troops: Army;
  /** Blessés gardés en route, soignés au retour. */
  wounded: Army;
  /** Prochain étage à prendre. */
  floor: number;
  /** out : en route vers la faille ; wait : devant l'étage `floor` ; back : sur le retour. */
  status: "out" | "wait" | "back";
  arriveAt: number;
  returnAt: number;
  /** Durée d'un trajet. */
  travel: number;
  /** Dernier ordre (pour le retour automatique). */
  lastAt: number;
  week: string;
  fights: RiftFight[];
}

export interface RiftState {
  week: string;
  /** Plus haut étage franchi dans la semaine. */
  best: number;
  /** Compagnie → prochaine expédition possible. */
  rest: Record<string, number>;
  exp: RiftExpedition | null;
}

type Holder = Omit<ArmyHolder, "captains" | "relics" | "rift"> & { rift?: RiftState | null; stone: number; captains?: Captain[]; relics?: Relic[] };
type R<S> = { ok: true; value: S } | { ok: false; error: string };
const fail = <S>(error: string): R<S> => ({ ok: false, error });

export function riftOf(s: { rift?: RiftState | null }, now: number): RiftState {
  const week = riftWeek(now).key;
  const r = s.rift;
  if (!r) return { week, best: 0, rest: {}, exp: null };
  return r.week === week ? r : { ...r, week, best: 0 };
}

/** Pourquoi cette compagnie ne peut pas partir dans la faille, ou null. */
export function riftCompanyBlocker(s: Holder, id: string, now: number): string | null {
  const c = (s.companies ?? []).find((x) => x.id === id);
  if (!c) return "Compagnie inconnue.";
  if (c.trainUntil > now) return "Elle est à l'entraînement.";
  const r = riftOf(s, now);
  if ((r.rest[id] ?? 0) > now) return "Elle s'est battue dans la faille il y a moins de 4 heures.";
  const a = allocation(s).get(id);
  if (!a || a.home <= 0) return "Elle n'a personne au domaine.";
  // Les blessés restent à l'infirmerie ; les autres hommes doivent être rentrés.
  if (a.home < a.men - ((s.wounded as Record<string, number>)[c.unit] ?? 0)) return "Tous ses hommes doivent être au domaine.";
  return null;
}

/** Départ d'une expédition. */
export function riftSend<S extends Holder>(s: S, ids: string[], travel: number, now: number): R<S> {
  if (!companiesOn(s)) return fail("La faille s'ouvre avec la saison 1.");
  const r = riftOf(s, now);
  if (r.exp) return fail("Une expédition est déjà dans la faille.");
  const unique = [...new Set(ids)];
  if (unique.length < 1 || unique.length > RIFT_MAX_COMPANIES) return fail(`De 1 à ${RIFT_MAX_COMPANIES} compagnies.`);
  for (const id of unique) {
    const why = riftCompanyBlocker(s, id, now);
    if (why) return fail(why);
  }
  const alloc = allocation(s);
  const by: Record<string, number> = {};
  const troops: Record<string, number> = {};
  const home: Record<string, number> = { ...(s.troops as Record<string, number>) };
  for (const id of unique) {
    const c = s.companies!.find((x) => x.id === id)!;
    const n = Math.min(alloc.get(id)!.home, home[c.unit] ?? 0);
    by[id] = n;
    troops[c.unit] = (troops[c.unit] ?? 0) + n;
    home[c.unit] = (home[c.unit] ?? 0) - n;
    if (home[c.unit] <= 0) delete home[c.unit];
  }
  const rest = { ...r.rest };
  for (const id of unique) rest[id] = now + RIFT_REST_MS;
  const exp: RiftExpedition = { by, troops: troops as Army, wounded: {}, floor: r.best + 1, status: "out", arriveAt: now + travel, returnAt: 0, travel, lastAt: now + travel, week: r.week, fights: [] };
  return { ok: true, value: { ...s, troops: home as S["troops"], rift: { ...r, rest, exp } } };
}

/** Ordre de rentrer. */
export function riftReturn<S extends Holder>(s: S, now: number): R<S> {
  const r = riftOf(s, now);
  const e = r.exp;
  if (!e) return fail("Aucune expédition dans la faille.");
  if (e.status === "back") return fail("L'expédition rentre déjà.");
  // En route vers la faille : demi-tour, elle rentre en autant de temps qu'elle a marché.
  const returnAt = e.status === "out" ? now + Math.max(0, e.travel - Math.max(0, e.arriveAt - now)) : now + e.travel;
  return { ok: true, value: { ...s, rift: { ...r, exp: { ...e, status: "back", returnAt } } } };
}

/** Arrivées, retours automatiques et retours au domaine jusqu'à `now`. */
export function settleRift<S extends Holder>(s: S, now: number, heal: (s: S, wounded: Army, at: number) => S): S {
  if (!s.rift) return s;
  let r = riftOf(s, now);
  let e = r.exp;
  if (e && e.status === "out" && e.arriveAt <= now) {
    // La semaine a pu changer en route : on repart du bas.
    e = { ...e, status: "wait", floor: e.week === r.week ? e.floor : r.best + 1, week: r.week, lastAt: e.arriveAt };
  }
  if (e && e.status === "wait" && e.lastAt + RIFT_IDLE_MS <= now) e = { ...e, status: "back", returnAt: e.lastAt + RIFT_IDLE_MS + e.travel };
  if (e && e.status === "back" && e.returnAt <= now) {
    const troops: Record<string, number> = { ...(s.troops as Record<string, number>) };
    for (const [id, n] of Object.entries(e.troops)) if ((n ?? 0) > 0) troops[id] = (troops[id] ?? 0) + (n ?? 0);
    const back = heal({ ...s, troops: troops as S["troops"] }, e.wounded, e.returnAt);
    r = { ...r, exp: null };
    return { ...back, rift: r };
  }
  if (e === r.exp && r === s.rift) return s;
  return { ...s, rift: { ...r, exp: e } };
}

/** Pourquoi on ne peut pas attaquer l'étage suivant, ou null. */
export function riftFightBlocker(s: Holder, now: number, allies = 0): string | null {
  const e = riftOf(s, now).exp;
  if (!e) return "Aucune expédition dans la faille.";
  if (e.status === "out") return "L'expédition n'est pas encore arrivée.";
  if (e.status === "back") return "L'expédition rentre.";
  if (isGuardian(e.floor) && allies < 1) return "Un gardien garde cet étage : il faut qu'un allié de ton alliance attende aussi devant.";
  return null;
}

/** Niveaux de combat de l'expédition. */
export function expeditionLevels(s: Holder, e: RiftExpedition): Levels {
  return companyLevels(s, Object.keys(e.by), e.by);
}

/** Options complètes de la bataille d'un étage pour cette expédition (capitaines et reliques compris). */
export function expeditionOpts(s: Holder, e: RiftExpedition, f: Floor): BattleOptions {
  const ids = Object.keys(e.by);
  const share = (kind: RelicKind, unit: UnitId) => relicShare(s, kind, unit, e.by);
  const first: Record<string, number> = {};
  for (const u of ["milicien", "piquier", "arbaletrier", "chevalier", "belier"] as UnitId[]) {
    const x = share("lame", u);
    if (x > 0) first[u] = x;
  }
  return riftBattleOpts(f, expeditionLevels(s, e), {
    boost: armyBoost(s, "attack", e.by),
    ignore: { gel: { chevalier: share("fers", "chevalier") }, brouillard: { arbaletrier: share("torche", "arbaletrier") }, gregeois: { chevalier: share("cuir", "chevalier"), belier: share("cuir", "belier") } },
    ...(Object.keys(first).length ? { first } : {}),
    lucky: hasTrait(s, "veinard", ids),
  });
}

/**
 * Applique l'issue d'un combat à l'expédition : pertes réparties sur les compagnies au prorata, bornées par Tenace et
 * l'Écu des anciens ; blessés gardés (sauf Nuit de sang, et +20 % avec le Reliquaire) ; expérience et mort des
 * capitaines ; étage suivant si elle gagne, retour sinon.
 */
export function applyRiftFight<S extends Holder>(s: S, f: Floor, result: { success: boolean; attackerLost: Army; defenderLost: Army }, woundShare: number, now: number, rng: () => number = Math.random): S {
  const r = riftOf(s, now);
  const e = r.exp!;
  const start = { ...e.by };
  const unitOf = (id: string) => s.companies?.find((c) => c.id === id)?.unit;
  // Pertes du type réparties sur ses compagnies, au prorata de leurs hommes.
  const cut: Record<string, number> = {};
  for (const [unit, lostRaw] of Object.entries(result.attackerLost)) {
    const ids = Object.keys(start).filter((id) => unitOf(id) === unit);
    const total = ids.reduce((a, id) => a + start[id], 0);
    let left = Math.min(total, lostRaw ?? 0);
    ids.forEach((id, i) => {
      const c = i === ids.length - 1 ? left : Math.min(left, Math.round(((lostRaw ?? 0) * start[id]) / Math.max(1, total)));
      cut[id] = Math.min(start[id], c);
      left -= cut[id];
    });
  }
  const won = result.success;
  const after = afterBattle(s, start, cut, won, rng);
  const share = f.alterations.includes("sang") ? 0 : woundShare;
  const by: Record<string, number> = {};
  const troops: Record<string, number> = {};
  const wounded: Record<string, number> = { ...(e.wounded as Record<string, number>) };
  const lost: Record<string, number> = {};
  for (const id of Object.keys(start)) {
    const unit = unitOf(id);
    const c = after.cut[id] ?? 0;
    by[id] = start[id] - c;
    if (!unit) continue;
    if (by[id] > 0) troops[unit] = (troops[unit] ?? 0) + by[id];
    if (c > 0) lost[unit] = (lost[unit] ?? 0) + c;
    const w = Math.floor(c * Math.min(1, share * (1 + (after.woundBonus[id] ?? 0))));
    if (w > 0) wounded[unit] = (wounded[unit] ?? 0) + w;
  }
  const alive = Object.values(troops).some((n) => n > 0);
  const ok = won && alive;
  const fight: RiftFight = { floor: f.floor, won: ok, lost: lost as Army, killed: result.defenderLost, at: now, ...(after.dead.length ? { dead: after.dead.map((k) => k.name) } : {}) };
  const exp: RiftExpedition = {
    ...e,
    by,
    troops: troops as Army,
    wounded: wounded as Army,
    floor: ok ? e.floor + 1 : e.floor,
    status: ok ? "wait" : "back",
    returnAt: ok ? 0 : now + e.travel,
    lastAt: now,
    fights: [...e.fights, fight].slice(-12),
  };
  return { ...after.state, rift: { ...r, best: ok ? Math.max(r.best, f.floor) : r.best, exp } };
}

/** Gardiens : une seule bataille pour plusieurs expéditions alliées, bonus mêlés au prorata des hommes de chaque type. */
export function guardianBattle(parts: { s: Holder; e: RiftExpedition }[], f: Floor): { troops: Army; opts: BattleOptions } {
  const troops: Record<string, number> = {};
  for (const p of parts) for (const [id, n] of Object.entries(p.e.troops)) if ((n ?? 0) > 0) troops[id] = (troops[id] ?? 0) + (n ?? 0);
  const each = parts.map((p) => ({ men: p.e.troops as Record<string, number>, o: expeditionOpts(p.s, p.e, f) }));
  const avg = (unit: string, get: (o: BattleOptions) => number) => {
    const total = troops[unit] ?? 0;
    return total > 0 ? each.reduce((a, x) => a + (x.men[unit] ?? 0) * get(x.o), 0) / total : 1;
  };
  const levels: Record<string, number> = {};
  const boost: Required<Boost> = { atk: {}, hp: {}, vs: {} };
  const first: Record<string, number> = {};
  for (const unit of Object.keys(troops)) {
    levels[unit] = (avg(unit, (o) => 1 + 0.1 * Math.max(0, o.attackerLevels?.[unit as UnitId] ?? 0)) - 1) / 0.1;
    boost.atk[unit] = avg(unit, (o) => o.attackerBoost?.atk?.[unit] ?? 1);
    boost.hp[unit] = avg(unit, (o) => o.attackerBoost?.hp?.[unit] ?? 1);
    const vs: Record<string, number> = {};
    for (const cat of ["infanterie", "tir", "cavalerie", "siege", "fortification"]) {
      const v = avg(unit, (o) => o.attackerBoost?.vs?.[unit]?.[cat] ?? 1);
      if (Math.abs(v - 1) > 1e-9) vs[cat] = v;
    }
    if (Object.keys(vs).length) boost.vs[unit] = vs;
    const fs = avg(unit, (o) => o.attackerFirst?.[unit] ?? 0);
    if (fs > 0) first[unit] = fs;
  }
  const share = (unit: string, kind: RelicKind) => {
    const total = troops[unit] ?? 0;
    return total > 0 ? parts.reduce((a, p) => a + ((p.e.troops as Record<string, number>)[unit] ?? 0) * relicShare(p.s, kind, unit as UnitId, p.e.by), 0) / total : 0;
  };
  const opts = riftBattleOpts(f, levels as Levels, {
    boost,
    ignore: { gel: { chevalier: share("chevalier", "fers") }, brouillard: { arbaletrier: share("arbaletrier", "torche") }, gregeois: { chevalier: share("chevalier", "cuir"), belier: share("belier", "cuir") } },
    ...(Object.keys(first).length ? { first } : {}),
    lucky: parts.some((p) => hasTrait(p.s, "veinard", Object.keys(p.e.by))),
  });
  return { troops: troops as Army, opts };
}

/** Pertes d'une bataille commune réparties entre les expéditions, au prorata de leurs hommes de chaque type. */
export function splitLosses(parts: { e: RiftExpedition }[], lost: Army): Army[] {
  const out: Record<string, number>[] = parts.map(() => ({}));
  for (const [unit, n] of Object.entries(lost)) {
    const total = parts.reduce((a, p) => a + ((p.e.troops as Record<string, number>)[unit] ?? 0), 0);
    let left = Math.min(total, n ?? 0);
    parts.forEach((p, i) => {
      const mine = (p.e.troops as Record<string, number>)[unit] ?? 0;
      const c = i === parts.length - 1 ? left : Math.min(left, mine, Math.round(((n ?? 0) * mine) / Math.max(1, total)));
      if (c > 0) out[i][unit] = c;
      left -= c;
    });
  }
  return out as Army[];
}

/** Nettoyage à la lecture. */
export function cleanRift(raw: unknown): RiftState | null {
  const r = raw as Partial<RiftState> | null | undefined;
  if (!r || typeof r !== "object" || typeof r.week !== "string") return null;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const army = (a: unknown): Army => Object.fromEntries(Object.entries((a ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Math.max(0, Math.floor(num(v)))]).filter(([, v]) => (v as number) > 0));
  const rest = Object.fromEntries(Object.entries((r.rest ?? {}) as Record<string, unknown>).map(([k, v]) => [k, num(v)]));
  const e = r.exp as Partial<RiftExpedition> | null | undefined;
  const exp: RiftExpedition | null =
    e && typeof e === "object" && (e.status === "out" || e.status === "wait" || e.status === "back")
      ? {
          by: Object.fromEntries(Object.entries((e.by ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Math.max(0, Math.floor(num(v)))])),
          troops: army(e.troops),
          wounded: army(e.wounded),
          floor: Math.max(1, Math.floor(num(e.floor))),
          status: e.status,
          arriveAt: num(e.arriveAt),
          returnAt: num(e.returnAt),
          travel: num(e.travel),
          lastAt: num(e.lastAt),
          week: String(e.week ?? r.week),
          fights: Array.isArray(e.fights) ? e.fights.slice(-12).map((x) => ({ floor: num(x?.floor), won: !!x?.won, lost: army(x?.lost), killed: army(x?.killed), at: num(x?.at), ...(Array.isArray(x?.dead) ? { dead: x.dead.map(String).slice(0, 4) } : {}) })) : [],
        }
      : null;
  return { week: r.week, best: Math.max(0, Math.floor(num(r.best))), rest, exp };
}
