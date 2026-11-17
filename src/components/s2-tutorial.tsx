"use client";

// Saison 2 : tutoriel en quelques pages, ouvert à la première visite de la saison et rouvrable par le bouton
// « Comment jouer ». Le fait de l'avoir vu est gardé dans le navigateur (simple confort, rien d'important).
import { useEffect, useState } from "react";

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
      "🪨 La pierre sert à bâtir : améliorer tes concessions, tes bâtiments d'appui, et faire monter le beffroi.",
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
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== "1";
    } catch {
      return true;
    }
  });
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
