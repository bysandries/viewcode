/*
 * Service Worker: offline cache for the heavy, effectively-immutable Java-runtime
 * assets, so the app keeps working after the first load.
 *
 * Scope is deliberately narrow — only the CheerpJ runtime, the proxied ECJ jar,
 * and the TreeVisualizer helper — so it never interferes with Next.js navigation
 * or _next/* build assets (which Next already fingerprints + HTTP-caches).
 */

const CACHE = "lcm-wasm-v1"

function isCacheable(url) {
  // CheerpJ runtime (loader.js, .wasm, support jars) is served cross-origin.
  if (url.origin === "https://cjrtnc.leaningtech.com") return true
  // Same-origin: the ECJ compiler jar (proxied) and the reflection helper.
  if (url.origin === self.location.origin) {
    return url.pathname.startsWith("/api/ecj") || url.pathname === "/TreeVisualizer.java"
  }
  return false
}

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (!isCacheable(url)) return

  // CheerpJ pulls ecj.jar with HTTP Range requests; the Cache API can't model
  // partial responses, so let the network/browser handle ranged fetches.
  if (req.headers.has("range")) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      if (cached) return cached
      const res = await fetch(req)
      // Store ok same-origin and opaque cross-origin responses alike; opaque
      // responses are still replayable for offline-after-first-load (best effort).
      if (res && (res.ok || res.type === "opaque")) {
        cache.put(req, res.clone()).catch(() => {})
      }
      return res
    }),
  )
})
