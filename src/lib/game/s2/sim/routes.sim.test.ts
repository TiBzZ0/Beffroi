// Équilibrage des routes : rendement et risque de chaque action, jour par jour (outil, pas un test du jeu).
// SIM=1 npx vitest run src/lib/game/s2/sim/routes.sim.test.ts
import { beforeAll, it } from "vitest";
import { MAP } from "../fixture";
import { setS2Geometry } from "../../config";
import { setIronArmy as ironOn } from "../../companies";
import { setS2Map } from "../rules";
import { armyValue, battle, seededRng, type Army } from "../../battle";
import { COMPANY_CAP, recruitPrice, refRate, trainLevels } from "../../companies";
import type { UnitId } from "../../config";
import { banditSide, campLoot, campSide, CONTRACT_HOURS, CONTRACT_KIND_PAY, CONTRACT_RANK_PAY, expeditionSide, fightChance, patrolSide, routeFight, safePrice, SAFE_HOURS, type Side } from "../convoys";
import { CONVOY_BASE_MIN, newS2State, REF, VALUE } from "../economy";
import { lordTrain } from "../lords";
import { mercOffer, mercPrice } from "../mercs";
import { sabotagePrice, SABOTAGE_SHARE, tradePay, withTower } from "../players";
import type { Rank } from "../map";

const DAY = 86_400_000;
const T0 = 0;
const DAYS = [1, 3, 5, 7, 10, 14, 21];
const RANKS: Rank[] = ["hobereau", "baron", "comte", "duc"];

beforeAll(() => {
  setS2Geometry(true);
  ironOn(true);
  setS2Map(MAP);
});

/** Valeur (en pierre) d'une armée : fer de recrutement ×2. */
const cost = (a: Record<string, number>) => Object.entries(a).reduce((s, [u, n]) => s + recruitPrice(u as UnitId, n) * VALUE.fer, 0);
/** Armée type au jour d : une part `share` de la production cumulée, en tiers de piquiers, chevaliers, arbalétriers. */
function armyAt(d: number, share = 0.25): Record<string, number> {
  let total = 0;
  for (let h = 0; h < d * 24; h++) total += refRate(h) * 3600 * (h % 24 < 16 ? 1 : 0.6);
  const budget = total * share;
  const out: Record<string, number> = {};
  for (const u of ["piquier", "chevalier", "arbaletrier"] as UnitId[]) out[u] = Math.floor(budget / 3 / (recruitPrice(u, 1) * VALUE.fer));
  return out;
}
const train = (d: number) => Math.min(10, Math.floor(d / 2));
const side = (a: Record<string, number>, d: number): Side => ({ army: a as Army, levels: trainLevels(train(d)) });
/** Pertes moyennes (valeur) et chance sur 200 tirages. */
function odds(us: Side, them: Side, n = 200) {
  let lost = 0;
  let won = 0;
  for (let i = 0; i < n; i++) {
    const f = routeFight(us, them, `sim:${i}:${Math.random()}`);
    lost += cost(f.lost as Record<string, number>);
    if (f.won) won++;
  }
  return { chance: fightChance(us, them), win: won / n, lost: lost / n };
}
const pad = (s: string | number, n = 9) => String(s).padStart(n);
const k = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));

it.skipIf(!process.env.SIM)("routes", () => {
  void battle;
  void seededRng;
  void armyValue;
  console.log("\n== Référence : P = production horaire d'un joueur actif, REF = celle d'une concession ==");
  console.log(["jour", "REF", "P", "armée", "valeur", "convoi"].map((x) => pad(x)).join(""));
  for (const d of DAYS) {
    const a = armyAt(d);
    const convoy = (REF(d) * CONVOY_BASE_MIN) / 60;
    console.log([d, k(REF(d)), k(refRate(d * 24) * 3600), Object.values(a).map(k).join("/"), k(cost(a)), k(convoy)].map((x) => pad(x, 9)).join(""));
  }

  console.log("\n== Gains d'une action (valeur pierre, et en heures de P) ==");
  console.log(["jour", "intercep", "embusc4h", "pillage", "camp", "contrat", "commerce/h", "sabotage", "prix sabo"].map((x) => pad(x, 11)).join(""));
  for (const d of DAYS) {
    const P = refRate(d * 24) * 3600;
    const convoy = (REF(d) * CONVOY_BASE_MIN) / 60;
    const intercept = convoy / 3;
    // Embuscade : une route ennemie qui passe, un convoi toutes les 15 min pendant 4 h, un tiers chacun.
    const ambush = 16 * convoy / 3;
    // Pillage : stock moyen d'une concession à la moitié de 4 h (envois à la main), réserve d'un niveau.
    const pillage = 0.25 * REF(d) * 2 + 0.15 * REF(d) * 2;
    const camp = campLoot(T0, d * DAY) * VALUE.fer;
    const contract = ((CONTRACT_HOURS * REF(d)) / VALUE.or) * CONTRACT_RANK_PAY.baron * CONTRACT_KIND_PAY.camp * VALUE.or;
    const trade = tradePay({ ...newS2State(0), castle: [10, 10] }, [10, 10], [20, 10], T0, d * DAY) * VALUE.or;
    const sab = convoy * SABOTAGE_SHARE * 0.6;
    const sabPrice = sabotagePrice(T0, d * DAY) * VALUE.or;
    const h = (v: number) => `${k(v)} ${(v / P).toFixed(2)}h`;
    console.log([d, h(intercept), h(ambush), h(pillage), h(camp), h(contract), h(trade), h(sab), h(sabPrice)].map((x) => pad(x, 11)).join(""));
  }

  console.log("\n== Combats de l'armée type (chance, pertes moyennes en valeur) ==");
  console.log(["jour", "camp", "contrat", "escorte 600pq", "patr.hob", "patr.baron", "patr.comte", "patr.duc"].map((x) => pad(x, 14)).join(""));
  for (const d of DAYS) {
    const a = side(armyAt(d), d);
    const c = odds(a, campSide({ id: "c", pos: [0, 0], from: (d - 1) * DAY }, d * DAY));
    const ct = odds(a, { ...banditSide(T0, d * DAY), army: { milicien: COMPANY_CAP.milicien, piquier: COMPANY_CAP.piquier / 2 } as Army });
    const esc = side({ piquier: COMPANY_CAP.piquier }, d);
    const lords = RANKS.map((r) => {
      const l = MAP.lords.find((x) => x.rank === r)!;
      return fightChance(esc, patrolSide(l, T0, d * DAY));
    });
    const f = (o: { chance: number; lost: number }) => `${(o.chance * 100).toFixed(0)}% -${k(o.lost)}`;
    console.log([d, f(c), f(ct), "", ...lords.map((x) => `${(x * 100).toFixed(0)}%`)].map((x) => pad(x, 14)).join(""));
  }

  console.log("\n== Escorte d'une compagnie de piquiers contre une expédition ==");
  for (const d of DAYS) {
    const esc = side({ piquier: COMPANY_CAP.piquier }, d);
    console.log(pad(d, 4), RANKS.map((r) => `${r} ${(fightChance(esc, expeditionSide(MAP.lords.find((x) => x.rank === r)!, T0, d * DAY)) * 100).toFixed(0)}%`).join("  "));
  }

  console.log("\n== Tour de site : chance d'un pillage avec l'armée type (et 1/4 de l'armée) ==");
  for (const d of DAYS) {
    const full = armyAt(d);
    const quarter = Object.fromEntries(Object.entries(full).map(([u, n]) => [u, Math.floor(n / 4)]));
    console.log(pad(d, 4), [1, 2, 3, 5].map((t) => `niv${t} ${(fightChance(side(full, d), withTower(null, t)!) * 100).toFixed(0)}%/${(fightChance(side(quarter, d), withTower(null, t)!) * 100).toFixed(0)}%`).join("  "));
  }

  console.log("\n== Prix : mercenaires (12 h) et sauf-conduit (24 h), en heures de P ; valeur d'achat de la compagnie louée ==");
  for (const d of DAYS) {
    const P = refRate(d * 24) * 3600;
    const row = RANKS.map((r) => {
      const l = MAP.lords.find((x) => x.rank === r)!;
      const o = mercOffer(l, T0, d * DAY);
      const price = mercPrice(l, T0, d * DAY) * VALUE.or;
      const safe = (safePrice({ ...newS2State(0), castle: [0, 0] }, l, T0, d * DAY) ?? 0) * VALUE.or;
      return `${r.slice(0, 4)} merc ${(price / P).toFixed(1)}h (achat ${(cost({ [o.unit]: o.men }) / P).toFixed(1)}h, t${o.train}) sauf ${(safe / P).toFixed(2)}h`;
    });
    console.log(pad(d, 4), row.join(" | "));
  }
  void SAFE_HOURS;
  void lordTrain;
});

import { convoyRisk, hostilityAt, zonesOnRoute } from "../convoys";
import type { Pos } from "../map";

/** Un joueur passif : une concession dont la route traverse la zone d'un seigneur, convois toutes les `every` minutes, sans escorte. */
export function passive(rank: Rank, every: number, days: number, escort: Side | null) {
  const lord = MAP.lords.find((l) => l.rank === rank)!;
  // Une route qui traverse la zone : d'un côté à l'autre du fief, à distance de la zone.
  const z = 2 + (rank === "duc" ? 2 : rank === "hobereau" ? 0 : 1);
  const from: Pos = [Math.max(0, lord.pos[0] - z - 2), lord.pos[1] + 1];
  const to: Pos = [Math.min(40, lord.pos[0] + z + 2), lord.pos[1] + 1];
  const zones = zonesOnRoute(MAP, from, to).map((x) => x.lord.id);
  const st = { ...newS2State(0), castle: to, who: { id: "sim", alliance: null } };
  const load = (REF(4) * CONVOY_BASE_MIN) / 60;
  let lost = 0;
  let sent = 0;
  const trace: string[] = [];
  for (let t = DAY; t < (1 + days) * DAY; t += every * 60_000) {
    const v = { conc: "c1", res: "pierre" as const, load, depart: t, arrive: t + 5 * 60_000, from, to };
    sent += load;
    lost += convoyRisk(st, v, { map: MAP, seasonStart: 0, stagesDone: 0, escort: () => escort, hurt: () => {} });
    if ((t - DAY) % (12 * 3_600_000) === 0) trace.push(zones.map((id) => hostilityAt(st, id, t).toFixed(0)).join("/"));
  }
  return { lostShare: lost / sent, trace: trace.join(" "), zones: zones.length };
}

it.skipIf(!process.env.SIM)("joueur passif : hostilité et pertes", () => {
  console.log("\n== Joueur passif, une route à travers une zone, 4 jours (hostilité toutes les 12 h, part de la production perdue) ==");
  for (const r of RANKS)
    for (const every of [15, 8]) {
      const a = passive(r, every, 4, null);
      const b = passive(r, every, 4, side({ piquier: COMPANY_CAP.piquier }, 4));
      console.log(pad(r, 9), pad(`${every}min`, 6), `zones ${a.zones}`, `sans escorte ${(a.lostShare * 100).toFixed(1)}%`, `escorte ${(b.lostShare * 100).toFixed(1)}%`, "|", a.trace);
    }
});

it.skipIf(!process.env.SIM)("armées réelles (jour 4)", () => {
  const real: Record<string, Record<string, number>> = {
    "1000 mil": { milicien: 1000 },
    "1000 mil+25 chev": { milicien: 1000, chevalier: 25 },
    "600 piq+136 chev": { piquier: 600, chevalier: 136, arbaletrier: 3 },
    "300 mil+490 arb": { milicien: 300, arbaletrier: 490 },
  };
  console.log("\n== Armées réelles, jour 4 : chance contre camp, contrat (camp), tour 1/2/3, patrouilles hob/baron/comte/duc ==");
  for (const [name, a] of Object.entries(real)) {
    const s = { army: a as Army, levels: trainLevels(0) };
    const camp = fightChance(s, campSide({ id: "c", pos: [0, 0], from: 3 * DAY }, 4 * DAY));
    const ct = fightChance(s, { ...banditSide(T0, 4 * DAY), army: { milicien: COMPANY_CAP.milicien, piquier: COMPANY_CAP.piquier / 2 } as Army });
    const tw = [1, 2, 3].map((t) => (fightChance(s, withTower(null, t)!) * 100).toFixed(0));
    const pt = RANKS.map((r) => (fightChance(s, patrolSide(MAP.lords.find((x) => x.rank === r)!, T0, 4 * DAY)) * 100).toFixed(0));
    console.log(pad(name, 18), `camp ${(camp * 100).toFixed(0)}%`, `contrat ${(ct * 100).toFixed(0)}%`, `tour ${tw.join("/")}%`, `patrouilles ${pt.join("/")}%`, `valeur ${k(cost(a))}`);
  }
});
