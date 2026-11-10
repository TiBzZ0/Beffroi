// Données d'équilibrage de Beffroi. Tout ce qui se règle se trouve ici.
// Ce fichier est partagé entre le navigateur (prédiction) et le serveur (calcul qui fait foi).

export const SEASON_DAYS = 14;

/** Gains hors ligne plafonnés à 8 h. */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

/** Clics acceptés au plus par seconde. L'excédent est ignoré. */
export const MAX_CLICKS_PER_SECOND = 80;
/** Fenêtre maximale de clics prise en compte par lot (évite d'accumuler un crédit de clics). */
export const CLICK_WINDOW_MAX_MS = 10_000;
/**
 * Anti-triche : au-delà de 75 coups/s soutenus sur 5 envois de suite (≈ 15 s), le marteau est confisqué 2 min.
 * La cadence est mesurée sur au moins 6 s, pour qu'un envoi retardé par le réseau ne gonfle pas la mesure.
 */
export const SUSPICIOUS_CLICK_RATE = 75;
export const CLICK_STRIKES_FOR_PAUSE = 5;
export const CLICK_RATE_MIN_WINDOW_MS = 6_000;
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
  { id: "marteau_maitre", name: "Marteau de maître", description: "Chaque coup rapporte en plus 5 % de ta production par seconde.", cost: 60_000, effect: { kind: "clickFromProduction", fraction: 0.05 }, requires: { generator: "charrette", count: 5 } },
  { id: "benediction", name: "Bénédiction de l'évêque", description: "Toute la production +10 %.", cost: 2_000_000, effect: { kind: "production", multiplier: 1.1 }, requires: { generator: "four", count: 5 } },
  { id: "corvee_royale", name: "Corvée royale", description: "Toute la production +25 %.", cost: 80_000_000, effect: { kind: "production", multiplier: 1.25 }, requires: { generator: "grue", count: 10 } },
  { id: "foire", name: "Foire de la Saint-Jean", description: "Toute la production +25 %.", cost: 2_000_000_000, effect: { kind: "production", multiplier: 1.25 }, requires: { generator: "guilde", count: 10 } },
  { id: "marteau_runique", name: "Marteau runique", description: "Chaque coup rapporte en plus 10 % de ta production par seconde.", cost: 5_000_000_000, effect: { kind: "clickFromProduction", fraction: 0.1 }, requires: { generator: "port", count: 5 } },
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
  bonus: { production?: number; click?: number };
}

/** Le chantier commun : 8 étapes, chacune débloque un bonus permanent pour la saison. */
export const STAGES: readonly StageDef[] = [
  { name: "Les fondations", description: "Creuser et poser les assises du beffroi.", basePerPlayer: 50_000, bonusLabel: "Production +10 % pour tous", bonus: { production: 1.1 } },
  { name: "La tour de guet", description: "Monter les murs de pierre jusqu'au chemin de ronde.", basePerPlayer: 5_000_000, bonusLabel: "Coups de marteau ×2 pour tous", bonus: { click: 2 } },
  { name: "La chambre des cloches", description: "Couronner la tour et hisser les cloches.", basePerPlayer: 500_000_000, bonusLabel: "Production +25 % pour tous", bonus: { production: 1.25 } },
  { name: "Les gargouilles", description: "Sculpter les gardiens de pierre aux quatre coins.", basePerPlayer: 20_000_000_000, bonusLabel: "Production +10 % pour tous", bonus: { production: 1.1 } },
  { name: "Le grand bourdon", description: "Fondre la plus grosse cloche du royaume.", basePerPlayer: 150_000_000_000, bonusLabel: "Coups de marteau ×2 pour tous", bonus: { click: 2 } },
  { name: "La flèche", description: "Élancer la flèche au-dessus des nuages.", basePerPlayer: 1_000_000_000_000, bonusLabel: "Production +15 % pour tous", bonus: { production: 1.15 } },
  { name: "L'horloge astronomique", description: "Une horloge qui suit le soleil, la lune et les saisons.", basePerPlayer: 7_000_000_000_000, bonusLabel: "Production +20 % pour tous", bonus: { production: 1.2 } },
  { name: "Le beffroi légendaire", description: "On en parlera dans tout le royaume pendant des siècles.", basePerPlayer: 50_000_000_000_000, bonusLabel: "Production +25 % pour tous", bonus: { production: 1.25 } },
];
/** Un seigneur bâtisseur ne verse jamais plus que cette part de l'étape en cours d'un coup. */
export const LORD_GIFT_MAX_SHARE = 0.25;

export const STAGE_BASES = STAGES.map((s) => s.basePerPlayer);

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
export const SECURED_SECONDS = 30 * 60;
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
  { id: "milicien", name: "Milicien", plural: "Miliciens", icon: "🗡️", description: "Pas cher, pas bien solide.", cost: 200, attack: 2, hp: 10, category: "infanterie" },
  { id: "piquier", name: "Piquier", plural: "Piquiers", icon: "🔱", description: "Sa pique arrête net les chevaux.", cost: 400, attack: 3, hp: 25, category: "infanterie", bonus: { cavalerie: 4 } },
  { id: "arbaletrier", name: "Arbalétrier", plural: "Arbalétriers", icon: "🏹", description: "Fauche l'infanterie, fragile au contact.", cost: 500, attack: 8, hp: 15, category: "tir", bonus: { infanterie: 2.5 } },
  { id: "chevalier", name: "Chevalier", plural: "Chevaliers", icon: "🐎", description: "Charge les tireurs, redoute les piques.", cost: 2_000, attack: 25, hp: 80, category: "cavalerie", bonus: { tir: 3 } },
  { id: "belier", name: "Bélier", plural: "Béliers", icon: "🪓", description: "Inutile en rase campagne, terrible contre les murs.", cost: 3_000, attack: 5, hp: 150, category: "siege", bonus: { fortification: 20 } },
];

export const DEFENSES: readonly CombatantDef<DefenseId>[] = [
  { id: "palissade", name: "Palissade", plural: "Palissades", icon: "🪵", description: "Encaisse les coups, ne riposte pas.", cost: 150, attack: 0, hp: 40, category: "fortification" },
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

// Forteresse : une seule par saison, à prendre en alliance.
/** Bonus de production pour tous les membres de l'alliance qui la tient. */
export const FORTRESS_PRODUCTION_BONUS = 1.2;
/** Garnison neutre de la forteresse libre : valeur = troupes médianes des joueurs × ce facteur. Une fois prise, seules les troupes envoyées la défendent. */
export const FORTRESS_WALLS_POWER = 2;
export const FORTRESS_WALLS: Partial<Record<CombatantId, number>> = { muraille: 0.35, baliste: 0.35, tour: 0.3 };
export const FORTRESS_NAME = "Forteresse de Pierre-Haute";
export const SPY_COST_SECONDS = 60;
/** Durée pendant laquelle un rapport montre l'armée exacte (et à jour) de la cible. */
export const SPY_INTEL_MS = 60 * 60 * 1000;
/** Risque que l'espion soit repéré : 30 %, +5 % par tour d'archers de la cible, 90 % au plus. */
export const SPY_DETECT_BASE = 0.3;
export const SPY_DETECT_PER_TOWER = 0.05;
export const SPY_DETECT_MAX = 0.9;

/**
 * Armée des seigneurs : valeur = valeur médiane des armées des joueurs × `power`
 * (≈ 0,1 à 0,25 facile, 0,5 moyen, 1 à 1,4 difficile, 3 à 4 redoutable),
 * dont `troopShare` en troupes (qui défendent et raident), le reste en fortifications.
 */
export const LORD_ARMY: Record<LordKey, { power: number; troopShare: number; troops: Partial<Record<UnitId, number>>; forts: Partial<Record<DefenseId, number>> }> = {
  bourbelin: { power: 0.1, troopShare: 0.0, troops: {}, forts: { palissade: 1 } },
  aubeval: { power: 0.25, troopShare: 0.0, troops: {}, forts: { palissade: 0.5, tour: 0.5 } },
  corbelune: { power: 0.45, troopShare: 0.6, troops: { chevalier: 0.5, arbaletrier: 0.3, milicien: 0.2 }, forts: { palissade: 0.5, tour: 0.5 } },
  ventebrise: { power: 0.55, troopShare: 0.45, troops: { arbaletrier: 0.6, chevalier: 0.4 }, forts: { tour: 0.6, palissade: 0.4 } },
  grisemolle: { power: 1.0, troopShare: 0.29, troops: { piquier: 0.5, arbaletrier: 0.5 }, forts: { muraille: 0.4, baliste: 0.4, tour: 0.2 } },
  noirval: { power: 1.4, troopShare: 0.5, troops: { chevalier: 0.6, piquier: 0.2, arbaletrier: 0.2 }, forts: { baliste: 0.5, tour: 0.3, palissade: 0.2 } },
  hautefaille: { power: 3, troopShare: 0.44, troops: { chevalier: 0.4, arbaletrier: 0.3, piquier: 0.3 }, forts: { muraille: 0.4, baliste: 0.4, tour: 0.2 } },
  moulinet: { power: 0.1, troopShare: 0.0, troops: {}, forts: { palissade: 1 } },
  bruyere: { power: 0.15, troopShare: 0.0, troops: {}, forts: { palissade: 0.6, tour: 0.4 } },
  pontcroix: { power: 0.2, troopShare: 0.36, troops: { milicien: 1 }, forts: { palissade: 1 } },
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
export const EVENT_GAP_MS = 2 * 60 * 60 * 1000;
/** Caravane : 1 h pour la piller, une fois par joueur ; chaque assaut réussi emporte une part de sa pierre. */
export const CARAVAN_MS = 60 * 60 * 1000;
/** Sa pierre de départ : 45 min de production de tous les joueurs réunis. */
export const CARAVAN_PRIZE_SECONDS = 45 * 60;
/** Part de la pierre de départ emportée par un assaut réussi. */
export const CARAVAN_TAKE = 0.25;
/** Escorte (reformée à chaque assaut) : troupes médianes des joueurs × ce facteur. */
export const CARAVAN_ESCORT_POWER = 0.6;
export const CARAVAN_ESCORT: Partial<Record<CombatantId, number>> = { milicien: 0.3, piquier: 0.3, arbaletrier: 0.4 };
/** Colosse : 6 h pour l'abattre à plusieurs ; ses pertes ne se reforment pas. */
export const COLOSSUS_MS = 6 * 60 * 60 * 1000;
/** Son armée : toutes les troupes des joueurs réunies × ce facteur (au moins 3 fois la médiane). */
export const COLOSSUS_POWER = 0.6;
export const COLOSSUS_ARMY: Partial<Record<CombatantId, number>> = { chevalier: 0.35, piquier: 0.3, arbaletrier: 0.35 };
/** Prime partagée au prorata des dégâts : valeur de son armée × ce facteur. */
export const COLOSSUS_BOUNTY = 1;

/** Un joueur est « en ligne » s'il a été actif il y a moins de ce délai (sa page se synchronise chaque minute). */
export const ONLINE_MS = 2.5 * 60 * 1000;

// Panthéon : catégories figées à la fin de chaque saison (podium de 3), titres pour les premiers.
export const HALL: readonly { id: "builder" | "plunderer" | "producer" | "colossus" | "caravan" | "fortress" | "war"; icon: string; label: string; title: string; unit: "stone" | "time" | "count"; alliance: boolean }[] = [
  { id: "builder", icon: "🏗️", label: "Bâtisseurs du chantier", title: "Grand bâtisseur", unit: "stone", alliance: false },
  { id: "plunderer", icon: "⚔️", label: "Pillards", title: "Fléau du royaume", unit: "stone", alliance: false },
  { id: "producer", icon: "⛏️", label: "Carriers (pierre produite)", title: "Maître carrier", unit: "stone", alliance: false },
  { id: "colossus", icon: "🗿", label: "Chasseurs de colosses (dégâts)", title: "Tueur de colosses", unit: "stone", alliance: false },
  { id: "caravan", icon: "🐪", label: "Détrousseurs de caravanes", title: "Détrousseur", unit: "stone", alliance: false },
  { id: "fortress", icon: "🏰", label: "Gardiens de Pierre-Haute (temps tenu)", title: "Gardiens de Pierre-Haute", unit: "time", alliance: true },
  { id: "war", icon: "🏆", label: "Guerres gagnées", title: "Seigneurs de guerre", unit: "count", alliance: true },
];
export const HALL_PODIUM = 3;

// Améliorations militaires : chaque niveau donne +10 % d'attaque et de PV au type amélioré.
export const LEVEL_BONUS = 0.1;
/** Prix d'un niveau : coût d'un exemplaire × 100 × 2,2^niveau actuel. */
export const RESEARCH_COST_FACTOR = 100;
export const RESEARCH_COST_GROWTH = 2.2;
/** Durée d'un niveau : 2 min × 1,6^niveau actuel (niveau 10 ≈ 3 h 40, niveau 15 ≈ 39 h), divisée par l'académie. */
export const RESEARCH_BASE_MS = 2 * 60 * 1000;
export const RESEARCH_TIME_GROWTH = 1.6;
/** Académie militaire : chaque niveau accélère la recherche de 25 % (durée ÷ (1 + 0,25 × niveau)). */
export const ACADEMY_SPEED = 0.25;
export const ACADEMY_BASE_COST = 50_000;
export const ACADEMY_COST_GROWTH = 2.5;
/** Sabotage de l'académie d'un rival : prix = 3 min de sa propre production (1 000 au moins). */
export const SABOTAGE_COST_SECONDS = 180;
export const SABOTAGE_MIN_COST = 1_000;
/** Réussite : 60 %, −5 % par tour d'archers de la cible, 10 % au moins. */
export const SABOTAGE_BASE_SUCCESS = 0.6;
export const SABOTAGE_PER_TOWER = 0.05;
export const SABOTAGE_MIN_SUCCESS = 0.1;
/** Un sabotage réussi abat un niveau d'académie, retarde la recherche en cours de 20 % du temps restant, et protège la cible 1 h. */
export const SABOTAGE_DELAY = 0.2;
export const SABOTAGE_IMMUNITY_MS = 60 * 60 * 1000;
