// Batailles de Beffroi : quelques rounds où chaque camp tire en même temps.
// Chaque type répartit ses coups sur les types adverses selon leurs points de vie totaux
// (les arbalétriers s'abritent derrière les chevaliers, les murs encaissent), avec un
// multiplicateur contre certaines catégories (les piques contre les chevaux, etc.).

import { BATTLE_ROUNDS, BATTLE_SWING, CHANCE_SIMULATIONS, COMBATANTS, LEVEL_BONUS, type CombatantDef, type CombatantId } from "./config";

export type Army = Partial<Record<CombatantId, number>>;
/** Niveau d'amélioration de chaque type (+10 % d'attaque et de PV par niveau). */
export type Levels = Partial<Record<CombatantId, number>>;

/** Multiplicateur d'attaque et de PV d'un type à son niveau. */
export function levelFactor(levels: Levels | undefined, id: CombatantId): number {
  return 1 + LEVEL_BONUS * Math.max(0, levels?.[id] ?? 0);
}

export interface BattleResult {
  success: boolean;
  rounds: number;
  attackerLost: Army;
  defenderLost: Army;
  attackerLeft: Army;
  defenderLeft: Army;
  /** B7 : pertes de chaque round, et effectifs restants à la fin du round. */
  log: RoundLog[];
}

export interface RoundLog {
  attackerLost: Army;
  defenderLost: Army;
  attackerLeft: number;
  defenderLeft: number;
}

export interface BattleOptions {
  /** Multiplicateur des dégâts de l'attaquant (revanche). */
  attackBonus?: number;
  /** Niveaux d'amélioration de chaque camp. */
  attackerLevels?: Levels;
  defenderLevels?: Levels;
}

function defOf(id: string): CombatantDef | undefined {
  return COMBATANTS.get(id);
}

/** Ne garde que les types connus avec au moins un exemplaire. */
export function cleanArmy(army: Army): Army {
  const out: Army = {};
  for (const [id, n] of Object.entries(army) as [CombatantId, number][]) {
    const count = Math.floor(n ?? 0);
    if (count > 0 && defOf(id)) out[id] = count;
  }
  return out;
}

export function armySize(army: Army): number {
  return Object.values(army).reduce<number>((s, n) => s + (n ?? 0), 0);
}

/** Valeur en pierre d'une armée. */
export function armyValue(army: Army): number {
  return (Object.entries(army) as [CombatantId, number][]).reduce((s, [id, n]) => s + (defOf(id)?.cost ?? 0) * n, 0);
}

/** L'armée peut-elle encore blesser quelqu'un ? */
export function canFight(army: Army): boolean {
  return (Object.entries(army) as [CombatantId, number][]).some(([id, n]) => n > 0 && (defOf(id)?.attack ?? 0) > 0);
}

/** Part maximale des coups qu'encaissent les obstacles (palissades, murailles) quand d'autres ripostent derrière. */
const MAX_OBSTACLE_SHARE = 0.5;
/** A12 : les palissades seules n'encaissent jamais plus d'un quart des coups. */
const MAX_PALISADE_SHARE = 0.25;
/** A12 : les béliers réduisent la part des obstacles, jamais sous 20 % de sa valeur. */
const MIN_BREACH_FACTOR = 0.2;

/**
 * Dégâts infligés par `shooters` à chaque type de `targets`.
 * Les coups se répartissent selon les points de vie, mais les obstacles qui ne ripostent pas
 * n'en absorbent jamais plus de la moitié (un quart pour les palissades). Les béliers visent
 * d'abord les obstacles et réduisent la part qu'ils absorbent pour les autres.
 */
function damageOn(shooters: Army, targets: Army, mult: number, shooterLv?: Levels, targetLv?: Levels): Map<CombatantId, number> {
  const out = new Map<CombatantId, number>();
  const alive = (Object.entries(targets) as [CombatantId, number][]).filter(([id, m]) => m > 0 && defOf(id));
  const hpOf = (id: CombatantId, m: number) => m * defOf(id)!.hp * levelFactor(targetLv, id);
  const pool = (keep: (t: CombatantDef) => boolean) => alive.filter(([id]) => keep(defOf(id)!));
  const sumHp = (list: [CombatantId, number][]) => list.reduce((s, [id, m]) => s + hpOf(id, m), 0);
  const armed = pool((t) => t.attack > 0);
  const obstacles = pool((t) => t.attack <= 0);
  const palisades = obstacles.filter(([id]) => id === "palissade");
  const walls = obstacles.filter(([id]) => id !== "palissade");
  const forts = pool((t) => t.category === "fortification");
  const armedHp = sumHp(armed);
  const obstacleHp = sumHp(obstacles);
  const totalHp = armedHp + obstacleHp;
  if (totalHp <= 0) return out;

  // Brèche : la valeur des béliers face à celle des obstacles réduit la part que ceux-ci encaissent.
  const ramValue = armyValue({ belier: shooters.belier ?? 0 });
  const obstacleValue = armyValue(Object.fromEntries(obstacles) as Army);
  const breach = obstacleValue > 0 ? Math.max(MIN_BREACH_FACTOR, 1 - ramValue / obstacleValue) : 1;
  let palShare = 1;
  let wallShare = 0;
  if (armedHp > 0) {
    palShare = Math.min(MAX_PALISADE_SHARE, sumHp(palisades) / totalHp);
    wallShare = Math.min(MAX_OBSTACLE_SHARE - palShare, sumHp(walls) / totalHp);
    palShare *= breach;
    wallShare *= breach;
  } else {
    const ph = sumHp(palisades);
    palShare = obstacleHp > 0 ? ph / obstacleHp : 0;
    wallShare = 1 - palShare;
  }

  // Répartition d'une volée : [cible, part des coups].
  const spread = (list: [CombatantId, number][], share: number): [CombatantId, number][] => {
    const hp = sumHp(list);
    return hp > 0 && share > 0 ? list.map(([id, m]) => [id, (share * hpOf(id, m)) / hp]) : [];
  };
  const normal = [...spread(armed, 1 - palShare - wallShare), ...spread(palisades, palShare), ...spread(walls, wallShare)];
  // Les engins de siège visent d'abord les obstacles, puis les autres fortifications.
  const siege = obstacles.length > 0 ? spread(obstacles, 1) : forts.length > 0 ? spread(forts, 1) : normal;

  for (const [sid, n] of Object.entries(shooters) as [CombatantId, number][]) {
    const s = defOf(sid);
    if (!s || s.attack <= 0 || n <= 0) continue;
    const plan = s.bonus?.fortification ? siege : normal;
    for (const [tid, share] of plan) {
      const t = defOf(tid)!;
      const dmg = n * s.attack * levelFactor(shooterLv, sid) * (s.bonus?.[t.category] ?? 1) * share * mult;
      out.set(tid, (out.get(tid) ?? 0) + dmg);
    }
  }
  return out;
}

/** Transforme des dégâts en pertes : les fractions de PV tuent au hasard. */
function casualties(army: Army, damage: Map<CombatantId, number>, rng: () => number, levels?: Levels): Army {
  const lost: Army = {};
  for (const [id, dmg] of damage) {
    const n = army[id] ?? 0;
    const hp = (defOf(id)?.hp ?? 1) * levelFactor(levels, id);
    const exact = dmg / hp;
    const kills = Math.min(n, Math.floor(exact) + (rng() < exact - Math.floor(exact) ? 1 : 0));
    if (kills > 0) lost[id] = kills;
  }
  return lost;
}

function subtract(army: Army, lost: Army): Army {
  const out: Army = {};
  for (const [id, n] of Object.entries(army) as [CombatantId, number][]) {
    const left = n - (lost[id] ?? 0);
    if (left > 0) out[id] = left;
  }
  return out;
}

function add(a: Army, b: Army): Army {
  const out: Army = { ...a };
  for (const [id, n] of Object.entries(b) as [CombatantId, number][]) out[id] = (out[id] ?? 0) + n;
  return out;
}

/**
 * Livre une bataille. L'attaquant gagne s'il lui reste des hommes et que le défenseur
 * n'a plus personne capable de riposter (palissades et murailles ne suffisent pas à tenir).
 */
export function battle(attacker: Army, defender: Army, rng: () => number, opts: BattleOptions = {}): BattleResult {
  let att = cleanArmy(attacker);
  let def = cleanArmy(defender);
  let attackerLost: Army = {};
  let defenderLost: Army = {};
  let rounds = 0;
  const log: RoundLog[] = [];
  const mult = opts.attackBonus ?? 1;
  while (rounds < BATTLE_ROUNDS && armySize(att) > 0 && canFight(def)) {
    rounds++;
    const aLv = opts.attackerLevels;
    const dLv = opts.defenderLevels;
    // A11 : à chaque round, les dégâts de chaque camp varient de ±15 %.
    const swingAtt = 1 - BATTLE_SWING + rng() * 2 * BATTLE_SWING;
    const swingDef = 1 - BATTLE_SWING + rng() * 2 * BATTLE_SWING;
    const onDef = casualties(def, damageOn(att, def, mult * swingAtt, aLv, dLv), rng, dLv);
    const onAtt = casualties(att, damageOn(def, att, swingDef, dLv, aLv), rng, aLv);
    def = subtract(def, onDef);
    att = subtract(att, onAtt);
    defenderLost = add(defenderLost, onDef);
    attackerLost = add(attackerLost, onAtt);
    log.push({ attackerLost: onAtt, defenderLost: onDef, attackerLeft: armySize(att), defenderLeft: armySize(def) });
  }
  return { success: armySize(att) > 0 && !canFight(def), rounds, attackerLost, defenderLost, attackerLeft: att, defenderLeft: def, log };
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chance de victoire estimée en simulant plusieurs batailles (tirages fixes : résultat stable). */
export function estimateChance(attacker: Army, defender: Army, opts: BattleOptions = {}): number {
  if (armySize(cleanArmy(attacker)) === 0) return 0;
  const rng = seededRng(0xbeff);
  let wins = 0;
  for (let i = 0; i < CHANCE_SIMULATIONS; i++) if (battle(attacker, defender, rng, opts).success) wins++;
  return wins / CHANCE_SIMULATIONS;
}

/** Compose une armée à partir d'un budget et de parts par type (le reste part dans le moins cher). */
export function armyFromBudget(budget: number, shares: Partial<Record<CombatantId, number>>): Army {
  const entries = (Object.entries(shares) as [CombatantId, number][]).filter(([id, s]) => s > 0 && defOf(id));
  if (entries.length === 0 || budget <= 0) return {};
  const army: Army = {};
  let spent = 0;
  for (const [id, share] of entries) {
    const cost = defOf(id)!.cost;
    const n = Math.floor((budget * share) / cost);
    if (n > 0) {
      army[id] = n;
      spent += n * cost;
    }
  }
  const [cheapest] = [...entries].sort((a, b) => defOf(a[0])!.cost - defOf(b[0])!.cost);
  const cost = defOf(cheapest[0])!.cost;
  const extra = Math.floor((budget - spent) / cost);
  if (extra > 0) army[cheapest[0]] = (army[cheapest[0]] ?? 0) + extra;
  return army;
}

/**
 * A10 : armée d'un raid de seigneur, de la composition donnée, dimensionnée sur la défense
 * de la cible pour une chance de victoire d'environ `target` (un tiers).
 */
export function armyForChance(shape: Army, defender: Army, target: number, opts: BattleOptions = {}): Army {
  const shares = Object.fromEntries(Object.entries(cleanArmy(shape)).map(([id, n]) => [id, (defOf(id)?.cost ?? 0) * (n ?? 0)])) as Partial<Record<CombatantId, number>>;
  const total = Object.values(shares).reduce<number>((a, b) => a + (b ?? 0), 0);
  if (total <= 0) return {};
  for (const id of Object.keys(shares) as CombatantId[]) shares[id] = (shares[id] ?? 0) / total;
  const base = Math.max(1, armyValue(defender));
  let lo = 0.05;
  let hi = 20;
  for (let i = 0; i < 12; i++) {
    const mid = Math.sqrt(lo * hi);
    if (estimateChance(armyFromBudget(base * mid, shares), defender, opts) < target) lo = mid;
    else hi = mid;
  }
  return armyFromBudget(base * Math.sqrt(lo * hi), shares);
}
