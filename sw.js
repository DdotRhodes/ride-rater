/* Offline cache. Park wifi is bad; the app should not care. */
var CACHE = "ride-rater-v10";
var ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./data.js",
  "./live-map.js", "./live.js",
  "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"
];

/* Hosts whose responses are wait times, park hours or trip scores — facts about
   right now. Serving any of them from cache would put an old number on screen
   with a fresh look, which is the one thing the live layer must never do. The
   app has its own cache for these, and it stamps what it shows with an age. */
var LIVE_HOSTS = ["ride-rater-sync", "queue-times.com", "api.themeparks.wiki"];
function isLive(url) {
  for (var i = 0; i < LIVE_HOSTS.length; i++) if (url.indexOf(LIVE_HOSTS[i]) !== -1) return true;
  return false;
}

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    /* Only our own old caches. github.io is a shared origin — anything else
       published under the same account has its own caches, and wiping them
       would break somebody else's offline app. */
    return Promise.all(keys.map(function (k) {
      return (k !== CACHE && k.indexOf("ride-rater-") === 0) ? caches.delete(k) : null;
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  if (isLive(req.url)) return;
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then(function (hit) {
        return hit || fetch(req);
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        /* No cached copy and no network. Answer with a real response rather
           than undefined, which respondWith turns into an opaque failure the
           page cannot tell apart from a bug. */
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});
