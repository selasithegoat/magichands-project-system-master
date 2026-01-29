// Basic Service Worker for PWA compliance
const CACHE_NAME = "magichands-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through for now, but required for PWA install prompt
  event.respondWith(fetch(event.request));
});
