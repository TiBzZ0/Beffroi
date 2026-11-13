// Données d'équilibrage de Beffroi. Tout ce qui se règle se trouve ici.
// Ce fichier est partagé entre le navigateur (prédiction) et le serveur (calcul qui fait foi).

export const SEASON_DAYS = 14;

/** Gains hors ligne plafonnés à 8 h. */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

/** Clics acceptés au plus par seconde. L'excédent est ignoré. */
export const MAX_CLICKS_PER_SECOND = 20;
/** Fenêtre maximale de clics prise en compte par lot (évite d'accumuler un crédit de clics). */
export const CLICK_WINDOW_MAX_MS = 10_000;
/**
 * Anti-triche : au-delà de 18 coups/s soutenus sur 5 envois de suite, le marteau est confisqué 2 min.
 * La cadence est mesurée sur le temps réel écoulé depuis le lot précédent, et sur au moins 15 s.
 */
export const SUSPICIOUS_CLICK_RATE = 18;
export const CLICK_STRIKES_FOR_PAUSE = 5;
export const CLICK_RATE_MIN_WINDOW_MS = 15_000;
export const CLICK_PAUSE_MS = 2 * 60 * 1000;

/** Croissance du prix de chaque bâtiment supplémentaire. */
export const COST_GROWTH = 1.15;

export type GeneratorId =
  | "manoeuvre"
  | "tailleur"
  | "charrette"
  | "carriere"
  | "four"
  | "grue"
  | "guilde"
  | "port"
  | "marbre"
  | "cite"
  | "architectes"
  | "atelier_royal"
  | "merveille";

export interface GeneratorDef {
  id: GeneratorId;
  name: string;
  plural: string;
  description: string;
  icon: string;
  baseCost: number;
  /** Pierre produite par seconde et par bâtiment, avant bonus. */
  baseRate: number;
}

export const GENERATORS: readonly GeneratorDef[] = [
  { id: "manoeuvre", name: "Manœuvre", plural: "Manœuvres", icon: "🧑‍🌾", description: "Ramasse les pierres des champs.", baseCost: 15, baseRate: 0.1 },
  { id: "tailleur", name: "Tailleur de pierre", plural: "Tailleurs de pierre", icon: "⚒️", description: "Équarrit les blocs au ciseau.", baseCost: 100, baseRate: 1 },
  { id: "charrette", name: "Charrette à bœufs", plural: "Charrettes à bœufs", icon: "🐂", description: "Achemine la pierre des collines.", baseCost: 1_100, baseRate: 8 },
  { id: "carriere", name: "Carrière", plural: "Carrières", icon: "⛰️", description: "Un flanc de montagne entier à exploiter.", baseCost: 12_000, baseRate: 47 },
  { id: "four", name: "Four à chaux", plural: "Fours à chaux", icon: "🔥", description: "Cuit le calcaire pour le mortier.", baseCost: 130_000, baseRate: 260 },
  { id: "grue", name: "Grue à roue", plural: "Grues à roue", icon: "🎡", description: "Deux hommes marchent, les blocs s'envolent.", baseCost: 1_400_000, baseRate: 1_400 },
  { id: "guilde", name: "Guilde des bâtisseurs", plural: "Guildes des bâtisseurs", icon: "🏰", description: "Les maîtres d'œuvre de tout le royaume.", baseCost: 20_000_000, baseRate: 7_800 },
  { id: "port", name: "Port fluvial", plural: "Ports fluviaux", icon: "⚓", description: "Des barges entières de pierre descendent le fleuve.", baseCost: 330_000_000, baseRate: 44_000 },
  { id: "marbre", name: "Mine de marbre", plural: "Mines de marbre", icon: "💎", description: "La pierre la plus noble, pour les plus beaux ouvrages.", baseCost: 5_100_000_000, baseRate: 260_000 },
  { id: "cite", name: "Cité des maçons", plural: "Cités des maçons", icon: "🏘️", description: "Une ville entière vouée à la pierre.", baseCost: 75_000_000_000, baseRate: 1_600_000 },
  { id: "architectes", name: "Ordre des architectes", plural: "Ordres des architectes", icon: "📐", description: "Leurs plans font pousser les tours.", baseCost: 1_000_000_000_000, baseRate: 10_000_000 },
  { id: "atelier_royal", name: "Atelier royal", plural: "Ateliers royaux", icon: "👑", description: "Le roi lui-même finance tes chantiers.", baseCost: 14_000_000_000_000, baseRate: 65_000_000 },
  { id: "merveille", name: "Merveille du royaume", plural: "Merveilles du royaume", icon: "✨", description: "On en parlera dans mille ans.", baseCost: 170_000_000_000_000, baseRate: 430_000_000 },
];

export const GENERATOR_IDS = GENERATORS.map((g) => g.id);

/** Corps de métier : chaque tranche complète de 50 bâtiments d'un type donne +2 % de production totale (ruines exclues). */
export const MASTERY_TRANCHE = 50;
export const MASTERY_BONUS = 0.02;
/** Compagnonnage : chaque tranche de 10 petits bâtiments donne +1 % à la production d'un grand. */
export const COMPANION_TRANCHE = 10;
export const COMPANION_BONUS = 0.01;
export const COMPANIONS: Partial<Record<GeneratorId, GeneratorId>> = {
  manoeuvre: "merveille",
  tailleur: "atelier_royal",
  charrette: "architectes",
  carriere: "cite",
  four: "marbre",
  grue: "port",
};

export type UpgradeEffect =
  | { kind: "generator"; generator: GeneratorId; multiplier: number }
  | { kind: "click"; multiplier: number }
  /** Élan : tant que la réserve d'élan n'est pas vide, la production est augmentée de `bonus`. */
  | { kind: "elan"; bonus: number }
  | { kind: "production"; multiplier: number };

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  effect: UpgradeEffect;
  /** Condition d'apparition : posséder au moins N bâtiments d'un type. */
  requires?: { generator: GeneratorId; count: number };
}

const GENERATOR_UPGRADE_NAMES: Record<GeneratorId, [string, string]> = {
  manoeuvre: ["Paniers d'osier", "Brouettes ferrées"],
  tailleur: ["Ciseaux d'acier", "Gabarits de maître"],
  charrette: ["Roues cerclées de fer", "Attelages doubles"],
  carriere: ["Coins de chêne mouillés", "Treuils à cliquet"],
  four: ["Soufflets de forge", "Chaux vive de qualité"],
  grue: ["Poulies mouflées", "Roues d'écureuil géantes"],
  guilde: ["Chartes royales", "Secrets de compagnons"],
  port: ["Écluses de bois", "Flottille de barges"],
  marbre: ["Scies à eau", "Veines secrètes"],
  cite: ["Halles couvertes", "Remparts de la cité"],
  architectes: ["Compas d'or", "Traités d'architecture"],
  atelier_royal: ["Sceau du roi", "Trésor de la couronne"],
  merveille: ["Pèlerins émerveillés", "Légende éternelle"],
};

/** Paliers avancés (50, 100, 150, 200 bâtiments), communs à tous les types. */
const ADVANCED_TIER_NAMES = ["Savoir-faire", "Maîtrise", "Excellence", "Légende"];

function generatorUpgrades(): UpgradeDef[] {
  const tiers = [
    { count: 10, costFactor: 50 },
    { count: 25, costFactor: 1_000 },
    { count: 50, costFactor: 50_000 },
    { count: 100, costFactor: 5_000_000 },
    { count: 150, costFactor: 500_000_000 },
    { count: 200, costFactor: 50_000_000_000 },
  ];
  return GENERATORS.flatMap((g) =>
    tiers.map((tier, i) => ({
      id: `${g.id}_${i + 1}`,
      name: i < 2 ? GENERATOR_UPGRADE_NAMES[g.id][i] : `${ADVANCED_TIER_NAMES[i - 2]} : ${g.plural.toLowerCase()}`,
      description: `Production des ${g.plural.toLowerCase()} ×2.`,
      cost: g.baseCost * tier.costFactor,
      effect: { kind: "generator" as const, generator: g.id, multiplier: 2 },
      requires: { generator: g.id, count: tier.count },
    })),
  );
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: "gants_cuir", name: "Gants de cuir", description: "Chaque coup de marteau rapporte ×2.", cost: 200, effect: { kind: "click", multiplier: 2 } },
  { id: "masse_bronze", name: "Masse de bronze", description: "Chaque coup de marteau rapporte ×3.", cost: 15_000, effect: { kind: "click", multiplier: 3 }, requires: { generator: "tailleur", count: 5 } },
  { id: "marteau_maitre", name: "Marteau de maître", description: "Frapper donne de l'élan (3 s par coup, 10 min au plus) : tant qu'il dure, +20 % de production.", cost: 60_000, effect: { kind: "elan", bonus: 0.2 }, requires: { generator: "charrette", count: 5 } },
  { id: "benediction", name: "Bénédiction de l'évêque", description: "Toute la production +10 %.", cost: 2_000_000, effect: { kind: "production", multiplier: 1.1 }, requires: { generator: "four", count: 5 } },
  { id: "corvee_royale", name: "Corvée royale", description: "Toute la production +25 %.", cost: 80_000_000, effect: { kind: "production", multiplier: 1.25 }, requires: { generator: "grue", count: 10 } },
  { id: "foire", name: "Foire de la Saint-Jean", description: "Toute la production +25 %.", cost: 2_000_000_000, effect: { kind: "production", multiplier: 1.25 }, requires: { generator: "guilde", count: 10 } },
  { id: "marteau_runique", name: "Marteau runique", description: "L'élan monte à +50 % de production (au lieu de +20 %).", cost: 5_000_000_000, effect: { kind: "elan", bonus: 0.3 }, requires: { generator: "port", count: 5 } },
  { id: "routes_pavees", name: "Routes pavées", description: "Toute la production +50 %.", cost: 100_000_000_000, effect: { kind: "production", multiplier: 1.5 }, requires: { generator: "marbre", count: 10 } },
  { id: "privilege_royal", name: "Privilège royal", description: "Toute la production +50 %.", cost: 5_000_000_000_000, effect: { kind: "production", multiplier: 1.5 }, requires: { generator: "cite", count: 10 } },
  { id: "age_or", name: "Âge d'or", description: "Toute la production ×2.", cost: 300_000_000_000_000, effect: { kind: "production", multiplier: 2 }, requires: { generator: "atelier_royal", count: 10 } },
  ...generatorUpgrades(),
];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((u) => [u.id, u]));

export interface StageDef {
  name: string;
  description: string;
  /** Pierre à verser par joueur actif (taille = base × joueurs actifs sur 7 jours). */
  basePerPlayer: number;
  bonusLabel: string;
  bonus: {
    production?: number;
    click?: number;
    /** B6 : bonus variés, cumulés sur les étapes achevées. */
    defenseHp?: number;
    elan?: number;
    securedSeconds?: number;
    researchSpeed?: number;
    /** Écus versés à l'achèvement à chaque joueur qui a atteint au moins un palier de don. */
    donorEcus?: number;
  };
}

/** Le chantier commun : 8 étapes, chacune débloque un bonus permanent pour la saison. */
export const STAGES: readonly StageDef[] = [
  { name: "Les fondations", description: "Creuser et poser les assises du beffroi.", basePerPlayer: 50_000, bonusLabel: "Production +10 % pour tous", bonus: { production: 1.1 } },
  { name: "La tour de guet", description: "Monter les murs de pierre jusqu'au chemin de ronde.", basePerPlayer: 5_000_000, bonusLabel: "Coups de marteau ×2 pour tous", bonus: { click: 2 } },
  { name: "La chambre des cloches", description: "Couronner la tour et hisser les cloches.", basePerPlayer: 500_000_000, bonusLabel: "Production +25 % pour tous", bonus: { production: 1.25 } },
  { name: "Les gargouilles", description: "Sculpter les gardiens de pierre aux quatre coins.", basePerPlayer: 20_000_000_000, bonusLabel: "Production +10 % et points de vie en défense +20 % pour tous", bonus: { production: 1.1, defenseHp: 0.2 } },
  { name: "Le grand bourdon", description: "Fondre la plus grosse cloche du royaume.", basePerPlayer: 150_000_000_000, bonusLabel: "Élan à +75 % au lieu de +50 % pour tous", bonus: { elan: 0.25 } },
  { name: "La flèche", description: "Élancer la flèche au-dessus des nuages.", basePerPlayer: 1_000_000_000_000, bonusLabel: "Production +15 % et 1 h de stock à l'abri en plus pour tous", bonus: { production: 1.15, securedSeconds: 3600 } },
  { name: "L'horloge astronomique", description: "Une horloge qui suit le soleil, la lune et les saisons.", basePerPlayer: 7_000_000_000_000, bonusLabel: "Production +20 % et recherches 20 % plus rapides pour tous", bonus: { production: 1.2, researchSpeed: 0.2 } },
  { name: "Le beffroi légendaire", description: "On en parlera dans tout le royaume pendant des siècles.", basePerPlayer: 50_000_000_000_000, bonusLabel: "Production +25 % pour tous, et 20 écus à chaque joueur qui a atteint un palier de don", bonus: { production: 1.25, donorEcus: 20 } },
];
/** Un seigneur bâtisseur ne verse jamais plus que cette part de l'étape en cours d'un coup. */
export const LORD_GIFT_MAX_SHARE = 0.25;

/** G1 : après le beffroi, des embellissements sans fin (24 h de production chacun, +5 % de production cumulés, 10 écus aux donateurs). */
export const EMBELLISH_NAMES: readonly string[] = ["Les vitraux", "Le carillon", "Les dorures", "Les statues des bâtisseurs", "Le parvis"];
export const EMBELLISH_HOURS = 24;
export const EMBELLISH_PRODUCTION = 0.05;
export const EMBELLISH_ECUS = 10;
/** Nombre d'étapes envoyé à la base : les huit du beffroi puis assez d'embellissements pour ne jamais s'arrêter. */
export const TOTAL_STAGES = STAGES.length + 200;

/** G1 : définition de l'étape n (0 pour la première), étape du beffroi ou embellissement. */
export function stageDef(n: number): StageDef {
  if (n < STAGES.length) return STAGES[n];
  const k = n - STAGES.length;
  return {
    name: EMBELLISH_NAMES[k] ?? `Embellissement ${k + 1}`,
    description: "Embellir le beffroi achevé, pour la gloire du royaume.",
    basePerPlayer: STAGES[STAGES.length - 1].basePerPlayer,
    bonusLabel: `Production +${Math.round(EMBELLISH_PRODUCTION * 100)} % pour tous, et ${EMBELLISH_ECUS} écus à chaque joueur qui a atteint un palier de don`,
    bonus: { donorEcus: EMBELLISH_ECUS },
  };
}

/** G1 : numéro d'embellissement (1, 2…) de l'étape n, ou 0 pour une étape du beffroi. */
export function embellishmentOf(n: number): number {
  return n < STAGES.length ? 0 : n - STAGES.length + 1;
}

export const STAGE_BASES = STAGES.map((s) => s.basePerPlayer);
/** Taille d'une étape à son ouverture : tant d'heures de la production cumulée des joueurs actifs. */
export const STAGE_SIZE_HOURS = 4;
/** Durée de chaque étape en heures de production (taille, parts de chantier, lots et paliers) : on ralentit la fin du beffroi. */
export const STAGE_HOURS_BY_STAGE: readonly number[] = [4, 4, 4, 4, 4, 4, 12, 24];
export function stageHours(stage: number): number {
  if (stage >= STAGE_HOURS_BY_STAGE.length && stage >= 8) return EMBELLISH_HOURS;
  return STAGE_HOURS_BY_STAGE[stage] ?? STAGE_SIZE_HOURS;
}
/** Dîme automatique : au plus 20 % de la production passive, 5 % pour un nouveau compte, 10 % conseillés. */
export const MAX_TITHE = 0.2;
export const NEW_PLAYER_TITHE = 0.05;
export const ADVISED_TITHE = 0.1;
/** B2 : paliers de don par étape, en part de la part de chantier du joueur (4 h de sa production). */
export const SHARE_HOURS = 4;
export const DONOR_TIERS = [0.25, 0.5, 1] as const;
export const DONOR_TIER_ECUS = [5, 10, 15] as const;
/** Chaque palier atteint donne +2 % de production jusqu'à la fin de la saison. */
export const DONOR_TIER_BONUS = 0.02;
/** C2 : couvre-feu de 8 h par jour ; un changement de plage prend effet 24 h plus tard. */
export const CURFEW_MINUTES = 8 * 60;
export const CURFEW_DELAY_MS = 24 * 3_600_000;
/**
 * C1 : veines d'or. Une pierre dorée toutes les 5 à 10 minutes (si le joueur est là), visible 12 secondes.
 * Frénésie (×2 pendant 30 s, 60 %) ou pluie de pierre (3 min de production, 40 %).
 * En moyenne 90 s de production pour 450 s d'attente : +20 % au plus pour un joueur très attentif.
 */
export const VEIN_MIN_MS = 5 * 60_000;
export const VEIN_MAX_MS = 10 * 60_000;
export const VEIN_VISIBLE_MS = 12_000;
/** Marge accordée à la latence du réseau pour valider une prise. */
export const VEIN_GRACE_MS = 2_000;
export const VEIN_FRENZY_CHANCE = 0.6;
export const VEIN_FRENZY_MS = 30_000;
export const VEIN_FRENZY_FACTOR = 2;
export const VEIN_RAIN_SECONDS = 180;
/** B4 : accueil guidé, dix quêtes affichées une à une pour les nouveaux comptes. */
export const QUESTS = [
  { id: "clicks", label: "Frappe 20 coups de marteau", goal: 20 },
  { id: "workshop", label: "Achète un atelier", goal: 1 },
  { id: "upgrade", label: "Achète un savoir", goal: 1 },
  { id: "workshops", label: "Possède 10 ateliers", goal: 10 },
  { id: "tithe", label: "Règle ta dîme dans l'onglet du chantier", goal: 1 },
  { id: "troops", label: "Recrute 10 troupes", goal: 10 },
  { id: "defense", label: "Bâtis une défense", goal: 1 },
  { id: "lord", label: "Pille un seigneur facile", goal: 1 },
  { id: "alliance", label: "Rejoins ou crée une alliance", goal: 1 },
  { id: "push", label: "Active les notifications", goal: 1 },
] as const;
export type QuestId = (typeof QUESTS)[number]["id"];
/** Quêtes du jour : trois par jour (une par famille), tirées à 4 h UTC. Aucune ne demande d'attaquer un joueur. */
export type DailyFamily = "batir" | "combattre" | "participer";
export const DAILY_QUESTS = [
  { id: "don", family: "batir", icon: "🧱", label: "Verse un quart de ta part de chantier" },
  { id: "ateliers", family: "batir", icon: "🏭", label: "Achète 20 ateliers", goal: 20 },
  { id: "savoir", family: "batir", icon: "📜", label: "Achète un savoir", goal: 1 },
  { id: "seigneur", family: "combattre", icon: "🏰", label: "Gagne un raid contre un seigneur", goal: 1 },
  { id: "repousser", family: "combattre", icon: "🛡️", label: "Repousse un raid", goal: 1 },
  { id: "renforts", family: "combattre", icon: "🤝", label: "Envoie des renforts à un allié", goal: 1 },
  { id: "recherche", family: "combattre", icon: "⚗️", label: "Termine une recherche", goal: 1 },
  { id: "espion", family: "combattre", icon: "🕵️", label: "Envoie une reconnaissance", goal: 1 },
  { id: "veines", family: "participer", icon: "✨", label: "Prends 5 veines d'or", goal: 5 },
  { id: "evenement", family: "participer", icon: "🎪", label: "Prends part à un événement", goal: 1 },
  { id: "message", family: "participer", icon: "💬", label: "Écris un message dans le chat", goal: 1 },
] as const;
export type DailyQuestId = (typeof DAILY_QUESTS)[number]["id"];
export const DAILY_FAMILIES: readonly DailyFamily[] = ["batir", "combattre", "participer"];
export const DAILY_RESET_HOUR_UTC = 4;
/** Chaque quête rapporte 20 minutes de production ; les trois ouvrent un coffre de 4 h de production en plus. */
export const DAILY_REWARD_SECONDS = 20 * 60;
export const DAILY_CHEST_MS = 4 * 60 * 60 * 1000;
/** Coffre : +10 % le premier jour, puis +2,5 % par jour complet d'affilée, +20 % au cinquième. */
export const DAILY_CHEST_BASE = 0.1;
export const DAILY_CHEST_STEP = 0.025;
export const DAILY_STREAK_MAX = 5;
/** Récompense d'une quête : 5 minutes de production, 100 pierres au moins ; la dernière donne aussi 5 écus. */
export const QUEST_REWARD_SECONDS = 300;
export const QUEST_MIN_REWARD = 100;
export const QUEST_FINAL_ECUS = 5;
/** D1 à D4 : lots du chantier. Prime de lot : +10 % de production jusqu'à la fin de l'étape suivante et 10 écus. */
export const LOT_BONUS = 0.1;
export const LOT_ECUS = 10;
export const LOT_PRIME_SHARE = 0.25;
/** Maître d'œuvre : bonus de 24 h au choix pour ses membres ; sans choix au bout d'une heure, la production. */
export const MASTER_BONUSES = {
  production: { label: "+15 % de production", value: 0.15 },
  defense: { label: "+25 % de points de vie en défense", value: 0.25 },
  loot: { label: "+25 % de butin", value: 0.25 },
} as const;
export type MasterBonusKind = keyof typeof MASTER_BONUSES;
export const MASTER_BONUS_MS = 24 * 3_600_000;
export const MASTER_CHOICE_MS = 3_600_000;
/** Taille minimale d'une étape, pour un chantier sans joueur actif. */
export const STAGE_MIN_SIZE = 50_000;

/** Fenêtre pendant laquelle un joueur compte comme actif pour dimensionner le chantier. */
export const ACTIVE_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Raids (version 1)
// ---------------------------------------------------------------------------

/** Délai minimal entre deux raids lancés par un même joueur. */
export const RAID_COOLDOWN_MS = 5 * 60 * 1000;
/** Part du stock non sécurisé volée (doublée en cas de revanche). */
export const RAID_LOOT_RATE = 0.25;
export const REVENGE_LOOT_RATE = 0.4;
/** Stock sécurisé : N secondes de la production de la victime ne peuvent pas être volées. */
export const SECURED_SECONDS = 2 * 60 * 60;
/** Part du stock qui reste toujours exposée au pillage, même si la production est forte. */
export const MIN_EXPOSED_SHARE = 0.5;
/** Ateliers incendiés : production réduite de moitié pendant 30 min. */
export const BURN_MS = 30 * 60 * 1000;
export const BURN_PRODUCTION_FACTOR = 0.5;
/** Chaque coup de marteau accepté écourte l'incendie d'une seconde. */
export const BURN_CLICK_REDUCTION_MS = 1000;
/** Part des bâtiments détruits (arrondi à l'inférieur, au plus un par type). */
export const RAID_DESTROY_RATE = 0.05;
/** Les N premiers bâtiments de chaque type ne peuvent pas être détruits. */
export const PROTECTED_PER_TYPE = 5;
/** Une ruine se rebâtit à ce facteur du prix d'un bâtiment neuf. */
export const RUIN_REBUILD_FACTOR = 0.5;
/** Bouclier de la victime après un raid. */
export const SHIELD_MS = 4 * 60 * 60 * 1000;
/** Bouclier d'un seigneur après un pillage réussi : bien plus court que celui d'un joueur. */
export const LORD_SHIELD_MS = 10 * 60 * 1000;
/** La victime peut se venger pendant ce délai (attaque +50 %, butin doublé, sans attendre). */
export const REVENGE_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Seigneurs voisins (bots assumés)
// ---------------------------------------------------------------------------

export type LordKey = string;

export type Difficulty = 1 | 2 | 3 | 4;
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { 1: "Facile", 2: "Moyen", 3: "Difficile", 4: "Redoutable" };

export interface LordDef {
  key: LordKey;
  /** Identifiant fixe de la ligne `profiles` du seigneur. */
  id: string;
  username: string;
  name: string;
  blazon: string;
  temper: string;
  /** Production = médiane des vrais joueurs × ce facteur (±20 % selon le caractère). */
  rateFactor: number;
  /** Intervalle moyen entre deux raids du seigneur (null = ne raide jamais). */
  raidEveryHours: number | null;
  /** Part de son stock versée au chantier, et intervalle moyen (null = jamais). */
  contribution: { share: number; everyHours: number } | null;
  difficulty: Difficulty;
  /** Ne raide que ceux qui l'ont attaqué récemment (les seigneurs les plus forts). */
  retaliateOnly: boolean;
}

export const LORDS: readonly LordDef[] = [
  { key: "bourbelin", id: "00000000-0000-4000-8000-00000000b0b0", username: "Bourbelin", name: "Hameau de Bourbelin", blazon: "🐑", temper: "Village mal gardé", rateFactor: 0.6, raidEveryHours: null, contribution: null, difficulty: 1, retaliateOnly: false },
  { key: "aubeval", id: "00000000-0000-4000-8000-00000000a0be", username: "Aubeval", name: "Prieure d'Aubeval", blazon: "⛪", temper: "Bâtisseuse pacifique", rateFactor: 0.8, raidEveryHours: null, contribution: { share: 0.2, everyHours: 12 }, difficulty: 1, retaliateOnly: false },
  { key: "corbelune", id: "00000000-0000-4000-8000-00000000c0b1", username: "Corbelune", name: "Baron de Corbelune", blazon: "🐦‍⬛", temper: "Pillard agressif", rateFactor: 1.0, raidEveryHours: 6, contribution: null, difficulty: 2, retaliateOnly: false },
  { key: "ventebrise", id: "00000000-0000-4000-8000-00000000e7b5", username: "Ventebrise", name: "Dame de Ventebrise", blazon: "🏹", temper: "Archère rusée", rateFactor: 1.1, raidEveryHours: 8, contribution: null, difficulty: 2, retaliateOnly: false },
  { key: "grisemolle", id: "00000000-0000-4000-8000-0000000062e5", username: "Grisemolle", name: "Comte Grisemolle", blazon: "💰", temper: "Avare, bien gardé", rateFactor: 1.4, raidEveryHours: 2, contribution: null, difficulty: 3, retaliateOnly: true },
  { key: "noirval", id: "00000000-0000-4000-8000-00000000d0a1", username: "Noirval", name: "Margrave de Noirval", blazon: "🐺", temper: "Cavalier implacable", rateFactor: 1.8, raidEveryHours: 2, contribution: null, difficulty: 3, retaliateOnly: true },
  { key: "hautefaille", id: "00000000-0000-4000-8000-00000000ffaa", username: "Hautefaille", name: "Duc de Hautefaille", blazon: "👑", temper: "Le plus riche du royaume", rateFactor: 3, raidEveryHours: 2, contribution: null, difficulty: 4, retaliateOnly: true },
  { key: "moulinet", id: "00000000-0000-4000-8000-000000000101", username: "Moulinet", name: "Meunier de Moulinet", blazon: "🌾", temper: "Paisible, quelques gardes", rateFactor: 0.5, raidEveryHours: null, contribution: null, difficulty: 1, retaliateOnly: false },
  { key: "bruyere", id: "00000000-0000-4000-8000-000000000102", username: "Bruyere", name: "Abbaye de la Bruyère", blazon: "🕯️", temper: "Moines bâtisseurs", rateFactor: 0.6, raidEveryHours: null, contribution: { share: 0.1, everyHours: 24 }, difficulty: 1, retaliateOnly: false },
  { key: "pontcroix", id: "00000000-0000-4000-8000-000000000103", username: "Pontcroix", name: "Péage de Pontcroix", blazon: "🌉", temper: "Riche et mal défendu", rateFactor: 0.9, raidEveryHours: null, contribution: null, difficulty: 1, retaliateOnly: false },
  { key: "sauleraie", id: "00000000-0000-4000-8000-000000000104", username: "Sauleraie", name: "Chevalier de Sauleraie", blazon: "🍂", temper: "Vieux et fatigué", rateFactor: 0.7, raidEveryHours: null, contribution: null, difficulty: 1, retaliateOnly: false },
  { key: "roncebois", id: "00000000-0000-4000-8000-000000000105", username: "Roncebois", name: "Brigands de Roncebois", blazon: "🗡️", temper: "Pillards des forêts", rateFactor: 0.8, raidEveryHours: 10, contribution: null, difficulty: 2, retaliateOnly: false },
  { key: "clairmarais", id: "00000000-0000-4000-8000-000000000106", username: "Clairmarais", name: "Baronne de Clairmarais", blazon: "🦢", temper: "Archers et tours", rateFactor: 1.0, raidEveryHours: null, contribution: null, difficulty: 2, retaliateOnly: false },
  { key: "pierrefendue", id: "00000000-0000-4000-8000-000000000107", username: "Pierrefendue", name: "Sire de Pierrefendue", blazon: "⛏️", temper: "Mineur têtu", rateFactor: 1.0, raidEveryHours: 16, contribution: null, difficulty: 2, retaliateOnly: false },
  { key: "brumeport", id: "00000000-0000-4000-8000-000000000108", username: "Brumeport", name: "Corsaires de Brumeport", blazon: "⚓", temper: "Pillards des côtes", rateFactor: 1.1, raidEveryHours: 12, contribution: null, difficulty: 2, retaliateOnly: false },
  { key: "lysnoir", id: "00000000-0000-4000-8000-000000000109", username: "LysNoir", name: "Ordre du Lys Noir", blazon: "⚜️", temper: "Chevaliers fanatiques", rateFactor: 1.6, raidEveryHours: 2, contribution: null, difficulty: 3, retaliateOnly: true },
  { key: "hautgivre", id: "00000000-0000-4000-8000-00000000010a", username: "Hautgivre", name: "Seigneur de Hautgivre", blazon: "❄️", temper: "Forteresse des glaces", rateFactor: 1.5, raidEveryHours: 2, contribution: null, difficulty: 3, retaliateOnly: true },
  { key: "rougemarc", id: "00000000-0000-4000-8000-00000000010b", username: "Rougemarc", name: "Comtesse de Rougemarc", blazon: "🍷", temper: "Riche et rancunière", rateFactor: 2.0, raidEveryHours: 2, contribution: null, difficulty: 3, retaliateOnly: true },
  { key: "marches", id: "00000000-0000-4000-8000-00000000010c", username: "Marches", name: "Roi des Marches", blazon: "🐉", temper: "Armée immense", rateFactor: 3.5, raidEveryHours: 2, contribution: null, difficulty: 4, retaliateOnly: true },
  { key: "orgemont", id: "00000000-0000-4000-8000-00000000010d", username: "Orgemont", name: "Haut-Roi d'Orgemont", blazon: "🏰", temper: "Murailles légendaires", rateFactor: 4.0, raidEveryHours: 2, contribution: null, difficulty: 4, retaliateOnly: true },
];

export const LORD_BY_ID: ReadonlyMap<string, LordDef> = new Map(LORDS.map((l) => [l.id, l]));

/** Production minimale d'un seigneur, pour qu'il existe même en début de saison. */
export const LORD_MIN_RATE = 1;

// ---------------------------------------------------------------------------
// Troupes et défenses : combats en rounds, chaque type a ses forces et faiblesses
// ---------------------------------------------------------------------------

export type UnitId = "milicien" | "piquier" | "arbaletrier" | "chevalier" | "belier";
export type DefenseId = "palissade" | "tour" | "baliste" | "muraille";
/** Garde du château : défenseurs gratuits présents dans chaque domaine. */
export type GuardId = "garde";
export type CombatantId = UnitId | DefenseId | GuardId;
export type Category = "infanterie" | "tir" | "cavalerie" | "siege" | "fortification";

export const CATEGORY_LABELS: Record<Category, string> = {
  infanterie: "l'infanterie",
  tir: "les tireurs",
  cavalerie: "la cavalerie",
  siege: "les engins de siège",
  fortification: "les fortifications",
};

export interface CombatantDef<Id extends string = CombatantId> {
  id: Id;
  name: string;
  plural: string;
  icon: string;
  description: string;
  cost: number;
  attack: number;
  hp: number;
  category: Category;
  /** Multiplicateur de dégâts contre certaines catégories. */
  bonus?: Partial<Record<Category, number>>;
}

export const UNITS: readonly CombatantDef<UnitId>[] = [
  { id: "milicien", name: "Milicien", plural: "Miliciens", icon: "🗡️", description: "Pas cher, pas bien solide, mais il met le feu aux engins de siège.", cost: 200, attack: 2, hp: 10, category: "infanterie", bonus: { siege: 4 } },
  { id: "piquier", name: "Piquier", plural: "Piquiers", icon: "🔱", description: "Sa pique arrête net les chevaux.", cost: 400, attack: 3, hp: 25, category: "infanterie", bonus: { cavalerie: 4 } },
  { id: "arbaletrier", name: "Arbalétrier", plural: "Arbalétriers", icon: "🏹", description: "Fauche l'infanterie, fragile au contact.", cost: 500, attack: 8, hp: 15, category: "tir", bonus: { infanterie: 2.5 } },
  { id: "chevalier", name: "Chevalier", plural: "Chevaliers", icon: "🐎", description: "Charge les tireurs, redoute les piques.", cost: 2_000, attack: 25, hp: 80, category: "cavalerie", bonus: { tir: 3 } },
  { id: "belier", name: "Bélier", plural: "Béliers", icon: "🪓", description: "Vise d'abord palissades et murailles, et ouvre une brèche pour les autres.", cost: 3_000, attack: 5, hp: 150, category: "siege", bonus: { fortification: 20 } },
];

export const DEFENSES: readonly CombatantDef<DefenseId>[] = [
  { id: "palissade", name: "Palissade", plural: "Palissades", icon: "🪵", description: "Encaisse les coups (un quart au plus), ne riposte pas.", cost: 150, attack: 0, hp: 120, category: "fortification" },
  { id: "tour", name: "Tour d'archers", plural: "Tours d'archers", icon: "🗼", description: "Arrose l'infanterie qui approche.", cost: 1_000, attack: 8, hp: 60, category: "fortification", bonus: { infanterie: 2 } },
  { id: "baliste", name: "Baliste", plural: "Balistes", icon: "🎯", description: "Transperce chevaliers et béliers.", cost: 3_000, attack: 30, hp: 120, category: "fortification", bonus: { cavalerie: 3, siege: 3 } },
  { id: "muraille", name: "Muraille", plural: "Murailles", icon: "🧱", description: "Un mur immense qui absorbe l'assaut.", cost: 5_000, attack: 0, hp: 1_500, category: "fortification" },
];

export const GUARD: CombatantDef<GuardId> = {
  id: "garde",
  name: "Garde du château",
  plural: "Gardes du château",
  icon: "💂",
  description: "Toujours là, toujours remplacé.",
  cost: 0,
  attack: 2,
  hp: 12,
  category: "infanterie",
};
export const GUARDS_PER_DOMAIN = 3;

export const COMBATANTS: ReadonlyMap<string, CombatantDef> = new Map<string, CombatantDef>([...UNITS, ...DEFENSES, GUARD].map((c) => [c.id, c]));
export const UNIT_IDS = UNITS.map((u) => u.id);
export const DEFENSE_IDS = DEFENSES.map((d) => d.id);

/** Nombre maximal de rounds d'une bataille. */
export const BATTLE_ROUNDS = 4;
/** Part des fortifications détruites qui se relèvent après la bataille. */
export const DEFENSE_REPAIR_RATE = 0.7;
/** Bonus de dégâts lors d'une revanche. */
export const REVENGE_ATTACK_BONUS = 1.5;
/** Nombre de batailles simulées pour estimer la chance de succès. */
export const CHANCE_SIMULATIONS = 40;

// Espions : sans rapport, on ne voit qu'une estimation floue de l'armée adverse.
/** Prix d'un espion : une minute de sa propre production, au moins 200 pierres. */
export const SPY_MIN_COST = 200;
/** Membres au plus par alliance. */
export const MAX_ALLIANCE_SIZE = 4;

// Guerres d'alliances : 24 h sans pause ni bouclier entre ennemis ; la moitié du butin total
// revient en prime à l'alliance gagnante.
export const WAR_MS = 24 * 60 * 60 * 1000;
/** A5 : une guerre commence 2 h après sa déclaration (le temps de s'organiser). */
export const WAR_DELAY_MS = 2 * 60 * 60 * 1000;

// Forteresse : une seule par saison, à prendre en alliance.
/** Bonus de production pour tous les membres de l'alliance qui la tient. */
export const FORTRESS_PRODUCTION_BONUS = 1.2;
/** Garnison neutre de la forteresse libre : valeur = troupes médianes des joueurs × ce facteur. Une fois prise, seules les troupes envoyées la défendent. */
export const FORTRESS_WALLS_POWER = 2;
/** A13 : pas d'assaut pendant 30 minutes après une prise. */
export const FORTRESS_TRUCE_MS = 30 * 60_000;
/** A13 : murs d'une forteresse tenue, en part de leur valeur neutre : 25 % à la prise, +25 % toutes les 2 h, 200 % au plus. */
export const FORTRESS_WALLS_START = 0.25;
export const FORTRESS_WALLS_STEP = 0.25;
export const FORTRESS_WALLS_STEP_MS = 2 * 3_600_000;
export const FORTRESS_WALLS_MAX = 2;
export const FORTRESS_WALLS: Partial<Record<CombatantId, number>> = { muraille: 0.35, baliste: 0.35, tour: 0.3 };
export const FORTRESS_NAME = "Forteresse de Pierre-Haute";
export const SPY_COST_SECONDS = 60;
/** Durée pendant laquelle un rapport montre l'armée exacte (et à jour) de la cible. */
export const SPY_INTEL_MS = 60 * 60 * 1000;
/** Risque que l'espion soit repéré : 30 %, +5 % par tour d'archers de la cible, 90 % au plus. */

/**
 * Armée des seigneurs : valeur = valeur médiane des armées des joueurs × `power`
 * (≈ 0,1 à 0,25 facile, 0,5 moyen, 1 à 1,4 difficile, 3 à 4 redoutable),
 * dont `troopShare` en troupes (qui défendent et raident), le reste en fortifications.
 */
export const LORD_ARMY: Record<LordKey, { power: number; troopShare: number; troops: Partial<Record<UnitId, number>>; forts: Partial<Record<DefenseId, number>> }> = {
  bourbelin: { power: 0.1, troopShare: 0.0, troops: {}, forts: { palissade: 0.6, tour: 0.4 } },
  aubeval: { power: 0.25, troopShare: 0.0, troops: {}, forts: { palissade: 0.5, tour: 0.5 } },
  corbelune: { power: 0.45, troopShare: 0.6, troops: { chevalier: 0.5, arbaletrier: 0.3, milicien: 0.2 }, forts: { palissade: 0.5, tour: 0.5 } },
  ventebrise: { power: 0.55, troopShare: 0.45, troops: { arbaletrier: 0.6, chevalier: 0.4 }, forts: { tour: 0.6, palissade: 0.4 } },
  grisemolle: { power: 1.0, troopShare: 0.29, troops: { piquier: 0.5, arbaletrier: 0.5 }, forts: { muraille: 0.4, baliste: 0.4, tour: 0.2 } },
  noirval: { power: 1.4, troopShare: 0.5, troops: { chevalier: 0.6, piquier: 0.2, arbaletrier: 0.2 }, forts: { baliste: 0.5, tour: 0.3, palissade: 0.2 } },
  hautefaille: { power: 3, troopShare: 0.44, troops: { chevalier: 0.4, arbaletrier: 0.3, piquier: 0.3 }, forts: { muraille: 0.4, baliste: 0.4, tour: 0.2 } },
  moulinet: { power: 0.1, troopShare: 0.0, troops: {}, forts: { palissade: 0.6, tour: 0.4 } },
  bruyere: { power: 0.15, troopShare: 0.0, troops: {}, forts: { palissade: 0.6, tour: 0.4 } },
  pontcroix: { power: 0.2, troopShare: 0.4, troops: { milicien: 1 }, forts: { palissade: 1 } },
  sauleraie: { power: 0.2, troopShare: 0.43, troops: { chevalier: 0.6, milicien: 0.4 }, forts: { palissade: 1 } },
  roncebois: { power: 0.4, troopShare: 0.62, troops: { milicien: 0.5, arbaletrier: 0.5 }, forts: { palissade: 1 } },
  clairmarais: { power: 0.5, troopShare: 0.26, troops: { arbaletrier: 1 }, forts: { tour: 0.7, palissade: 0.3 } },
  pierrefendue: { power: 0.5, troopShare: 0.44, troops: { piquier: 0.7, milicien: 0.3 }, forts: { palissade: 0.5, tour: 0.5 } },
  brumeport: { power: 0.5, troopShare: 0.63, troops: { chevalier: 0.5, arbaletrier: 0.5 }, forts: { tour: 1 } },
  lysnoir: { power: 1.2, troopShare: 0.52, troops: { chevalier: 0.7, piquier: 0.3 }, forts: { baliste: 0.5, tour: 0.5 } },
  hautgivre: { power: 1.1, troopShare: 0.25, troops: { piquier: 0.5, arbaletrier: 0.5 }, forts: { muraille: 0.6, tour: 0.4 } },
  rougemarc: { power: 1.3, troopShare: 0.45, troops: { arbaletrier: 0.5, chevalier: 0.5 }, forts: { baliste: 0.4, tour: 0.4, palissade: 0.2 } },
  marches: { power: 3.5, troopShare: 0.53, troops: { chevalier: 0.4, piquier: 0.3, arbaletrier: 0.3 }, forts: { baliste: 0.5, muraille: 0.3, tour: 0.2 } },
  orgemont: { power: 4, troopShare: 0.37, troops: { piquier: 0.4, arbaletrier: 0.4, chevalier: 0.2 }, forts: { muraille: 0.5, baliste: 0.4, tour: 0.1 } },
};
/** Budget minimal d'une armée de seigneur, pour qu'il ne soit jamais sans défense. */
export const LORD_MIN_BUDGET = 1_500;

// ---------------------------------------------------------------------------
// Coup de pouce aux joueurs distancés
// ---------------------------------------------------------------------------

/**
 * Un joueur qui a produit au moins CATCH_UP_MIN_GAP fois moins que le premier reçoit un bonus
 * de production et de défense : +CATCH_UP_PER_DECADE par facteur 10 d'écart, CATCH_UP_MAX au plus.
 * Exemple : 10× derrière = +30 %, 100× = +60 %, 1 000× et plus = +80 %.
 */
export const CATCH_UP_MIN_GAP = 2;
export const CATCH_UP_PER_DECADE = 0.3;
export const CATCH_UP_MAX = 0.8;

/**
 * Seigneurs difficiles et redoutables : leur armée suit aussi le joueur le plus fort,
 * pour rester une menace. Étalon = max(médiane, armée du plus fort × ce facteur).
 */
export const STRONG_LORD_TOP_SHARE = 0.25;

// Événements : une caravane marchande ou un colosse apparaît régulièrement pour tout le monde.
/** Pause entre deux événements. */
export const EVENT_GAP_MS = 60 * 60 * 1000;
/** Caravane : 1 h pour la piller, une fois par joueur. A14 : chacun affronte sa propre escorte. */
export const CARAVAN_MS = 60 * 60 * 1000;
/** Une victoire rapporte 45 min de sa propre production. */
export const CARAVAN_PRIZE_SECONDS = 45 * 60;
/** Ancienne règle (caravanes lancées avant A14) : part du chargement commun emportée par un assaut. */
export const CARAVAN_TAKE = 0.25;
/** Escorte : 60 % de la valeur de sa propre armée (à la création : troupes médianes × ce facteur). */
export const CARAVAN_ESCORT_POWER = 0.6;
export const CARAVAN_ESCORT: Partial<Record<CombatantId, number>> = { milicien: 0.3, piquier: 0.3, arbaletrier: 0.4 };
/** Colosse : 6 h pour l'abattre à plusieurs ; ses pertes ne se reforment pas. */
export const COLOSSUS_MS = 6 * 60 * 60 * 1000;
/** Son armée : toutes les troupes des joueurs réunies × ce facteur (au moins 3 fois la médiane). */
export const COLOSSUS_POWER = 0.6;
export const COLOSSUS_ARMY: Partial<Record<CombatantId, number>> = { chevalier: 0.35, piquier: 0.3, arbaletrier: 0.35 };
/** A15 : chaque assaut rapporte tout de suite 2 fois la valeur des pertes infligées. */
export const COLOSSUS_BOUNTY = 2;
/** A15 : un colosse abattu donne en plus 15 minutes de sa production à chaque joueur qui l'a touché. */
export const COLOSSUS_KILL_SECONDS = 15 * 60;

/** Un joueur est « en ligne » s'il a été actif il y a moins de ce délai (sa page se synchronise chaque minute). */
export const ONLINE_MS = 2.5 * 60 * 1000;

// Panthéon : catégories figées à la fin de chaque saison (podium de 3), titres pour les premiers.
export type HallUnit = "stone" | "time" | "count" | "percent" | "ratio";
export const HALL: readonly { id: "generous" | "plunderer" | "progress" | "colossus" | "defender" | "fortress" | "war"; icon: string; label: string; title: string; unit: HallUnit; alliance: boolean; ecus?: readonly number[] }[] = [
  { id: "generous", icon: "🏗️", label: "Les plus généreux (part de sa production versée)", title: "Grand bâtisseur", unit: "percent", alliance: false, ecus: [30, 20, 10] },
  { id: "plunderer", icon: "⚔️", label: "Pillards", title: "Fléau du royaume", unit: "stone", alliance: false, ecus: [30, 20, 10] },
  { id: "progress", icon: "📈", label: "Meilleure progression (production multipliée sur 7 jours)", title: "Étoile montante", unit: "ratio", alliance: false, ecus: [30, 20, 10] },
  { id: "colossus", icon: "🗿", label: "Chasseurs de colosses (dégâts)", title: "Tueur de colosses", unit: "stone", alliance: false, ecus: [30, 20, 10] },
  { id: "defender", icon: "🛡️", label: "Meilleurs défenseurs (raids repoussés)", title: "Rempart du royaume", unit: "count", alliance: false, ecus: [30, 20, 10] },
  { id: "fortress", icon: "🏰", label: "Gardiens de Pierre-Haute (temps tenu)", title: "Gardiens de Pierre-Haute", unit: "time", alliance: true, ecus: [30, 20, 10] },
  { id: "war", icon: "🏆", label: "Guerres gagnées", title: "Seigneurs de guerre", unit: "count", alliance: true, ecus: [30, 20, 10] },
];
/** Joueurs qui n'ont presque rien produit : exclus des classements relatifs (B12). */
export const HALL_MIN_PRODUCED = 1_000_000;
export const HALL_PODIUM = 3;

// Améliorations militaires : chaque niveau donne +10 % d'attaque et de PV au type amélioré.
export const LEVEL_BONUS = 0.1;
/** Prix d'un niveau : coût d'un exemplaire × 10 000 × 2,2^niveau actuel (piquier niveau 1 : 4 M ; niveau 10 : ≈ 10 G). */
export const RESEARCH_COST_FACTOR = 10_000;
export const RESEARCH_COST_GROWTH = 2.2;
/** Durée d'un niveau : 2 min × 1,6^niveau actuel (niveau 10 ≈ 3 h 40, niveau 15 ≈ 39 h), divisée par l'académie. */
export const RESEARCH_BASE_MS = 2 * 60 * 1000;
/** Recherches en file d'attente, celle en cours comprise. */
export const RESEARCH_QUEUE_MAX = 3;
export const RESEARCH_TIME_GROWTH = 1.6;
/** Académie militaire : chaque niveau accélère la recherche de 10 % (durée ÷ (1 + 0,1 × niveau)), et coûte 3 fois plus que le précédent. */
export const ACADEMY_SPEED = 0.1;
export const ACADEMY_BASE_COST = 50_000;
export const ACADEMY_COST_GROWTH = 3;
/** Sabotage de l'académie d'un rival : la moitié du prix du niveau visé, et au moins 3 min de sa propre production (1 000 au minimum). */
/** R2 : une recherche annulée rend la moitié de son prix. */
export const RESEARCH_REFUND = 0.5;
export const SABOTAGE_LEVEL_SHARE = 0.5;
/** E4 : un sabotage coûte 10 minutes de production de base. */
export const SABOTAGE_COST_SECONDS = 600;
export const SABOTAGE_MIN_COST = 1_000;
/** Réussite : 60 %, −5 % par tour d'archers de la cible, 10 % au moins. */
/** Refonte de l'espionnage (E4) : réussite 50 % + 10 % par niveau d'écart, entre 10 et 90 %. */
export const SABOTAGE_BASE_SUCCESS = 0.5;
export const SABOTAGE_PER_GAP = 0.1;
export const SABOTAGE_MIN_SUCCESS = 0.1;
export const SABOTAGE_MAX_SUCCESS = 0.9;
/** Un sabotage réussi abat un niveau d'académie, retarde la recherche en cours de 20 % du temps restant, et protège la cible 1 h. */
export const SABOTAGE_DELAY = 0.2;
export const SABOTAGE_IMMUNITY_MS = 60 * 60 * 1000;

// Raids entre joueurs (audit, vague 1).
/** A6 : butin plafonné à 2 h de production de l'attaquant, revanche comprise. */
/** Butin d'un seigneur sur un joueur : au plus 30 minutes de la production de la victime, revanche comprise. */
export const LORD_LOOT_CAP_SECONDS = 30 * 60;
export const PVP_LOOT_CAP_SECONDS = 2 * 60 * 60;
/** G5 : un joueur prend au plus 1 h de sa production de base à un seigneur. */
export const LORD_LOOT_PLAYER_CAP_SECONDS = 60 * 60;
/** G5 : « Tribut des seigneurs », réserve de 2 h de production, +20 min par heure (pleine en 6 h). */
export const TRIBUTE_MAX_SECONDS = 2 * 60 * 60;
export const TRIBUTE_RECHARGE = 1 / 3;
/** A6 : on ne peut pas attaquer une cible dont la taille relative est sous 0,1 (sauf guerre et revanche). */
export const MIN_TARGET_SIZE = 0.1;
/**
 * E1 : infirmerie. Une part des troupes perdues revient 30 minutes après la bataille :
 * 60 % pour le vainqueur, 30 % pour l'attaquant battu, 50 % pour le défenseur battu (remplace A7).
 */
/** E2 : rançon versée par le jeu au vainqueur d'un raid contre un joueur : 30 % de la valeur des défenseurs abattus. */
export const RANSOM_SHARE = 0.3;
/** E3 : équité, coefficient min(1, 2 × taille relative) sur le butin et la rançon (1 en revanche). */
export const FAIRNESS_SLOPE = 2;
/** A11 : les dégâts de chaque camp sont multipliés à chaque round par un tirage entre 0,85 et 1,15. */
export const BATTLE_SWING = 0.15;
/** A10 : un seigneur attaquant vise une chance de victoire d'un tiers. */
export const LORD_RAID_CHANCE = 1 / 3;
export const INFIRMARY_MS = 30 * 60_000;
export const WOUNDED_WINNER = 0.6;
export const WOUNDED_ATTACKER_BEATEN = 0.3;
export const WOUNDED_DEFENDER_BEATEN = 0.5;
/** A7 : après des ruines, plus aucune ruine pendant 24 h. */
export const RUIN_IMMUNITY_MS = 24 * 60 * 60 * 1000;

// Seigneurs (audit, vague 1).
/** A3 : production des seigneurs = référence des joueurs × rateFactor × 0,17. */
export const LORD_RATE_SCALE = 0.17;
/** A3 : coffre plafonné à 12 h de production. */
export const LORD_COFFER_SECONDS = 12 * 60 * 60;
/** A4 : valeur de la défense = part du coffre selon le niveau (plancher : la même part de 2 h de production). */
export const LORD_DEFENSE_SHARE: Record<1 | 2 | 3 | 4, number> = { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 };
export const LORD_DEFENSE_FLOOR_SECONDS = 2 * 60 * 60;

/** A2, G3 : chaque coup accepté ajoute 3 s d'élan, réserve de 10 minutes au plus. */
export const ELAN_PER_CLICK_MS = 3000;
export const ELAN_MAX_MS = 600_000;

// T1 : carte du royaume. Grille de 15 × 15 cases, numérotées de 1 à 15.
export const MAP_SIZE = 15;
export type MapPos = readonly [number, number];
export const BELFRY_POS: MapPos = [8, 8];
export const FORTRESS_POS: MapPos = [8, 4];
/** Un joueur arrive à 2 cases au moins de tout lieu et à 5 cases au plus du centre. */
export const MAP_MIN_GAP = 2;
export const MAP_SPAWN_RADIUS = 5;
/** Cases fixes des seigneurs : faciles en couronne près du centre, redoutables dans les coins. */
export const LORD_POSITIONS: Record<LordKey, MapPos> = {
  bourbelin: [14, 8],
  aubeval: [11, 13],
  moulinet: [5, 13],
  bruyere: [2, 8],
  pontcroix: [5, 3],
  sauleraie: [11, 3],
  corbelune: [14, 12],
  ventebrise: [8, 15],
  roncebois: [2, 12],
  clairmarais: [2, 4],
  pierrefendue: [8, 1],
  brumeport: [14, 4],
  grisemolle: [5, 15],
  noirval: [11, 15],
  lysnoir: [5, 1],
  hautgivre: [11, 1],
  rougemarc: [15, 1],
  hautefaille: [1, 1],
  marches: [15, 15],
  orgemont: [1, 15],
};

export function mapDistance(a: MapPos, b: MapPos): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// Événements sans carte (V3 à V6, V15). Un événement toutes les 2 heures, tiré au sort selon ces poids, jamais deux fois de suite le même.
export type EventKind = "caravane" | "colosse" | "foire" | "fete" | "etoiles" | "treve" | "marchand" | "lune" | "brouillard" | "filon" | "bandits" | "tresor" | "convoi" | "siege" | "tournoi";
export const EVENT_WEIGHTS: Record<EventKind, number> = { caravane: 3, colosse: 2, foire: 2, fete: 2, etoiles: 2, treve: 1, marchand: 2, lune: 1, brouillard: 1, filon: 4, bandits: 6, tresor: 2, convoi: 2, siege: 1, tournoi: 1 };
export const EVENT_DURATIONS_MS: Record<EventKind, number> = {
  caravane: 60 * 60 * 1000,
  colosse: 6 * 60 * 60 * 1000,
  foire: 2 * 60 * 60 * 1000,
  fete: 2 * 60 * 60 * 1000,
  etoiles: 60 * 60 * 1000,
  treve: 2 * 60 * 60 * 1000,
  marchand: 60 * 60 * 1000,
  lune: 2 * 60 * 60 * 1000,
  brouillard: 2 * 60 * 60 * 1000,
  filon: 2 * 60 * 60 * 1000,
  bandits: 3 * 60 * 60 * 1000,
  tresor: 90 * 60 * 1000,
  convoi: 90 * 60 * 1000,
  siege: 3 * 60 * 60 * 1000,
  tournoi: 60 * 60 * 1000,
};
/** V10 : le convoi est attaqué à mi-chemin par 50 % des armées réunies des joueurs actifs ; 45 minutes de production pour chaque escorte s'il passe. */
export const CONVOY_ATTACK_SHARE = 0.5;
export const CONVOY_PRIZE_SECONDS = 45 * 60;
/** Toutes les troupes perdues à l'escorte du convoi passent par l'infirmerie à 60 %. */
export const CONVOY_WOUNDED = 0.6;
/** V11 : 80 % des armées réunies marchent sur le beffroi ; victoire 1 h de production par défenseur, défaite −10 % de l'étape. */
export const SIEGE_ATTACK_SHARE = 0.8;
export const SIEGE_PRIZE_SECONDS = 60 * 60;
export const SIEGE_STAGE_LOSS = 0.1;
/** V12 : tournoi, même budget pour tous (armée médiane), sans pertes ; podium 2 h, 1 h, 30 min de production. */
/** Joueurs en ligne (vus dans les 15 dernières minutes) qu'il faut au moment de l'annonce pour tirer ces événements. */
export const EVENT_MIN_ONLINE: Partial<Record<EventKind, number>> = { siege: 3, convoi: 2, tournoi: 2 };
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;
export const TOURNEY_PRIZES_SECONDS = [2 * 60 * 60, 60 * 60, 30 * 60] as const;
/** V9 : filon géant, 3 minutes de production par tranche de 10 minutes sur place, 30 minutes au plus. */
export const MINE_SECONDS_PER_SLICE = 3 * 60;
export const MINE_SLICE_MS = 10 * 60 * 1000;
export const MINE_MAX_SECONDS = 30 * 60;
/** V7 : un camp de bandits par joueur actif, à 2 ou 3 cases, défendu par 30 % de son armée ; 40 minutes de production pour le vainqueur. */
export const BANDIT_ARMY_SHARE = 0.3;
export const BANDIT_PRIZE_SECONDS = 40 * 60;
/** V8 : le trésor vaut 4 heures de la production médiane. */
export const TREASURE_PRIZE_SECONDS = 4 * 60 * 60;
/** V13 : un raid de seigneur repoussé pendant la lune rouge rapporte 30 % de la valeur de son armée. */
export const RED_MOON_RANSOM = 0.3;
/** V14 : l'espion coûte moitié prix dans le brouillard. */
export const FOG_SPY_FACTOR = 0.5;
/** L'événement suivant est annoncé 15 minutes avant. */
export const EVENT_NOTICE_MS = 15 * 60 * 1000;
/** V3 : savoirs à −20 %, ateliers à −10 %. */
export const FAIR_UPGRADE_FACTOR = 0.8;
export const FAIR_GENERATOR_FACTOR = 0.9;
/** V4 : les dons comptent double pour les paliers et les lots. */
export const FEAST_GIFT_FACTOR = 2;
/** V5 : les veines d'or apparaissent 3 fois plus souvent. */
export const STARS_VEIN_FACTOR = 3;
/** V6 : aucun départ d'armée, production +25 %. */
export const TRUCE_PRODUCTION = 0.25;
/** V15 : le marchand vend un bonus au choix pour 30 minutes de production, une fois par passage. */
export const MERCHANT_PRICE_SECONDS = 30 * 60;
export type MerchantChoice = "production" | "repair" | "safe";
export const MERCHANT_OFFERS: Record<MerchantChoice, { icon: string; label: string }> = {
  production: { icon: "⚒️", label: "+25 % de production pendant 4 heures" },
  repair: { icon: "🧱", label: "Toutes tes ruines rebâties" },
  safe: { icon: "🔒", label: "2 heures de stock à l'abri en plus pendant 24 heures" },
};
export const MERCHANT_PRODUCTION = 0.25;
export const MERCHANT_PRODUCTION_MS = 4 * 60 * 60 * 1000;
export const MERCHANT_SAFE_SECONDS = 2 * 60 * 60;
export const MERCHANT_SAFE_MS = 24 * 60 * 60 * 1000;

// T2 à T5 : trajets des armées.
/** Vitesse en cases par minute « de base » : l'armée avance au pas de son unité la plus lente. */
export const UNIT_SPEED: Record<string, number> = { milicien: 1, piquier: 1, arbaletrier: 1, chevalier: 1.5, belier: 0.6 };
export const TRAVEL_BASE_MIN = 2;
/** Le seul réglage à toucher : minutes par case à vitesse 1 (à calibrer en jeu). */
export const TRAVEL_PER_CELL_MIN = 1;
export const TRAVEL_MIN_MIN = 3;
export const TRAVEL_MAX_MIN = 20;
/** Trois armées en route au plus par joueur. */
export const MAX_MARCHES = 3;
/** T5 : chaque tour d'archers donne 5 % de chance de voir le nom de l'attaquant, 90 % au plus. */
/** T6 : un seigneur vise de préférence un joueur à moins de 8 cases. */
export const LORD_TARGET_RADIUS = 8;

// ---------------------------------------------------------------------------
// Halle de guilde (H1 à H6)
// ---------------------------------------------------------------------------

export type WingId = "loge" | "grenier" | "armes" | "guet" | "ecuries" | "infirmerie";

export interface WingDef {
  id: WingId;
  name: string;
  icon: string;
  levels: [string, string, string];
}

export const WINGS: readonly WingDef[] = [
  { id: "loge", name: "Loge des bâtisseurs", icon: "🧱", levels: ["+5 % de production", "+10 % de production", "+15 % de production"] },
  { id: "grenier", name: "Grenier commun", icon: "🌾", levels: ["+30 min de stock à l'abri", "+1 h de stock à l'abri", "+1 h 30 de stock à l'abri"] },
  { id: "armes", name: "Salle d'armes", icon: "⚔️", levels: ["Renforts 10 % plus forts, 20 % plus rapides", "Renforts 20 % plus forts, 40 % plus rapides", "Renforts 30 % plus forts, 60 % plus rapides"] },
  { id: "guet", name: "Guet", icon: "🔭", levels: ["Alerte dès le départ de l'armée ennemie", "Le nom de l'attaquant est toujours connu", "La composition de l'armée est connue"] },
  { id: "ecuries", name: "Écuries", icon: "🐎", levels: ["Armées 10 % plus rapides", "Armées 20 % plus rapides", "Armées 30 % plus rapides"] },
  { id: "infirmerie", name: "Infirmerie de guilde", icon: "⚕️", levels: ["Blessés soignés en 25 min", "Blessés soignés en 20 min", "Blessés soignés en 15 min"] },
];
export const WING_IDS = WINGS.map((w) => w.id);
export const WING_MAX_LEVEL = 3;

/** Prix de fondation : 30 minutes de la production cumulée des membres. */
export const HALL_FOUND_HOURS = 0.5;
/** Étape n : 0,5 × 1,4^(n−1) heure de la production cumulée des membres, mesurée à l'ouverture. */
export const HALL_STAGE_BASE_HOURS = 0.5;
export const HALL_STAGE_GROWTH = 1.4;
export const HALL_STAGES = 10;
/** Loge d'un joueur seul : 4 étapes, deux ailes différentes au plus. */
export const LODGE_STAGES = 4;
export const LODGE_MAX_WINGS = 2;
/** À 3 cases au plus d'un membre, à 2 cases au moins de tout autre lieu. */
export const HALL_MAX_FROM_MEMBER = 3;
export const HALL_MIN_GAP = 2;
/** Part de la dîme qui va à la halle : 0 à 50 %, par pas de 5 %, 25 % au départ. */
export const HALL_TITHE_MAX = 0.5;
export const HALL_TITHE_DEFAULT = 0.25;
/** Effets des ailes, par niveau (index 0 = aile absente). */
export const WING_PRODUCTION = [0, 0.05, 0.1, 0.15];
export const WING_SAFE_SECONDS = [0, 1800, 3600, 5400];
export const WING_REINFORCE_STRENGTH = [0, 0.1, 0.2, 0.3];
export const WING_REINFORCE_SPEED = [0, 0.2, 0.4, 0.6];
export const WING_ARMY_SPEED = [0, 0.1, 0.2, 0.3];
export const WING_HEAL_MS = [30, 25, 20, 15].map((m) => m * 60_000);
/** H5 : murs de la halle (10 % de la pierre reçue), aile hors service 24 h, puis halle à l'abri 24 h. */
export const HALL_WALLS_SHARE = 0.1;
export const HALL_WING_DOWN_MS = 24 * 3_600_000;
export const HALL_SIEGE_IMMUNITY_MS = 24 * 3_600_000;

// ---------------------------------------------------------------------------
// Espionnage (E1 à E3)
// ---------------------------------------------------------------------------

/** Recherche « Espionnage » : 10 niveaux, le niveau n coûte 20 min de production de base × 1,6^(n−1). */
export const SPY_LEVEL_MAX = 10;
export const SPY_LEVEL_SECONDS = 20 * 60;
export const SPY_LEVEL_GROWTH = 1.6;
/** Niveau des seigneurs selon leur difficulté (1 facile à 4 redoutable). */
export const LORD_SPY_LEVEL: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 2, 3: 4, 4: 6 };
/** L'espion voyage comme une armée de vitesse 3, aller simple, 1 minute au moins ; 3 en route au plus. */
export const SPY_SPEED = 3;
export const SPY_MIN_MS = 60_000;
export const SPY_MAX_ACTIVE = 3;
/** Risque d'être repéré : 50 % − 10 % par niveau d'écart + 2 % par case, entre 5 et 95 %. */
export const SPY_RISK_BASE = 0.5;
export const SPY_RISK_PER_GAP = 0.1;
export const SPY_RISK_PER_CELL = 0.02;
export const SPY_RISK_MIN = 0.05;
export const SPY_RISK_MAX = 0.95;
/** E5 : trois espions repérés chez la même cible en 24 h, et ils n'y entrent plus pendant 6 h. */
export const SPY_BAN_COUNT = 3;
export const SPY_BAN_WINDOW_MS = 24 * 3_600_000;
export const SPY_BAN_MS = 6 * 3_600_000;
/** E4 : taupe (5 min, 2 h, écart +1 au moins, deux actives au plus), contre-espionnage (3 min, 6 h, −2 à l'écart), fausse rumeur (3 min, 2 h, ×2 ou ÷2). */
export const MOLE_SECONDS = 5 * 60;
export const MOLE_MS = 2 * 3_600_000;
export const MOLE_MAX = 2;
export const MOLE_MIN_GAP = 1;
export const COUNTER_SECONDS = 3 * 60;
export const COUNTER_MS = 6 * 3_600_000;
export const COUNTER_GAP = 2;
export const RUMOR_SECONDS = 3 * 60;
export const RUMOR_MS = 2 * 3_600_000;
export const RUMOR_FACTOR = 2;
/** Sabotage du grenier (stock à l'abri ÷ 2 pendant 2 h) et du guet (aucune alerte d'approche pendant 1 h). */
export const GRANARY_CUT_MS = 2 * 3_600_000;
export const BLIND_MS = 3_600_000;

/** H2 : héritage, bonus permanents achetés en écus et gardés d'une saison à l'autre. Le niveau n coûte base × n écus. */
export const LEGACY = [
  { id: "carrier", icon: "⛏️", name: "Carrier", effect: "+2 % de production par niveau", max: 10, base: 20 },
  { id: "depart", icon: "🚀", name: "Départ lancé", effect: "+10 % de production par niveau pendant les 24 premières heures de la saison", max: 3, base: 40 },
  { id: "cave", icon: "🍷", name: "Cave", effect: "+15 minutes de stock à l'abri par niveau", max: 4, base: 25 },
  { id: "rempart", icon: "🧱", name: "Rempart", effect: "+3 % de points de vie des fortifications par niveau", max: 5, base: 15 },
] as const;
export type LegacyId = (typeof LEGACY)[number]["id"];
export const LEGACY_CARRIER = 0.02;
export const LEGACY_START = 0.1;
/** G6 : Rempart, +3 % de points de vie des fortifications par niveau. */
export const LEGACY_RAMPART = 0.03;
export const LEGACY_START_MS = 24 * 3_600_000;
export const LEGACY_CAVE_SECONDS = 15 * 60;
/** H1 : écus de clôture : 10 par étape du beffroi achevée (donateurs), podium 30/20/10 partout, 5 pour 3 jours de connexion. */
export const CLOSE_STAGE_ECUS = 10;
export const CLOSE_PODIUM_ECUS: readonly number[] = [30, 20, 10];
export const CLOSE_LOGIN_ECUS = 5;
export const CLOSE_LOGIN_DAYS = 3;
