"use client";

// Saison 2 : un guide pas à pas pour le début (S2Guide), et les règles en quelques pages, ouvertes par
// « Règles », « ? » ou « Comment jouer ». Ce qui a été fait est gardé dans le navigateur (simple confort).
import { useEffect, useState } from "react";
import type { PlayerState } from "@/lib/game/engine";

const OPEN_EVENT = "beffroi:tutoriel";

/** Rouvre le tutoriel depuis n'importe quel écran. */
export function openTutorial() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const PAGES: { icon: string; title: string; text: string[] }[] = [
  {
    icon: "🗺️",
    title: "Bienvenue dans la saison 2",
    text: [
      "Le royaume est maintenant une grande carte de 41 cases sur 41, découpée en sept régions. Chaque région donne un bonus à ceux qui s'y installent.",
      "Tu commences par poser ton château où tu veux, hors du centre, à deux cases au moins des sites, des seigneurs et des autres châteaux. Les cases libres sont marquées d'un point blanc.",
    ],
  },
  {
    icon: "💰",
    title: "Trois monnaies",
    text: [
      "🪨 La pierre sert à bâtir : tes bâtiments d'appui, le ravitaillement de tes concessions, et faire monter le beffroi.",
      "⚔️ Le fer paie l'armée : recruter et entraîner tes compagnies. Tu démarres avec 3 000 fer.",
      "🪙 L'or paie l'espionnage et les concessions en plus. Chaque convoi qui arrive en rapporte un peu.",
    ],
  },
  {
    icon: "⛏️",
    title: "Concessions et convois",
    text: [
      "Une concession, c'est une place sur un site : une carrière pour la pierre, une mine pour le fer, un filon pour l'or. Ta première carrière t'est donnée avec ton château.",
      "La concession produit en continu dans son stock local. Toutes les heures, un convoi part vers ton château avec ce qui s'y trouve. Si le stock est plein, la concession s'arrête : la charronnerie et le relais règlent ça.",
      "Tu prends d'autres concessions en touchant un site sur la carte. Les étapes du beffroi et l'or t'en ouvrent de nouvelles.",
      "Chaque concession se gère à part, dans l'onglet du domaine. Son rythme : prudent pour s'absenter, intensif pour produire plus contre un peu d'or. Ses convois : vers ton château, directement au beffroi (où ils comptent comme un don), ou vers une autre de tes concessions pour remplir sa réserve.",
      "Une concession s'améliore avec ce qu'elle a sur place : sa réserve de chantier, que tu remplis en lui envoyant des ressources depuis le château, puis son propre stock.",
    ],
  },
  {
    icon: "🔨",
    title: "Le marteau et l'élan",
    text: [
      "Le marteau ne taille plus la pierre : il allume l'élan. Tant que l'élan dure, toute ta production gagne 25 %.",
      "Chaque coup ajoute quelques secondes d'élan. Passe de temps en temps pour le raviver.",
    ],
  },
  {
    icon: "🏗️",
    title: "Bâtiments d'appui",
    text: [
      "🛠️ Les outils : +5 % de production sur toutes tes concessions par niveau.",
      "🛞 La charronnerie : des convois plus chargés. 🐎 Le relais : des convois plus fréquents et plus rapides.",
      "🏚️ L'entrepôt : un stock local plus grand, et plus de pierre à l'abri au château.",
    ],
  },
  {
    icon: "🛡️",
    title: "Ton armée et les seigneurs",
    text: [
      "Une compagnie de miliciens t'est offerte à la pose du château. Recrute et entraîne d'autres compagnies avec ton fer, dans l'onglet Armée.",
      "Les seigneurs gardent leur fief avec de vraies compagnies : hobereaux, barons, comtes et ducs, du plus faible au plus fort. Commence par les hobereaux, loin du centre.",
      "Une victoire emporte 60 % de leur fief et du fer pour chaque compagnie battue. La garnison se reforme ensuite en 12 heures.",
    ],
  },
  {
    icon: "🔔",
    title: "Le beffroi et le centre",
    text: [
      "Au centre se dressent le beffroi, la faille et une forteresse. Personne ne peut y bâtir de château.",
      "Le beffroi se construit tous ensemble, avec la pierre. Chaque étape achevée donne un bonus à tout le royaume : une concession de plus, des gardiens de faille affaiblis, une compagnie de plus…",
    ],
  },
  {
    icon: "⚖️",
    title: "Le marché",
    text: [
      "Il te manque une monnaie ? Le marché échange tout de suite, au tiers de la valeur : 1 or vaut 4 pierres, 1 fer en vaut 2.",
      "Tu le trouves dans l'onglet Concessions, avec tes bâtiments d'appui. Bonne saison !",
    ],
  },
];

export function S2Tutorial({ seasonId }: { seasonId: number }) {
  const key = `beffroi-tutoriel-s2-${seasonId}`;
  // L'écran de jeu ne se rend qu'une fois l'instantané reçu, côté navigateur : on peut lire le stockage tout de suite.
  // Les règles ne s'ouvrent plus d'elles-mêmes : le guide pas à pas mène le début, ce bouton sert de référence.
  void key;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const reopen = () => {
      setPage(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, [key]);
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* rien de grave */
    }
    setOpen(false);
  };
  const p = PAGES[page];
  const last = page === PAGES.length - 1;
  return (
    <div className="tuto-backdrop" role="dialog" aria-modal="true" aria-labelledby="tuto-title" onClick={close}>
      <div className="tuto" onClick={(e) => e.stopPropagation()}>
        <div className="tuto-icon" aria-hidden>{p.icon}</div>
        <h2 id="tuto-title">{p.title}</h2>
        {p.text.map((t) => (
          <p key={t}>{t}</p>
        ))}
        <div className="tuto-dots" aria-label={`Page ${page + 1} sur ${PAGES.length}`}>
          {PAGES.map((_, i) => (
            <button key={i} className={i === page ? "on" : ""} onClick={() => setPage(i)} aria-label={`Page ${i + 1}`} />
          ))}
        </div>
        <div className="tuto-nav">
          <button className="btn" onClick={close}>Passer</button>
          <span>
            {page > 0 && <button className="btn" onClick={() => setPage(page - 1)}>Précédent</button>}{" "}
            <button className="btn btn-primary" onClick={() => (last ? close() : setPage(page + 1))}>{last ? "C'est parti" : "Suivant"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guide pas à pas : une étape à la fois, qui avance quand le joueur l'a faite.
// ---------------------------------------------------------------------------


interface GuideStep {
  id: string;
  title: string;
  text: string;
  /** Onglet où se fait l'étape (null : partout). */
  tab: "carte" | "ateliers" | "armee" | "chantier" | null;
  go: string;
  done: (s: PlayerState, visited: Set<string>) => boolean;
}

const STEPS: GuideStep[] = [
  {
    id: "castle",
    title: "Pose ton château",
    text: "Ouvre la carte et touche une case marquée d'un point blanc, puis « Poser mon château ici ». Ta première carrière et une compagnie de miliciens te sont données.",
    tab: "carte",
    go: "Ouvrir la carte",
    done: (s) => !!s.s2?.castle,
  },
  {
    id: "concession",
    title: "Regarde ta carrière",
    text: "Dans Concessions, ta carrière remplit son stock et envoie un convoi de pierre vers ton château toutes les heures. Tu y verras aussi tes bâtiments d'appui et le marché.",
    tab: "ateliers",
    go: "Voir mes concessions",
    done: (_, v) => v.has("ateliers"),
  },
  {
    id: "hammer",
    title: "Frappe le marteau",
    text: "Le marteau allume l'élan : +25 % de production tant qu'il dure. Quelques coups suffisent, reviens le raviver de temps en temps.",
    tab: null,
    go: "",
    done: (s) => (s.elanUntil ?? 0) > 0,
  },
  {
    id: "build",
    title: "Bâtis un bâtiment d'appui",
    text: "Dans Concessions, lance la charronnerie (convois plus chargés) ou les outils (+5 % de production). Ils se paient en pierre.",
    tab: "ateliers",
    go: "Bâtir",
    done: (s) => !!s.s2 && (Object.values(s.s2.bld).some((n) => n > 0) || s.s2.works.length > 0),
  },
  {
    id: "army",
    title: "Renforce ton armée",
    text: "Dans Armée, recrute des hommes ou crée une deuxième compagnie. L'armée se paie en fer : tu en as 3 000 pour commencer.",
    tab: "armee",
    go: "Ouvrir l'armée",
    done: (s) => (s.recruits?.length ?? 0) > 0 || (s.companies?.length ?? 0) > 1 || (s.companies ?? []).some((c) => c.train > 0 || c.trainUntil > 0),
  },
  {
    id: "belfry",
    title: "Aide à bâtir le beffroi",
    text: "Dans Chantier, verse un peu de pierre ou règle ta dîme. Chaque étape achevée donne un bonus à tout le royaume, dont une concession de plus.",
    tab: "chantier",
    go: "Ouvrir le chantier",
    done: (s) => s.totalContributed > 0 || !!s.titheSet,
  },
  {
    id: "lord",
    title: "Attaque un hobereau",
    text: "Sur la carte, touche un écu rouge sans couronne, loin du centre, puis « Attaquer ». Une victoire rapporte 60 % de son fief et du fer.",
    tab: "carte",
    go: "Choisir un hobereau",
    done: (s) => (s.marches ?? []).some((m) => m.kind === "raid") || (s.questFlags ?? []).includes("lord"),
  },
];

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* simple confort */
  }
}

export function S2Guide({ seasonId, live, tab, go }: { seasonId: number; live: PlayerState; tab: string; go: (tab: string) => void }) {
  const doneKey = `beffroi-guide-s2-${seasonId}`;
  const seenKey = `beffroi-guide-onglets-${seasonId}`;
  const hideKey = `beffroi-guide-masque-${seasonId}`;
  // Ce qui est fait et les onglets vus restent acquis (une armée rentrée ne défait pas l'étape) : gardés à part.
  const [stored] = useState(() => ({ done: readSet(doneKey), visited: readSet(seenKey) }));
  const [hidden, setHidden] = useState(() => readSet(hideKey).has("1"));
  const visited = new Set(stored.visited).add(tab);
  const done = stored.done;
  const newly = STEPS.filter((st) => !done.has(st.id) && st.done(live, visited)).map((st) => st.id);
  useEffect(() => {
    const st = stored;
    if (!st.visited.has(tab)) {
      st.visited.add(tab);
      writeSet(seenKey, st.visited);
    }
    if (newly.length) {
      for (const id of newly) st.done.add(id);
      writeSet(doneKey, st.done);
    }
  });
  const isDone = (st: GuideStep) => done.has(st.id) || newly.includes(st.id);
  const step = STEPS.find((st) => !isDone(st));
  const count = STEPS.filter(isDone).length;
  const hide = () => {
    writeSet(hideKey, new Set(["1"]));
    setHidden(true);
  };
  if (hidden) return null;
  if (!step) {
    return (
      <div className="guide guide-done">
        <div>
          <b>🎉 Tu connais l&apos;essentiel.</b> Le reste se découvre en jouant : bonne saison !
        </div>
        <button className="btn btn-small" onClick={hide}>Fermer</button>
      </div>
    );
  }
  const here = step.tab === null || step.tab === tab;
  return (
    <div className="guide" role="status">
      <div className="guide-head">
        <span className="guide-count num">Guide · étape {count + 1}/{STEPS.length}</span>
        <span className="guide-links">
          <button className="btn-link" onClick={openTutorial}>Règles</button>
          <button className="btn-link" onClick={hide}>Masquer</button>
        </span>
      </div>
      <div className="bar bar-thin"><span style={{ width: `${(count / STEPS.length) * 100}%` }} /></div>
      <div className="guide-title">{step.title}</div>
      <p className="guide-text">{step.text}</p>
      {!here && step.go && (
        <button className="btn btn-primary btn-small" onClick={() => go(step.tab!)}>{step.go}</button>
      )}
    </div>
  );
}
