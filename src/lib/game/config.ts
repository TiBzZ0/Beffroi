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

// ---------------------------------------------------------------------------
// Raids (version 1)
// ---------------------------------------------------------------------------

/** Délai minimal entre deux raids lancés par un même joueur. */
export const RAID_COOLDOWN_MS = 60 * 60 * 1000;
/** Part du stock non sécurisé volée (doublée en cas de revanche). */
export const RAID_LOOT_RATE = 0.1;
export const REVENGE_LOOT_RATE = 0.2;
/** Stock sécurisé : N secondes de la production de la victime ne peuvent pas être volées. */
export const SECURED_SECONDS = 30 * 60;
/** Ateliers incendiés : production réduite de moitié pendant 2 h. */
export const BURN_MS = 2 * 60 * 60 * 1000;
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
/** La victime peut se venger pendant ce délai (attaque +50 %, butin doublé, sans attendre). */
export const REVENGE_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Seigneurs voisins (bots assumés)
// ---------------------------------------------------------------------------

export type LordKey = "corbelune" | "aubeval" | "grisemolle";

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
}

export const LORDS: readonly LordDef[] = [
  { key: "corbelune", id: "00000000-0000-4000-8000-00000000c0b1", username: "Corbelune", name: "Baron de Corbelune", blazon: "🐦‍⬛", temper: "Pillard agressif", rateFactor: 1.0, raidEveryHours: 6, contribution: null },
  { key: "aubeval", id: "00000000-0000-4000-8000-00000000a0be", username: "Aubeval", name: "Prieure d'Aubeval", blazon: "⛪", temper: "Bâtisseuse pacifique", rateFactor: 0.8, raidEveryHours: null, contribution: { share: 0.2, everyHours: 12 } },
  { key: "grisemolle", id: "00000000-0000-4000-8000-0000000062e5", username: "Grisemolle", name: "Comte Grisemolle", blazon: "💰", temper: "Avare, bien gardé", rateFactor: 1.2, raidEveryHours: 24, contribution: null },
];

export const LORD_BY_ID: ReadonlyMap<string, LordDef> = new Map(LORDS.map((l) => [l.id, l]));

/** Production minimale d'un seigneur, pour qu'il existe même en début de saison. */
export const LORD_MIN_RATE = 1;

// ---------------------------------------------------------------------------
// Troupes et défenses
// ---------------------------------------------------------------------------

export type UnitId = "milicien" | "arbaletrier" | "chevalier";
export type DefenseId = "palissade" | "tour" | "muraille";

export interface ArmyDef<Id extends string> {
  id: Id;
  name: string;
  plural: string;
  icon: string;
  description: string;
  cost: number;
  /** Puissance d'attaque (troupes) ou de défense (fortifications) par exemplaire. */
  power: number;
}

export const UNITS: readonly ArmyDef<UnitId>[] = [
  { id: "milicien", name: "Milicien", plural: "Miliciens", icon: "🗡️", description: "Une fourche, un peu de courage.", cost: 200, power: 1 },
  { id: "arbaletrier", name: "Arbalétrier", plural: "Arbalétriers", icon: "🏹", description: "Frappe de loin, et fort.", cost: 2_500, power: 14 },
  { id: "chevalier", name: "Chevalier", plural: "Chevaliers", icon: "🐎", description: "Armure, destrier et panache.", cost: 30_000, power: 190 },
];

export const DEFENSES: readonly ArmyDef<DefenseId>[] = [
  { id: "palissade", name: "Palissade", plural: "Palissades", icon: "🪵", description: "Des pieux bien taillés.", cost: 150, power: 1 },
  { id: "tour", name: "Tour de guet", plural: "Tours de guet", icon: "🗼", description: "On voit venir les pillards.", cost: 2_000, power: 14 },
  { id: "muraille", name: "Muraille", plural: "Murailles", icon: "🧱", description: "Pierre sur pierre, rien ne passe.", cost: 24_000, power: 190 },
];

export const UNIT_IDS = UNITS.map((u) => u.id);
export const DEFENSE_IDS = DEFENSES.map((d) => d.id);

/** Défense de base de chaque domaine (gardes du château), même sans fortification. */
export const BASE_DEFENSE = 5;
/** Bonus d'attaque lors d'une revanche. */
export const REVENGE_ATTACK_BONUS = 1.5;
/** Pertes de l'attaquant : en cas de victoire, puis de défaite. */
export const ATTACKER_LOSS_ON_WIN = 0.1;
export const ATTACKER_LOSS_ON_DEFEAT = 0.3;
/** Fortifications endommagées quand la défense tombe. */
export const DEFENSE_LOSS_ON_DEFEAT = 0.1;
/** Seigneurs : attaque et défense = médiane des joueurs × facteur. */
export const LORD_ARMY: Record<LordKey, { attack: number; defense: number }> = {
  corbelune: { attack: 1.1, defense: 0.8 },
  aubeval: { attack: 0, defense: 0.7 },
  grisemolle: { attack: 0.9, defense: 2.5 },
};
