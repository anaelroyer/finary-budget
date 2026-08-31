/* Budget & Patrimoine — Service Worker — Security v3
   Cache renforcé des ressources statiques et bibliothèques externes. */
const CACHE_NAME = 'budget-patrimoine-security-v3-20260831';

const APP_SHELL = [
  './app.html',

  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const EXTERNAL_PRECACHE = [
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css',
  'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.14.0/html2pdf.bundle.min.js',
  'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'
];

function isCacheableExternal(url) {
  return (
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'cdnjs.cloudflare.com' ||
    (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/12.1.0/'))
  );
}

async function safePrecache(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(url, response.clone());
    }
  } catch (_) {
    // Une ressource externe indisponible ne doit jamais bloquer l'installation du SW.
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(APP_SHELL);
    } catch (_) {
      // L'app reste installable même si un élément du shell est momentanément indisponible.
      await Promise.allSettled(APP_SHELL.map(url => safePrecache(cache, url)));
    }
    await Promise.allSettled(EXTERNAL_PRECACHE.map(url => safePrecache(cache, url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('budget-patrimoine-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigation : réseau en priorité afin de récupérer rapidement les nouvelles versions,
  // avec app.html en secours hors connexion.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./app.html', response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match('./app.html')) || Response.error();
      }
    })());
    return;
  }

  // Bibliothèques externes : cache d'abord. Une fois chargées une fois,
  // JsBarcode / QRCode / Cropper / html2pdf / Firebase restent disponibles hors ligne.
  if (isCacheableExternal(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  // Ressources locales statiques : réseau avec repli sur le cache.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        const cached = await caches.match(request, { ignoreSearch: true });
        return cached || Response.error();
      }
    })());
  }
});
