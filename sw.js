/* Sketchroom service worker: lets the installed app open without a connection.
   Network first, so a deploy shows up on the next load. The cache is only the fallback when offline.
   Only this site's own files are cached. Firebase and Google Fonts are left alone, so offline the app uses its local fallback. */
'use strict';
var CACHE = 'sketchroom-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./').then(function (page) { return page || Response.error(); });
      return Response.error();
    });
  }));
});
