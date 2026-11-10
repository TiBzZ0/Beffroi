"use client";
import type { ChatChannel, ChatView } from "@/lib/game/chat-config";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_CLICKS_PER_SECOND } from "@/lib/game/config";
import { advance, buyAcademy, buyArmy, buyGenerator, buyUpgrade, clickValue, stagesDoneAt, setTithe, startResearch, type PlayerState } from "@/lib/game/engine";
import type { GeneratorId } from "@/lib/game/config";
import { worksiteFromRow, worldFrom, type ActionResponse, type AwaySummary, type GameAction, type GameSnapshot, type Leaderboards } from "@/lib/game/types";
import { getBrowserClient } from "@/lib/supabase/client";

const CLICK_FLUSH_MS = 3_000;
const SYNC_MS = 60_000;
/** Délai minimal entre deux synchronisations déclenchées par l'activité des rivaux. */
const LIVE_SYNC_MS = 5_000;

/** Ce qui change l'armée, le statut ou la production d'un rival (hors pierre, suivie à part). */
function rivalSignature(row: Record<string, unknown>): string {
  const keys = ["generators", "upgrades", "troops", "defenses", "ruins", "shield_until", "burned_until", "last_raid_at", "last_raid_target", "revenge_until"];
  return JSON.stringify(keys.map((k) => row[k] ?? null));
}

/**
 * État du jeu côté navigateur. Le serveur fait foi : le client ne fait que prédire
 * (même moteur que le serveur) et envoyer des intentions, une à la fois.
 */
export function useGame() {
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [away, setAway] = useState<AwaySummary | null>(null);
  const snapRef = useRef<GameSnapshot | null>(null);
  const offset = useRef(0);
  const pending = useRef(0);
  const inflight = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const clickTimes = useRef<number[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watching = useRef(false);
  const [liveRivals, setLiveRivals] = useState(false);
  const lastLiveSync = useRef(0);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signatures = useRef(new Map<string, string>());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3_000);
  }, []);

  // Achats affichés tout de suite, avant la réponse du serveur (qui fait foi et les remplace).
  const optimisticOps = useRef<GameAction[]>([]);

  const receive = useCallback((s: GameSnapshot) => {
    offset.current = s.serverNow - Date.now();
    // La chronique n'est renvoyée qu'aux synchronisations : on garde la précédente sinon.
    let next = s.chronicle ? s : { ...s, chronicle: snapRef.current?.chronicle ?? [] };
    // Achats encore en route : on les remet par-dessus l'état reçu pour éviter un retour en arrière.
    if (optimisticOps.current.length > 0) {
      const state = optimisticOps.current.reduce<PlayerState>((st, op) => applyLocal(st, op) ?? st, advance(next.state, s.serverNow, worldFrom(next.worksite)));
      next = { ...next, state };
    }
    snapRef.current = next;
    setSnap(next);
    if (s.away) setAway(s.away);
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
      const before = snapRef.current?.state.clickPausedUntil ?? 0;
      const r = await post({ type: "click", count: n });
      if (!r.snapshot) {
        pending.current += n; // réseau coupé : on réessaiera
        return;
      }
      receive(r.snapshot);
      // Un lot accepté n'est jamais renvoyé (sinon il grossit à chaque envoi et finit en confiscation).
      if (r.snapshot.state.clickPausedUntil > before && r.snapshot.state.clickPausedUntil > r.snapshot.serverNow) {
        showToast("🔨 Trop rapide pour un humain ! Ton marteau est confisqué 2 minutes.");
      }
    } finally {
      inflight.current = 0;
    }
  }, [post, receive, showToast]);

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
        const i = optimisticOps.current.indexOf(action);
        if (i >= 0) optimisticOps.current.splice(i, 1);
        if (r.snapshot) receive(r.snapshot);
        if (!r.ok && action.type !== "sync") showToast(r.error);
        if (r.ok && r.message) showToast(r.message);
        return r.ok;
      };
      if (action !== "flush-clicks") {
        const s = snapRef.current;
        const now = Date.now() + offset.current;
        const local = s ? applyLocal(advance(s.state, now, worldFrom(s.worksite)), action) : null;
        if (s && local) {
          optimisticOps.current.push(action);
          const next = { ...s, state: local };
          snapRef.current = next;
          setSnap(next);
        }
      }
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
    if (!s || s.state.clickPausedUntil > serverNow()) return 0;
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

  /** Synchronise bientôt (au plus une fois toutes les 5 s), si l'onglet Raids est ouvert. */
  const scheduleLiveSync = useCallback(() => {
    if (!watching.current || liveTimer.current) return;
    const wait = Math.max(0, lastLiveSync.current + LIVE_SYNC_MS - Date.now());
    liveTimer.current = setTimeout(() => {
      liveTimer.current = null;
      lastLiveSync.current = Date.now();
      void run({ type: "sync" });
    }, wait);
  }, [run]);

  /** L'onglet Raids est ouvert : on suit les rivaux en direct (et on se met à jour tout de suite). */
  const watchRivals = useCallback(
    (active: boolean) => {
      watching.current = active;
      setLiveRivals(active);
      if (active) scheduleLiveSync();
    },
    [scheduleLiveSync],
  );

  // Rivaux en direct (seulement onglet Raids ouvert, pour ménager le quota Realtime) :
  // la pierre est mise à jour aussitôt, le reste par une synchronisation.
  useEffect(() => {
    if (seasonId === undefined || !liveRivals) return;
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`players-${seasonId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "player_states", filter: `season_id=eq.${seasonId}` },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          const id = row.user_id as string;
          const s = snapRef.current;
          if (!s || id === s.userId) return;
          setSnap((cur) => {
            if (!cur) return cur;
            const rivals = cur.rivals.map((r) =>
              r.id === id
                ? {
                    ...r,
                    stone: Number(row.stone),
                    stoneAt: Date.parse(row.last_update as string),
                    shieldUntil: Date.parse(row.shield_until as string),
                    burnedUntil: Date.parse(row.burned_until as string),
                    totalPlundered: Number(row.total_plundered),
                    lastSeen: r.isLord || !row.last_seen ? r.lastSeen : Date.parse(row.last_seen as string),
                  }
                : r,
            );
            const next = { ...cur, rivals };
            snapRef.current = next;
            return next;
          });
          const sig = rivalSignature(row);
          if (signatures.current.get(id) !== sig) {
            signatures.current.set(id, sig);
            scheduleLiveSync();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [seasonId, liveRivals, scheduleLiveSync]);

  useEffect(
    () => () => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
    },
    [],
  );

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
          if (s && payload.new.kind === "spy" && payload.new.target_id === s.userId) {
            const spy = s.rivals.find((r) => r.id === payload.new.actor_id)?.name ?? "Un rival";
            showToast(`🕵️ Un espion de ${spy} a été surpris dans ton domaine !`);
          }
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

  return { snap, toast, away, dismissAway: () => setAway(null), run, click, predictedStone, serverNow, watchRivals, pendingClicks: () => pending.current + inflight.current };
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

/** Effet local d'un achat, s'il est sûr de réussir ; null sinon (le serveur tranchera). */
function applyLocal(state: PlayerState, action: GameAction): PlayerState | null {
  const r =
    action.type === "buy"
      ? buyGenerator(state, action.generator as GeneratorId, Number(action.qty))
      : action.type === "army"
        ? buyArmy(state, action.kind, action.id, Number(action.qty))
        : action.type === "upgrade"
          ? buyUpgrade(state, action.upgrade)
          : action.type === "academy"
            ? buyAcademy(state)
            : action.type === "research"
              ? startResearch(state, action.id, state.lastUpdate)
              : action.type === "tithe"
                ? setTithe(state, Number(action.percent))
                : null;
  return r && r.ok ? r.value : null;
}

export type PushState = "loading" | "unsupported" | "denied" | "off" | "on";

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Notifications du téléphone ou de l'ordinateur, même jeu fermé. */
export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async (): Promise<string | null> => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return "Notifications refusées par le navigateur.";
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const res = await fetch("/api/push", { cache: "no-store" });
      const { publicKey } = (await res.json()) as { publicKey: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) }));
      const saved = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!saved.ok) return "Abonnement impossible, réessaie.";
      setState("on");
      return null;
    } catch {
      return "Ce navigateur ne permet pas les notifications (sur iPhone : ajoute d'abord le jeu à l'écran d'accueil).";
    }
  }, []);

  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }, []);

  return { state, enable, disable };
}

/** B11 : messages d'un canal, relus toutes les 8 secondes tant que l'onglet est ouvert. */
export function useChat(channel: ChatChannel) {
  const [view, setView] = useState<ChatView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/chat?channel=${channel}`, { cache: "no-store" });
        if (res.ok && alive) setView((await res.json()) as ChatView);
      } catch {
        // on garde les anciens messages
      }
    };
    void load();
    const id = setInterval(load, 8_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [channel]);
  const post = async (payload: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, ...payload }) });
      const data = (await res.json()) as ChatView & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Envoi impossible.");
        return false;
      }
      setError(null);
      setView(data);
      return true;
    } catch {
      setError("Le messager s'est perdu, réessaie.");
      return false;
    }
  };
  return {
    view: view?.channel === channel ? view : null,
    error,
    send: (body: string) => post({ body }),
    react: (id: number, emoji: string) => post({ id, emoji }),
  };
}
