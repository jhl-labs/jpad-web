const CACHE_NAME = "jpad-v1";

const APP_SHELL = ["/", "/workspace", "/login", "/offline"];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
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

// Fetch: network-first for API/navigation, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  const isApiCall = url.pathname.startsWith("/api/");
  const isNavigation = request.mode === "navigate";
  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|ico)$/i.test(
    url.pathname
  );

  if (isStaticAsset) {
    // Cache-first for static assets
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
  } else if (isApiCall || isNavigation) {
    // Network-first for API calls and page navigations
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // If navigation request fails and no cache, show offline page
            if (isNavigation) {
              return caches.match("/offline");
            }
            return new Response("Network error", { status: 503 });
          });
        })
    );
  }
});
