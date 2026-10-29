// Service worker template. vite.config.ts fills in the version and precache list at build time.
// Precaches the whole app shell so the game opens with no network after the first visit.
const VERSION = '985a820ee967';
const PRECACHE = ["./","assets/index-AWZg7qhC.css","assets/index-CLf6Bfiq.js","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","manifest.webmanifest"];
// Cache Storage is shared by every registration on this origin (the live site and each PR preview),
// so each scope gets its own prefix and only ever cleans up after itself.
const PREFIX = `pzc:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The live site's scope also covers PR previews under /pr-preview/. Leave those to the network
  // (or to the preview's own worker) so a preview never shows the live app.
  const scopePath = new URL(self.registration.scope).pathname;
  if (!scopePath.includes('/pr-preview/') && url.pathname.includes('/pr-preview/')) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = request.mode === 'navigate' ? new Request('./') : request;
      // ignoreVary: module scripts are fetched with an Origin header the precache request never had.
      const hit = await cache.match(key, { ignoreSearch: request.mode === 'navigate', ignoreVary: true });
      if (hit) return hit;
      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === 'navigate') {
          const shell = await cache.match(new Request('./'));
          if (shell) return shell;
        }
        throw err;
      }
    }),
  );
});
