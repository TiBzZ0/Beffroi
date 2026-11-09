import type { PlayerState } from "./engine";

export interface WorksiteView {
  stage: number;
  progress: number;
  target: number;
  total: number;
  activePlayers: number;
  stageCompletedAt: number[];
}

export interface SeasonView {
  id: number;
  number: number;
  startsAt: number;
  endsAt: number;
}

/** Un autre joueur ou un seigneur voisin, vu depuis l'onglet Raids. */
export interface RivalView {
  id: string;
  name: string;
  isLord: boolean;
  blazon?: string;
  temper?: string;
  /** Seigneurs : difficulté de 1 à 4, et s'ils ne frappent qu'en représailles. */
  difficulty?: 1 | 2 | 3 | 4;
  retaliateOnly?: boolean;
  stone: number;
  rate: number;
  /** Pierre qu'un raid rapporterait maintenant (estimation). */
  loot: number;
  /** Armée qui défendrait le domaine (troupes, fortifications, gardes), et ta chance estimée de l'emporter. */
  army: Record<string, number>;
  chance: number;
  shieldUntil: number;
  burnedUntil: number;
  totalPlundered: number;
  revenge: boolean;
  /** Raison pour laquelle on ne peut pas le raider maintenant, ou null. */
  blocker: string | null;
}

export interface ChronicleEntry {
  id: number;
  at: number;
  kind: "raid" | "gift";
  actorId: string | null;
  actorName: string;
  targetId: string | null;
  targetName: string;
  details: {
    success?: boolean;
    chance?: number;
    stolen?: number;
    destroyed?: Record<string, number>;
    rounds?: number;
    attackerLost?: Record<string, number>;
    defenderLost?: Record<string, number>;
    revenge?: boolean;
    amount?: number;
  };
}

export interface GameSnapshot {
  serverNow: number;
  userId: string;
  username: string;
  state: PlayerState;
  worksite: WorksiteView;
  season: SeasonView;
  rivals: RivalView[];
  /** Fournie lors des synchronisations et des raids ; sinon le client garde la précédente. */
  chronicle?: ChronicleEntry[];
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  total: number;
}

export interface Leaderboards {
  contributors: LeaderboardRow[];
  plunderers: LeaderboardRow[];
}

export type GameAction =
  | { type: "sync" }
  | { type: "click"; count: number }
  | { type: "buy"; generator: string; qty: number }
  | { type: "upgrade"; upgrade: string }
  | { type: "contribute"; amount: number }
  | { type: "raid"; target: string }
  | { type: "rebuild"; generator: string }
  | { type: "army"; kind: "unit" | "defense"; id: string; qty: number };

export type ActionResponse =
  | { ok: true; snapshot: GameSnapshot; message?: string }
  | { ok: false; error: string; snapshot?: GameSnapshot };

/** Bâtit la vue du monde utile au moteur à partir du chantier. */
export function worldFrom(worksite: WorksiteView) {
  return { stageCompletedAt: worksite.stageCompletedAt };
}

/** Convertit une ligne `worksites` (API ou temps réel) en vue. */
export function worksiteFromRow(row: {
  stage: number;
  progress: number;
  target: number;
  total: number;
  active_players: number;
  stage_completed_at: string[] | null;
}): WorksiteView {
  return {
    stage: row.stage,
    progress: Number(row.progress),
    target: Number(row.target),
    total: Number(row.total),
    activePlayers: row.active_players,
    stageCompletedAt: (row.stage_completed_at ?? []).map((t) => Date.parse(t)),
  };
}
