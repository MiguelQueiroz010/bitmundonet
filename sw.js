/**
 * BitMundo Service Worker - Motor de Cache Offline Total para Ferramentas
 */
const CACHE_NAME = 'bitmundo-tools-offline-v3';

// Recursos críticos da casca e ferramentas para pré-carregamento imediato
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/tools.html',
  '/raiden_patcher.html',
  '/hog_extractor.html',
  '/tools/Fully/AFS_STATION.html',
  '/tools/Fully/TTxT-standalone.html',
  '/css/style.css',
  '/scripts/tool_back_button.js',
  '/scripts/navbar.js',
  '/scripts/raiden_patcher.js',
  '/scripts/hog_extractor.js',
  '/fav/site.webmanifest',
  '/fav/raiden_patcher.webmanifest',
  '/fav/hog_extractor.webmanifest',
  '/fav/afs_station.webmanifest',
  '/fav/ttxt.webmanifest',
  '/fav/raiden_patcher.svg',
  '/fav/hog_extractor.svg',
  '/fav/afs_station.svg',
  '/fav/ttxt.svg',
  '/fav/raiden_patcher-192.png',
  '/fav/raiden_patcher-512.png',
  '/fav/hog_extractor-192.png',
  '/fav/hog_extractor-512.png',
  '/fav/afs_station-192.png',
  '/fav/afs_station-512.png',
  '/fav/ttxt-192.png',
  '/fav/ttxt-512.png',
  '/fav/android-chrome-192x192.png',
  '/fav/android-chrome-512x512.png',
  '/fav/favicon-32x32.png',
  'https://code.jquery.com/jquery-3.7.1.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.debug('[SW Precache Skipped]', url, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Ignorar requests que não sejam http/https (ex: chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // Não interceptar Firebase Firestore ou Auth
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('firebaseio.com')
  ) {
    return;
  }

  // Interceptar páginas e assets
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      // 1. Se já está no cache, entrega imediatamente e atualiza em background se houver rede
      if (cached) {
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const resClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
            }
          })
          .catch(() => {
            // Em modo offline, silencioso
          });
        return cached;
      }

      // 2. Se não está em cache, tenta rede e guarda no cache
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // 3. Fallback offline para navegações HTML
          if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
            const pathname = url.pathname.toLowerCase();
            if (pathname.includes('raiden')) return caches.match('/raiden_patcher.html');
            if (pathname.includes('hog')) return caches.match('/hog_extractor.html');
            if (pathname.includes('afs')) return caches.match('/tools/Fully/AFS_STATION.html');
            if (pathname.includes('ttxt')) return caches.match('/tools/Fully/TTxT-standalone.html');
            return caches.match('/tools.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
