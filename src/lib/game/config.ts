// Données d'équilibrage de Beffroi. Tout ce qui se règle se trouve ici.
// Ce fichier est partagé entre le navigateur (prédiction) et le serveur (calcul qui fait foi).

export const SEASON_DAYS = 14;

/** Gains hors ligne plafonnés à 8 h. */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

/** Clics acceptés au plus par seconde. L'excédent est ignoré. */
export const MAX_CLICKS_PER_SECOND = 15;
/** Fenêtre maximale de clics prise en compte par lot (évite d'accumuler un crédit de clics). */
export const CLICK_WINDOW_MAX_MS = 10_000;

/** Croissance du prix de chaque bâtiment supplémentaire. */
export const COST_GROWTH = 1.15;

export type GeneratorId =
  | "manoeuvre"
  | "tailleur"
  | "charrette"
  | "carriere"
  | "four"
  | "grue"
  | "guilde";

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
];

export const GENERATOR_IDS = GENERATORS.map((g) => g.id);

export type UpgradeEffect =
  | { kind: "generator"; generator: GeneratorId; multiplier: number }
  | { kind: "click"; multiplier: number }
  | { kind: "clickFromProduction"; fraction: number }
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
};

function generatorUpgrades(): UpgradeDef[] {
  const tiers = [
    { count: 10, costFactor: 50 },
    { count: 25, costFactor: 1_000 },
  ];
  return GENERATORS.flatMap((g) =>
    tiers.map((tier, i) => ({
      id: `${g.id}_${i + 1}`,
      name: GENERATOR_UPGRADE_NAMES[g.id][i],
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
  { id: "marteau_maitre", name: "Marteau de maître", description: "Chaque coup rapporte en plus 5 % de ta production par seconde.", cost: 60_000, effect: { kind: "clickFromProduction", fraction: 0.05 }, requires: { generator: "charrette", count: 5 } },
  { id: "benediction", name: "Bénédiction de l'évêque", description: "Toute la production +10 %.", cost: 2_000_000, effect: { kind: "production", multiplier: 1.1 }, requires: { generator: "four", count: 5 } },
  { id: "corvee_royale", name: "Corvée royale", description: "Toute la production +25 %.", cost: 80_000_000, effect: { kind: "production", multiplier: 1.25 }, requires: { generator: "grue", count: 10 } },
  ...generatorUpgrades(),
];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((u) => [u.id, u]));

export interface StageDef {
  name: string;
  description: string;
  /** Pierre à verser par joueur actif (taille = base × joueurs actifs sur 7 jours). */
  basePerPlayer: number;
  bonusLabel: string;
  bonus: { production?: number; click?: number };
}

/** Le chantier commun : 3 étapes, chacune débloque un bonus permanent pour la saison. */
export const STAGES: readonly StageDef[] = [
  { name: "Les fondations", description: "Creuser et poser les assises du beffroi.", basePerPlayer: 50_000, bonusLabel: "Production +10 % pour tous", bonus: { production: 1.1 } },
  { name: "La tour de guet", description: "Monter les murs de pierre jusqu'au chemin de ronde.", basePerPlayer: 5_000_000, bonusLabel: "Coups de marteau ×2 pour tous", bonus: { click: 2 } },
  { name: "La chambre des cloches", description: "Couronner la tour et hisser les cloches.", basePerPlayer: 500_000_000, bonusLabel: "Production +25 % pour tous", bonus: { production: 1.25 } },
];

export const STAGE_BASES = STAGES.map((s) => s.basePerPlayer);

/** Fenêtre pendant laquelle un joueur compte comme actif pour dimensionner le chantier. */
export const ACTIVE_WINDOW_DAYS = 7;
