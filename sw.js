// Service worker minimal : permet d'installer le jeu sur l'écran d'accueil.
// Il ne met rien en cache, pour que chaque mise à jour du jeu arrive tout de suite.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
