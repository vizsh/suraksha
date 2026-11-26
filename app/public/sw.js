// SuRaksha Mesh service worker: the app keeps working on a bad connection.
// - pages: network first, cached shell when offline
// - built code, fonts, textures, models: cache first
// - corridor data: stale while revalidate
// - the event API and third-party services: always network (the app queues reports itself)
const VERSION = 'suraksha-v1'
const SHELL = ['/', '/app', '/manifest.webmanifest', '/icons/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
    )
    return
  }

  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const cached = await c.match(req)
        const fresh = fetch(req).then((res) => {
          c.put(req, res.clone())
          return res
        })
        return cached || fresh
      }),
    )
    return
  }

  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
