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
| 🖼️ Galerie | Une photo d'un joueur : à qui est-elle ? | 500 à 1 000 selon la rapidité |
| ✍️ Qui a écrit ça ? | Chacun répond en secret, puis on devine qui a écrit chaque réponse | 500 à 1 000 ; l'auteur gagne 150 par joueur piégé |

Chaque nouvelle manche a une banque de 500 questions (`questions.js`). « Plus susceptible », Galerie et « Qui a écrit ça ? » demandent au moins 3 joueurs.

Les chiffres de « Plus ou moins » et du « Juste chiffre » viennent de Wikidata (licence CC0). Pour les mettre à jour : modifier `outils/wikidata.mjs` (GitHub relance la récupération), puis lancer `node outils/construire.mjs`.

## Comment ça marche

- **Connexion** : PeerJS (WebRTC), avec le serveur public gratuit de PeerJS pour la mise en relation. Ensuite, les données passent directement d'un téléphone à l'autre.
- **Photos des joueurs** : réduites à 720 px sur le téléphone, ce qui supprime aussi la position GPS. Elles ne sont jamais stockées sur un serveur.

## Limites connues du prototype

- Si le téléphone de l'hôte se met en veille ou recharge la page, la partie s'arrête. Le jeu demande à l'écran de rester allumé, mais certains téléphones l'ignorent.
- Sur certains réseaux (4G d'opérateur, Wi-Fi d'entreprise), la connexion directe peut échouer pour un joueur. Le relais gratuit de PeerJS aide, sans garantie.
- Le serveur public PeerJS est gratuit mais sans garantie de disponibilité.

## Tester en local

```
python3 -m http.server 8080
```
puis ouvrir http://localhost:8080 dans deux onglets.
