// Réglages publicitaires de Tour de Table.
// Tant que « adsenseClient » est vide, le jeu est en mode démo : de fausses pubs
// s'affichent (aucun revenu, aucun cookie).
window.TDT_CONFIG = {
  packs: {
    coquin: { nom: '🔥 Pack Coquin', desc: 'Près de 250 questions osées pour adultes (18+), pour pimenter la soirée.' },
    perso: { nom: '✏️ Questions personnalisées', desc: 'Écris tes propres questions : elles se mélangent à celles du jeu.' },
    noel: { nom: '🎄 Noël en famille', desc: '75 questions de fêtes : cadeaux, bûche et repas de famille.' },
    anniv: { nom: '🎂 Anniversaire', desc: '75 questions pour fêter quelqu’un comme il se doit.' },
    evjf: { nom: '💍 EVJF / EVG', desc: '75 questions pour enterrer une vie de jeune fille ou de garçon (18+).' },
    afterwork: { nom: '🍻 Afterwork', desc: '75 questions entre collègues.' },
    etudiant: { nom: '🎓 Soirée étudiante', desc: '75 questions sur les partiels, la coloc et les soirées.' }
  },
  // Un pack débloqué par une pub reste ouvert pendant (heures) :
  dureePub: 24,
  // Une pause pub plein écran par bloc de N manches, au milieu du bloc (0 = jamais).
  // 10 → partie de 10 manches : 1 seule pub, après la 5e manche.
  pubToutesLesManches: 10,
  // Durée de la pause pub entre les manches (secondes) :
  pubDureeSecondes: 8,
  // Durée de la fausse pub récompensée en mode démo (secondes) :
  pubDemoSecondes: 15,
  // Identifiant AdSense (ex. 'ca-pub-1234567890123456') une fois le compte
  // et l'accès « H5 Games Ads » approuvés par Google. Vide = mode démo.
  adsenseClient: '',
  // true = pubs de test Google (à utiliser pendant la mise au point)
  adsenseTest: true,
  // Compteur anonyme sans cookie : code GoatCounter (ex. 'tourdetable' pour
  // tourdetable.goatcounter.com). Vide = aucun comptage.
  goatcounter: ''
};
