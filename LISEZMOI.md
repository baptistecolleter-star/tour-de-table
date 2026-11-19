# Tour de Table : prototype

Un jeu d'ambiance entre amis : un hôte crée une salle, les autres la rejoignent avec un code à 4 chiffres ou un QR code. Pas d'appli, pas de compte, pas de clé API, 0 €.

## Mettre en ligne (5 minutes)

1. Va sur https://app.netlify.com/drop et crée un compte gratuit.
2. Glisse-dépose le dossier `tour-de-table` (dézippé) sur la page.
3. Netlify te donne une adresse du type `https://xxx.netlify.app` : c'est ton jeu.
4. Pour une mise à jour : onglet « Deploys » du site, puis glisse-dépose à nouveau le dossier.

GitHub Pages ou Cloudflare Pages fonctionnent aussi : ce sont des fichiers statiques, rien à compiler.

## Jouer

- L'hôte ouvre le site, choisit un pseudo, puis « Créer une salle ». Son téléphone sert de serveur : il doit rester allumé et sur la page pendant toute la partie.
- Les autres scannent le QR code ou tapent le code.
- Chacun peut ajouter jusqu'à 10 photos pour la manche Galerie.
- L'hôte choisit le nombre de manches et les catégories, puis lance la partie.

## Les manches

| Manche | Principe | Points |
| --- | --- | --- |
| 👉 Qui est le plus susceptible de… | Tout le monde vote pour un joueur | 500 si tu votes comme la majorité |
| 🔟 Sur une échelle de 1 à 10 | Un joueur se note en secret sur une affirmation, les autres devinent sa note | 1 000 si exact, 600 à 1 près, 300 à 2 près ; le joueur noté gagne 100 par bon pronostic |
| ⚖️ Plus ou moins | Deux choix : lequel est le plus peuplé, le plus haut, le plus ancien… | 500 à 1 000 selon la rapidité |
| 🔢 Le juste chiffre | Estimer un nombre (habitants, hauteur, année…) | Jusqu'à 1 000 selon la proximité, +200 pour le plus proche |
| 🖼️ Galerie | Chaque joueur sélectionne des photos dans sa galerie (autant qu'il veut), le jeu en tire 20 au hasard, le joueur refuse celles qu'il ne veut pas montrer (remplacées au hasard) puis valide. Ensuite : à qui est cette photo ? | 500 à 1 000 selon la rapidité |
| ✍️ Qui a écrit ça ? | Chacun répond en secret, puis on devine qui a écrit chaque réponse | 500 à 1 000 ; l'auteur gagne 150 par joueur piégé |

Chaque nouvelle manche a une banque de 500 questions (`questions.js`). « Plus susceptible », Galerie et « Qui a écrit ça ? » demandent au moins 3 joueurs.

Les chiffres de « Plus ou moins » et du « Juste chiffre » viennent de Wikidata (licence CC0). Pour les mettre à jour : modifier `outils/wikidata.mjs` (GitHub relance la récupération), puis lancer `node outils/construire.mjs`.

## Ambiances, packs et publicité

- **Ambiance de la soirée** (réglée par l'hôte) : 😎 Décontractée, 🕯️ Sérieuse, 🔥 Coquine (18+). Elle change les questions de « Plus susceptible », « Échelle 1 à 10 » et « Qui a écrit ça ? ». Questions dans `packs.js`.
- **Packs** : 🔥 Coquin et ✏️ Questions personnalisées. Gratuits : on les débloque pour 24 h en regardant une pub récompensée (mémorisé sur le téléphone de l'hôte).
- **Pause pub** : une seule pub plein écran (8 s) par tranche de 10 manches, au milieu (après la 5e manche), sur tous les téléphones ; jamais après la dernière manche.
- Tout se règle dans `config.js` (fréquence, durées).
- **Mode démo** tant que `adsenseClient` est vide : fausses pubs, aucun revenu.
- **Passer aux vraies pubs** : 1) compte Google AdSense approuvé pour le site ; 2) demande d'accès « H5 Games Ads » (pubs plein écran et récompensées) ; 3) coller l'identifiant `ca-pub-…` dans `config.js` en gardant `adsenseTest: true` pour vérifier, puis le passer à `false` ; 4) ajouter un bandeau de consentement aux cookies (obligatoire en France) et une page de mentions légales. Le pack Coquin peut poser problème avec les règles publicitaires de Google : à vérifier lors de la demande.

## Comment ça marche

- **Connexion** : PeerJS (WebRTC), avec le serveur public gratuit de PeerJS pour la mise en relation. Ensuite, les données passent directement d'un téléphone à l'autre.
- **Photos des joueurs** : réduites à 720 px sur le téléphone, ce qui supprime aussi la position GPS. Elles ne sont jamais stockées sur un serveur.

## Ambiance de jeu

- **Suspense** : les votes s'affichent un par un, puis la bonne réponse apparaît ; les points arrivent ensuite.
- **Sons et vibrations** générés par le téléphone (tic-tac des 5 dernières secondes, roulement de tambour, bonne ou mauvaise réponse, fanfare du podium). Bouton 🔊/🔇 en haut à droite.
- **Joker ×2** : chaque joueur peut regarder une pub pendant l'affichage des résultats pour doubler ses points à la manche suivante (3 jokers maximum par partie).
- **Packs d'occasion** (débloqués 24 h par une pub) : 🎄 Noël en famille, 🎂 Anniversaire, 💍 EVJF / EVG (18+), 🍻 Afterwork, 🎓 Soirée étudiante. 75 questions chacun, dans `packs.js`.
- **Partage** : trophées de fin de partie et carte podium au format story à partager ; aperçu soigné du lien d'invitation dans WhatsApp ; installation possible sur l'écran d'accueil.

## Fiabilité

- **Indicateur de connexion** : pastille par joueur (🟢 bonne, 🟠 faible, ⚪ déconnecté) et bouton « 📶 Tester ma connexion » dans la salle d'attente.
- **Si l'hôte décroche** (appel, veille, réseau coupé), le premier joueur arrivé reprend la partie au bout d'environ 12 s : mêmes scores, même manche, même code de salle. Les autres se reconnectent tout seuls. Quand l'ancien hôte revient, il rejoint la partie comme joueur.
- **Compteur anonyme** (sans cookie) : créer un compte gratuit sur goatcounter.com et mettre le code du site dans `config.js` (`goatcounter`). Événements comptés : salle créée, joueur rejoint, partie lancée, podium, pubs, reprise d'hôte. Vérifier les conditions d'usage de GoatCounter pour un site qui affiche de la publicité.

## Limites connues du prototype

- Les photos de la Galerie de l'hôte sont perdues s'il décroche (celles des autres joueurs sont renvoyées automatiquement).
- Sur certains réseaux (4G d'opérateur, Wi-Fi d'entreprise), la connexion directe peut échouer pour un joueur. Le relais gratuit de PeerJS aide, sans garantie.
- Le serveur public PeerJS est gratuit mais sans garantie de disponibilité.

## Tester en local

```
python3 -m http.server 8080
```
puis ouvrir http://localhost:8080 dans deux onglets.
