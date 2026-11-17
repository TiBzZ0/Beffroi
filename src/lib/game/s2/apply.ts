// Actions de la saison 2, partagées par le serveur (qui fait foi) et le navigateur (aperçu immédiat).
import { COMPANY_CAP, createCompany } from "../companies";
import { stagesDoneAt, type PlayerState, type Result, type WorldState } from "../engine";
import { lin, LIN_GENERATOR_DISCOUNT } from "../lineage";
import type { GameAction } from "../types";
import { build, buyConcession, concBuild, type ConcBuildingId, dropConcession, exchangeBlocker, firstConcessionSites, LAUNCH_MS, marketQuote, setConcession, shipNow, START_STONE, supplyBlocker, supplyConcession, takeConcession, upgradeConcession, type BuildingId } from "./economy";
import { castleBlocker, regionAt, type Resource } from "./map";
import { s2Map } from "./rules";

export interface S2Outcome {
  state: PlayerState;
  log?: { action: string; details: Record<string, unknown> };
  message?: string;
}

import type { MapPos } from "../config";

/** Saison 2 : ce que le serveur sait des autres (places prises sur les sites, châteaux posés). */
export interface S2Others {
  taken: (siteId: number) => number;
  castles: MapPos[];
}
/** Saison 2 : pose du château, concessions, bâtiments d'appui, marché. */
export function applyS2Action(state: PlayerState, action: Extract<GameAction, { type: "s2" }>, now: number, world: WorldState, others: S2Others): Result<S2Outcome> {
  const map = s2Map();
  const s2 = state.s2;
  if (!map || !s2) return { ok: false, error: "La carte de la saison 2 n'est pas encore ouverte." };
  const ctx = { map, stageConcessions: stagesDoneAt(world, now) >= 1 ? 1 : 0 };
  const done = (next: PlayerState, op: string, details: Record<string, unknown>, message?: string): Result<S2Outcome> => ({ ok: true, value: { state: next, ...(message ? { message } : {}), log: { action: `s2_${op}`, details } } });
  switch (action.op) {
    case "place": {
      if (s2.castle) return { ok: false, error: "Ton château est déjà posé." };
      const p: MapPos = [Math.floor(Number(action.x)), Math.floor(Number(action.y))];
      const why = castleBlocker(map, p as [number, number], others.castles as [number, number][]);
      if (why) return { ok: false, error: why };
      const firsts = firstConcessionSites(map, p as [number, number], others.taken);
      const site = firsts.includes(Number(action.site)) ? Number(action.site) : firsts[0];
      if (site === undefined) return { ok: false, error: "Aucune place libre sur une carrière : choisis une autre case." };
      const placed = { ...s2, castle: p as [number, number], region: regionAt(map, p as [number, number]), at: now, launchUntil: now + LAUNCH_MS };
      const r = takeConcession(placed, ctx, site, { taken: others.taken }, now);
      if (!r.ok) return r;
      // S9 : une compagnie de miliciens pleine, offerte à la pose.
      // Lancement : de la pierre pour bâtir tout de suite.
      let next: PlayerState = { ...state, stone: state.stone + START_STONE, s2: r.value };
      const gift = createCompany(next, "milicien", now);
      if (gift.ok) next = { ...gift.value, troops: { ...gift.value.troops, milicien: (gift.value.troops.milicien ?? 0) + COMPANY_CAP.milicien } };
      return done(next, "place", { x: p[0], y: p[1], site }, `🏰 Ton château est posé. Première concession : ${map.sites[site].name}. Pour bien démarrer : ${START_STONE.toLocaleString("fr-FR")} pierre et une compagnie de miliciens.`);
    }
    case "take": {
      const r = takeConcession(s2, ctx, Number(action.site), { taken: others.taken }, now);
      return r.ok ? done({ ...state, s2: r.value }, "take", { site: action.site }, `⛏️ Nouvelle concession : ${map.sites[Number(action.site)].name}.`) : r;
    }
    case "set": {
      const r = setConcession(s2, String(action.id), action.pace, action.dest, action.manual);
      return r.ok ? done({ ...state, s2: r.value }, "set", { id: action.id, pace: action.pace, dest: action.dest, manual: action.manual }) : r;
    }
    case "cbuild": {
      const r = concBuild(s2, String(action.id), action.building as ConcBuildingId, map, now);
      return r.ok ? done({ ...state, s2: r.value }, "cbuild", { id: action.id, building: action.building }) : r;
    }
    case "ship": {
      const r = shipNow(s2, String(action.id), map, now);
      return r.ok ? done({ ...state, s2: r.value }, "ship", { id: action.id }, "🛒 Convoi parti.") : r;
    }
    case "drop": {
      const r = dropConcession(s2, String(action.id));
      return r.ok ? done({ ...state, s2: r.value }, "drop", { id: action.id }) : r;
    }
    case "upgrade": {
      const r = upgradeConcession(s2, String(action.id), map, now);
      return r.ok ? done({ ...state, s2: r.value.s }, "upgrade", { id: action.id, cost: r.value.cost }) : r;
    }
    case "supply": {
      const amount = Math.floor(Number(action.amount));
      const have = { pierre: state.stone, fer: s2.iron, or: s2.gold };
      const why = supplyBlocker(s2, String(action.id), have, action.from, amount);
      if (why) return { ok: false, error: why };
      const res = action.from as Resource;
      const sent = supplyConcession(s2, String(action.id), map, res, amount, now);
      const paid = { ...have, [res]: have[res] - amount };
      return done({ ...state, stone: paid.pierre, s2: { ...sent, iron: paid.fer, gold: paid.or } }, "supply", { id: action.id, res, amount }, `🛒 Convoi de ravitaillement parti vers la concession.`);
    }
    case "build": {
      const discount = lin(state, "main_oeuvre") ? 1 - LIN_GENERATOR_DISCOUNT : 1;
      const r = build(s2, action.building as BuildingId, state.stone, now, discount);
      return r.ok ? done({ ...state, stone: state.stone - r.value.cost, s2: r.value.s }, "build", { building: action.building, cost: r.value.cost }) : r;
    }
    case "buy": {
      const r = buyConcession(s2);
      return r.ok ? done({ ...state, s2: r.value }, "buy", {}, "🪙 Une concession de plus : choisis sa place sur la carte.") : r;
    }
    case "exchange": {
      const from = action.from as Resource;
      const to = action.to as Resource;
      const amount = Math.floor(Number(action.amount));
      const have = { pierre: state.stone, fer: s2.iron, or: s2.gold };
      if (!(from in have) || !(to in have)) return { ok: false, error: "Monnaie inconnue." };
      const why = exchangeBlocker(have, from, to, amount);
      if (why) return { ok: false, error: why };
      const got = marketQuote(from, to, amount);
      const next = { ...have, [from]: have[from] - amount };
      next[to] += got;
      return done({ ...state, stone: next.pierre, s2: { ...s2, iron: next.fer, gold: next.or } }, "exchange", { from, to, amount, got }, `⚖️ Échange : ${amount.toLocaleString("fr-FR")} ${from} contre ${got.toLocaleString("fr-FR")} ${to}.`);
    }
  }
  return { ok: false, error: "Action inconnue." };
}
