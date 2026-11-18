// Contenu du jeu Tour de Table.
// Les photos « année » et « pays » sont tirées en direct de Wikidata / Wikimedia Commons
// (gratuit, sans clé). Les listes FALLBACK_* servent si Wikidata ne répond pas.

window.TDT_DATA = {
  // Requêtes Wikidata (exécutées par le téléphone de l'hôte à la création de la salle)
  SPARQL_PAYS: `SELECT ?i ?l ?f ?c WHERE {
    ?i wdt:P1435 wd:Q9259; wdt:P18 ?img; wdt:P17 ?co; wikibase:sitelinks ?sl.
    FILTER(?sl > 30)
    FILTER NOT EXISTS { ?i wdt:P17 ?co2 FILTER(?co2 != ?co) }
    ?i rdfs:label ?l FILTER(LANG(?l) = "fr")
    ?co rdfs:label ?c FILTER(LANG(?c) = "fr")
    BIND(STRAFTER(STR(?img), "FilePath/") AS ?f)
  } LIMIT 700`,

  SPARQL_ANNEE: `SELECT ?i ?l ?f ?y WHERE {
    ?i wdt:P1619 ?d; wdt:P18 ?img; wikibase:sitelinks ?sl.
    FILTER(?sl > 40)
    BIND(YEAR(?d) AS ?y)
    FILTER(?y >= 1850 && ?y <= 2025)
    ?i rdfs:label ?l FILTER(LANG(?l) = "fr")
    BIND(STRAFTER(STR(?img), "FilePath/") AS ?f)
  } LIMIT 600`,

  // Noms de pays raccourcis pour l'affichage
  RENOMMER_PAYS: {
    "République populaire de Chine": "Chine",
    "État de Palestine": "Palestine",
    "République démocratique du Congo": "RD Congo",
    "Royaume des Pays-Bas": "Pays-Bas"
  },

  // Secours si Wikidata est injoignable (fichiers vérifiés sur Wikimedia Commons)
  FALLBACK_ANNEE: [
    { f: "Lange-MigrantMother02.jpg", y: 1936, l: "Mère migrante, Dorothea Lange (États-Unis)" },
    { f: "Boulevard du Temple by Daguerre.jpg", y: 1838, l: "Boulevard du Temple, Daguerre (Paris)" },
    { f: "Alfred Stieglitz Winter Fifth Avenue 1892.jpg", y: 1892, l: "Hiver, Cinquième Avenue (New York)" },
    { f: "Salvador Dali A (Dali Atomicus) 09633u.jpg", y: 1948, l: "Dalí Atomicus, Philippe Halsman" },
    { f: "Moonrise, Hernandez, New Mexico (cropped).jpg", y: 1941, l: "Moonrise, Hernandez, Ansel Adams" },
    { f: "Adams The Tetons and the Snake River.jpg", y: 1942, l: "The Tetons and the Snake River, Ansel Adams" },
    { f: "Tartan Ribbon.jpg", y: 1861, l: "Tartan Ribbon, première photo couleur" },
    { f: "Webb's First Deep Field.jpg", y: 2022, l: "Premier champ profond du télescope Webb" },
    { f: "Sternentstehung im Adlernebel.jpg", y: 1995, l: "Les Piliers de la création (Hubble)" }
  ],
  FALLBACK_PAYS: [
    { f: "Taj Mahal, Agra, India edit3.jpg", c: "Inde", l: "Taj Mahal" },
    { f: "Colosseo 2020.jpg", c: "Italie", l: "Colisée" },
    { f: "Hagia Sophia Mars 2013.jpg", c: "Turquie", l: "Sainte-Sophie" },
    { f: "Westfassade Chartres.jpg", c: "France", l: "Cathédrale de Chartres" },
    { f: "Senegal Gorée island harbor.jpg", c: "Sénégal", l: "Île de Gorée" },
    { f: "Biblioteca Nacional de España (Madrid) 09.jpg", c: "Espagne", l: "Bibliothèque nationale d'Espagne" },
    { f: "Grand Prismatic Spring 2013.jpg", c: "États-Unis", l: "Parc national de Yellowstone" },
    { f: "Thingvellir.jpg", c: "Islande", l: "Þingvellir" },
    { f: "Temple of Heaven 20160323 01.jpg", c: "Chine", l: "Temple du Ciel" },
    { f: "Gate of All Nations, Persepolis.jpg", c: "Iran", l: "Persépolis" },
    { f: "Cité de Carcassonne.jpg", c: "France", l: "Cité de Carcassonne" },
    { f: "Tower of London viewed from the River Thames.jpg", c: "Royaume-Uni", l: "Tour de Londres" }
  ],

  // Pays utilisés comme mauvaises réponses si besoin
  PAYS_LEURRES: ["France", "Italie", "Espagne", "Allemagne", "Royaume-Uni", "États-Unis", "Mexique",
    "Brésil", "Pérou", "Japon", "Chine", "Inde", "Iran", "Turquie", "Grèce", "Égypte", "Maroc",
    "Russie", "Canada", "Australie", "Portugal", "Pologne", "Vietnam", "Indonésie", "Afrique du Sud"],

  // Film en emojis (titres français)
  FILMS: [
    ["🦁👑🌅", "Le Roi Lion"], ["🚢🧊💔", "Titanic"], ["🦖🏝️🚙", "Jurassic Park"],
    ["👽🚲🌕", "E.T. l'extra-terrestre"], ["🧙‍♂️💍🌋", "Le Seigneur des anneaux"],
    ["🦈🏖️😱", "Les Dents de la mer"], ["🐀👨‍🍳🍲", "Ratatouille"], ["🏠🎈👴", "Là-haut"],
    ["🐠🔍🌊", "Le Monde de Nemo"], ["❄️👸⛄", "La Reine des neiges"],
    ["🕷️🧑🏙️", "Spider-Man"], ["🦇🃏🌃", "The Dark Knight"], ["💊🕶️🐇", "Matrix"],
    ["👻🚫🔦", "SOS Fantômes"], ["⏰🚗⚡", "Retour vers le futur"], ["🧸🤠🚀", "Toy Story"],
    ["🦍🏙️✈️", "King Kong"], ["🍫🏭🎩", "Charlie et la Chocolaterie"],
    ["👩🥄🍮🗼", "Le Fabuleux Destin d'Amélie Poulain"], ["🧑‍🦽🤝🕺", "Intouchables"],
    ["🏠👦🎄🪤", "Maman, j'ai raté l'avion"], ["👨‍🚀🌽🕳️", "Interstellar"],
    ["🧠😀😢😡", "Vice-versa"], ["💀🎸🌼", "Coco"], ["🐼🥋🥟", "Kung Fu Panda"],
    ["🟢👹🧅🫏", "Shrek"], ["🌊🛶🐔🌺", "Vaiana"], ["🧞‍♂️🪔🐒", "Aladdin"],
    ["🧜‍♀️🐠🦀", "La Petite Sirène"], ["🃏🎭🪜", "Joker"], ["🏹🔥👧", "Hunger Games"],
    ["⚡👓🧹", "Harry Potter à l'école des sorciers"], ["🚀⭐⚔️👨‍👦", "Star Wars"],
    ["🦸🧤💎♾️", "Avengers: Endgame"], ["🏃‍♂️🍫🪶", "Forrest Gump"], ["🤖🌱🗑️", "WALL-E"],
    ["🏰👠🎃", "Cendrillon"], ["🍯🐻🎈", "Winnie l'ourson"], ["🚗⚡🏁", "Cars"],
    ["💼💰🐺📈", "Le Loup de Wall Street"], ["🏝️🏐📦", "Seul au monde"],
    ["📮🌧️🍟🗣️", "Bienvenue chez les Ch'tis"], ["🏰⚔️⏳🚗", "Les Visiteurs"],
    ["🐫🏛️🐗💪", "Astérix et Obélix : Mission Cléopâtre"], ["🍽️🤪🪵🔥", "Le Dîner de cons"],
    ["🦌🌲🐇", "Bambi"], ["🌀😴🏙️", "Inception"], ["💖👱‍♀️🏖️", "Barbie"],
    ["💣🧪🎩", "Oppenheimer"], ["👴🌹🍊🤵", "Le Parrain"], ["🦕🦖🦴🏛️", "La Nuit au musée"],
    ["🐉👦🔥🛡️", "Dragons"], ["👨‍🦲👶🍌", "Moi, moche et méchant"], ["🚌💥⏱️", "Speed"]
  ],

  // Questions « Qui a écrit ça ? »
  QUESTIONS_AUTEUR: [
    "Ton pire achat de tous les temps ?", "Le plat que tu ne mangerais même pas pour 100 € ?",
    "Ta plus grosse honte en soirée ?", "Le métier que tu ferais dans une autre vie ?",
    "Le surnom que tu avais petit(e) ?", "Ton talent le plus inutile ?",
    "La chanson que tu chantes sous la douche ?", "Une chose que tout le monde sait faire sauf toi ?",
    "Le pire cadeau que tu aies reçu ?", "Ta peur la plus bizarre ?",
    "L'objet que tu emporterais sur une île déserte ?", "La célébrité avec qui tu dînerais ?",
    "Ton plaisir coupable ?", "Ta pire coupe de cheveux ?", "Ton record le plus absurde ?",
    "La première chose que tu fais le matin ?", "Le film que tu as vu le plus de fois ?",
    "Ce que tu ferais avec 1 million d'euros demain ?", "Ton pire job ou stage ?",
    "Le dernier truc qui t'a fait pleurer de rire ?", "Ton emoji le plus utilisé ?",
    "La règle que tu enfreins tout le temps ?", "Le prénom que tu donnerais à un chat ?",
    "L'objet le plus inutile chez toi ?", "Ta pire galère de vacances ?",
    "Le super-pouvoir que tu choisirais ?", "La pire excuse que tu aies donnée pour annuler ?",
    "Ton plat signature ?", "Ce que tu collectionnais enfant ?", "Ta série doudou ?"
  ]
};
