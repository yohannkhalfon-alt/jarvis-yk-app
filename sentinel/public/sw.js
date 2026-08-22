// Service worker Sentinelle : rend l'app installable + chargement instantané.
// Les données (/api/*) passent toujours par le réseau (jamais mises en cache).
const CACHE = "sentinelle-v3";
const SHELL = ["/", "/logo.png?v=2", "/logo-512.png?v=2", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // données live -> réseau direct
  // La page : réseau d'abord (pour voir les mises à jour), cache en secours (hors-ligne).
  if (e.request.mode === "navigate" || url.pathname === "/" || url.pathname === "/messagerie") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
    return;
  }
  // Icônes / manifeste : cache d'abord.
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
