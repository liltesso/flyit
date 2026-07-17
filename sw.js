const CACHE_NAME = 'aura-v11-cache';
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
    const url = new URL(e.request.url);

    // Network-first for API calls
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(
            fetch(e.request)
                .catch(() => new Response(JSON.stringify({ ok: false, error: 'Offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                }))
        );
        return;
    }

    // Cache-first for everything else
    e.respondWith(
        caches.match(e.request)
            .then(cached => cached || fetch(e.request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                    }
                    return response;
                })
            )
            .catch(() => caches.match('/index.html'))
    );
});
