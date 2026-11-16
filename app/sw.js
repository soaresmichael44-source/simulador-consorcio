// Cache simples para o app abrir offline (a fonte do Google é opcional).
const V = 'mobie-cenario-v3';
const ARQ = ['./', 'index.html', 'calc.js', 'cena-nlu.js', 'config.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(ARQ)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
