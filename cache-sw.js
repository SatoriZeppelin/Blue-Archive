const CACHE_NAME = 'blue-archive-assets-v4';
const assetPrefix = 'https://huggingface.co/think-denim-frisk/BlueArchive/resolve/main/resources/';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('blue-archive-assets-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.href.startsWith(assetPrefix)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const range = request.headers.get('Range');
    const cacheKey = new Request(request.url, { mode: request.mode, credentials: request.credentials });
    const cached = await cache.match(cacheKey);
    if (cached) {
      if (!range) return cached;
      if (cached.type !== 'opaque') {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (match) {
          const buffer = await cached.arrayBuffer();
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), buffer.byteLength - 1) : buffer.byteLength - 1;
          if (start < buffer.byteLength && end >= start) {
            return new Response(buffer.slice(start, end + 1), {
              status: 206,
              headers: {
                'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream',
                'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(end - start + 1)
              }
            });
          }
        }
      }
    }
    const response = await fetch(request);
    if (!range && response.ok && response.status === 200 && response.type !== 'opaque') {
      try { await cache.put(cacheKey, response.clone()); } catch (_) {}
    }
    if (range && response.status === 206 && !cached) {
      event.waitUntil((async () => {
        try {
          const full = await fetch(cacheKey);
          if (full.ok && full.status === 200 && full.type !== 'opaque') await cache.put(cacheKey, full);
        } catch (_) {}
      })());
    }
    return response;
  })());
});
