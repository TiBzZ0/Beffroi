// H1 : écus de clôture de saison (règles pures, sans base de données).
import { CLOSE_LOGIN_DAYS, CLOSE_LOGIN_ECUS, CLOSE_PODIUM_ECUS, CLOSE_STAGE_ECUS, STAGES } from "./config";

export interface SeasonRewardDetails {
  /** Étapes du beffroi achevées et écus qu'elles rapportent (donateurs seulement). */
  stages: number;
  stageEcus: number;
  /** Places sur le podium du panthéon. */
  podium: { category: string; rank: number; ecus: number }[];
  /** Jours de connexion et écus de fidélité. */
  days: number;
  loginEcus: number;
}

export interface SeasonRewardRow {
  user_id: string;
  total: number;
  details: SeasonRewardDetails;
}

export interface ClosingInput {
  /** Joueurs humains de la saison : palier de don atteint, alliance. */
  players: { id: string; donor: boolean; allianceId: number | null }[];
  /** Étapes du chantier achevées (embellissements compris). */
  stagesDone: number;
  /** Podiums du panthéon, dans l'ordre ; pour une catégorie d'alliance, `id` est celui de l'alliance. */
  podiums: { category: string; alliance: boolean; ids: string[] }[];
  /** Jours de connexion par joueur. */
  days: Map<string, number>;
}

/**
 * Écus versés à la clôture. Les embellissements ont déjà payé leurs 10 écus à leur achèvement, et la huitième étape ses 20 écus :
 * on ne compte donc ici que les étapes du beffroi (8 au plus), pour ne rien payer deux fois.
 */
export function seasonRewards(input: ClosingInput): SeasonRewardRow[] {
  const stages = Math.min(STAGES.length, Math.max(0, input.stagesDone));
  const rows = new Map<string, SeasonRewardRow>();
  for (const p of input.players) {
    const days = input.days.get(p.id) ?? 0;
    const stageEcus = p.donor ? stages * CLOSE_STAGE_ECUS : 0;
    const loginEcus = days >= CLOSE_LOGIN_DAYS ? CLOSE_LOGIN_ECUS : 0;
    rows.set(p.id, { user_id: p.id, total: 0, details: { stages: p.donor ? stages : 0, stageEcus, podium: [], days, loginEcus } });
  }
  for (const pod of input.podiums) {
    pod.ids.slice(0, CLOSE_PODIUM_ECUS.length).forEach((id, i) => {
      const ecus = CLOSE_PODIUM_ECUS[i];
      const winners = pod.alliance ? input.players.filter((p) => p.allianceId !== null && String(p.allianceId) === id).map((p) => p.id) : [id];
      for (const w of winners) rows.get(w)?.details.podium.push({ category: pod.category, rank: i + 1, ecus });
    });
  }
  for (const r of rows.values()) r.total = r.details.stageEcus + r.details.loginEcus + r.details.podium.reduce((a, b) => a + b.ecus, 0);
  return [...rows.values()].filter((r) => r.total > 0);
}
