// Réglages publicitaires de Tour de Table.
// Tant que « adsenseClient » est vide, le jeu est en mode démo : de fausses pubs
// s'affichent (aucun revenu, aucun cookie).
window.TDT_CONFIG = {
  packs: {
    coquin: { nom: '🔥 Pack Coquin', desc: 'Près de 250 questions osées pour adultes (18+), pour pimenter la soirée.' },
    perso: { nom: '✏️ Questions personnalisées', desc: 'Écris tes propres questions : elles se mélangent à celles du jeu.' }
  },
  // Un pack débloqué par une pub reste ouvert pendant (heures) :
  dureePub: 24,
  // Pause pub plein écran sur tous les téléphones toutes les N manches (0 = jamais) :
  pubToutesLesManches: 3,
  // Durée de la pause pub entre les manches (secondes) :
  pubDureeSecondes: 8,
  // Durée de la fausse pub récompensée en mode démo (secondes) :
  pubDemoSecondes: 15,
  // Identifiant AdSense (ex. 'ca-pub-1234567890123456') une fois le compte
  // et l'accès « H5 Games Ads » approuvés par Google. Vide = mode démo.
  adsenseClient: '',
  // true = pubs de test Google (à utiliser pendant la mise au point)
  adsenseTest: true
};
