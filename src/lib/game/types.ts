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
  /** Instant (heure serveur) où `stone` était exact ; la pierre progresse ensuite au rythme `rate`. */
  stoneAt: number;
  rate: number;
  /** Pierre qu'un raid rapporterait maintenant (estimation). */
  loot: number;
  /** Son alliance est en guerre contre la mienne. */
  atWar: boolean;
  /** Membre de mon alliance : on ne peut pas le piller, on peut lui envoyer des renforts. */
  allied: boolean;
  /** Nom de son alliance, s'il en a une. */
  allianceName: string | null;
  /** Rapport d'espion valable jusqu'à cet instant (0 = aucun : armée et chance sont alors floues). */
  intelUntil: number;
  /** Armée qui défendrait le domaine (troupes, fortifications, gardes), et ta chance estimée de l'emporter. */
  army: Record<string, number>;
  chance: number;
  shieldUntil: number;
  burnedUntil: number;
  totalPlundered: number;
  /** Joueurs : dernière activité (heure serveur). Les seigneurs n'en ont pas. */
  lastSeen?: number;
  /** Titres gagnés à la saison précédente. */
  titles?: string[];
  /** Joueurs rivaux : niveau d'académie, recherche en cours, et ce qui empêche de les saboter (null = possible). */
  academy?: number;
  researching?: boolean;
  sabotageBlocker?: string | null;
  sabotageCost?: number;
  revenge: boolean;
  /** Raison pour laquelle on ne peut pas le raider maintenant, ou null. */
  blocker: string | null;
}

export interface ChronicleEntry {
  id: number;
  at: number;
  kind: "raid" | "gift" | "spy" | "war" | "fortress" | "event" | "sabotage";
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
    allyShares?: Record<string, number>;
    attackerLost?: Record<string, number>;
    defenderLost?: Record<string, number>;
    revenge?: boolean;
    amount?: number;
    /** Espion surpris à la forteresse. */
    fortress?: boolean;
    phase?: "start" | "end" | "attack";
    a?: number;
    b?: number;
    scoreA?: number;
    scoreB?: number;
    winner?: number | null;
    bounty?: number;
    alliance?: number;
    /** Événement : type et parts de chacun (pierre prise ou dégâts). */
    event?: "caravane" | "colosse";
    eventId?: number;
    /** Colosse : pertes infligées, en valeur de pierre. */
    dealt?: number;
    shares?: Record<string, number>;
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
  alliance: AllianceView | null;
  invites: InviteView[];
  /** Mes troupes postées chez des alliés, et les renforts d'alliés postés chez moi. */
  abroad: GarrisonAbroad[];
  reinforcements: GarrisonAbroad[];
  alliances: AllianceSummary[];
  war: WarView | null;
  fortress: FortressView;
  event: EventView | null;
  /** Mes titres gagnés à la saison précédente. */
  myTitles: string[];
  /** Fournie lors des synchronisations et des raids ; sinon le client garde la précédente. */
  chronicle?: ChronicleEntry[];
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  total: number;
}

export type HallCategory = "builder" | "plunderer" | "producer" | "colossus" | "caravan" | "fortress" | "war";

/** Un classement : joueurs ou alliances, du premier au dernier. */
export interface Standing {
  category: HallCategory;
  rows: { id: string; name: string; value: number }[];
}

/** Podiums d'une saison terminée. */
export interface SeasonHall {
  season: number;
  endsAt: number;
  podiums: Standing[];
}

export interface Leaderboards {
  contributors: LeaderboardRow[];
  plunderers: LeaderboardRow[];
  /** Saison en cours, toutes catégories. */
  standings: Standing[];
  /** Saisons terminées, la plus récente d'abord. */
  hall: SeasonHall[];
  seasonEndsAt: number;
}

export type GameAction =
  | { type: "sync" }
  | { type: "click"; count: number }
  | { type: "buy"; generator: string; qty: number }
  | { type: "upgrade"; upgrade: string }
  | { type: "contribute"; amount: number }
  | { type: "raid"; target: string }
  | { type: "rebuild"; generator: string }
  | { type: "army"; kind: "unit" | "defense"; id: string; qty: number }
  | { type: "spy"; target: string }
  | { type: "alliance_create"; name: string }
  | { type: "alliance_invite"; target: string }
  | { type: "alliance_accept"; alliance: number }
  | { type: "alliance_decline"; alliance: number }
  | { type: "alliance_leave" }
  | { type: "reinforce"; target: string; unit: string; qty: number }
  | { type: "recall"; host: string }
  | { type: "war_declare"; alliance: number }
  | { type: "fortress_attack" }
  | { type: "fortress_station"; unit: string; qty: number }
  | { type: "fortress_recall" }
  | { type: "event_attack" }
  | { type: "research"; id: string }
  | { type: "academy" }
  | { type: "sabotage"; target: string };

export interface EventView {
  id: number;
  kind: "caravane" | "colosse";
  name: string;
  description: string;
  /** Actif : fin de l'événement. Sinon : arrivée du prochain. */
  active: boolean;
  startsAt: number;
  endsAt: number;
  army: Record<string, number>;
  /** Part des défenseurs encore debout (0 à 1). */
  armyLeft: number;
  /** Caravane : pierre restante. Colosse : prime à partager. */
  pool: number;
  prize: number;
  /** Caravane : pierre que j'ai prise. Colosse : ma part des dégâts (0 à 1). */
  mine: number;
  attackers: number;
  chance: number;
  /** Caravane : ce qu'un assaut réussi rapporte. */
  take: number;
  blocker: string | null;
}

export interface AllianceSummary {
  id: number;
  name: string;
  size: number;
}

export interface WarView {
  id: number;
  enemyId: number;
  enemyName: string;
  myScore: number;
  enemyScore: number;
  /** La guerre commence 2 h après la déclaration. */
  startsAt: number;
  endsAt: number;
}

export interface FortressView {
  name: string;
  holderId: number | null;
  holderName: string | null;
  /** Mon alliance la tient. */
  mine: boolean;
  /** Défenseurs (exacts si c'est la mienne, sinon estimation). */
  army: Record<string, number>;
  exact: boolean;
  /** Fin du rapport d'espion sur la forteresse, s'il y en a un. */
  intelUntil: number | null;
  /** Ma chance de la prendre, et ce qui m'en empêche. */
  chance: number;
  blocker: string | null;
  /** Troupes de chaque membre postées dans la forteresse (visibles par l'alliance qui la tient). */
  garrison: GarrisonAbroad[];
  myGarrison: Record<string, number>;
}

export interface AllianceView {
  id: number;
  name: string;
  members: { id: string; name: string }[];
}

export interface InviteView {
  allianceId: number;
  allianceName: string;
  inviterName: string;
}

/** Troupes postées chez un allié (les miennes chez lui, ou les siennes chez moi). */
export interface GarrisonAbroad {
  id: string;
  name: string;
  troops: Record<string, number>;
}

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
