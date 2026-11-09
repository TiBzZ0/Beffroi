"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_CLICKS_PER_SECOND } from "@/lib/game/config";
import { advance, clickValue, stagesDoneAt } from "@/lib/game/engine";
import { worksiteFromRow, worldFrom, type ActionResponse, type GameAction, type GameSnapshot, type Leaderboards } from "@/lib/game/types";
import { getBrowserClient } from "@/lib/supabase/client";

const CLICK_FLUSH_MS = 3_000;
const SYNC_MS = 60_000;

/**
 * État du jeu côté navigateur. Le serveur fait foi : le client ne fait que prédire
 * (même moteur que le serveur) et envoyer des intentions, une à la fois.
 */
export function useGame() {
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const snapRef = useRef<GameSnapshot | null>(null);
  const offset = useRef(0);
  const pending = useRef(0);
  const inflight = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const clickTimes = useRef<number[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3_000);
  }, []);

  const receive = useCallback((s: GameSnapshot) => {
    offset.current = s.serverNow - Date.now();
    // La chronique n'est renvoyée qu'aux synchronisations : on garde la précédente sinon.
    const next = s.chronicle ? s : { ...s, chronicle: snapRef.current?.chronicle ?? [] };
    snapRef.current = next;
    setSnap(next);
  }, []);

  const post = useCallback(async (action: GameAction): Promise<ActionResponse> => {
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (res.status === 401) {
        window.location.assign(new URL("/connexion", window.location.origin));
        return { ok: false, error: "Non connecté." };
      }
      return (await res.json()) as ActionResponse;
    } catch {
      return { ok: false, error: "Connexion perdue, nouvelle tentative bientôt." };
    }
  }, []);

  const sendClicks = useCallback(async () => {
    const n = pending.current;
    if (n === 0) return;
    pending.current = 0;
    inflight.current = n;
    try {
      const r = await post({ type: "click", count: n });
      if (r.snapshot) receive(r.snapshot);
      else pending.current += n; // réseau coupé : on réessaiera
    } finally {
      inflight.current = 0;
    }
  }, [post, receive]);

  /** Met une action en file : une seule requête à la fois, clics en attente envoyés d'abord. */
  const run = useCallback(
    (action: GameAction | "flush-clicks"): Promise<boolean> => {
      const task = async () => {
        if (action === "flush-clicks") {
          await sendClicks();
          return true;
        }
        if (pending.current > 0) await sendClicks();
        const r = await post(action);
        if (r.snapshot) receive(r.snapshot);
        if (!r.ok && action.type !== "sync") showToast(r.error);
        if (r.ok && r.message) showToast(r.message);
        return r.ok;
      };
      const p = queue.current.then(task, task);
      queue.current = p.catch(() => undefined);
      return p;
    },
    [post, receive, sendClicks, showToast],
  );

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  /** Pierre prévue maintenant (production + clics pas encore confirmés). */
  const predictedStone = useCallback(() => {
    const s = snapRef.current;
    if (!s) return 0;
    const now = serverNow();
    const world = worldFrom(s.worksite);
    const base = advance(s.state, now, world).stone;
    return base + (pending.current + inflight.current) * clickValue(s.state, world, stagesDoneAt(world, now));
  }, [serverNow]);

  /** Un coup de marteau. Renvoie le gain affiché, ou 0 si la cadence max est dépassée. */
  const click = useCallback((): number => {
    const s = snapRef.current;
    if (!s) return 0;
    const t = performance.now();
    clickTimes.current = clickTimes.current.filter((x) => t - x < 1000);
    if (clickTimes.current.length >= MAX_CLICKS_PER_SECOND) return 0;
    clickTimes.current.push(t);
    pending.current += 1;
    const world = worldFrom(s.worksite);
    return clickValue(s.state, world, stagesDoneAt(world, serverNow()));
  }, [serverNow]);

  // Chargement initial, envoi régulier des clics, synchronisation périodique.
  useEffect(() => {
    void run({ type: "sync" });
    const flush = setInterval(() => {
      if (pending.current > 0) void run("flush-clicks");
    }, CLICK_FLUSH_MS);
    const sync = setInterval(() => void run({ type: "sync" }), SYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run({ type: "sync" });
      else if (pending.current > 0) void run("flush-clicks");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(flush);
      clearInterval(sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run]);

  // Chantier commun en direct (Supabase Realtime).
  const seasonId = snap?.season.id;
  useEffect(() => {
    if (seasonId === undefined) return;
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`worksite-${seasonId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "worksites", filter: `season_id=eq.${seasonId}` },
        (payload: { new: Record<string, unknown> }) => {
          const worksite = worksiteFromRow(payload.new as unknown as Parameters<typeof worksiteFromRow>[0]);
          setSnap((s) => {
            if (!s) return s;
            const next = { ...s, worksite };
            snapRef.current = next;
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [seasonId]);

  // Chronique en direct : un raid ou un don déclenche une synchronisation,
  // et on prévient le joueur s'il vient d'être pillé.
  useEffect(() => {
    if (seasonId === undefined) return;
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`chronicle-${seasonId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chronicle", filter: `season_id=eq.${seasonId}` },
        (payload: { new: Record<string, unknown> }) => {
          const s = snapRef.current;
          if (s && payload.new.kind === "raid" && payload.new.target_id === s.userId) {
            const attacker = s.rivals.find((r) => r.id === payload.new.actor_id)?.name ?? "Un rival";
            const repelled = (payload.new.details as { success?: boolean } | null)?.success === false;
            showToast(repelled ? `🛡️ Tu as repoussé le raid de ${attacker} !` : `⚔️ ${attacker} vient de piller tes greniers !`);
          }
          void run({ type: "sync" });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [seasonId, run, showToast]);

  return { snap, toast, run, click, predictedStone, serverNow, pendingClicks: () => pending.current + inflight.current };
}

/** Classement des contributeurs, rafraîchi quand le chantier avance. */
export function useLeaderboard(active: boolean, worksiteTotal: number | undefined) {
  const [rows, setRows] = useState<Leaderboards | null>(null);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (res.ok) setRows((await res.json()) as Leaderboards);
      } catch {
        // on garde l'ancien classement
      }
    }, 400);
    return () => clearTimeout(t);
  }, [active, worksiteTotal]);
  return rows;
}

/** Force un rendu régulier (pour les boutons qui deviennent achetables). */
export function useTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
