var CACHE_NAME = 'inventario-v3';
var urlsToCache = [
  '/inventario-inmobiliario/',
  '/inventario-inmobiliario/index.html',
  '/inventario-inmobiliario/logo.png',
  '/inventario-inmobiliario/icon-192.png',
  '/inventario-inmobiliario/icon-512.png',
  '/inventario-inmobiliario/manifest.json',
  '/inventario-inmobiliario/sw.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    }).then(function() { self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
