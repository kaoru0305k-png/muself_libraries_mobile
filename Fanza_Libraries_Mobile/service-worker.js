const CACHE_VERSION = "v2";
const CACHE_NAME = `fvl-mobile-${CACHE_VERSION}`;

const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./main.js",
    "./manifest.webmanifest",
    "./offline.html"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    // ナビゲーションはネット優先、失敗時に offline.html
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put("./index.html", cloned);
                    });
                    return response;
                })
                .catch(async () => {
                    const cachedPage = await caches.match(request);
                    if (cachedPage) return cachedPage;

                    return caches.match("./offline.html");
                })
        );
        return;
    }

    // 同一オリジンの静的ファイルは stale-while-revalidate 風
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then((cached) => {
                const networkFetch = fetch(request)
                    .then((response) => {
                        if (response && response.status === 200) {
                            const cloned = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, cloned);
                            });
                        }
                        return response;
                    })
                    .catch(() => cached);

                return cached || networkFetch;
            })
        );
        return;
    }

    // 外部リソースはそのまま、失敗時はキャッシュがあれば使う
    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});