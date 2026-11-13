import type { PlayerState } from "./engine";
import type { EventKind, MerchantChoice } from "./config";

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
  /** L2 : icône de la branche du nœud de rang 4 de sa Lignée. */
  mark?: string;
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
  /** Joueurs : rançon attendue en cas de victoire (E2), et coefficient d'équité (E3, 1 = plein). */
  ransom?: number;
  fairness?: number;
  /** Joueurs : plafond du butin (2 h de ma production), pour que l'estimation en direct suive la même règle que le serveur. */
  lootCap?: number;
  /** V15 : secondes de stock à l'abri achetées au marchand par ce joueur. */
  lootSafe?: number;
  /** Son alliance est en guerre contre la mienne. */
  atWar: boolean;
  /** Membre de mon alliance : on ne peut pas le piller, on peut lui envoyer des renforts. */
  allied: boolean;
  /** Nom de son alliance, s'il en a une. */
  allianceName: string | null;
  /** Rapport d'espion valable jusqu'à cet instant (0 = aucun : armée et chance sont alors floues). */
  intelUntil: number;
  /** E1 : écart de niveau d'espionnage du meilleur rapport valable (le mien ou celui d'un allié), null sans rapport. */
  spyGap?: number | null;
  /** E2 : sans rapport, l'armée en ordre de grandeur et la chance en un mot (absente dans le brouillard). */
  armyHint?: "bien plus faible" | "comparable" | "plus forte" | "écrasante";
  chanceWord?: "favorable" | "incertaine" | "risquée";
  /** Le stock exposé est connu (rapport +2, +1 pour un seigneur) : sinon pierre et butin valent 0. */
  stoneKnown?: boolean;
  /** Rapport +1 : armées parties et renforts reçus. */
  moves?: { target: string; troops: Record<string, number>; status: "out" | "back" | "camp"; arriveAt: number; returnAt: number }[];
  guests?: Record<string, number>;
  /** Rapport +3 : Forge, recherches, blessés et couvre-feu. */
  levels?: Record<string, number>;
  spyLevel?: number;
  researchQueue?: { id: string; endsAt: number }[];
  wounded?: Record<string, number>;
  healAt?: number;
  curfewStart?: number | null;
  /** Armée qui défendrait le domaine (troupes, fortifications, gardes), et ta chance estimée de l'emporter. */
  army: Record<string, number>;
  chance: number;
  shieldUntil: number;
  burnedUntil: number;
  totalPlundered: number;
  /** Joueurs : dernière activité (heure serveur). Les seigneurs n'en ont pas. */
  lastSeen?: number;
  /** Le joueur est dans sa plage de couvre-feu : ni attaque ni sabotage. */
  curfew?: boolean;
  /** Titres gagnés à la saison précédente. */
  titles?: string[];
  /** Joueurs rivaux : niveau d'académie, recherche en cours, et ce qui empêche de les saboter (null = possible). */
  academy?: number;
  researching?: boolean;
  sabotageBlocker?: string | null;
  /** E4 : sabotage par cible (académie, grenier, guet). */
  sabotageBlockers?: { academie: string | null; grenier: string | null; guet: string | null };
  /** E4 : fin de ma taupe chez lui (0 sans taupe). */
  moleUntil?: number;
  molePrice?: number;
  /** E4 : son armée affichée est une fausse rumeur, démasquée par un rapport à +2. */
  rumorUnmasked?: boolean;
  /** E4 : son grenier est saboté (moitié du stock à l'abri). */
  granaryCut?: boolean;
  sabotageCost?: number;
  revenge: boolean;
  /** Raison pour laquelle on ne peut pas le raider maintenant, ou null. */
  blocker: string | null;
}

/** B3 : ce qui s'est passé pendant une absence d'au moins 30 minutes. */
/** D1 à D4 : un lot du chantier (alliance, ou joueur seul). */
export interface LotView {
  stage: number;
  owner: string;
  name: string;
  solo: boolean;
  target: number;
  progress: number;
  members: number;
  finishedAt: number | null;
  closesAt: number | null;
  master: boolean;
  masterChoice: "production" | "defense" | "loot" | null;
  masterUntil: number | null;
  canChoose: boolean;
  mine: boolean;
  myShare?: number;
  myGiven?: number;
}

export interface AwaySummary {
  since: number;
  produced: number;
  tithe: number;
  raidsLost: { by: string; stolen: number; troops: Record<string, number>; buildings: Record<string, number> }[];
  raidsRepelled: string[];
  sabotages: { by: string; success: boolean }[];
  research: { id: string; levels: number }[];
  stages: number[];
}

export interface ChronicleEntry {
  id: number;
  at: number;
  kind: "raid" | "gift" | "spy" | "war" | "fortress" | "event" | "sabotage" | "lot" | "hall" | "hall_siege" | "stage" | "quest" | "chest" | "ecus" | "renown";
  actorId: string | null;
  actorName: string;
  targetId: string | null;
  targetName: string;
  details: {
    success?: boolean;
    chance?: number;
    stolen?: number;
    stage?: number;
    name?: string;
    master?: boolean;
    ransom?: number;
    destroyed?: Record<string, number>;
    rounds?: number;
    /** B7 : pertes de chaque round et effectifs restants. */
    log?: { attackerLost: Record<string, number>; defenderLost: Record<string, number>; attackerLeft: number; defenderLeft: number }[];
    /** R10 : armées au départ et blessés (visibles des deux camps seulement). */
    attackerStart?: Record<string, number>;
    defenderStart?: Record<string, number>;
    attackerWounded?: Record<string, number>;
    defenderWounded?: Record<string, number>;
    allyShares?: Record<string, number>;
    attackerLost?: Record<string, number>;
    defenderLost?: Record<string, number>;
    revenge?: boolean;
    amount?: number;
    /** Espion surpris à la forteresse. */
    fortress?: boolean;
    phase?: "start" | "end" | "attack" | "camp" | "treasure" | "group";
    /** Participants d'un combat d'événement commun (convoi, siège). */
    members?: string[];
    a?: number;
    b?: number;
    scoreA?: number;
    scoreB?: number;
    winner?: number | null;
    bounty?: number;
    alliance?: number;
    target?: number;
    /** Événement : type et parts de chacun (pierre prise ou dégâts). */
    event?: "caravane" | "colosse" | "bandits" | "tresor" | "convoi" | "siege";
    eventId?: number;
    /** Colosse : pertes infligées, en valeur de pierre. */
    dealt?: number;
    shares?: Record<string, number>;
    /** U2 : quête, coffre et écus. */
    label?: string;
    icon?: string;
    ecus?: number;
    tiers?: number;
  };
}

/** T5 : une armée approche (on ne voit l'attaquant que si les tours l'ont repéré). */
/** Quêtes du jour (trois par jour, renouvelées à 4 h UTC). */
export interface DailyView {
  quests: { id: string; icon: string; label: string; family: string; progress: number; goal: number; claimed: boolean }[];
  swapped: boolean;
  chest: boolean;
  /** Jours complets d'affilée, et bonus du coffre (celui du jour, ou celui obtenu). */
  streak: number;
  chestBonus: number;
  boostUntil: number;
  resetAt: number;
}

/** U1 : renforts d'un allié en route vers moi (out) ou qui rentrent chez lui (back). */
export interface AllyMoveView {
  id: string;
  from: string;
  troops: Partial<Record<string, number>>;
  status: "out" | "back";
  arriveAt: number;
  returnAt: number;
}

export interface IncomingView {
  id: string;
  arriveAt: number;
  from: string | null;
  /** Guet niveau 3 : composition de l'armée. */
  troops?: Partial<Record<string, number>>;
}

/** Halle de guilde (ou loge d'un joueur seul) sur la carte. */
export interface HallPlace {
  id: number;
  name: string;
  allianceId: number | null;
  pos: [number, number];
  stage: number;
  lodge: boolean;
}

/** Ma halle (ou ma loge), ou de quoi la fonder. */
export interface HallView {
  lodge: boolean;
  /** Puis-je fonder, placer les ailes (chef ou propriétaire) ? */
  chief: boolean;
  chiefName: string | null;
  foundCost: number;
  hall: {
    pos: [number, number];
    stage: number;
    maxStages: number;
    progress: number;
    cost: number;
    received: number;
    gifts: { id: string; name: string; amount: number }[];
    wings: Partial<Record<string, number>>;
    /** Niveaux gagnés (étapes, et maîtrise du beffroi) et déjà placés. */
    available: number;
    placed: number;
    masterLevels: number;
    /** H5 : garnison, murs, ailes hors service (jusqu'à) et protection après un assaut. */
    garrison: { id: string; name: string; troops: Partial<Record<string, number>> }[];
    walls: Partial<Record<string, number>>;
    disabled: Partial<Record<string, number>>;
    immuneUntil: number;
  } | null;
  /** Halles ennemies (en guerre) qu'on peut assiéger. */
  targets: { id: number; name: string; wings: Partial<Record<string, number>>; chance: number; blocker: string | null; immuneUntil: number; intelUntil: number }[];
  /** Ma loge qui attend d'être versée dans la halle de mon alliance. */
  dormantLodge: boolean;
}

/** T1 : carte du royaume. Positions en cases (1 à size), par id de joueur ou de seigneur. */
export interface MapView {
  size: number;
  belfry: [number, number] | readonly [number, number];
  fortress: [number, number] | readonly [number, number];
  places: Record<string, [number, number]>;
  halls?: HallPlace[];
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
  /** Lots du chantier, et maître d'œuvre de chaque étape. */
  lots?: LotView[];
  masters?: Record<number, string>;
  /** Résumé de l'absence, envoyé une seule fois au retour du joueur. */
  away?: AwaySummary;
  /** Écus du joueur (monnaie de profil, dépensable dès la saison 1). */
  ecus: number;
  /** H1 : écus de clôture de la dernière saison terminée. */
  seasonRewards?: { season: number; total: number; details: { stages: number; stageEcus: number; podium: { category: string; rank: number; ecus: number }[]; days: number; loginEcus: number } };
  /** Fournie lors des synchronisations et des raids ; sinon le client garde la précédente. */
  chronicle?: ChronicleEntry[];
  map?: MapView;
  incoming?: IncomingView[];
  allyMoves?: AllyMoveView[];
  daily?: DailyView;
  guild?: HallView;
  /** L1 : renom gagné dans la saison, disponible, et gains du jour par source. */
  renown?: { earned: number; available: number; today: Partial<Record<string, number>> };
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  total: number;
}

export type HallCategory = "generous" | "plunderer" | "progress" | "colossus" | "defender" | "fortress" | "war";

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
  plunderers: LeaderboardRow[];
  /** Saison en cours, toutes catégories. */
  standings: Standing[];
  /** Saisons terminées, la plus récente d'abord. */
  hall: SeasonHall[];
  seasonEndsAt: number;
}

export type GameAction =
  | { type: "sync" }
  | { type: "lineage_buy"; node: string }
  | { type: "lineage_respec" }
  | { type: "company"; op: "create" | "dissolve" | "retype" | "recruit" | "train" | "barracks" | "fort"; id?: string; unit?: string; qty?: number }
  | { type: "click"; count: number }
  | { type: "buy"; generator: string; qty: number }
  | { type: "upgrade"; upgrade: string }
  | { type: "contribute"; amount: number }
  | { type: "raid"; target: string; troops?: Record<string, number>; allies?: boolean }
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
  | { type: "event_attack"; troops?: Record<string, number>; camp?: string }
  | { type: "research"; id: string }
  | { type: "research_cancel"; endsAt: number }
  | { type: "legacy_buy"; kind: string }
  | { type: "inbox_read"; category: string }
  | { type: "merchant"; choice: MerchantChoice }
  | { type: "march_recall"; id: string }
  | { type: "tournament_join"; troops: Record<string, number> }
  | { type: "daily"; op: "claim" | "swap" | "chest"; index: number }
  | { type: "hall"; op: "found" | "give" | "tithe" | "place" | "station" | "recall" | "siege"; amount?: number; percent?: number; wing?: string; unit?: string; qty?: number; hall?: number; troops?: Record<string, number> }
  | { type: "academy" }
  | { type: "tithe"; percent: number }
  | { type: "curfew"; start: number | null }
  | { type: "vein" }
  | { type: "master_choice"; choice: "production" | "defense" | "loot" }
  | { type: "sabotage"; target: string; aim?: "academie" | "grenier" | "guet" }
  | { type: "mole"; target: string }
  | { type: "counter" }
  | { type: "rumor"; mode: "fort" | "faible" };

export interface EventView {
  id: number;
  kind: EventKind;
  name: string;
  description: string;
  /** V15 : prix d'un achat au marchand, et si j'ai déjà acheté à ce passage. */
  merchantPrice?: number;
  merchantBought?: boolean;
  /** T6 : position sur la carte (colosse fixe, caravane qui avance de `path.from` à `path.to`). */
  pos?: [number, number];
  path?: { from: [number, number]; to: [number, number] };
  /** V7 : camps de bandits (le mien d'abord), V8 : qui tient le trésor. */
  camps?: { id: string; pos: [number, number]; army: Record<string, number>; winner: string | null; mine: boolean }[];
  holder?: string | null;
  /** V10 à V12 : heure du combat commun, s'il est réglé et son issue. */
  battleAt?: number;
  resolved?: boolean;
  outcome?: "won" | "lost" | "left" | null;
  /** V10, V11 : nombre de joueurs postés, si j'y suis, et l'armée commune des défenseurs. */
  posters?: number;
  myPosted?: boolean;
  defense?: Record<string, number>;
  /** V12 : budget commun, inscrits, mon armée, podium. */
  budget?: number;
  entries?: number;
  myEntry?: Record<string, number> | null;
  podium?: string[];
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
