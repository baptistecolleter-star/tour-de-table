// Réglages de monétisation de Tour de Table.
// Tant que les liens sont vides, le jeu est en « mode démo » : les packs se
// débloquent gratuitement après une fausse pub ou un faux paiement.
window.TDT_CONFIG = {
  packs: {
    coquin: { nom: '🔥 Pack Coquin', prix: '2,99 €', desc: 'Près de 250 questions osées pour adultes (18+), pour pimenter la soirée.' },
    perso: { nom: '✏️ Questions personnalisées', prix: '1,99 €', desc: 'Écris tes propres questions : elles se mélangent à celles du jeu.' }
  },
  // Liens de paiement (ex. Stripe Payment Links). Vide = mode démo.
  paiement: { coquin: '', perso: '' },
  // Durée d'un déblocage obtenu en regardant une pub (en heures).
  dureePub: 24,
  // Régie publicitaire non branchée = pub de démonstration de 15 s.
  pubDemoSecondes: 15
};
