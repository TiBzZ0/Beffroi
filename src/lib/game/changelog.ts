// Ce qui change : chaque mise en ligne qui touche une règle ajoute une entrée ici (la plus récente en dernier).
// Le panneau s'affiche une fois à la connexion suivante ; c'est le seul moyen de prévenir les joueurs.

export interface ChangeEntry {
  id: number;
  date: string;
  items: string[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    id: 1,
    date: "10 novembre",
    items: [
      "🔨 Marteau : un bug comptait plusieurs fois les mêmes coups et confisquait le marteau même en cliquant lentement. Il est corrigé. Le plafond passe à 20 coups par seconde.",
      "🛡️ Les 2 dernières heures de ta production sont à l'abri des pillards (au lieu de 30 minutes), jamais plus de la moitié du stock.",
      "⚔️ Entre joueurs, le butin d'un raid est plafonné à 2 heures de la production de l'attaquant, et on ne peut plus attaquer un domaine dix fois plus petit que soi (sauf revanche et guerre).",
      "🩹 Un défenseur battu récupère tout de suite la moitié des troupes perdues. Après un raid qui a ruiné des bâtiments, plus aucune ruine pendant 24 heures.",
      "🏰 Les seigneurs produisent beaucoup moins, leur coffre est plafonné à 12 heures de production, et leur défense dépend de ce qu'ils ont dans le coffre : un raid gagné rapporte à la mesure de ce qu'il coûte. Les seigneurs faciles suivent les petits joueurs.",
      "⚔️ Guerre : elle commence 2 heures après la déclaration. Les boucliers restent levés entre ennemis, mais le repos de 5 minutes s'applique et on ne frappe pas deux fois de suite la même cible.",
      "⚡ Élan : les deux marteaux ne rapportent plus un pourcentage de ta production par coup. À la place, chaque coup ajoute 1 seconde d'élan (30 secondes au plus), et tant qu'il en reste ta production est augmentée de 20 % (50 % avec le Marteau runique).",
    ],
  },
  {
    id: 2,
    date: "10 novembre",
    items: [
      "🏗️ Chantier : la taille d'une étape est fixée à son ouverture, à 4 heures de la production de tous les joueurs actifs, et ne bouge plus ensuite. L'étape en cours a été redimensionnée, la pierre déjà versée est gardée.",
    ],
  },
  {
    id: 3,
    date: "10 novembre",
    items: [
      "⛪ Dîme automatique : dans l'onglet du chantier, un curseur de 0 à 20 % envoie d'office cette part de ta production (hors ligne comprise) au chantier. Elle compte comme un don pour tout. On conseille 10 %.",
    ],
  },
  {
    id: 4,
    date: "10 novembre",
    items: [
      "🎖️ Paliers de don : à chaque étape, ta part de chantier vaut 4 heures de ta production. À 25 %, 50 % et 100 % versés (dîme comprise), tu gagnes +2 % de production jusqu'à la fin de la saison, cumulable d'étape en étape, et 5, 10 puis 15 écus.",
      "🪙 Écus : une nouvelle monnaie gardée sur ton profil, jamais pillée ni remise à zéro. Tes écus serviront dès la saison 1.",
    ],
  },
  {
    id: 5,
    date: "10 novembre",
    items: [
      "🌙 Couvre-feu : dans Raids › Armée, choisis une plage de 8 heures par jour pendant laquelle tu ne peux ni attaquer ni être attaqué, ni saboter ni être saboté, seigneurs et guerre compris. La production et la dîme continuent. Un changement prend effet 24 heures plus tard. Une lune 🌙 signale les joueurs en couvre-feu.",
    ],
  },
  {
    id: 6,
    date: "10 novembre",
    items: [
      "🌄 Pendant ton absence : après 30 minutes ou plus loin du jeu, un résumé t'attend à ton retour (pierre produite, dîme versée, raids subis et repoussés, sabotages, recherches terminées, étapes franchies, événement en cours).",
    ],
  },
];
