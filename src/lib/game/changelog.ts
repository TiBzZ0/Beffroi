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
  {
    id: 7,
    date: "10 novembre",
    items: [
      "✨ Veines d'or : quand tu es en jeu, une pierre dorée apparaît près de ta pierre toutes les 5 à 10 minutes et reste 12 secondes. Touche-la : frénésie (production doublée 30 secondes) ou pluie de pierre (3 minutes de production d'un coup).",
    ],
  },
  {
    id: 8,
    date: "10 novembre",
    items: [
      "📜 Accueil guidé : les nouveaux venus suivent dix quêtes, une à la fois, chacune récompensée par 5 minutes de production.",
    ],
  },
  {
    id: 9,
    date: "10 novembre",
    items: [
      "🩹 Infirmerie : après chaque bataille (raid ou forteresse), une part de tes troupes tombées revient 30 minutes plus tard : 60 % si tu as gagné, 30 % si ton attaque a échoué, 50 % si tu as été battu en défense. Cela remplace le retour immédiat de la moitié des troupes. Les blessés ne se battent pas, les fortifications gardent leur réparation à 70 %.",
    ],
  },
  {
    id: 10,
    date: "10 novembre",
    items: [
      "💰 Rançon : quand tu gagnes un raid contre un joueur, le jeu te verse 30 % de la valeur des défenseurs que tu as abattus (troupes et fortifications). Cette pierre n'est pas prise à la victime. Rien contre les seigneurs, la caravane ou le colosse.",
      "⚖️ Équité : contre un joueur plus petit que la moitié de ta taille, le butin et la rançon baissent (coefficient égal à 2 fois sa taille relative). Pas de baisse en revanche, mais elle s'applique en guerre. La fiche de la cible affiche le butin, la rançon et le coefficient.",
    ],
  },
  {
    id: 11,
    date: "10 novembre",
    items: [
      "🏗️ Lots du chantier : à chaque étape, chaque alliance reçoit un lot égal à 4 heures de la production de ses membres (un joueur seul a son propre lot). Tes dons, dîme comprise, comptent pour l'étape et pour ton lot. Un lot pas fini à la fin de l'étape reste ouvert 6 heures.",
      "🎁 Prime de lot : quand ton lot est fini, si tu as versé au moins 25 % de ta part, tu gagnes +10 % de production jusqu'à la fin de l'étape suivante et 10 écus.",
      "👑 Maître d'œuvre : le premier lot fini de l'étape donne son nom à l'étage et choisit un bonus de 24 heures pour ses membres : +15 % de production, +25 % de points de vie en défense, ou +25 % de butin. Sans choix au bout d'une heure, c'est la production.",
    ],
  },
  {
    id: 12,
    date: "10 novembre",
    items: [
      "🎲 Hasard des combats : à chaque round, les dégâts de chaque camp varient de 15 % en plus ou en moins. Une bataille serrée n'est plus jouée d'avance.",
    ],
  },
  {
    id: 13,
    date: "10 novembre",
    items: [
      "🏰 Seigneurs attaquants : leur armée est taillée sur ta défense, pour une chance de victoire d'environ un tiers. Si tu les repousses, tu récupères toutes tes pertes.",
    ],
  },
  {
    id: 14,
    date: "10 novembre",
    items: [
      "🗡️ Unités : le milicien frappe 4 fois plus fort les engins de siège. La palissade a 120 points de vie au lieu de 40, mais les palissades n'encaissent jamais plus d'un quart des coups (la muraille garde la moitié). Le bélier vise d'abord palissades et murailles, et chaque bélier ouvre une brèche : les obstacles encaissent moins de coups pour le reste de l'armée.",
    ],
  },
  {
    id: 15,
    date: "10 novembre",
    items: [
      "🏰 Forteresse : après une prise, pas d'assaut pendant 30 minutes, le temps pour l'alliance d'y poster sa garnison.",
    ],
  },
  {
    id: 16,
    date: "10 novembre",
    items: [
      "🐪 Caravane : chacun affronte sa propre escorte, qui vaut 60 % de son armée, et une victoire rapporte 45 minutes de sa propre production. Un assaut par caravane, et plus de limite aux quatre premiers.",
      "🗿 Colosse : chaque assaut rapporte tout de suite 2 fois la valeur des pertes infligées. S'il tombe, chaque joueur qui l'a touché reçoit en plus 15 minutes de sa production. Le colosse en cours garde l'ancienne prime commune.",
    ],
  },
  {
    id: 17,
    date: "10 novembre",
    items: [
      "🧱 Forteresse tenue : en plus des troupes postées par l'alliance, ses murs reviennent. Ils repartent à 25 % de leur valeur à la prise, puis gagnent 25 % toutes les 2 heures, jusqu'à 200 %.",
    ],
  },
  {
    id: 18,
    date: "10 novembre",
    items: [
      "🎁 Bonus d'étape variés : Les gargouilles donnent aussi +20 % de points de vie en défense. Le grand bourdon porte l'élan à +75 % au lieu de doubler les coups. La flèche ajoute 1 heure de stock à l'abri. L'horloge rend les recherches 20 % plus rapides. Le beffroi légendaire verse 20 écus à chaque joueur qui a atteint un palier de don.",
    ],
  },
  {
    id: 19,
    date: "10 novembre",
    items: [
      "⭐ Conseil d'achat : le bâtiment le plus rentable est marqué, et chaque bâtiment trop cher indique dans combien de temps tu pourras te l'offrir.",
      "🔔 Après un raid subi, le jeu te propose d'activer les notifications. Ceux qui les ont activées reçoivent chaque soir un résumé de leur journée.",
      "🔢 Une légende des grands nombres (k, M, Md, Bn…) est en bas de la page.",
    ],
  },
  {
    id: 20,
    date: "10 novembre",
    items: [
      "🏛️ Le classement de saison change : les plus généreux (part de ta production versée au chantier), la meilleure progression (production multipliée sur 7 jours) et les meilleurs défenseurs (raids repoussés) remplacent les bâtisseurs, les carriers et les détrousseurs de caravanes.",
      "🪙 À la fin de la saison, ces trois podiums rapportent 30, 20 et 10 écus. Il faut avoir produit au moins 1 M de pierre pour y figurer.",
    ],
  },
  {
    id: 21,
    date: "10 novembre",
    items: [
      "🛡️ Nouvel onglet Armée : ta garnison, le couvre-feu et la Forge y sont rangés, l'onglet Raids ne garde que les cibles et la chronique.",
      "🔴 Une pastille signale une recherche terminée (onglet Armée) et un événement en cours (onglet Raids).",
    ],
  },
  {
    id: 22,
    date: "10 novembre",
    items: ["🔔 Le beffroi est dessiné à côté du chantier : il gagne une pièce à chaque étape, et la pièce en cours se remplit à mesure des dons."],
  },
  {
    id: 23,
    date: "10 novembre",
    items: [
      "📜 Chaque raid de la chronique a son déroulé round par round : les pertes de chaque camp et les effectifs restants.",
      "🎲 Nouveau bouton Simuler sur chaque cible : une bataille pour de faux avec ton armée contre celle que tu vois en face, à rejouer autant que tu veux. Rien n'est perdu.",
      "🐞 Le butin estimé d'un joueur tient enfin compte du plafond de 2 heures de ta production et du coefficient d'équité, comme le vrai raid.",
    ],
  },
  {
    id: 24,
    date: "10 novembre",
    items: [
      "💬 Nouvel onglet Messages : un canal général pour tout le royaume et un canal privé pour ton alliance. Les messages font 200 caractères au plus, un toutes les 3 secondes.",
      "👍 Tu peux réagir à un message d'un clic (👍 ⚔️ 🛡️ 🏗️ 😂 ❤️).",
    ],
  },
  {
    id: 25,
    date: "10 novembre",
    items: [
      "🗺️ Nouvel onglet Carte : le royaume sur une grille de 15 × 15 cases, avec le beffroi au centre, Pierre-Haute, les seigneurs et tous les joueurs aux couleurs de leur alliance. Chaque domaine a reçu sa case pour la saison.",
      "📍 Touche un domaine pour ouvrir sa fiche et voir à combien de cases il est. Bientôt, la distance comptera : les armées mettront du temps à arriver.",
    ],
  },
  {
    id: 26,
    date: "10 novembre",
    items: [
      "🎲 Cinq nouveaux événements rejoignent la caravane et le colosse, tirés au sort toutes les 2 heures, jamais deux fois de suite le même :",
      "🎪 La grande foire (2 h) : savoirs à −20 %, ateliers à −10 %.",
      "🎉 La fête des bâtisseurs (2 h) : tes dons au chantier comptent double pour tes paliers et pour le lot de ton alliance.",
      "🌠 La pluie d'étoiles (1 h) : les veines d'or apparaissent trois fois plus souvent.",
      "🔔 La trêve des cloches (2 h) : aucune armée ne part, ni raid, ni renfort, ni assaut, et tout le monde produit 25 % de plus.",
      "🧺 Le marchand ambulant (1 h) : pour 30 minutes de ta production, au choix +25 % de production pendant 4 h, toutes tes ruines rebâties, ou 2 h de stock à l'abri en plus pendant 24 h. Un achat par passage.",
      "📣 Chaque événement est annoncé 15 minutes avant, dans le jeu et par notification.",
    ],
  },
  {
    id: 27,
    date: "10 novembre",
    items: [
      "🏇 Les raids ne sont plus instantanés : tu choisis les troupes envoyées (ou « Tout envoyer »), puis elles marchent jusqu'à la cible. L'aller prend de 3 à 20 minutes selon la distance sur la carte et l'unité la plus lente (chevaliers rapides, béliers lents). Le retour dure autant.",
      "🛡️ Les troupes en route ne défendent plus ton domaine : attaquer, c'est découvrir sa défense. Trois armées en route au plus. Le repos de 5 minutes entre deux raids disparaît.",
      "⚔️ Le combat se joue à l'arrivée, contre la défense présente. Si la cible est alors sous bouclier, en couvre-feu ou trop petite, ton armée fait demi-tour sans combattre. Le butin et la rançon ne sont crédités qu'au retour.",
      "🏳️ Tu peux rappeler une armée tant qu'elle n'est pas arrivée : elle rentre en autant de temps qu'elle a marché.",
      "⚠️ À mi-chemin, le défenseur est prévenu (bandeau et notification) de l'heure d'arrivée, sans savoir qui arrive. Chaque tour d'archers donne 5 % de chance de voir le nom de l'attaquant.",
      "🗺️ Tes armées en route s'affichent sur la carte.",
    ],
  },
  {
    id: 28,
    date: "10 novembre",
    items: [
      "👑 Les seigneurs pillards voyagent eux aussi : leur armée part de leur case et tu es prévenu à mi-chemin, comme pour un joueur. Ils visent de préférence les domaines à moins de 8 cases.",
      "🛡️ Les renforts voyagent : ils ne défendent ton allié qu'une fois arrivés, et rentrent par la route quand tu les rappelles.",
      "⚖️ Pour savoir si une cible est trop petite et calculer l'équité, c'est toute ton armée qui compte (domaine, routes, renforts chez tes alliés), pas seulement le détachement envoyé.",
    ],
  },
  {
    id: 29,
    date: "10 novembre",
    items: [
      "🏰 L'assaut et la garnison de Pierre-Haute voyagent jusqu'à sa case. Les 30 minutes sans assaut après une prise se vérifient à l'arrivée de l'armée.",
      "🐪 La caravane traverse la carte d'un bord à l'autre en une heure, et 🗿 le colosse apparaît sur une case loin des joueurs. Pour les attaquer, ton armée marche jusqu'à eux ; la prime rentre avec elle.",
    ],
  },
  {
    id: 30,
    date: "10 novembre",
    items: [
      "🌕 Nouvel événement, la lune rouge (2 h) : tous les seigneurs pillards lancent un raid en même temps. Chaque raid de seigneur repoussé te rapporte une rançon de 30 % de la valeur de son armée.",
      "🌫️ Nouvel événement, le brouillard (2 h) : aucune alerte d'approche, les chances sont masquées sans espion, et l'espion coûte moitié prix.",
    ],
  },
  {
    id: 31,
    date: "10 novembre",
    items: [
      "⛏️ Nouvel événement, le filon géant (2 h) : une mine apparaît sur la carte. Postes-y une armée, elle ne se bat pas et extrait 3 minutes de ta production par tranche de 10 minutes, 30 minutes au plus.",
      "🏕️ Nouvel événement, les camps de bandits (3 h) : un camp près de chaque joueur actif, défendu par 30 % de son armée. Le premier qui le vide emporte 40 minutes de la production du joueur le plus proche.",
      "💰 Nouvel événement, le trésor enfoui (90 min) : une case est révélée. Les armées qui y arrivent se battent dans l'ordre d'arrivée, et celle qui tient la case à la fin emporte 2 heures de la production médiane. Pas de trésor en couvre-feu.",
    ],
  },
  {
    id: 32,
    date: "10 novembre",
    items: [
      "👑 Nouvel événement, le convoi royal (90 min) : il traverse la carte et tombe dans une embuscade à mi-chemin, face à 50 % des armées réunies des joueurs actifs. Poste des troupes au point d'embuscade avant : si le convoi passe, chaque escorte reçoit 45 minutes de sa production. Les pertes reviennent à 60 % de l'infirmerie.",
      "🏰 Nouvel événement, le siège du beffroi (3 h) : une armée valant 80 % des armées réunies frappe le beffroi à la fin. Poste des défenseurs au centre : victoire, 1 heure de production chacun ; défaite, l'étape en cours perd 10 % de sa pierre.",
      "🏆 Nouvel événement, le tournoi (1 h) : compose une armée avec le budget fourni, sans toucher à tes troupes. Tableau à élimination à la fin, sans pertes : 2 h, 1 h et 30 min de production pour le podium.",
    ],
  },
];
