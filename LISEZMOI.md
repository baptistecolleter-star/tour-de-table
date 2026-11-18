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
| 📅 Photo → année | Un monument : en quelle année a-t-il été inauguré ? | 1 000 si l'année est exacte, 40 points de moins par année d'écart |
| 🌍 Photo → pays | Un site du patrimoine mondial : dans quel pays ? (4 choix) | 500 à 1 000 selon la rapidité |
| 🖼️ Galerie | Une photo d'un joueur : à qui est-elle ? | 500 à 1 000 selon la rapidité |
| 🎬 Film en emojis | Retrouver le film (4 choix) | 500 à 1 000 selon la rapidité |
| ✍️ Qui a écrit ça ? | Chacun répond en secret, puis on devine qui a écrit chaque réponse | 500 à 1 000 ; l'auteur gagne 150 par joueur piégé |

Les manches Galerie et « Qui a écrit ça ? » demandent au moins 3 joueurs.

## Comment ça marche

- **Connexion** : PeerJS (WebRTC), avec le serveur public gratuit de PeerJS pour la mise en relation. Ensuite, les données passent directement d'un téléphone à l'autre.
- **Photos année et pays** : tirées en direct de Wikidata et Wikimedia Commons (licences libres, sans clé) quand l'hôte crée la salle. Si Wikidata ne répond pas, une petite banque de secours de 21 photos prend le relais.
- **Photos des joueurs** : réduites à 720 px sur le téléphone, ce qui supprime aussi la position GPS. Elles ne sont jamais stockées sur un serveur.

## Limites connues du prototype

- Si le téléphone de l'hôte se met en veille ou recharge la page, la partie s'arrête. Le jeu demande à l'écran de rester allumé, mais certains téléphones l'ignorent.
- Sur certains réseaux (4G d'opérateur, Wi-Fi d'entreprise), la connexion directe peut échouer pour un joueur. Le relais gratuit de PeerJS aide, sans garantie.
- Les photos Wikimedia sont créditées par un lien vers leur page Commons, qui indique l'auteur et la licence. Avant une sortie publique, il faudra afficher directement l'auteur.
- Le serveur public PeerJS est gratuit mais sans garantie de disponibilité.

## Tester en local

```
python3 -m http.server 8080
```
puis ouvrir http://localhost:8080 dans deux onglets.
