// L1, L2 : le renom et la Lignée (règles pures, sans base de données).
// Le renom se gagne par des actions et ne grossit pas avec la production. Il repart de zéro à chaque saison.
// La Lignée : trois branches de neuf nœuds sur quatre rangs, achetés en renom ; un seul nœud de rang 4 en tout.

export type RenownSource = "raid" | "defense" | "lord" | "recon" | "quest" | "event" | "podium" | "stage" | "gift";

/** Renom par action, et limite par jour (heure de Paris). */
export const RENOWN: Record<RenownSource, { amount: number; cap?: number; label: string; icon: string }> = {
  raid: { amount: 3, cap: 15, label: "Raids", icon: "⚔️" },
  defense: { amount: 2, cap: 10, label: "Défenses", icon: "🛡️" },
  lord: { amount: 1, cap: 6, label: "Seigneurs", icon: "🏰" },
  recon: { amount: 1, cap: 4, label: "Reconnaissances", icon: "🕵️" },
  quest: { amount: 3, label: "Quêtes du jour", icon: "📜" },
  event: { amount: 2, label: "Événements", icon: "🎪" },
  podium: { amount: 3, label: "Podiums", icon: "🏆" },
  stage: { amount: 10, label: "Étapes", icon: "🏗️" },
  gift: { amount: 20, label: "Offert", icon: "🎁" },
};
/** Sources affichées en jauges (celles qui ont une limite par jour). */
export const RENOWN_CAPPED: RenownSource[] = ["raid", "defense", "lord", "recon"];

/** Pour l'essai de la saison 0 : 20 renom offerts, une fois. */
export const RENOWN_GIFT_SEASON = 0;

export type BranchId = "batisseur" | "guerre" | "espion";

export const BRANCHES: { id: BranchId; icon: string; name: string }[] = [
  { id: "batisseur", icon: "⛏️", name: "Bâtisseur" },
  { id: "guerre", icon: "⚔️", name: "Seigneur de guerre" },
  { id: "espion", icon: "🕵️", name: "Maître espion" },
];

export interface LineageNode {
  id: string;
  branch: BranchId;
  rank: 1 | 2 | 3 | 4;
  icon: string;
  name: string;
  effect: string;
}

export const NODES: LineageNode[] = [
  { id: "carriere", branch: "batisseur", rank: 1, icon: "⛏️", name: "Bonne carrière", effect: "+5 % de production." },
  { id: "main_oeuvre", branch: "batisseur", rank: 1, icon: "👷", name: "Main-d'œuvre", effect: "Ateliers 5 % moins chers." },
  { id: "cave", branch: "batisseur", rank: 1, icon: "🍷", name: "Cave profonde", effect: "+30 min de stock à l'abri." },
  { id: "dime", branch: "batisseur", rank: 2, icon: "🎁", name: "Dîme généreuse", effect: "Les paliers de don demandent 20 % de moins." },
  { id: "savants", branch: "batisseur", rank: 2, icon: "📚", name: "Savants", effect: "Recherches de la Forge 15 % plus rapides." },
  { id: "charpentiers", branch: "batisseur", rank: 2, icon: "🪚", name: "Charpentiers", effect: "Rebâtir une ruine coûte deux fois moins." },
  { id: "fondations", branch: "batisseur", rank: 3, icon: "🧱", name: "Fondations solides", effect: "Un atelier de plus de chaque type protégé contre les ruines." },
  { id: "marteau", branch: "batisseur", rank: 3, icon: "🔨", name: "Marteau infatigable", effect: "La réserve d'élan dure deux fois plus longtemps." },
  { id: "architecte", branch: "batisseur", rank: 4, icon: "📐", name: "Architecte royal", effect: "Tes ateliers en ruine produisent encore à 50 %." },

  { id: "forge", branch: "guerre", rank: 1, icon: "🔥", name: "Forge vive", effect: "+5 % de dégâts en attaque." },
  { id: "marche", branch: "guerre", rank: 1, icon: "🥾", name: "Marche forcée", effect: "Armées 10 % plus rapides." },
  { id: "recrues", branch: "guerre", rank: 1, icon: "🪖", name: "Recrues", effect: "Troupes 5 % moins chères." },
  { id: "pillard", branch: "guerre", rank: 2, icon: "💰", name: "Pillard", effect: "Plafond de butin entre joueurs +15 %." },
  { id: "chirurgiens", branch: "guerre", rank: 2, icon: "⚕️", name: "Chirurgiens", effect: "+10 % de blessés soignés." },
  { id: "rancune", branch: "guerre", rank: 2, icon: "😠", name: "Rancune", effect: "Fenêtre de revanche +12 h." },
  { id: "beliers", branch: "guerre", rank: 3, icon: "🐏", name: "Béliers lourds", effect: "+20 % de dégâts contre les fortifications." },
  { id: "veterans", branch: "guerre", rank: 3, icon: "🎖️", name: "Vétérans", effect: "10 % de pertes en moins en attaque." },
  { id: "chef", branch: "guerre", rank: 4, icon: "👑", name: "Chef de guerre", effect: "La fortune de tes batailles se tire entre 0,95 et 1,25 au lieu de 0,8 et 1,2." },

  { id: "yeux", branch: "espion", rank: 1, icon: "👁️", name: "Bons yeux", effect: "Rapports de reconnaissance plus précis d'un cran." },
  { id: "pieds", branch: "espion", rank: 1, icon: "🪶", name: "Pieds légers", effect: "Espions 25 % plus rapides." },
  { id: "sentinelles", branch: "espion", rank: 1, icon: "🔦", name: "Sentinelles", effect: "+10 % de chance de surprendre un espion chez toi." },
  { id: "taupe", branch: "espion", rank: 2, icon: "🐀", name: "Taupe patiente", effect: "Taupes actives 50 % plus longtemps." },
  { id: "poudre", branch: "espion", rank: 2, icon: "🧨", name: "Poudre sèche", effect: "Sabotage 25 % moins cher." },
  { id: "informateurs", branch: "espion", rank: 2, icon: "📨", name: "Informateurs", effect: "Tu vois la composition des armées qui approchent, sans guet." },
  { id: "ombres", branch: "espion", rank: 3, icon: "🌑", name: "Ombres", effect: "Tes armées en approche apparaissent « ? » chez la cible." },
  { id: "faux", branch: "espion", rank: 3, icon: "🃏", name: "Faux rapports", effect: "Un espion qui te vise rapporte des chiffres faussés de ±30 %." },
  { id: "maitre_ombres", branch: "espion", rank: 4, icon: "🦇", name: "Maître des ombres", effect: "Une fois par jour, ton espion ne peut pas être surpris." },
];
export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));
export type NodeId = string;

/** Prix d'un nœud selon son rang, et renom à avoir dépensé dans la branche pour l'acheter. */
export const RANK_COST = [0, 3, 6, 12, 25] as const;
export const RANK_REQUIRED = [0, 0, 6, 24, 50] as const;
/** Changer de voie : tout est rendu sauf 10 renom, au plus une fois par jour. */
export const RESPEC_FEE = 10;

// Effets chiffrés.
export const LIN_PRODUCTION = 0.05;
export const LIN_GENERATOR_DISCOUNT = 0.05;
export const LIN_CAVE_SECONDS = 30 * 60;
export const LIN_DONOR_TIERS = 0.8;
export const LIN_RESEARCH_SPEED = 0.15;
export const LIN_REBUILD = 0.5;
export const LIN_PROTECTED = 1;
export const LIN_ELAN = 2;
export const LIN_RUIN_OUTPUT = 0.5;
export const LIN_ATTACK = 0.05;
export const LIN_SPEED = 0.1;
export const LIN_TROOP_DISCOUNT = 0.05;
export const LIN_PVP_CAP = 0.15;
export const LIN_WOUNDED = 0.1;
export const LIN_REVENGE_MS = 12 * 3_600_000;
export const LIN_FORT_DAMAGE = 0.2;
export const LIN_ATTACK_LOSSES = 0.9;
export const LIN_FORTUNE = { min: 0.95, max: 1.25 } as const;
export const LIN_SPY_SPEED = 0.25;
export const LIN_SPY_CATCH = 0.1;
export const LIN_MOLE = 1.5;
export const LIN_SABOTAGE = 0.75;

export interface LineageState {
  nodes: string[];
  /** Renom perdu en changeant de voie. */
  fees: number;
  /** Dernier changement de voie (ms). */
  respecAt: number;
  /** Jour (Paris) où le Maître des ombres a servi. */
  shadowDay?: string;
}

type Holder = { lineage?: LineageState | null };

/** Le joueur a-t-il ce nœud ? */
export function lin(state: Holder | null | undefined, id: string): boolean {
  return !!state?.lineage?.nodes.includes(id);
}

export function nodeCost(id: string): number {
  const n = NODE_BY_ID.get(id);
  return n ? RANK_COST[n.rank] : 0;
}

export function spentIn(nodes: string[], branch: BranchId): number {
  return nodes.reduce((a, id) => a + (NODE_BY_ID.get(id)?.branch === branch ? nodeCost(id) : 0), 0);
}

export function lineageSpent(l: LineageState | null | undefined): number {
  return (l?.nodes ?? []).reduce((a, id) => a + nodeCost(id), 0) + (l?.fees ?? 0);
}

/** Renom disponible : gagné moins dépensé (nœuds et frais de changement de voie). */
export function renownAvailable(earned: number, l: LineageState | null | undefined): number {
  return Math.max(0, earned - lineageSpent(l));
}

/** Icône de la branche du nœud de rang 4, affichée à côté du nom. */
export function lineageMark(l: LineageState | null | undefined): string | null {
  const top = (l?.nodes ?? []).map((id) => NODE_BY_ID.get(id)).find((n) => n?.rank === 4);
  return top ? (BRANCHES.find((b) => b.id === top.branch)?.icon ?? null) : null;
}

/** Jour à Paris (AAAA-MM-JJ), pour les limites par jour. */
export function parisDay(t: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/** Pourquoi on ne peut pas prendre ce nœud, ou null. */
export function nodeBlocker(l: LineageState | null | undefined, id: string, available: number): string | null {
  const n = NODE_BY_ID.get(id);
  if (!n) return "Nœud inconnu.";
  const nodes = l?.nodes ?? [];
  if (nodes.includes(id)) return "Déjà acquis.";
  if (n.rank === 4 && nodes.some((x) => NODE_BY_ID.get(x)?.rank === 4)) return "Un seul nœud de rang 4 dans toute la Lignée.";
  const need = RANK_REQUIRED[n.rank];
  const spent = spentIn(nodes, n.branch);
  if (spent < need) return `Dépense d'abord ${need} renom dans cette branche (${spent} pour l'instant).`;
  if (available < RANK_COST[n.rank]) return `Il faut ${RANK_COST[n.rank]} renom.`;
  return null;
}

export function buyNode<S extends Holder>(state: S, id: string, available: number): { ok: true; value: S } | { ok: false; error: string } {
  const blocked = nodeBlocker(state.lineage, id, available);
  if (blocked) return { ok: false, error: blocked };
  const l = state.lineage ?? { nodes: [], fees: 0, respecAt: 0 };
  return { ok: true, value: { ...state, lineage: { ...l, nodes: [...l.nodes, id] } } };
}

export function respecBlocker(l: LineageState | null | undefined, now: number): string | null {
  if (!l || l.nodes.length === 0) return "Aucun nœud à rendre.";
  if (l.respecAt > 0 && parisDay(l.respecAt) === parisDay(now)) return "Une seule fois par jour.";
  const refund = l.nodes.reduce((a, id) => a + nodeCost(id), 0);
  if (refund < RESPEC_FEE) return `Il faut avoir dépensé au moins ${RESPEC_FEE} renom.`;
  return null;
}

/** Changer de voie : les nœuds sont rendus, moins 10 renom. */
export function respec<S extends Holder>(state: S, now: number): { ok: true; value: S } | { ok: false; error: string } {
  const blocked = respecBlocker(state.lineage, now);
  if (blocked) return { ok: false, error: blocked };
  const l = state.lineage!;
  return { ok: true, value: { ...state, lineage: { ...l, nodes: [], fees: l.fees + RESPEC_FEE, respecAt: now } } };
}

/** Nettoie une Lignée lue en base. */
export function cleanLineage(raw: unknown): LineageState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { nodes?: unknown; fees?: unknown; respecAt?: unknown; shadowDay?: unknown };
  const nodes = Array.isArray(r.nodes) ? [...new Set(r.nodes.map(String).filter((id) => NODE_BY_ID.has(id)))] : [];
  return { nodes, fees: Math.max(0, Number(r.fees) || 0), respecAt: Number(r.respecAt) || 0, ...(typeof r.shadowDay === "string" ? { shadowDay: r.shadowDay } : {}) };
}
