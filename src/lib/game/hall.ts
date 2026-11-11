// Halle de guilde : coûts, ailes et emplacement (règles pures, sans base de données).
import {
  HALL_MAX_FROM_MEMBER,
  HALL_MIN_GAP,
  HALL_STAGE_BASE_HOURS,
  HALL_STAGE_GROWTH,
  HALL_STAGES,
  LODGE_MAX_WINGS,
  LODGE_STAGES,
  MAP_SIZE,
  WING_IDS,
  WING_MAX_LEVEL,
  mapDistance,
  type MapPos,
  type WingId,
} from "./config";

export type Wings = Partial<Record<WingId, number>>;

export function cleanWings(raw: unknown): Wings {
  const out: Wings = {};
  if (!raw || typeof raw !== "object") return out;
  for (const id of WING_IDS) {
    const n = Math.floor(Number((raw as Record<string, unknown>)[id] ?? 0));
    if (n > 0) out[id] = Math.min(WING_MAX_LEVEL, n);
  }
  return out;
}

export function wingLevel(w: Wings | undefined, id: WingId): number {
  return Math.min(WING_MAX_LEVEL, Math.max(0, w?.[id] ?? 0));
}

export function placedLevels(w: Wings): number {
  return WING_IDS.reduce((s, id) => s + wingLevel(w, id), 0);
}

/** Nombre d'étapes d'une halle (10) ou d'une loge (4). */
export function maxStages(lodge: boolean): number {
  return lodge ? LODGE_STAGES : HALL_STAGES;
}

/** Coût de l'étape n (1 à 10), en pierres, pour une production cumulée de `perSecond`. */
export function hallStageCost(n: number, perSecond: number): number {
  return Math.max(1, Math.ceil(HALL_STAGE_BASE_HOURS * Math.pow(HALL_STAGE_GROWTH, n - 1) * perSecond * 3600));
}

/** Peut-on monter `wing` d'un niveau ? `available` : niveaux gagnés (étapes et maîtrise du beffroi). */
export function wingBlocker(w: Wings, wing: WingId, available: number, lodge: boolean): string | null {
  if (!WING_IDS.includes(wing)) return "Aile inconnue.";
  if (placedLevels(w) >= available) return "Aucun niveau d'aile à placer : termine une étape de plus.";
  if (wingLevel(w, wing) >= WING_MAX_LEVEL) return "Cette aile est déjà au plus haut.";
  if (lodge && wingLevel(w, wing) === 0 && WING_IDS.filter((id) => wingLevel(w, id) > 0).length >= LODGE_MAX_WINGS) return `Une loge n'a que ${LODGE_MAX_WINGS} ailes différentes.`;
  return null;
}

/**
 * H1 : cases possibles pour la halle, de la plus proche à la plus lointaine du domaine `home`.
 * Idéalement à 3 cases au plus d'un membre et à 2 cases au moins de tout lieu ; si la carte est trop pleine,
 * on s'éloigne des membres, puis on accepte une case simplement libre.
 */
export function hallSpots(home: MapPos, members: MapPos[], taken: MapPos[]): MapPos[] {
  const tries: { gap: number; near: number }[] = [
    { gap: HALL_MIN_GAP, near: HALL_MAX_FROM_MEMBER },
    { gap: HALL_MIN_GAP, near: Infinity },
    { gap: 1, near: Infinity },
  ];
  for (const t of tries) {
    const out: { c: MapPos; d: number }[] = [];
    for (let x = 1; x <= MAP_SIZE; x++)
      for (let y = 1; y <= MAP_SIZE; y++) {
        const c: MapPos = [x, y];
        if (taken.some((p) => mapDistance(p, c) < t.gap)) continue;
        if (!members.some((m) => mapDistance(m, c) <= t.near)) continue;
        out.push({ c, d: mapDistance(home, c) });
      }
    if (out.length > 0) return out.sort((a, b) => a.d - b.d || a.c[0] - b.c[0] || a.c[1] - b.c[1]).map((o) => o.c);
  }
  return [];
}
