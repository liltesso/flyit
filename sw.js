const CACHE_NAME = 'aura-v22-cache';
const SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return; // never touch POST/PUT/DELETE

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // skip cross-origin (fonts CDN, etc.)

    // API: network-first with offline fallback
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(
            fetch(req).catch(() => new Response(
                JSON.stringify({ ok: false, error: 'Offline' }),
                { headers: { 'Content-Type': 'application/json' }, status: 503 }
            ))
        );
        return;
    }

    // Static shell: cache-first, refill on miss
    e.respondWith(
        caches.match(req).then(cached =>
            cached ||
            fetch(req).then(response => {
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
                }
                return response;
            }).catch(() => caches.match('/index.html'))
        )
    );
});
