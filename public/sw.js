const CACHE_PREFIXES = ["fcfund-", "trai-lang-fc-"];
const CACHE = "trai-lang-fc-shell-v3";
const SHELL = ["/", "/login", "/offline"];
const CACHEABLE_DESTINATIONS = new Set(["style", "script", "image", "font"]);

function isSupportedRequest(request) {
  if (request.method !== "GET") return false;
  try {
    const url = new URL(request.url);
    return (url.protocol === "http:" || url.protocol === "https:")
      && url.origin === self.location.origin
      && !url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

async function cacheResponse(request, response) {
  if (!response.ok || response.type !== "basic" || !CACHEABLE_DESTINATIONS.has(request.destination)) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  } catch {
    // Cache failures must never reject an otherwise successful network request.
  }
}

async function offlineFallback(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await caches.match("/offline");
      if (offline) return offline;
    }
  } catch {
    // Fall through to a valid HTTP response when Cache Storage is unavailable.
  }
  return new Response("Không thể kết nối mạng.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== CACHE && CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (!isSupportedRequest(event.request)) return;

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        await cacheResponse(event.request, response);
        return response;
      })
      .catch(() => offlineFallback(event.request)),
  );
});
