// Simulation d'un joueur actif sur 14 jours (outil d'équilibrage, pas un test du jeu).
import { it } from "vitest";
import { castleBlocker, generateMap, type Pos } from "../map";
import * as E from "../economy";

const H = 3_600_000;
const MIN = 60_000;
type S = E.S2State;

it.skipIf(!process.env.SIM)("simulation (SIM=1 pour la lancer)", () => {
  const map = generateMap(42);
  let castle: Pos | null = null;
  for (let y = 4; y < 36 && !castle; y++) for (let x = 4; x < 36 && !castle; x++) if (!castleBlocker(map, [x, y], [])) castle = [x, y];
  const T0 = 0;
  let s: S = { ...E.newS2State(T0), castle: castle!, at: T0, launchUntil: T0 + E.LAUNCH_MS };
  let stone = E.START_STONE;
  const taken = new Set<number>();
  const take = (now: number) => {
    const ctx = { map, stageConcessions: now > 24 * H ? 1 : 0 };
    const cands = map.sites.map((x, id) => ({ x, id })).filter(({ x, id }) => x.type === "pierre" && !taken.has(id) && !E.takeConcessionBlocker(s, ctx, id, { taken: () => 0 }));
    cands.sort((a, b) => b.x.places - a.x.places || Math.hypot(a.x.pos[0] - castle![0], a.x.pos[1] - castle![1]) - Math.hypot(b.x.pos[0] - castle![0], b.x.pos[1] - castle![1]));
    if (!cands.length) return false;
    const r = E.takeConcession(s, ctx, cands[0].id, { taken: () => 0 }, now);
    if (!r.ok) return false;
    s = r.value;
    taken.add(cands[0].id);
    return true;
  };
  take(T0);
  const actions: number[] = [];
  const prodAt: [number, number][] = [];
  const prod = (st: S) => E.productionValue(st, map);
  const awake = (t: number) => (t / H) % 24 < 16;
  for (let t = T0; t <= 14 * 24 * H; t += MIN) {
    const r = E.settleS2(s, { map, stageConcessions: t > 24 * H ? 1 : 0 }, t);
    s = r.s;
    stone += r.arrived.pierre;
    s = { ...s, gold: s.gold + r.arrived.or };
    if (t % H === 0) prodAt.push([t / H, prod(s) * (t < (s.launchUntil ?? 0) ? E.LAUNCH_MULT : 1)]);
    if (!awake(t) && (t / H) % 24 !== 15.99) {
      // La nuit : rien, sauf au coucher (géré par l'éveil).
    }
    if (!awake(t)) continue;
    // Plus de concessions dès qu'il y a une place (étape du beffroi, or).
    while (s.conc.length < E.concessionSlots(s, { stageConcessions: t > 24 * H ? 1 : 0 }) && take(t)) actions.push(t);
    if (!E.buyConcessionBlocker(s)) {
      const b = E.buyConcession(s);
      if (b.ok) { s = b.value; actions.push(t); }
    }
    // Plusieurs actions possibles à la même minute.
    for (let k = 0; k < 6; k++) {
      type Cand = { gain: number; cost: number; apply: () => void };
      const cands: Cand[] = [];
      const base = prod(s);
      const full = s.conc.some((c) => c.stock > 0.6 * E.localCap(s, c, map));
      // Bâtiments communs.
      for (const id of E.BUILDING_IDS) {
        const lvl = Math.max(s.bld[id], ...s.works.filter((w) => w.id === id).map((w) => w.level)) + 1;
        if (lvl > E.BUILDING_MAX || s.works.length >= E.BUILDING_SLOTS) continue;
        const cost = E.buildingCost(id, lvl);
        if (cost > stone) continue;
        let gain = 0;
        if (id === "outils") gain = prod({ ...s, bld: { ...s.bld, outils: lvl } }) - base;
        else if (full && (id === "charronnerie" || id === "relais")) gain = base * 0.2;
        else if (id === "entrepot") gain = 0;
        else continue;
        cands.push({ gain, cost, apply: () => { const r = E.build(s, id, stone, t); if (r.ok) { s = r.value.s; stone -= r.value.cost; } } });
      }
      // Concessions : niveau et bâtiments, payés par la réserve (ravitaillée tout de suite depuis le château).
      for (const c of s.conc) {
        const budget = E.concessionBudget(c, map);
        const fundFor = (cost: number) => Math.max(0, cost - budget);
        if (!(c.upUntil && c.upUntil > t) && c.level < E.CONCESSION_MAX_LEVEL) {
          const cost = E.concessionCost(c.level + 1);
          if (fundFor(cost) <= stone) {
            const gain = prod({ ...s, conc: s.conc.map((x) => (x.id === c.id ? { ...x, level: x.level + 1 } : x)) }) - base;
            cands.push({ gain, cost, apply: () => {
              const need = fundFor(cost);
              stone -= need;
              s = { ...s, conc: s.conc.map((x) => (x.id === c.id ? { ...x, fund: (x.fund ?? 0) + need } : x)) };
              const r = E.upgradeConcession(s, c.id, map, t);
              if (r.ok) s = r.value.s;
            } });
          }
        }
        for (const b of E.CONC_BUILDING_IDS) {
          if (E.concBuildBlocker({ ...s, conc: s.conc.map((x) => (x.id === c.id ? { ...x, fund: 1e12 } : x)) }, c.id, b, map, t)) continue;
          const lvl = (c.cb?.[b] ?? 0) + 1;
          const cost = E.concBuildingCost(lvl);
          if (fundFor(cost) > stone) continue;
          let gain = 0;
          if (b === "atelier") gain = prod({ ...s, conc: s.conc.map((x) => (x.id === c.id ? { ...x, cb: { ...x.cb, atelier: lvl } } : x)) }) - base;
          else if (b === "ecurie" && c.stock > 0.6 * E.localCap(s, c, map)) gain = base * 0.2;
          else continue;
          cands.push({ gain, cost, apply: () => {
            const need = fundFor(cost);
            stone -= need;
            s = { ...s, conc: s.conc.map((x) => (x.id === c.id ? { ...x, fund: (x.fund ?? 0) + need } : x)) };
            const r = E.concBuild(s, c.id, b, map, t);
            if (r.ok) s = r.value;
          } });
        }
      }
      if (!cands.length) break;
      cands.sort((a, b) => b.gain / b.cost - a.gain / a.cost);
      cands[0].apply();
      actions.push(t);
    }
  }
  // Rythme : actions par période.
  const periods: [string, number, number][] = [["0-1h", 0, 1], ["1-6h", 1, 6], ["6-24h", 6, 24], ["j2", 24, 48], ["j3-7", 48, 168], ["j8-14", 168, 336]];
  const awakeHours = (a: number, b: number) => { let n = 0; for (let h = a; h < b; h++) if (h % 24 < 16) n++; return n; };
  const out: string[] = [];
  for (const [name, a, b] of periods) {
    const n = actions.filter((x) => x >= a * H && x < b * H).length;
    out.push(`${name}: ${n} actions, une toutes les ${(awakeHours(a, b) * 60 / Math.max(1, n)).toFixed(1)} min éveillé`);
  }
  for (const h of [0, 1, 6, 24, 48, 72, 168, 240, 336]) {
    const p = prodAt.find(([x]) => x === h)?.[1] ?? 0;
    out.push(`h${h}: ${Math.round(p)}/h (REF ${Math.round(E.REF(h / 24))} × conc ${s.conc.length})`);
  }
  out.push(`fin : niveaux ${s.conc.map((c) => `${c.level}/${JSON.stringify(c.cb ?? {})}`).join(" ")} bld ${JSON.stringify(s.bld)} pierre ${Math.round(stone)} or ${Math.round(s.gold)}`);
  throw new Error("\n" + out.join("\n"));
}, 600_000);
