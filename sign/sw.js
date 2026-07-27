// Service worker JARVIS SIGN — cache le "shell" statique pour un lancement
// instantané en mode appli. Les appels /api/ restent toujours en réseau
// (jamais de cache : statuts et documents doivent être frais).
const CACHE = "jarvis-sign-v1";
const SHELL = ["/sign/", "/sign/index.html", "/sign/signer.html", "/sign/icon-192.png", "/sign/icon-512.png", "/sign/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return; // réseau direct
  // réseau d'abord (pour avoir les mises à jour), cache en secours (hors ligne)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && url.origin === location.origin && url.pathname.startsWith("/sign/")) {
          const copie = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copie));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: url.pathname === "/sign/" }))
  );
});
