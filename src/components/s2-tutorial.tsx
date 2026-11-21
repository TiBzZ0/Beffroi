"use client";

// Saison 2 : un guide pas à pas pour le début (S2Guide), et les règles en quelques pages, ouvertes par
// « Règles », « ? » ou « Comment jouer ». Ce qui a été fait est gardé dans le navigateur (simple confort).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { concessionSlots } from "@/lib/game/s2/economy";
import type { PlayerState } from "@/lib/game/engine";

const OPEN_EVENT = "beffroi:tutoriel";
const DONE_EVENT = "beffroi:guide";

/** Marque une étape du guide comme faite depuis un autre écran (par exemple : fiche d'un seigneur ouverte). */
export function guideDone(id: string) {
  window.dispatchEvent(new CustomEvent(DONE_EVENT, { detail: id }));
}

/** Rouvre le tutoriel depuis n'importe quel écran. */
export function openTutorial() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const PAGES: { icon: string; title: string; text: string[] }[] = [
  {
    icon: "🗺️",
    title: "Bienvenue dans la saison 2",
    text: [
      "Le royaume est une carte de 41 cases sur 41. Au centre, le beffroi que tout le monde bâtit ensemble ; autour, sept régions, des sites de ressources et vingt seigneurs.",
      "Ton but : faire grandir ton domaine (concessions, bâtiments), lever une armée pour battre les seigneurs, et aider à achever le beffroi. Les classements de fin de saison rapportent des écus.",
      "Ces pages sont la référence. Le guide en bas de l'écran (🧭) te montre, lui, quoi toucher à chaque étape du début.",
    ],
  },
  {
    icon: "🏰",
    title: "Poser son château",
    text: [
      "Touche une case marquée d'un point blanc sur la carte : hors du tourbillon central, à deux cases au moins des sites, des seigneurs et des autres châteaux.",
      "Tu reçois une carrière proche, 1 000 pierre pour bâtir tout de suite et une compagnie de miliciens.",
      "La région compte : ⛰️ Montagne +10 % sur les carrières, ⛏️ Collines +10 % sur les mines, ⚓ Côte +10 % d'or, 🌾 Plaine armées et convois 10 % plus rapides, 🌲 Forêt espions moins souvent repérés. ❄️ Froid +10 % de points de vie au combat, 🏜️ Désert +10 % de butin sur les convois interceptés.",
      "Reste près de plusieurs sites : tes convois feront moins de route (30 secondes par case).",
    ],
  },
  {
    icon: "💰",
    title: "Trois monnaies",
    text: [
      "🪨 La pierre bâtit : bâtiments d'appui, ravitaillement des concessions, caserne, fortifications, et le beffroi.",
      "⚔️ Le fer paie l'armée : recruter (20 à 300 fer l'homme) et entraîner. Tu démarres avec 30 000 fer ; les mines et les seigneurs en rapportent.",
      "🪙 L'or paie l'espionnage, le rythme intensif et les concessions en plus. Chaque convoi arrivé en rapporte 3 % de sa valeur, et les filons en produisent.",
      "⚖️ Le marché, dans ton château, échange tout de suite au tiers de la valeur (1 or = 2 fer = 4 pierre).",
    ],
  },
  {
    icon: "⛏️",
    title: "Concessions et convois",
    text: [
      "Une concession est une place sur un site : carrière (pierre), mine (fer) ou filon (or). Les grands sites (8 places au centre, 6 ailleurs) produisent davantage.",
      "Elle produit dans son stock local. Toutes les 15 minutes, un convoi part vers ton château avec une charge : la production d'un intervalle. Si la production dépasse la charge, le stock monte ; plein, la concession s'arrête.",
      "Au-dessus de 90 % de stock, des brigands rôdent : une heure après, puis chaque heure, 30 % de risque de perdre 20 % du stock. Vide-le ou passe en prudent.",
      "Places : la première avec ton château, la deuxième dès qu'une concession atteint le niveau 5 (ou à la première étape du beffroi), puis trois à acheter en or (10 000, 25 000, 50 000).",
    ],
  },
  {
    icon: "🎛️",
    title: "Gérer chaque concession",
    text: [
      "Dans l'onglet Domaine, « Mes terres » (à droite, ou en haut sur téléphone) liste ton château et tes concessions : touche-en une pour la gérer. La barre du haut montre alors les ressources de ce lieu.",
      "Rythme : 🐢 prudent (−20 % de production, stock ×2, à l'abri des brigands) pour t'absenter ; normal ; 🔥 intensif (+25 %, contre 5 % de la valeur de chaque convoi en or).",
      "Départs : automatiques, ou à la main pour garder le stock sur place et payer les améliorations avec.",
      "Convois vers : ton château, le beffroi (chaque convoi compte comme un don entier), ou une autre de tes concessions pour remplir sa réserve.",
      "Un avis orange apparaît quand la charge des convois ne suit plus la production : c'est le signal de bâtir une écurie dans la concession ou de monter la charronnerie au château.",
    ],
  },
  {
    icon: "📈",
    title: "Faire grandir une concession",
    text: [
      "Une concession s'améliore avec ce qu'elle a sur place : sa réserve de chantier d'abord, puis son stock. Remplis la réserve avec « Ravitailler » (pierre, fer ×2, or ×4) ; elle accepte au plus le coût des deux prochains niveaux.",
      "Chaque niveau : +15 % de production et de charge. Paliers : ⛺ Campement (1-4), 🏚️ Exploitation (5-9), 🏭 Manufacture (10-14), 🏰 Grand domaine (15, +10 % et ta bannière sur la carte).",
      "Bâtiments de concession, jusqu'au niveau 10 et jamais au-dessus du niveau de la concession : ⚒️ atelier (+8 % de production par niveau), et dès l'Exploitation 🐴 écurie (+10 % de charge) et 🌾 grenier (+25 % de stock). 🗼 La tour de site (5 niveaux, dès le niveau 1) voit une case plus loin par niveau et garde le stock contre le pillage (200 piquiers et 150 arbalétriers par niveau).",
      "Les premiers niveaux se bâtissent en quelques secondes ; les derniers prennent des heures. Lance les longs chantiers avant de partir.",
    ],
  },
  {
    icon: "🏗️",
    title: "Bâtiments d'appui (château)",
    text: [
      "Choisis ton château dans « Mes terres ». Ses bâtiments se paient en pierre, deux chantiers à la fois, jusqu'au niveau 20, et valent pour toutes tes concessions.",
      "🛠️ Outils : +3 % de production par niveau. 🛞 Charronnerie : +10 % de charge par niveau. 🐎 Relais : un convoi 20 s plus tôt par niveau (5 min au plus court), et 3 % plus rapide.",
      "🏚️ Entrepôt : +30 min de stock local par niveau dans toutes tes concessions.",
    ],
  },
  {
    icon: "🛡️",
    title: "L'armée",
    text: [
      "Onglet Armée. Une compagnie a un type d'unité (miliciens, piquiers, arbalétriers, chevaliers, béliers) et un plafond d'hommes. La caserne ajoute des compagnies et des files de recrutement.",
      "Recruter coûte du fer et prend quelques secondes par homme. L'entraînement (🎯, 10 niveaux) rend la compagnie plus forte : +8 % d'attaque et de vie par niveau.",
      "Les blessés reviennent avec le temps. Personne n'attaque ton château en saison 2 : ni fortifications ni couvre-feu à gérer.",
    ],
  },
  {
    icon: "⚔️",
    title: "Les seigneurs",
    text: [
      "Vingt seigneurs tiennent un fief : 🛡️ hobereaux (1 à 2 compagnies), barons, comtes, puis ducs près du centre. Ils n'attaquent jamais les joueurs.",
      "Touche leur écu sur la carte : la fiche montre leur garnison et ta chance de victoire avec tes troupes au château. Ton armée marche, se bat, et rentre avec le butin.",
      "Une défaite coûte des hommes. Les seigneurs n'attaquent jamais : rien ne presse, attends d'avoir une bonne chance (au-dessus de 60 %).",
      "Une victoire emporte 60 % de leur fief (pierre, fer, or) et du fer pour chaque compagnie battue. La garnison se reforme ensuite, puis le fief se remplit à nouveau.",
      "Commence par les hobereaux loin du centre ; les ducs se battent en alliance.",
    ],
  },
  {
    icon: "🛤️",
    title: "Les routes et leurs dangers",
    text: [
      "Tes convois traversent les zones des seigneurs : leurs patrouilles attaquent parfois, d'autant plus que le seigneur t'en veut (chaque passage fait monter son hostilité). Un sauf-conduit payé en or, ou un seigneur vassal, laisse passer.",
      "Un seigneur très hostile envoie aussi des expéditions contre tes convois ; elles se voient sur la carte en pointillé, et son fief reste moins gardé jusqu'à leur retour.",
      "Les camps de bandits (🏕️) attaquent les convois qui passent à une case, et les autres joueurs peuvent intercepter, saboter ou tendre une embuscade sur ta route.",
      "Règle du tiers : un convoi ne perd jamais plus d'un tiers de sa charge (un quart après l'étape 5), et un seul joueur peut l'attaquer.",
      "Affecte une compagnie à l'escorte d'une concession (section « Route et escorte ») : sans escorte, tout combat sur la route est perdu. La même section signale les embuscades et camps repérés sur la route.",
    ],
  },
  {
    icon: "🏹",
    title: "Attaquer sur les routes",
    text: [
      "Tu vois les convois des autres à 5 cases de ton château et de tes concessions (+4 avec « La tour de guet » du beffroi, +1 par niveau de tour de site).",
      "🏇 Intercepter : ton armée attend le convoi sur sa route et combat son escorte ; victoire, le convoi perd un tiers de sa charge et tu rapportes trois fois ce tiers. 🕯️ Saboter : un espion payé en or (60 % de réussite) détruit 15 % de la charge et retarde le convoi.",
      "🏹 Embuscade : touche une case libre et « Poster ici » ; ton armée y reste 4 h et attaque chaque convoi ennemi qui passe à une case. Les voisins qui voient la case peuvent la 🗡️ déloger.",
      "⛏️ Piller une concession : 25 % de son stock et 15 % de sa réserve, au plus une fois toutes les 6 h, contre son escorte et sa tour. Détruire un camp de bandits rapporte du fer ; les contrats des seigneurs, de l'or.",
      "Les 48 premières heures d'un joueur, ses convois et ses concessions sont protégés.",
    ],
  },
  {
    icon: "⚖️",
    title: "Commerce, mercenaires et forteresses",
    text: [
      "Routes commerciales : propose-en une au château d'un autre joueur (elle s'ouvre quand il la propose aussi) ou à une forteresse de ton alliance. Un convoi d'or part chaque heure, d'autant plus riche que la route est longue. 3 routes au plus.",
      "Mercenaires : un seigneur neutre ou vassal loue une compagnie pour 12 h, à l'escorte d'une concession ou avec ton armée (elle se joint alors à tes pillages, interceptions, camps, contrats et délogements).",
      "Quatre forteresses entourent le centre ; chacune donne un bonus à l'alliance qui la tient : Nord +10 % de production, Est convois +15 % de vitesse, Sud escortes +15 % de dégâts, Ouest patrouilles −25 %. À 4 cases autour, vos convois passent sans patrouille, embuscade ni bandits.",
      "La Lignée du Marchand (🎖️) renforce le commerce : une route de plus, plus d'or, plus de vue, de meilleures escortes, moins de patrouilles.",
    ],
  },
  {
    icon: "🔔",
    title: "Le beffroi et le centre",
    text: [
      "Le tourbillon violet au centre (et les cases qui flanquent les forteresses) est interdit aux châteaux. On y trouve le beffroi, la faille et les forteresses.",
      "Le beffroi se bâtit tous ensemble, en pierre : verse depuis l'onglet Chantier, règle une dîme automatique, ou envoie-y directement les convois d'une concession.",
      "Chaque étape achevée donne un bonus à tout le royaume (concession, gardiens de faille affaiblis, compagnie et entraînement plus rapide, production). Les meilleurs donateurs gagnent des écus.",
    ],
  },
  {
    icon: "🤝",
    title: "Alliances, messages et classements",
    text: [
      "Une alliance partage les rapports d'espions, envoie des renforts et attaque ensemble les forteresses et les ducs.",
      "✉️ Messages regroupe les rapports : combats, espionnage, alliance, chantier (dont les brigands) et royaume.",
      "🏆 Rangs : richesse, dons au beffroi, combats… Les podiums de fin de saison rapportent des écus pour la suivante. Bonne saison !",
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
// Guide pas à pas : il montre à l'écran ce qu'il faut toucher (surbrillance), dit quoi faire et pourquoi,
// et passe à l'étape suivante dès qu'elle est faite.
// ---------------------------------------------------------------------------

type GuideTab = "carte" | "ateliers" | "armee" | "chantier" | "raids";
const GROUP_OF: Record<GuideTab, string> = { carte: "carte", raids: "carte", ateliers: "domaine", armee: "armee", chantier: "chantier" };
const TAB_NAME: Record<GuideTab, string> = { carte: "🗺️ Carte", raids: "Cibles", ateliers: "🏭 Domaine", armee: "⚔️ Armée", chantier: "⛪ Chantier" };

interface GuideStep {
  id: string;
  title: string;
  /** Ce qu'il faut faire, selon ce qui est visible (la première cible trouvée à l'écran). */
  what: Record<string, string>;
  why: string;
  /** Onglet où se fait l'étape (null : partout). */
  tab: (s: PlayerState, slots: number) => GuideTab | null;
  /** Éléments à mettre en avant, par ordre de préférence (attribut data-tuto). */
  targets: (s: PlayerState, slots: number) => string[];
  done: (s: PlayerState, slots: number) => boolean;
}

const conc0 = (s: PlayerState) => s.s2?.conc[0];
const STEPS: GuideStep[] = [
  {
    id: "castle",
    title: "Pose ton château",
    what: {
      place: "Cette case est libre : touche « Poser mon château ici ».",
      map: "Touche une case marquée d'un point blanc. Fais glisser pour te déplacer, molette ou boutons pour zoomer.",
    },
    why: "Ton château reçoit les convois de tes concessions et garde ton stock. La région donne un bonus (montagne : carrières, collines : mines, plaine : vitesse, froid : défense…). Reste près de plusieurs sites : les convois feront moins de route.",
    tab: () => "carte",
    targets: () => ["place", "map"],
    done: (s) => !!s.s2?.castle,
  },
  {
    id: "outils",
    title: "Bâtis les outils",
    what: { "bld-outils": "Lance le niveau 1 des outils : 50 pierre, 5 secondes.", "land-chateau": "Choisis ton château dans « Mes terres » : ses bâtiments s'y trouvent." },
    why: "Les outils ajoutent +3 % de production à toutes tes concessions, présentes et futures. Ce sont tes bâtiments d'appui, payés avec la pierre du château.",
    tab: () => "ateliers",
    targets: () => ["bld-outils", "land-chateau"],
    done: (s) => (s.s2?.bld.outils ?? 0) > 0 || !!s.s2?.works.some((w) => w.id === "outils"),
  },
  {
    id: "supply",
    title: "Ravitaille ta carrière",
    what: { supply: "Envoie 100 pierre ou plus à ta carrière avec « Envoyer ».", "land-conc0": "Choisis ta carrière dans « Mes terres » : chaque concession se gère à part, avec ses propres ressources." },
    why: "Une concession s'améliore avec ce qu'elle a sur place : sa réserve de chantier, puis son propre stock. Le convoi met quelques secondes par case à arriver.",
    tab: () => "ateliers",
    targets: () => ["supply", "land-conc0"],
    done: (s) => {
      const c = conc0(s);
      return !!c && ((c.fund ?? 0) > 0 || c.level >= 2 || !!c.upUntil || !!s.s2?.convoys.some((v) => v.dest === "concession"));
    },
  },
  {
    id: "upgrade",
    title: "Monte ta carrière d'un niveau",
    what: { "conc-upgrade": "Quand la réserve est arrivée, touche « Niveau 2 ».", "land-conc0": "Choisis ta carrière dans « Mes terres » : chaque concession se gère à part, avec ses propres ressources." },
    why: "Chaque niveau donne +15 % de production à cette concession, et ses convois emportent davantage. Au niveau 5, elle devient une Exploitation et t'ouvre une deuxième concession.",
    tab: () => "ateliers",
    targets: () => ["conc-upgrade", "land-conc0"],
    done: (s) => {
      const c = conc0(s);
      return !!c && (c.level >= 2 || !!c.upUntil);
    },
  },
  {
    id: "atelier",
    title: "Bâtis un atelier dans ta carrière",
    what: { "cbuild-atelier": "Lance l'atelier de ta carrière.", "land-conc0": "Choisis ta carrière dans « Mes terres » : chaque concession se gère à part, avec ses propres ressources." },
    why: "L'atelier ajoute +8 % de production par niveau à cette concession seulement. Il ne peut pas dépasser le niveau de la concession : monte les deux ensemble.",
    tab: () => "ateliers",
    targets: () => ["cbuild-atelier", "land-conc0"],
    done: (s) => {
      const c = conc0(s);
      return !!c && ((c.cb?.atelier ?? 0) > 0 || c.cwork?.id === "atelier");
    },
  },
  {
    id: "army",
    title: "Recrute des soldats",
    what: { company: "Touche « + » sur ta compagnie pour la remplir, ou crée-en une autre plus bas." },
    why: "L'armée se paie en fer : tu en as 30 000 pour commencer. Il te faut des troupes pour battre les seigneurs et défendre tes convois. L'entraînement (🎯) rend une compagnie plus forte.",
    tab: () => "armee",
    targets: () => ["company"],
    done: (s) => (s.recruits?.length ?? 0) > 0 || (s.companies?.length ?? 0) > 1 || (s.companies ?? []).some((c) => c.train > 0 || c.trainUntil > 0),
  },
  {
    id: "belfry",
    title: "Aide à bâtir le beffroi",
    what: { contribute: "Verse 10 % de ta pierre au beffroi." },
    why: "Le beffroi se bâtit ensemble. Chaque étape achevée donne un bonus à tout le royaume, et les meilleurs donateurs gagnent des écus en fin de saison.",
    tab: () => "chantier",
    targets: () => ["contribute"],
    done: (s) => s.totalContributed > 0 || !!s.titheSet,
  },
  {
    id: "lord",
    title: "Repère un seigneur à ta portée",
    what: {
      "lord-attack": "Lis ta chance de victoire. N'attaque que si elle est bonne (vert) ; sinon, renforce d'abord ton armée.",
      map: "Touche un écu rouge sans couronne, loin du centre : c'est un hobereau, le seigneur le plus faible. Sa fiche affiche ta chance de victoire.",
    },
    why: "Battre un seigneur rapporte une part de son fief et du fer. Mais une défaite coûte des hommes, et les seigneurs n'attaquent jamais : rien ne presse, attaque quand ta chance dépasse 60 %.",
    tab: () => "carte",
    targets: () => ["lord-attack", "map"],
    done: (s) => (s.marches ?? []).some((m) => m.kind === "raid") || (s.questFlags ?? []).includes("lord"),
  },
  {
    id: "second",
    title: "Ouvre une deuxième concession",
    what: {
      take: "Touche « Prendre une concession ici ».",
      map: "Une place est libre : touche un site sur la carte (hexagone gris pour la pierre, bleu pour le fer, jaune pour l'or).",
      "land-free": "Touche « Place libre » : la carte s'ouvre pour choisir un site.",
      "conc-upgrade": "Continue de monter ta carrière : au niveau 5, une deuxième place s'ouvre.",
      "land-conc0": "Choisis ta carrière dans « Mes terres » et continue de la monter : au niveau 5, une deuxième place s'ouvre.",
    },
    why: "Plus de concessions, c'est plus de production, et le fer et l'or se trouvent dans d'autres sites. Une mine de fer paie ton armée.",
    tab: (s, slots) => ((s.s2?.conc.length ?? 0) < slots ? "carte" : "ateliers"),
    targets: (s, slots) => ((s.s2?.conc.length ?? 0) < slots ? ["take", "map"] : ["conc-upgrade", "land-conc0"]),
    done: (s) => (s.s2?.conc.length ?? 0) >= 2,
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

type Box = { x: number; y: number; w: number; h: number };
const sameBox = (a: Box | null, b: Box | null) => (!a || !b ? a === b : Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1);

function visibleEl(key: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tuto="${key}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function S2Guide({ seasonId, live, tab, stages }: { seasonId: number; live: PlayerState; tab: string; stages: number }) {
  const doneKey = `beffroi-guide-s2-${seasonId}`;
  const hideKey = `beffroi-guide-masque-${seasonId}`;
  const [stored] = useState(() => ({ done: readSet(doneKey) }));
  const [hidden, setHidden] = useState(() => readSet(hideKey).has("1"));
  const [small, setSmall] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const slots = live.s2 ? concessionSlots(live.s2, { stageConcessions: stages >= 1 ? 1 : 0 }) : 1;
  const done = stored.done;
  const newly = STEPS.filter((st) => !done.has(st.id) && st.done(live, slots)).map((st) => st.id);
  useEffect(() => {
    if (newly.length) {
      for (const id of newly) stored.done.add(id);
      writeSet(doneKey, stored.done);
    }
  });
  const [, setMarked] = useState(0);
  useEffect(() => {
    const mark = (e: Event) => {
      const id = String((e as CustomEvent).detail ?? "");
      if (!id || stored.done.has(id)) return;
      stored.done.add(id);
      writeSet(doneKey, stored.done);
      setMarked((n) => n + 1);
    };
    window.addEventListener(DONE_EVENT, mark);
    return () => window.removeEventListener(DONE_EVENT, mark);
  }, [doneKey, stored]);
  const isDone = (st: GuideStep) => done.has(st.id) || newly.includes(st.id) || skipped.has(st.id);
  const step = STEPS.find((st) => !isDone(st)) ?? null;
  const count = STEPS.filter(isDone).length;

  // Où pointer : l'onglet à ouvrir d'abord, sinon la première cible visible de l'étape.
  const want = step?.tab(live, slots) ?? null;
  const tabKeys: string[] = [];
  if (want && want !== tab) {
    const group = GROUP_OF[want];
    const current = GROUP_OF[tab as GuideTab] ?? (tab === "ameliorations" ? "domaine" : tab);
    tabKeys.push(group !== current ? `group-${group}` : `tab-${want}`);
  }
  const keys = step ? (tabKeys.length ? tabKeys : step.targets(live, slots)) : [];
  const keysId = keys.join("|");

  const [spot, setSpot] = useState<{ key: string; box: Box } | null>(null);
  const lastScrolled = useRef("");
  useEffect(() => {
    if (!keysId || hidden || small) return;
    const list = keysId.split("|");
    const tick = () => {
      let found: { key: string; box: Box } | null = null;
      for (const k of list) {
        const el = visibleEl(k);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        found = { key: k, box: { x: r.left, y: r.top, w: r.width, h: r.height } };
        if (lastScrolled.current !== `${step?.id}:${k}` && (r.top < 60 || r.bottom > window.innerHeight - 40)) {
          lastScrolled.current = `${step?.id}:${k}`;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        break;
      }
      setSpot((prev) => (prev?.key === found?.key && sameBox(prev?.box ?? null, found?.box ?? null) ? prev : found));
    };
    tick();
    const id = window.setInterval(tick, 200);
    window.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", tick, true);
      window.removeEventListener("resize", tick);
    };
  }, [keysId, hidden, small, step?.id]);

  const hide = () => {
    writeSet(hideKey, new Set(["1"]));
    setHidden(true);
  };
  if (hidden || typeof document === "undefined") return null;
  if (!step) {
    return (
      <div className="guide guide-done">
        <div>
          <b>🎉 Tu connais l&apos;essentiel.</b> Le reste est dans les règles (« 📖 Comment jouer ») : bonne saison !
        </div>
        <button className="btn btn-small" onClick={hide}>
          Fermer
        </button>
      </div>
    );
  }
  if (small) {
    return (
      <button className="guide-pill" onClick={() => setSmall(false)}>
        🧭 Guide · {count + 1}/{STEPS.length} : {step.title}
      </button>
    );
  }
  const onTab = tabKeys.length > 0;
  const shown = spot && keys.includes(spot.key) ? spot : null;
  const what = onTab ? `Ouvre l'onglet ${TAB_NAME[want!]}.` : shown ? step.what[shown.key] : Object.values(step.what)[0];
  // La bulle se place sous la cible, ou au-dessus s'il n'y a pas la place ; sans cible, en bas de l'écran.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = Math.min(340, vw - 24);
  let bubble: React.CSSProperties = { left: (vw - bw) / 2, bottom: 12, width: bw };
  if (shown) {
    const b = shown.box;
    const big = b.h > vh * 0.5;
    const left = Math.min(vw - bw - 12, Math.max(12, b.x + b.w / 2 - bw / 2));
    if (big) bubble = { left, bottom: 12, width: bw };
    else if (b.y + b.h + 230 < vh) bubble = { left, top: b.y + b.h + 12, width: bw };
    else bubble = { left, bottom: vh - b.y + 12, width: bw };
  }
  return createPortal(
    <>
      {shown && (
        <div
          className="coach-spot"
          aria-hidden
          style={{ left: shown.box.x - 6, top: shown.box.y - 6, width: shown.box.w + 12, height: shown.box.h + 12 }}
        />
      )}
      <div className="coach-bubble" role="dialog" aria-label={`Guide : ${step.title}`} style={bubble}>
        <div className="guide-head">
          <span className="guide-count num">
            🧭 Étape {count + 1}/{STEPS.length}
          </span>
          <span className="guide-links">
            <button className="btn-link" onClick={openTutorial}>
              Règles
            </button>
            <button className="btn-link" onClick={() => setSmall(true)}>
              Réduire
            </button>
            <button className="btn-link" onClick={hide}>
              Masquer
            </button>
          </span>
        </div>
        <div className="bar bar-thin">
          <span style={{ width: `${(count / STEPS.length) * 100}%` }} />
        </div>
        <div className="guide-title">{step.title}</div>
        <p className="coach-what">👉 {what}</p>
        <p className="coach-why">
          <b>Pourquoi ?</b> {step.why}
        </p>
        <div className="coach-foot">
          <button className="btn-link" onClick={() => setSkipped(new Set(skipped).add(step.id))}>
            Passer cette étape
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
