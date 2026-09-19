/* Ride Rater — offline-first ratings with link sharing and optional live sync.
   Your data lives in this browser first, always. Live sync is a bonus layer on
   top: turn it off and every feature still works, link sharing included. */
(function () {
  "use strict";

  var K = { me: "rr.me", ratings: "rr.ratings", peers: "rr.peers", prefs: "rr.prefs", trip: "rr.trip", skipped: "rr.skipped" };
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  // <main> is the scroll container, not the window — see the app shell in styles.css.
  function scrollMainTop() {
    var m = $("#main");
    if (m) m.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* Set when a read threw rather than simply missing. The difference matters:
     a failed read leaves us holding empty defaults, and uploading those would
     wipe the server copy of a perfectly good set of ratings. */
  var storageFailed = false;
  function load(k, d) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }
    catch (e) { storageFailed = true; return d; }
  }
  /* Returns whether the write actually landed. Callers announce success — this
     used to toast its own failure, which the caller's "Saved" toast then
     overwrote a millisecond later, so a lost rating looked like a saved one. */
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  var STORAGE_ERR = "Couldn't save — this phone's storage is full or blocked.";
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var me = load(K.me, null);
  var ratings = load(K.ratings, {});
  // Personal planning choices never alter ratings or the shared trip payload.
  var skipped = load(K.skipped, {});
  function wontDo(id) { return !!skipped[id] && !ratings[id]; }
  var peers = load(K.peers, {});
  var prefs = load(K.prefs, { extras: false, separate: false, tuck: true });
  if (typeof prefs.tuck !== "boolean") prefs.tuck = true;
  /* How you are riding today, which decides which queue's number is the one
     that matters. Express is on by default because the trip has it at Universal
     after 2pm; it does nothing at the Disney parks, where no ride reports one. */
  if (typeof prefs.express !== "boolean") prefs.express = true;
  if (typeof prefs.single !== "boolean") prefs.single = true;

  var RIDES = window.RIDES, PARKS = window.PARKS;
  var FLAGS = window.FLAGS || {};
  /* Trip flags live in their own table in data.js so the ride list stays a
     plain catalogue. Fold them onto the rides once, here. */
  (function () {
    var trip = window.TRIP_FLAGS || {};
    RIDES.forEach(function (r) {
      var t = trip[r.id];
      if (!t) { r.f = []; return; }
      r.f = t.f || [];
      if (t.n) r.note = r.note ? r.note + " · " + t.n : t.n;
    });
  })();
  function hasFlag(r, f) { return r.f.indexOf(f) !== -1; }
  var byId = {};
  RIDES.forEach(function (r) { byId[r.id] = r; });

  /* Lands group in the order they first appear in the data, so a land that is
     listed in two chunks still renders under a single heading. */
  var landOrder = {};
  RIDES.forEach(function (r) {
    var k = r.p + "|" + r.land;
    if (!(k in landOrder)) landOrder[k] = Object.keys(landOrder).length;
  });
  function landRank(r) { return landOrder[r.p + "|" + r.land]; }

  var state = {
    park: "USH", filter: "all", q: "", view: "now", rankMode: "me",
    scope: "park", cmpScope: "park", showTucked: false, editing: null, pick: null,
    /* Where you are standing, if you have told the app. Held in memory only:
       a stale position from an hour ago is worse than none, and it is the one
       piece of data here that has no business outliving the session. */
    position: null, positionAt: 0, positionSource: null, locating: false,
    planAll: false
  };

  var LIVE = window.LIVE || null;

  /* ---------------- maps ----------------
     Neither park app can be opened to a named attraction from a link. Disney
     publishes exactly one universal-link path for the Disneyland app
     (/passes/renew/), and Universal's covers its park map but no individual
     ride. So a pin in the phone's own map app is the honest answer, and it is
     the one thing guaranteed to work on both phones. Coordinates come from the
     same park feed as the ride list. */
  var GEO = window.RIDE_GEO || {};
  var IS_APPLE = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  function mapUrl(r) {
    var g = GEO[r.id];
    if (!g) return null;
    var ll = g[0] + "," + g[1];
    return IS_APPLE
      ? "https://maps.apple.com/?ll=" + ll + "&q=" + encodeURIComponent(r.n) + "&t=m"
      : "https://www.google.com/maps/search/?api=1&query=" + ll;
  }

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add("hidden"); }, 2600);
  }

  /* ---------------- share payload ---------------- */
  function b64urlFromBytes(bytes) {
    var s = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function bytesFromB64url(str) {
    var s = str.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function utf8(str) { return new TextEncoder().encode(str); }
  function unutf8(bytes) { return new TextDecoder().decode(bytes); }

  async function squeeze(bytes) {
    if (typeof CompressionStream === "undefined") return null;
    try {
      var cs = new CompressionStream("deflate-raw");
      var blob = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
      return new Uint8Array(blob);
    } catch (e) { return null; }
  }
  async function unsqueeze(bytes) {
    var ds = new DecompressionStream("deflate-raw");
    var buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }

  async function makeShareLink() {
    var r = {};
    Object.keys(ratings).forEach(function (id) {
      var v = ratings[id];
      r[id] = v.n ? [v.s, v.n] : [v.s];
    });
    var payload = { v: 1, i: me.id, n: me.name, t: Date.now(), r: r };
    var raw = utf8(JSON.stringify(payload));
    var z = await squeeze(raw);
    var token = z ? "1" + b64urlFromBytes(z) : "0" + b64urlFromBytes(raw);
    var base = location.origin + location.pathname;
    return base + "#s=" + token;
  }

  async function readShareToken(token) {
    var mode = token.charAt(0), body = bytesFromB64url(token.slice(1));
    if (mode === "1") body = await unsqueeze(body);
    return JSON.parse(unutf8(body));
  }

  /* An invite link carries a trip code rather than a payload of scores: the
     scores arrive from the server a moment later. Handled before the share
     token so a link can never be read as both. */
  function ingestTripHash() {
    var m = /[#&]trip=([A-Za-z0-9\-]+)/.exec(location.hash || "");
    if (!m) return false;
    history.replaceState(null, "", location.pathname + location.search);
    var code = normCode(m[1]);
    if (code.length < 6) { toast("That invite link looked broken."); return false; }
    if (trip && trip.code === code) { toast("You're already on that trip."); return false; }
    pendingTrip = code;
    return true;
  }
  var pendingTrip = null;

  async function ingestHash() {
    var m = /[#&]s=([A-Za-z0-9\-_]+)/.exec(location.hash || "");
    if (!m) return false;
    history.replaceState(null, "", location.pathname + location.search);
    var data;
    try { data = await readShareToken(m[1]); }
    catch (e) { toast("That share link looked broken."); return false; }
    if (!data || !data.r) { toast("That share link had nothing in it."); return false; }

    if (me && data.i === me.id) { toast("That's your own link."); return false; }

    var pr = {};
    Object.keys(data.r).forEach(function (id) {
      if (!byId[id]) return;
      var a = data.r[id];
      pr[id] = { s: a[0], n: a[1] || "" };
    });
    peers[data.i] = { name: data.n || "Someone", ratings: pr, updated: data.t || Date.now() };
    save(K.peers, peers);
    var n = Object.keys(pr).length;
    pendingWelcome = (data.n || "Someone") + "'s " + n + " rating" + (n === 1 ? "" : "s") + " added.";
    return true;
  }
  var pendingWelcome = null;

  /* ---------------- live sync ----------------
     Entirely optional. Ratings are written to this phone first and pushed
     afterwards, so a dead connection costs nothing but freshness — which
     matters, because park wifi is dreadful and the whole app is built to
     survive it. Each person writes only their own record on the server, so two
     phones can never overwrite one another's scores.

     A trip code is a capability: whoever holds it can read and write the trip.
     That is the right trade for ride scores and would be wrong for anything
     that mattered more. */

  var SYNC_BASE = "https://ride-rater-sync.netlify.app";
  var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; /* no O/0/I/1 to mistype */
  var POLL_MS = 15000;
  var PUSH_DEBOUNCE_MS = 1200;

  var trip = load(K.trip, null);
  var sync = { busy: false, dirty: false, lastOk: 0, lastErr: null, fails: 0, skip: 0 };
  var pushTimer = null, pollTimer = null;

  function newTripCode() {
    var buf = new Uint8Array(8), out = "";
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (var j = 0; j < 8; j++) buf[j] = Math.floor(Math.random() * 256);
    for (var i = 0; i < 8; i++) out += CODE_ALPHABET.charAt(buf[i] % CODE_ALPHABET.length);
    return out;
  }
  function prettyCode(c) { return c ? c.slice(0, 4) + "-" + c.slice(4) : ""; }
  function normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16); }
  function tripLink(code) { return location.origin + location.pathname + "#trip=" + code; }

  async function syncFetch(path, opts) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;
    try {
      var init = { cache: "no-store" };
      if (opts) { for (var k in opts) init[k] = opts[k]; }
      if (ctrl) init.signal = ctrl.signal;
      var res = await fetch(SYNC_BASE + path, init);
      if (!res.ok) throw new Error("http_" + res.status);
      return await res.json();
    } finally { if (timer) clearTimeout(timer); }
  }

  /* Fold everyone else's server record into the local peers map. Peers picked
     up from share links keep working — they are keyed by the same id. */
  function absorbMembers(list) {
    if (!Array.isArray(list)) return false;
    var changed = false;
    list.forEach(function (m) {
      if (!m || !m.id) return;
      if (me && m.id === me.id) return;
      var prev = peers[m.id];
      if (prev && prev.updated === m.updated && prev.name === m.name) return;
      peers[m.id] = {
        name: m.name || "Someone",
        ratings: m.ratings || {},
        updated: m.updated || Date.now()
      };
      changed = true;
    });
    if (changed) save(K.peers, peers);
    return changed;
  }

  /* These record the outcome but deliberately do not render. Rendering while
     sync.busy is still true paints "Syncing…" as the *final* state and nothing
     redraws afterwards, so the status line sticks there forever. The redraw
     happens in the finally block below, after busy is cleared. */
  function syncOk() {
    sync.lastOk = Date.now();
    sync.lastErr = null;
    sync.fails = 0;
    sync.skip = 0;
  }
  function syncFailed(e) {
    sync.fails++;
    sync.lastErr = (e && e.message) || "failed";
    /* Back off so a dead connection is not hammered every 15s all day. */
    sync.skip = Math.min(sync.fails, 8);
  }
  /* Redraw with the true post-request state, and if a rating landed while the
     request was in flight, send it promptly instead of waiting out the poll —
     pushSoon's timer already fired and found us busy. */
  function syncSettled(changed) {
    sync.busy = false;
    if (sync.dirty && !pushTimer && !sync.lastErr) {
      pushTimer = setTimeout(function () { pushTimer = null; pushNow(); }, 400);
    }
    if (changed) renderAll(); else renderSync();
  }

  async function pushNow() {
    if (!trip || !me || sync.busy) return;
    sync.busy = true;
    sync.dirty = false;
    renderSync();
    var changed = false;
    try {
      var payload = {};
      Object.keys(ratings).forEach(function (id) {
        var v = ratings[id];
        payload[id] = v.n ? { s: v.s, n: v.n } : { s: v.s };
      });
      var data = await syncFetch("/t/" + trip.code + "/" + me.id, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: me.name, ratings: payload })
      });
      changed = absorbMembers(data && data.members);
      syncOk();
    } catch (e) {
      sync.dirty = true; /* try again on the next tick */
      syncFailed(e);
    } finally {
      syncSettled(changed);
    }
  }

  async function pullNow() {
    if (!trip || sync.busy) return;
    sync.busy = true;
    renderSync();
    var changed = false;
    try {
      var data = await syncFetch("/t/" + trip.code);
      changed = absorbMembers(data && data.members);
      syncOk();
    } catch (e) {
      syncFailed(e);
    } finally {
      syncSettled(changed);
    }
  }

  function pushSoon() {
    if (!trip) return;
    sync.dirty = true;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushTimer = null; pushNow(); }, PUSH_DEBOUNCE_MS);
    renderSync();
  }

  function syncTick() {
    if (!trip || document.hidden) return;
    if (sync.skip > 0) { sync.skip--; return; }
    if (sync.dirty) pushNow(); else pullNow();
  }

  function startSyncLoop() {
    if (pollTimer) clearInterval(pollTimer);
    if (!trip) return;
    pollTimer = setInterval(syncTick, POLL_MS);
  }

  function joinTrip(code, announce) {
    trip = { code: code, joined: Date.now() };
    if (!save(K.trip, trip)) {
      trip = null;
      toast(STORAGE_ERR);
      renderSync();
      return;
    }
    sync.fails = 0; sync.skip = 0; sync.lastErr = null;
    startSyncLoop();
    renderSync();
    if (me) pushNow();
    if (announce) toast(announce);
  }

  function leaveTrip() {
    trip = null;
    try { localStorage.removeItem(K.trip); } catch (e) { /* private mode */ }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    renderSync();
  }

  function syncStatusLine() {
    if (!trip) return "";
    if (sync.busy) return "Syncing…";
    /* A failure outranks "changes waiting": pending changes are the normal
       consequence of the failure, and showing only them hides the problem. */
    if (sync.lastErr) {
      return (sync.lastOk
        ? "Offline — last synced " + ago(sync.lastOk) + ". Your ratings are safe on this phone."
        : "Can't reach the server. Your ratings are safe on this phone.") +
        (sync.dirty ? " Changes are waiting to send." : "");
    }
    if (sync.dirty) return "Changes waiting to send…";
    if (sync.lastOk) return "Synced " + ago(sync.lastOk) + ".";
    return "Waiting for first sync…";
  }

  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 10) return "just now";
    if (s < 60) return s + "s ago";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    return Math.round(m / 60) + "h ago";
  }

  /* ---------------- helpers ---------------- */
  function peerList() {
    return Object.keys(peers).map(function (id) {
      return { id: id, name: peers[id].name, ratings: peers[id].ratings };
    });
  }
  function firstPeer() { var p = peerList(); return p.length ? p[0] : null; }

  function visible(r) {
    /* A separate-ticket entry answers to its own toggle and nothing else. Every
       Horror Nights house is typed as a walk-through, so making them obey the
       extras toggle as well meant switching on "separate-ticket events" and
       still being shown an empty list. */
    if (r.tag) return !!prefs.separate;
    /* A must-do show — WaterWorld, say — is the last thing that should hide
       itself behind a preference. Everything else obeys the extras toggle. */
    if (r.type !== "ride" && !prefs.extras && !hasFlag(r, "must")) return false;
    return true;
  }
  function parkRides(park) {
    return RIDES.filter(function (r) { return r.p === park && visible(r); });
  }
  /* Asking for the flagged rides means asking for all of them, shows included;
     the separate-ticket toggle still applies. */
  function flaggedRides(park, flag) {
    return RIDES.filter(function (r) {
      return r.p === park && hasFlag(r, flag) && (visible(r) || !r.tag);
    });
  }
  function ratedCount(park) {
    var list = parkRides(park).filter(function (r) { return !wontDo(r.id); }), n = 0;
    list.forEach(function (r) { if (ratings[r.id]) n++; });
    return { n: n, total: list.length };
  }
  function typeLabel(t) {
    return { show: "Show", walk: "Walk-through", play: "Play area" }[t] || "";
  }
  function shortName(s) { return String(s || "").split(" ")[0].slice(0, 8); }
  function badges(r) {
    return r.f.map(function (f) {
      var d = FLAGS[f];
      return d ? '<span class="badge ' + d.cls + '">' + esc(d.label) + "</span>" : "";
    }).join("");
  }

  /* ---------------- rendering: rides ---------------- */
  function renderParkTabs() {
    var el = $("#parkTabs");
    el.innerHTML = PARKS.map(function (p) {
      var c = ratedCount(p.key);
      return '<button class="ptab' + (p.key === state.park ? " active" : "") + '" data-park="' + p.key + '">' +
        esc(p.short) + ' <span class="muted">' + c.n + "/" + c.total + "</span></button>";
    }).join("");
    $$("#parkTabs .ptab").forEach(function (b) {
      b.onclick = function () {
        state.park = b.dataset.park;
        /* Universal and the Disney pair are fetched separately, so switching
           between them needs data the app has not asked for yet. */
        if (LIVE && liveStarted) LIVE.refresh(state.park);
        renderAll();
        scrollMainTop();
      };
    });
  }

  function renderProgress() {
    var all = RIDES.filter(function (r) { return visible(r) && !wontDo(r.id); }), n = 0;
    all.forEach(function (r) { if (ratings[r.id]) n++; });
    $("#progressCount").textContent = n;
    $("#progressWrap").innerHTML = '<span id="progressCount">' + n + '</span><span class="muted">/' + all.length + " rated</span>";
  }

  function itemHtml(r, peer, withLand) {
    var mine = ratings[r.id];
    var theirs = peer && peer.ratings[r.id];
    var right;
    if (peer) {
      right = '<div class="dual">' +
        '<div class="mini' + (mine ? "" : " empty") + '">' + (mine ? mine.s : "–") + '<span class="who">you</span></div>' +
        '<div class="mini' + (theirs ? "" : " empty") + '">' + (theirs ? theirs.s : "–") + '<span class="who">' + esc(shortName(peer.name)) + "</span></div></div>";
    } else {
      right = '<div class="score' + (mine ? " set" : "") + '">' + (mine ? mine.s : "–") + "</div>";
    }
    var sub = [];
    if (wontDo(r.id)) sub.push("Won’t do");
    if (withLand) sub.push(r.land);
    if (typeLabel(r.type)) sub.push(typeLabel(r.type));
    if (r.note) sub.push(r.note);
    if (mine && mine.n) sub.push("“" + mine.n + "”");
    return '<button class="item' + (hasFlag(r, "closed") ? " closed" : "") + '" data-id="' + r.id + '">' +
      '<div class="item-main">' +
      '<div class="item-name">' + esc(r.n) + badges(r) + "</div>" +
      (sub.length ? '<div class="item-sub">' + esc(sub.join(" · ")) + "</div>" : "") +
      "</div>" + waitChip(r) + right + "</button>";
  }
  function groupedHtml(list, peer) {
    var html = "", land = null;
    list.forEach(function (r) {
      if (r.land !== land) {
        land = r.land;
        html += '<div class="landhead">' + esc(land) + "</div>";
      }
      html += itemHtml(r, peer, false);
    });
    return html;
  }

  /* "What next" answers the only question you actually ask in a queue line.
     Time-boxed things lead: at Universal a must-do that dies when the day park
     shuts at 6pm cannot be rescheduled, so it outranks everything. */
  function nextRank(r) {
    if (hasFlag(r, "must") && hasFlag(r, "day")) return 0;
    if (hasFlag(r, "must")) return 1;
    if (hasFlag(r, "day")) return 2;
    return 3;
  }

  function renderList() {
    var el = $("#list");
    var q = state.q.trim().toLowerCase();
    var isNext = state.filter === "next";
    var flagFilter = FLAGS[state.filter] ? state.filter : null;
    var pool = flagFilter ? flaggedRides(state.park, flagFilter) : parkRides(state.park);
    var list = pool.filter(function (r) {
      if (q && r.n.toLowerCase().indexOf(q) === -1 && r.land.toLowerCase().indexOf(q) === -1) return false;
      if (state.filter === "todo" && (ratings[r.id] || wontDo(r.id))) return false;
      if (state.filter === "wont" && !wontDo(r.id)) return false;
      if (state.filter === "done" && !ratings[r.id]) return false;
      if (state.filter === "rides" && r.type !== "ride") return false;
      if (isNext) {
        /* Already rated, written off, or not running: not a candidate. Shows
           are noise here unless they're on the must list. */
        if (ratings[r.id] || wontDo(r.id)) return false;
        if (hasFlag(r, "closed") || hasFlag(r, "skip")) return false;
        if (r.type !== "ride" && !hasFlag(r, "must")) return false;
      }
      return true;
    });
    if (isNext) {
      list.sort(function (a, b) { return (nextRank(a) - nextRank(b)) || (landRank(a) - landRank(b)); });
    } else {
      list.sort(function (a, b) { return landRank(a) - landRank(b); });
    }

    /* Rated rides drop out of the walking list into a fold at the bottom —
       once you've scored something it is just taking up screen. A search is an
       explicit request for a specific ride, so it overrides the fold. */
    var tucked = [];
    if (prefs.tuck && !q && !isNext && state.filter !== "done" && state.filter !== "todo") {
      var keep = [];
      list.forEach(function (r) { (ratings[r.id] ? tucked : keep).push(r); });
      list = keep;
    }

    var peer = firstPeer();
    var html = "";

    if (list.length) {
      html += isNext
        ? list.map(function (r) { return itemHtml(r, peer, true); }).join("")
        : groupedHtml(list, peer);
    } else if (tucked.length) {
      html += '<div class="empty-note">Everything here is rated. Nice work.</div>';
    } else {
      html += '<div class="empty-note">Nothing here.<br>Try a different filter, or turn on shows and extras under More.</div>';
    }

    if (tucked.length) {
      html += '<button class="tuckhead" id="tuckToggle">' +
        '<span class="caret">' + (state.showTucked ? "▾" : "▸") + "</span>" +
        "Rated · " + tucked.length +
        '<span class="muted small">' + (state.showTucked ? "hide" : "show") + "</span></button>";
      if (state.showTucked) html += groupedHtml(tucked, peer);
    }

    el.innerHTML = html;
    $$("#list .item").forEach(function (b) {
      b.onclick = function () { openSheet(b.dataset.id); };
    });
    var tt = $("#tuckToggle");
    if (tt) tt.onclick = function () { state.showTucked = !state.showTucked; renderList(); };
  }

  /* ---------------- rendering: ranking ---------------- */
  function renderRank() {
    var el = $("#rankList");
    var peer = firstPeer();
    var rows = [];

    /* Scoped to the park you're standing in by default. On Sunday at
       Disneyland, Friday's Universal scores are not part of the decision. */
    var raters = 1 + peerList().length;
    RIDES.filter(function (r) {
      return visible(r) && (state.scope === "all" || r.p === state.park);
    }).forEach(function (r) {
      var mine = ratings[r.id];
      if (state.rankMode === "me") {
        if (mine) rows.push({ r: r, v: mine.s, label: null, k: 1 });
      } else {
        var vals = [], who = [];
        if (mine) { vals.push(mine.s); who.push("you " + mine.s); }
        peerList().forEach(function (p) {
          var t = p.ratings[r.id];
          if (t) { vals.push(t.s); who.push(shortName(p.name) + " " + t.s); }
        });
        if (vals.length) {
          var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
          rows.push({ r: r, v: avg, label: who.join(" · "), k: vals.length });
        }
      }
    });

    if (!rows.length) {
      el.innerHTML = '<div class="empty-note">No ratings here yet.<br>' +
        (state.scope === "park" ? "Go ride something, or switch to all parks." : "Go ride something.") + "</div>";
      return;
    }
    rows.sort(function (a, b) { return b.v - a.v; });

    var parkName = {};
    PARKS.forEach(function (p) { parkName[p.key] = p.short; });

    el.innerHTML = rows.map(function (row, i) {
      var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
      var v = state.rankMode === "both" ? (Math.round(row.v * 10) / 10) : row.v;
      var sub = row.label || parkName[row.r.p];
      /* One person's 10 is weaker evidence than two people agreeing on 9. Say
         how many of you it rests on rather than presenting an average of one. */
      var tally = (state.rankMode === "both" && raters > 1)
        ? '<span class="tally' + (row.k === raters ? " full" : "") + '">' + row.k + "/" + raters + "</span>"
        : "";
      return '<div class="rankrow"><div class="rankpos' + (i < 3 ? " top" : "") + '">' + medal + "</div>" +
        '<div class="item-main"><div class="item-name">' + esc(row.r.n) + tally + "</div>" +
        '<div class="item-sub">' + esc(sub) + "</div></div>" +
        '<div class="score set">' + v + "</div></div>";
    }).join("");
    if (state.rankMode === "both" && !peer) {
      el.innerHTML = '<div class="empty-note">Nobody else has shared their ratings with you yet.<br>Swap links on the Compare tab.</div>' + el.innerHTML;
    }
  }

  /* ---------------- rendering: compare ---------------- */
  function renderCompare() {
    var el = $("#compareBody");
    var chips = $("#cmpScopeChips");
    var peer = firstPeer();
    if (chips) chips.classList.toggle("hidden", !peer);
    if (!peer) {
      el.innerHTML = '<div class="empty-note">Join the same trip and your scores appear beside each other by themselves. Or open their one-off link — note that sending yours does not bring theirs back.</div>';
      return;
    }
    var both = [], onlyMe = [], onlyThem = [];
    RIDES.filter(function (r) {
      return state.cmpScope === "all" || r.p === state.park;
    }).forEach(function (r) {
      var a = ratings[r.id], b = peer.ratings[r.id];
      if (a && b) both.push({ r: r, a: a.s, b: b.s, d: Math.abs(a.s - b.s) });
      else if (a) onlyMe.push({ r: r, a: a.s });
      else if (b) onlyThem.push({ r: r, b: b.s });
    });
    both.sort(function (x, y) { return y.d - x.d; });

    var html = "";
    if (both.length) {
      var agree = both.filter(function (x) { return x.d === 0; }).length;
      var avgDiff = both.reduce(function (s, x) { return s + x.d; }, 0) / both.length;
      html += '<div class="card"><h2>You vs ' + esc(peer.name) + "</h2>" +
        '<div class="stats"><div class="stat"><div class="v">' + both.length + '</div><div class="k">Both rated</div></div>' +
        '<div class="stat"><div class="v">' + agree + '</div><div class="k">Exact matches</div></div>' +
        '<div class="stat"><div class="v">' + (Math.round(avgDiff * 10) / 10) + '</div><div class="k">Avg gap</div></div>' +
        '<div class="stat"><div class="v">' + (both[0].d) + '</div><div class="k">Biggest gap</div></div></div></div>';

      html += '<div class="sectionhead">Where you disagree most</div>';
      html += both.map(function (x) {
        var cls = x.d === 0 ? "same" : x.d >= 3 ? "big" : "";
        return '<div class="cmprow"><div class="nm">' + esc(x.r.n) +
          '<div class="sub">' + esc(x.r.land) + "</div></div>" +
          '<div class="pill">' + x.a + "</div><div class=\"pill\">" + x.b + "</div>" +
          '<div class="diff ' + cls + '">' + (x.d === 0 ? "match" : "±" + x.d) + "</div></div>";
      }).join("");
      html = html.replace('<div class="sectionhead">Where you disagree most</div>',
        '<div class="sectionhead">Where you disagree most &nbsp;<span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">you · ' + esc(shortName(peer.name)) + "</span></div>");
    }
    if (onlyMe.length) {
      html += '<div class="sectionhead">Only you rated</div>' + onlyMe.map(function (x) {
        return '<div class="cmprow"><div class="nm">' + esc(x.r.n) + '<div class="sub">' + esc(x.r.land) + '</div></div><div class="pill">' + x.a + "</div></div>";
      }).join("");
    }
    if (onlyThem.length) {
      html += '<div class="sectionhead">Only ' + esc(peer.name) + " rated</div>" + onlyThem.map(function (x) {
        return '<div class="cmprow"><div class="nm">' + esc(x.r.n) + '<div class="sub">' + esc(x.r.land) + '</div></div><div class="pill">' + x.b + "</div></div>";
      }).join("");
    }
    if (!html) {
      var pn = "";
      PARKS.forEach(function (p) { if (p.key === state.park) pn = p.short; });
      html = '<div class="empty-note">Neither of you has rated anything at ' + esc(pn) +
        " yet.<br>Switch to all parks below to see the rest.</div>";
    }
    el.innerHTML = html;
  }

  /* ---------------- rendering: stats ---------------- */
  function renderStats() {
    var mineIds = Object.keys(ratings);
    var vals = mineIds.map(function (id) { return ratings[id].s; });
    var avg = vals.length ? (vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0;
    var perPark = {};
    PARKS.forEach(function (p) { perPark[p.key] = []; });
    mineIds.forEach(function (id) {
      var r = byId[id];
      if (r) perPark[r.p].push(ratings[id].s);
    });
    var bestPark = "—", bestAvg = -1;
    PARKS.forEach(function (p) {
      var a = perPark[p.key];
      if (a.length) {
        var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
        if (m > bestAvg) { bestAvg = m; bestPark = p.short; }
      }
    });
    var top = "—";
    if (mineIds.length) {
      var bestId = mineIds.reduce(function (a, b) { return ratings[a].s >= ratings[b].s ? a : b; });
      top = byId[bestId] ? byId[bestId].n : "—";
    }
    $("#statsBody").innerHTML =
      '<div class="stat"><div class="v">' + mineIds.length + '</div><div class="k">Rated</div></div>' +
      '<div class="stat"><div class="v">' + (vals.length ? (Math.round(avg * 10) / 10) : "—") + '</div><div class="k">Your average</div></div>' +
      '<div class="stat"><div class="v" style="font-size:15px;line-height:1.3">' + esc(top) + '</div><div class="k">Your favourite</div></div>' +
      '<div class="stat"><div class="v" style="font-size:15px;line-height:1.3">' + esc(bestPark) + '</div><div class="k">Best park so far</div></div>';
  }

  /* ---------------- rendering: now ----------------
     The whole live layer is optional. Every function below has to survive
     window.LIVE being absent, every fetch having failed, and the park being
     shut, without ever showing a number it cannot stand behind. */

  function fmtClock(ms) {
    if (!ms) return "";
    var d = new Date(ms);
    var h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? "pm" : "am";
    h = h % 12; if (h === 0) h = 12;
    return h + (m ? ":" + (m < 10 ? "0" : "") + m : "") + ap;
  }
  function fmtMins(n) {
    if (n === null || n === undefined) return "—";
    if (n <= 0) return "Walk on";
    if (n < 60) return n + " min";
    var h = Math.floor(n / 60), m = n % 60;
    return h + "h" + (m ? " " + m + "m" : "");
  }
  /* Ages are stated, never rounded away. "2 min ago" and "an hour ago" have to
     look different at a glance or the freshness warning is decoration. */
  function fmtAge(ms) {
    if (ms === null || ms === undefined) return "unknown";
    var m = Math.round(ms / 60000);
    if (m < 1) return "just now";
    if (m === 1) return "1 min ago";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    return h === 1 ? "an hour ago" : h + "h ago";
  }
  function parkName(key) {
    for (var i = 0; i < PARKS.length; i++) if (PARKS[i].key === key) return PARKS[i].short;
    return "This park";
  }
  /* Colour means "how long is this queue". A show has no queue — 45 minutes
     until the next performance is not a bad thing, and painting it red would
     say it was. Those get their own neutral colour. */
  function waitClass(n, kind) {
    if (kind === "show") return "w-show";
    if (n === null || n === undefined) return "w-unknown";
    if (n <= 15) return "w-short";
    if (n <= 40) return "w-mid";
    return "w-long";
  }

  /* The one number to show against a ride in a list, plus what kind of queue it
     is. Never guesses: no data means no chip. */
  function waitChip(r) {
    if (!LIVE) return "";
    var rec = LIVE.ride(r.id);
    if (!rec) return "";
    if (rec.status === "REFURBISHMENT") return '<span class="wait w-unknown">Refurb</span>';
    if (rec.status === "DOWN") return '<span class="wait w-down">Down</span>';
    var kind = "", n = null;
    if (prefs.express && rec.express !== null) { n = rec.express; kind = "exp"; }
    else if (prefs.single && rec.single !== null && (rec.standby === null || rec.single < rec.standby)) { n = rec.single; kind = "sr"; }
    else n = rec.standby;
    if (n === null) {
      if (rec.status === "CLOSED") return '<span class="wait w-unknown">Closed</span>';
      return "";
    }
    return '<span class="wait ' + waitClass(n) + '">' + esc(fmtMins(n)) +
      (kind ? '<i>' + (kind === "exp" ? "EXP" : "SR") + "</i>" : "") + "</span>";
  }

  function renderLiveBar() {
    var el = $("#liveBar");
    if (!el) return;
    if (!LIVE) { el.innerHTML = '<div class="live-warn">Live waits are unavailable in this build.</div>'; return; }
    var f = LIVE.freshness(state.park);
    var cls = "live-ok", msg;

    if (f.busy && !f.newest) msg = "Fetching live wait times…";
    else if (!f.newest) {
      cls = "live-bad";
      msg = f.anyOk
        ? "No wait times for this park yet."
        : "Couldn't reach the wait-time services. Nothing here is live.";
    } else {
      /* Say where the data came from and exactly how old it is. A wrong number
         presented confidently is the only genuinely harmful thing this screen
         could do. */
      msg = "Waits from " + fmtAge(f.age);
      if (f.useless) { cls = "live-bad"; msg = "Last waits were " + fmtAge(f.age) + " — treat them as history, not fact."; }
      else if (f.stale) { cls = "live-warn"; msg = "Waits from " + fmtAge(f.age) + " — couldn't refresh since."; }
      if (f.tp.err && f.qt.err) { cls = "live-bad"; msg += " Both feeds are unreachable."; }
      else if (state.park === "USH" && f.qt.err) { cls = "live-warn"; msg += " Universal's wait feed is down."; }
      else if (state.park !== "USH" && f.tp.err) { cls = "live-warn"; msg += " Disney's wait feed is down."; }
    }
    el.className = "livebar " + cls;
    el.innerHTML = '<span class="live-msg">' + esc(msg) + "</span>" +
      '<button class="btn tiny" id="liveRefresh"' + (f.busy ? " disabled" : "") + ">" +
      (f.busy ? "…" : "Refresh") + "</button>";
    var b = $("#liveRefresh");
    if (b) b.onclick = function () { LIVE.refresh(state.park, { force: true }); };
  }

  function renderHoursBar() {
    var el = $("#hoursBar");
    if (!el) return;
    var h = LIVE && LIVE.hours(state.park);
    if (!h) { el.className = "hoursbar hidden"; el.textContent = ""; return; }
    var bits = [];
    /* A closed park is the first thing to say, not a footnote. Otherwise a full
       screen of zero-minute waits reads as "everything is a walk-on". */
    if (h.open) {
      if (h.operating) bits.push("Park until " + fmtClock(h.operating.end));
    } else if (h.opensAt) {
      bits.push("Closed — opens " + fmtClock(h.opensAt));
      if (h.operating && h.opensAt !== h.operating.start) bits.push("park until " + fmtClock(h.operating.end));
    } else {
      var last = h.ticketed ? h.ticketed.end : (h.operating ? h.operating.end : null);
      bits.push(last ? "Closed — shut at " + fmtClock(last) : "Closed for the day");
    }
    /* The ticketed block is still worth stating while the day park is open: it
       is the thing that decides whether a ride is worth saving for later. */
    if (h.ticketed && (h.open || h.opensAt)) {
      bits.push((h.ticketed.desc || "Ticketed event") + " " +
        fmtClock(h.ticketed.start) + "–" + fmtClock(h.ticketed.end));
    }
    el.className = "hoursbar" + (h.open ? "" : " shut");
    el.textContent = bits.join(" · ");
  }

  var BLOCK_LABEL = {
    later: "Not open yet", done: "Closed for the day", shut: "Not running right now",
    down: "Down right now", "too-late": "Not enough time left"
  };

  var WAIT_KIND_LABEL = {
    express: " Express", single: " single rider", show: " until it starts", standby: " wait"
  };
  /* The sub-line under a name. `withLand` is off on the big card, which already
     prints the land above it — otherwise it reads "Upper Lot · Upper Lot". */
  function planLine(it, withLand) {
    var bits = [];
    if (it.walk !== null) bits.push(it.walk + " min walk");
    else if (withLand) bits.push(it.ride.land);
    if (it.wait !== null) bits.push(fmtMins(it.wait) + (WAIT_KIND_LABEL[it.waitKind] || " wait"));
    return bits.join(" · ");
  }

  function planRow(it) {
    var r = it.ride;
    var right = it.blocked
      ? '<span class="wait w-unknown">' + esc(it.blocked === "later" && it.opensIn ? "in " + fmtMins(it.opensIn) : BLOCK_LABEL[it.blocked]) + "</span>"
      : '<span class="wait ' + waitClass(it.wait, it.waitKind) + '">' + esc(fmtMins(it.wait)) + "</span>";
    return '<button class="item planrow" data-id="' + r.id + '">' +
      '<div class="item-main"><div class="item-name">' + esc(r.n) + badges(r) + "</div>" +
      '<div class="item-sub">' + esc(planLine(it, true)) + "</div></div>" + right + "</button>";
  }

  function renderNow() {
    var el = $("#nowBody");
    if (!el) return;
    renderLiveBar();
    renderHoursBar();
    $("#chipExpress").classList.toggle("active", !!prefs.express);
    $("#chipSingle").classList.toggle("active", !!prefs.single);
    $("#chipExpress").classList.toggle("hidden", state.park !== "USH");
    var lb = $("#chipLocate");
    lb.classList.toggle("active", !!state.position);
    lb.textContent = state.locating ? "📍 Finding you…"
      : state.position ? "📍 " + (state.positionSource === "gps" ? "Using your location" : "Near " + state.positionSource)
      : "📍 I'm here";

    if (!LIVE) { el.innerHTML = '<div class="empty-note">Live planning is unavailable in this build.</div>'; return; }

    var list = LIVE.plan({
      park: state.park, express: prefs.express, single: prefs.single,
      rated: ratings, position: state.position
    }).filter(function (it) { return !wontDo(it.ride.id); });

    if (!list.length) {
      el.innerHTML = '<div class="empty-note">Nothing left to do here — everything is rated, marked won’t do, or not running.</div>';
      return;
    }

    var open = list.filter(function (x) { return !x.blocked; });
    var shut = list.filter(function (x) { return x.blocked; });
    var f = LIVE.freshness(state.park);
    var html = "";

    var hrs = LIVE.hours(state.park);
    if (!open.length) {
      /* Distinguish the two reasons the list can be empty. "The park is shut"
         is information; "nothing is running" on an open park is a warning. */
      html += '<div class="empty-note">' +
        (hrs && !hrs.open
          ? esc(parkName(state.park)) + " is closed right now." +
            (hrs.opensAt ? "<br>Gates open at " + esc(fmtClock(hrs.opensAt)) + "." : "")
          : "Nothing here is running right now.<br>" +
            (shut.length ? "Everything left is closed, down, or not open yet." : "")) +
        "</div>";
    } else {
      var top = open[0];
      /* A recommendation built on data this old is a guess. Say so on the card
         itself rather than only in the status bar above it, which is exactly the
         thing you scroll past. */
      var caveat = f.useless
        ? "Picked from wait times " + fmtAge(f.age) + " — check the board when you get there."
        : f.stale ? "Based on waits " + fmtAge(f.age) + "." : null;

      html += '<div class="sectionhead">Do this next</div>';
      html += '<div class="pickcard" data-id="' + top.ride.id + '">' +
        '<div class="pick-name">' + esc(top.ride.n) + "</div>" +
        '<div class="pick-meta">' + esc([top.ride.land, planLine(top, false)].filter(Boolean).join(" · ")) + "</div>" +
        '<div class="pick-wait ' + waitClass(top.wait, top.waitKind) + '">' + esc(fmtMins(top.wait)) + "</div>" +
        (top.reasons.length ? '<ul class="pick-why">' + top.reasons.map(function (x) {
          return "<li>" + esc(x) + "</li>";
        }).join("") + "</ul>" : "") +
        (caveat ? '<div class="pick-caveat">' + esc(caveat) + "</div>" : "") +
        '<div class="row gap pick-actions">' +
        '<button class="btn primary grow" data-act="rate">Rate it</button>' +
        (mapUrl(top.ride) ? '<a class="btn" data-act="map" target="_blank" rel="noopener" href="' + esc(mapUrl(top.ride)) + '">Where</a>' : "") +
        "</div></div>";

      var SHOWN = 8;
      var rest = open.slice(1, state.planAll ? open.length : SHOWN);
      if (rest.length) {
        html += '<div class="sectionhead">Then</div>' + rest.map(planRow).join("");
        var hidden = open.length - SHOWN;
        if (!state.planAll && hidden > 0) {
          html += '<button class="tuckhead" id="planMore"><span class="caret">▸</span>' +
            hidden + " more you could do<span class=\"muted small\">show</span></button>";
        }
      }
    }

    if (shut.length) {
      html += '<button class="tuckhead" id="shutToggle"><span class="caret">' + (state.showShut ? "▾" : "▸") + "</span>" +
        "Not right now · " + shut.length + '<span class="muted small">' + (state.showShut ? "hide" : "show") + "</span></button>";
      if (state.showShut) html += shut.map(planRow).join("");
    }

    /* Queue-Times asks for this in exchange for the free feed, and Universal's
       numbers here are entirely theirs. */
    if (state.park === "USH") {
      html += '<p class="fineprint center"><a href="https://queue-times.com/en-US" target="_blank" rel="noopener">Powered by Queue-Times.com</a></p>';
    }

    el.innerHTML = html;
    var card = el.querySelector(".pickcard");
    if (card) {
      card.querySelector('[data-act="rate"]').onclick = function () { openSheet(card.dataset.id); };
      card.onclick = function (e) {
        if (e.target.closest("button") || e.target.closest("a")) return;
        openSheet(card.dataset.id);
      };
    }
    $$("#nowBody .planrow").forEach(function (b) {
      b.onclick = function () { openSheet(b.dataset.id); };
    });
    var more = $("#planMore");
    if (more) more.onclick = function () { state.planAll = true; renderNow(); };
    var st = $("#shutToggle");
    if (st) st.onclick = function () { state.showShut = !state.showShut; renderNow(); };
  }

  /* Live detail for one ride, shown in the rating sheet. Lightning Lane is the
     place to be most careful: the feed says what the park is handing out right
     now, which is not the same as what you are holding. Word it as the feed's
     claim, never as advice about your own passes. */
  function renderSheetLive(r) {
    var el = $("#sheetLive");
    if (!el) return;
    var rec = LIVE && LIVE.ride(r.id);
    if (!rec) { el.classList.add("hidden"); el.innerHTML = ""; return; }

    var rows = [];
    if (rec.standby !== null) rows.push(["Standby", fmtMins(rec.standby)]);
    if (rec.single !== null) rows.push(["Single rider", fmtMins(rec.single)]);
    if (rec.express !== null) rows.push(["Express", fmtMins(rec.express)]);
    if (rec.standby === null && rec.single === null && rec.express === null && rec.status) {
      rows.push(["Status", rec.status.charAt(0) + rec.status.slice(1).toLowerCase()]);
    }
    if (rec.showtimes && rec.showtimes.length) {
      var next = rec.showtimes.map(function (s) { return Date.parse(s.startTime || ""); })
        .filter(function (t) { return t && t > Date.now(); }).sort();
      if (next.length) rows.push(["Next show", fmtClock(next[0])]);
    }

    var html = rows.length
      ? '<div class="livegrid">' + rows.map(function (x) {
          return '<div><span class="k">' + esc(x[0]) + '</span><span class="v">' + esc(x[1]) + "</span></div>";
        }).join("") + "</div>"
      : "";

    if (rec.ll && rec.ll.state === "AVAILABLE" && rec.ll.start) {
      html += '<div class="llnote">Lightning Lane being handed out for ' +
        esc(fmtClock(Date.parse(rec.ll.start))) + "–" + esc(fmtClock(Date.parse(rec.ll.end))) +
        '. <span class="muted">That is what the park is distributing now — this app does not know what passes you hold.</span></div>';
    } else if (rec.ll && rec.ll.state) {
      html += '<div class="llnote">Lightning Lane: ' + esc(String(rec.ll.state).toLowerCase()) +
        '. <span class="muted">From the park feed; the app cannot see your own passes.</span></div>';
    }
    if (rec.paidLL && rec.paidLL.state === "AVAILABLE") {
      html += '<div class="llnote">Individual Lightning Lane on sale' +
        (rec.paidLL.price ? " at " + esc(rec.paidLL.price) : "") + ".</div>";
    }

    var age = LIVE.ageOf(rec);
    html += '<div class="liveage">Updated ' + esc(fmtAge(age)) +
      " · " + esc(rec.from.map(function (s) { return s === "tp" ? "ThemeParks.wiki" : "Queue-Times"; }).join(" + ")) + "</div>";

    el.innerHTML = html;
    el.classList.remove("hidden");
  }

  /* An honest account of what the app can and cannot see. The failure this is
     here to prevent is a must-do that quietly has no live source at all. */
  function renderCoverage() {
    var el = $("#coverageBody");
    if (!el) return;
    if (!LIVE) { el.innerHTML = '<p class="muted small">Live data is unavailable in this build.</p>'; return; }
    /* Scoped to the park you are in. Only one park's feeds are loaded at a
       time, so an unscoped view would list every Disney must-do as missing
       while you are standing in Universal, which is alarming and wrong. */
    var c = LIVE.coverage(state.park);
    var f = LIVE.freshness(state.park);
    var html = '<p class="muted small">For ' + esc(parkName(state.park)) + ".</p>" +
      '<div class="stats">' +
      '<div class="stat"><div class="v">' + c.mapped + "/" + c.total + '</div><div class="k">Matched to a feed</div></div>' +
      '<div class="stat"><div class="v">' + c.live + '</div><div class="k">With live data now</div></div>' +
      '<div class="stat"><div class="v" style="font-size:15px;line-height:1.3">' + esc(fmtAge(f.age)) + '</div><div class="k">Freshest reading</div></div>' +
      "</div>";

    if (c.mustWithoutLive.length) {
      html += '<div class="live-bad pad-sm">No live data for these must-dos: ' +
        esc(c.mustWithoutLive.map(function (r) { return r.n; }).join(", ")) + "</div>";
    }
    if (c.unmapped.length) {
      html += '<p class="muted small">Not carried by either feed: ' +
        esc(c.unmapped.map(function (r) { return r.n; }).join(", ")) + "</p>";
    }
    /* The other direction. A feed carrying an attraction this app has never
       heard of is not an error, but it is the only way to find out that the
       catalogue has fallen behind — so it is shown rather than swallowed. */
    var orph = (c.orphans.qt || []).concat(c.orphans.tp || []);
    if (orph.length) {
      var seen = {}, names = [];
      orph.forEach(function (o) { if (!seen[o.name]) { seen[o.name] = 1; names.push(o.name); } });
      html += '<p class="muted small">The feeds list ' + names.length +
        " attraction" + (names.length === 1 ? "" : "s") + " this app does not have: " +
        esc(names.join(", ")) + ".</p>";
    }
    if (c.drift.length) {
      html += '<p class="muted small">A feed has renamed ' + c.drift.length +
        " attraction" + (c.drift.length === 1 ? "" : "s") + " since this app was built: " +
        esc(c.drift.slice(0, 4).map(function (d) { return d.expected + " → " + d.got; }).join("; ")) +
        ". Waits still match by id, so they are correct.</p>";
    }
    html += '<p class="muted small">Disney waits, single rider, Lightning Lane windows and park hours come from ' +
      '<a href="https://api.themeparks.wiki/" target="_blank" rel="noopener">ThemeParks.wiki</a>. ' +
      'Universal waits, including the Horror Nights houses and their Express lines, are ' +
      '<a href="https://queue-times.com/en-US" target="_blank" rel="noopener">Powered by Queue-Times.com</a>. ' +
      'Neither feed knows which Lightning Lanes you hold, and this app never guesses at them.</p>';
    el.innerHTML = html;
  }

  /* "Day only" only means something at Universal, where the day park shuts at
     6pm and the HHN ticket takes over. Hide the chip elsewhere, and don't
     strand the user on an empty list if they switch parks while it's active. */
  function syncFilterChips() {
    var chip = $('#filterChips .chip[data-filter="day"]');
    if (!chip) return;
    var show = state.park === "USH";
    chip.classList.toggle("hidden", !show);
    if (!show && state.filter === "day") {
      state.filter = "all";
      $$("#filterChips .chip").forEach(function (x) {
        x.classList.toggle("active", x.dataset.filter === "all");
      });
    }
  }

  function renderAll() {
    renderParkTabs();
    renderProgress();
    syncFilterChips();
    if (state.view === "now") renderNow();
    if (state.view === "rides") renderList();
    if (state.view === "rank") renderRank();
    if (state.view === "compare") { renderSync(); renderCompare(); }
    if (state.view === "more") { renderStats(); renderCoverage(); }
  }

  /* ---------------- live sync UI ---------------- */
  function renderSync() {
    var el = $("#syncBody");
    if (!el) return;
    var html;

    if (!trip) {
      html =
        '<p class="muted small">Turn this on and your scores appear on each other\'s phones by themselves — no swapping links every time. ' +
        'Everything still saves on this phone first, so it keeps working when the park wifi does not.</p>' +
        '<div class="row gap">' +
        '<button id="syncStart" class="btn primary">Start a trip</button>' +
        '</div>' +
        '<label class="setrow" for="syncJoinCode">Or join the one your friend started</label>' +
        '<div class="row gap">' +
        '<input id="syncJoinCode" class="search" type="text" inputmode="latin" autocapitalize="characters" ' +
        'autocomplete="off" spellcheck="false" maxlength="9" placeholder="ABCD-1234">' +
        '<button id="syncJoin" class="btn">Join</button>' +
        '</div>';
    } else {
      var others = peerList().length;
      html =
        '<p class="muted small">Anyone with this code sees your scores and you see theirs.</p>' +
        '<div class="tripcode">' + esc(prettyCode(trip.code)) + "</div>" +
        '<div class="row gap">' +
        '<button id="syncInvite" class="btn primary">Send invite link</button>' +
        '<button id="syncNow" class="btn">Sync now</button>' +
        "</div>" +
        '<div id="syncOut" class="shareout hidden"></div>' +
        '<p class="muted small" id="syncStatus">' + esc(syncStatusLine()) + "</p>" +
        '<p class="muted small">' +
        (others ? others + (others === 1 ? " other person" : " other people") + " in your list." : "Nobody else has joined yet.") +
        "</p>" +
        '<div class="row gap"><button id="syncLeave" class="btn">Turn off live sync</button></div>';
    }
    el.innerHTML = html;

    if (!trip) {
      $("#syncStart").onclick = function () {
        joinTrip(newTripCode(), "Trip started — send the invite link.");
      };
      $("#syncJoin").onclick = function () {
        var c = normCode($("#syncJoinCode").value);
        if (c.length < 6) { toast("That code looks too short."); return; }
        joinTrip(c, "Joined. Fetching their scores…");
      };
      $("#syncJoinCode").addEventListener("keydown", function (e) {
        if (e.key === "Enter") $("#syncJoin").click();
      });
    } else {
      $("#syncInvite").onclick = async function () {
        var url = tripLink(trip.code);
        if (navigator.share) {
          try { await navigator.share({ title: "Rate the rides with me", text: "Join my ride-rating trip", url: url }); return; }
          catch (e) { /* cancelled — fall through */ }
        }
        try { await navigator.clipboard.writeText(url); toast("Invite link copied"); return; }
        catch (e) { /* no clipboard — show it */ }
        $("#syncOut").textContent = url;
        $("#syncOut").classList.remove("hidden");
      };
      $("#syncNow").onclick = function () { if (sync.dirty) pushNow(); else pullNow(); };
      $("#syncLeave").onclick = function () {
        if (!confirm("Turn off live sync? Everyone's ratings stay on this phone.")) return;
        leaveTrip();
        toast("Live sync off");
      };
    }
  }

  /* ---------------- rating sheet ---------------- */
  function openSheet(id) {
    var r = byId[id];
    if (!r) return;
    state.editing = id;
    var existing = ratings[id];
    state.pick = existing ? existing.s : null;

    $("#sheetName").innerHTML = esc(r.n) + badges(r);
    var meta = [r.land];
    if (typeLabel(r.type)) meta.push(typeLabel(r.type));
    if (r.note) meta.push(r.note);
    $("#sheetMeta").textContent = meta.join(" · ");
    $("#noteInput").value = existing && existing.n ? existing.n : "";
    $("#clearBtn").classList.toggle("hidden", !existing);
    $("#wontDoBtn").classList.toggle("hidden", !!existing);
    $("#wontDoBtn").textContent = wontDo(id) ? "Put back on my list" : "Won’t do";
    $("#wontDoHint").classList.toggle("hidden", !!existing);

    var peer = firstPeer(), ps = $("#peerScore");
    if (peer && peer.ratings[id]) {
      var t = peer.ratings[id];
      ps.innerHTML = esc(peer.name) + " gave this <b>" + t.s + "/10</b>" + (t.n ? " — “" + esc(t.n) + "”" : "");
      ps.classList.remove("hidden");
    } else ps.classList.add("hidden");

    var mb = $("#mapBtn"), url = mapUrl(r);
    if (url) { mb.href = url; mb.classList.remove("hidden"); }
    else { mb.removeAttribute("href"); mb.classList.add("hidden"); }

    renderSheetLive(r);
    drawScores();
    $("#sheetBack").classList.remove("hidden");
    var sb = $(".sheet-body");
    if (sb) sb.scrollTop = 0;
    fitSheet();
  }

  function drawScores() {
    var g = $("#scoreGrid"), html = "";
    for (var i = 1; i <= 10; i++) {
      html += '<button class="sc' + (state.pick === i ? " on" : "") + '" data-v="' + i + '">' + i + "</button>";
    }
    g.innerHTML = html;
    $$("#scoreGrid .sc").forEach(function (b) {
      b.onclick = function () {
        state.pick = parseInt(b.dataset.v, 10);
        drawScores();
        if (navigator.vibrate) navigator.vibrate(8);
      };
    });
  }

  /* iOS does not shrink the layout viewport when the keyboard comes up, so
     100dvh is still the whole screen and the Save button ends up underneath
     the keys. visualViewport is the only thing that knows the real usable
     height — cap the sheet to it, and pad the backdrop so the sheet rides
     above the keyboard rather than behind it. */
  function fitSheet() {
    var back = $("#sheetBack"), sheet = $("#sheet"), vv = window.visualViewport;
    if (!sheet || !back) return;
    if (!vv || back.classList.contains("hidden")) {
      sheet.style.maxHeight = ""; back.style.paddingBottom = "";
      return;
    }
    var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    back.style.paddingBottom = kb ? kb + "px" : "";
    sheet.style.maxHeight = Math.max(240, Math.round(vv.height) - 24) + "px";
  }

  function closeSheet() {
    $("#sheetBack").classList.add("hidden");
    state.editing = null;
    fitSheet();
  }

  function saveRating() {
    if (!state.editing) return;
    if (!state.pick) { toast("Pick a score first."); return; }
    var note = $("#noteInput").value.trim().slice(0, 140);
    var id = state.editing, prev = ratings[id];
    ratings[id] = { s: state.pick, n: note, t: Date.now() };
    /* Only claim it saved once it has. On failure put the old value back and
       leave the sheet open, so the score is still on screen to retry rather
       than living in memory until the tab dies. */
    if (!save(K.ratings, ratings)) {
      if (prev) ratings[id] = prev; else delete ratings[id];
      toast(STORAGE_ERR);
      return;
    }
    pushSoon();
    var score = state.pick;
    closeSheet();
    renderAll();
    toast("Saved " + score + "/10");
  }

  function toggleWontDo() {
    var id = state.editing;
    if (!id || ratings[id]) return;
    var prev = skipped[id], removing = wontDo(id);
    if (removing) delete skipped[id]; else skipped[id] = true;
    if (!save(K.skipped, skipped)) {
      if (prev) skipped[id] = prev; else delete skipped[id];
      toast(STORAGE_ERR);
      return;
    }
    closeSheet();
    renderAll();
    toast(removing ? "Back on your list" : "Marked won’t do — undo in the Won’t do filter");
  }

  function clearRating() {
    if (!state.editing) return;
    var id = state.editing, prev = ratings[id];
    delete ratings[id];
    if (!save(K.ratings, ratings)) {
      if (prev) ratings[id] = prev;
      toast(STORAGE_ERR);
      return;
    }
    pushSoon();
    closeSheet();
    renderAll();
    toast("Rating cleared");
  }

  /* ---------------- export ---------------- */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportCsv() {
    var peer = firstPeer();
    var head = ["Park", "Land", "Attraction", "Type", me.name, "Note"];
    if (peer) head.push(peer.name);
    var parkName = {};
    PARKS.forEach(function (p) { parkName[p.key] = p.name; });
    var rows = [head];
    RIDES.forEach(function (r) {
      var a = ratings[r.id], b = peer && peer.ratings[r.id];
      if (!a && !b) return;
      var row = [parkName[r.p], r.land, r.n, r.type, a ? a.s : "", a && a.n ? a.n : ""];
      if (peer) row.push(b ? b.s : "");
      rows.push(row);
    });
    var csv = rows.map(function (row) {
      return row.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
    download("ride-ratings.csv", csv, "text/csv");
  }
  function exportJson() {
    download("ride-ratings.json", JSON.stringify({ me: me, ratings: ratings, peers: peers, skipped: skipped }, null, 2), "application/json");
  }

  /* ---------------- wiring ---------------- */
  /* Walking time is the difference between "20 minute wait" and "20 minute wait
     plus a twelve minute walk across the park", which is often the whole
     decision. Tapping the chip a second time turns it back off — position is
     held in memory only and never written anywhere. */
  function locateMe() {
    if (state.position) {
      state.position = null; state.positionSource = null; state.positionAt = 0;
      renderNow();
      return;
    }
    if (!navigator.geolocation) { toast("This browser won't share a location."); return; }
    state.locating = true;
    renderNow();
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.locating = false;
      state.position = [pos.coords.latitude, pos.coords.longitude];
      state.positionAt = Date.now();
      state.positionSource = "gps";
      renderNow();
    }, function (err) {
      state.locating = false;
      renderNow();
      toast(err && err.code === 1
        ? "Location is off for this site — walking times stay hidden."
        : "Couldn't get a location fix.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function setView(v) {
    state.view = v;
    $$(".view").forEach(function (s) { s.classList.add("hidden"); });
    $("#view-" + v).classList.remove("hidden");
    $$(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.view === v); });
    renderAll();
    scrollMainTop();
  }

  /* Live waits are a layer on top, started once the app itself is up. Nothing
     below this line can stop the ratings app working: if live.js failed to load
     or every request fails, LIVE is null or its state stays empty, and every
     render path already treats that as "no live data" rather than an error. */
  var liveStarted = false;
  function startLive() {
    if (!LIVE || liveStarted) return;
    liveStarted = true;
    /* A repaint per refresh, and only of the screen you are looking at. */
    LIVE.onChange(function () {
      if (state.view === "now") renderNow();
      else if (state.view === "rides") renderList();
      else if (state.view === "more") renderCoverage();
      if (state.editing) renderSheetLive(byId[state.editing]);
    });
    LIVE.startPolling(function () { return state.park; });
    LIVE.refresh(state.park);
  }

  function boot() {
    $("#app").classList.remove("hidden");
    $("#whoami").textContent = "Rating as " + me.name;
    $("#nameEdit").value = me.name;
    $("#toggleExtras").checked = !!prefs.extras;
    $("#toggleSeparate").checked = !!prefs.separate;
    $("#toggleTuck").checked = !!prefs.tuck;
    startLive();
    renderAll();
    if (pendingTrip) {
      var code = pendingTrip; pendingTrip = null;
      joinTrip(code, "Joined the trip — fetching their scores…");
    } else if (trip) {
      startSyncLoop();
      /* sync.dirty lives only in memory. Rate something in a dead zone, lock
         the phone, come back an hour later — the app reloads, the flag is gone,
         and from then on it only ever pulls. Those scores would never reach the
         other phone. So re-send our own record on every start: it is idempotent
         and cannot touch theirs, because each member writes only their own blob.
         The one case where it would do harm is a failed storage read, where
         `ratings` is an empty fallback that would erase the server copy. */
      if (storageFailed) pullNow();
      else { sync.dirty = true; pushNow(); }
    }
    if (pendingWelcome) { toast(pendingWelcome); pendingWelcome = null; }
  }

  function wire() {
    $$(".tab").forEach(function (t) { t.onclick = function () { setView(t.dataset.view); }; });

    $("#search").oninput = function () { state.q = this.value; renderList(); };
    $$("#filterChips .chip").forEach(function (c) {
      c.onclick = function () {
        $$("#filterChips .chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        state.filter = c.dataset.filter;
        renderList();
      };
    });
    $$("#rankChips .chip").forEach(function (c) {
      c.onclick = function () {
        $$("#rankChips .chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        state.rankMode = c.dataset.rank;
        renderRank();
      };
    });
    $$("#scopeChips .chip").forEach(function (c) {
      c.onclick = function () {
        $$("#scopeChips .chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        state.scope = c.dataset.scope;
        renderRank();
      };
    });
    $$("#cmpScopeChips .chip").forEach(function (c) {
      c.onclick = function () {
        $$("#cmpScopeChips .chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        state.cmpScope = c.dataset.scope;
        renderCompare();
      };
    });

    /* How you are riding today. Both change which queue's number the whole app
       shows, so they re-render everything, not just the planner. */
    $$("#planChips .chip[data-pref]").forEach(function (c) {
      c.onclick = function () {
        var k = c.dataset.pref === "express" ? "express" : "single";
        prefs[k] = !prefs[k];
        save(K.prefs, prefs);
        renderAll();
      };
    });
    $("#chipLocate").onclick = locateMe;

    $("#sheetClose").onclick = closeSheet;
    $("#sheetBack").onclick = function (e) { if (e.target === $("#sheetBack")) closeSheet(); };
    $("#saveBtn").onclick = saveRating;
    $("#clearBtn").onclick = clearRating;
    $("#wontDoBtn").onclick = toggleWontDo;

    $("#shareBtn").onclick = async function () {
      var url = await makeShareLink();
      if (navigator.share) {
        try { await navigator.share({ title: "My ride ratings", text: me.name + "'s ride ratings", url: url }); return; }
        catch (e) { /* cancelled — fall through to showing it */ }
      }
      $("#shareOut").textContent = url;
      $("#shareOut").classList.remove("hidden");
      toast("Link ready — copy it below");
    };
    $("#copyBtn").onclick = async function () {
      var url = await makeShareLink();
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copied");
      } catch (e) {
        $("#shareOut").textContent = url;
        $("#shareOut").classList.remove("hidden");
        toast("Copy it from below");
      }
    };

    $("#csvBtn").onclick = exportCsv;
    $("#jsonBtn").onclick = exportJson;

    $("#nameEdit").onchange = function () {
      var v = this.value.trim().slice(0, 18);
      if (!v) { this.value = me.name; return; }
      var was = me.name;
      me.name = v;
      if (!save(K.me, me)) { me.name = was; this.value = was; toast(STORAGE_ERR); return; }
      $("#whoami").textContent = "Rating as " + me.name;
      pushSoon();
      toast("Name updated");
    };
    $("#toggleExtras").onchange = function () { prefs.extras = this.checked; save(K.prefs, prefs); renderAll(); };
    $("#toggleSeparate").onchange = function () { prefs.separate = this.checked; save(K.prefs, prefs); renderAll(); };
    $("#toggleTuck").onchange = function () { prefs.tuck = this.checked; save(K.prefs, prefs); renderAll(); };

    $("#forgetPeers").onclick = function () {
      if (!confirm("Remove everyone else's ratings? Yours stay.")) return;
      peers = {};
      var ok = save(K.peers, peers);
      renderAll();
      toast(ok ? "Removed" : STORAGE_ERR);
    };
    $("#resetBtn").onclick = function () {
      if (!confirm("Erase all ratings, including yours? This cannot be undone.")) return;
      [K.me, K.ratings, K.peers, K.prefs, K.trip, K.skipped].forEach(function (k) { localStorage.removeItem(k); });
      location.reload();
    };

    $("#onboardGo").onclick = function () {
      var v = $("#nameInput").value.trim().slice(0, 18);
      if (!v) { toast("Put a name in first."); $("#nameInput").focus(); return; }
      me = { id: Math.random().toString(36).slice(2, 9), name: v };
      /* If the identity will not persist, starting anyway means a brand-new
         person on the next launch and every rating orphaned. Stop here. */
      if (!save(K.me, me)) {
        me = null;
        toast("Storage is blocked on this browser — turn off Private Browsing and try again.");
        return;
      }
      $("#onboard").classList.add("hidden");
      boot();
    };
    $("#nameInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") $("#onboardGo").click();
    });
  }

  /* ---------------- start ---------------- */
  (async function start() {
    wire();
    ingestTripHash();
    await ingestHash();
    peers = load(K.peers, {});
    if (me) boot();
    else {
      $("#onboard").classList.remove("hidden");
      var note = pendingWelcome ||
        (pendingTrip ? "You've been invited to a trip." : null);
      if (note) {
        $("#onboard").querySelector(".fineprint").textContent =
          note + " Add your name to start rating alongside them.";
        pendingWelcome = null;
      }
      setTimeout(function () { $("#nameInput").focus(); }, 300);
    }
    /* A link to the same page with a different #hash is a same-document
       navigation — no reload, so start() never re-runs. Catch it explicitly,
       otherwise a second share link from the same person silently does nothing. */
    window.addEventListener("hashchange", async function () {
      if (ingestTripHash()) {
        var code = pendingTrip; pendingTrip = null;
        if (me) joinTrip(code, "Joined the trip — fetching their scores…");
        return;
      }
      var got = await ingestHash();
      if (!got) return;
      peers = load(K.peers, {});
      if (me) {
        renderAll();
        if (pendingWelcome) { toast(pendingWelcome); pendingWelcome = null; }
      } else if (pendingWelcome) {
        $("#onboard").querySelector(".fineprint").textContent =
          pendingWelcome + " Add your name to start rating alongside them.";
        pendingWelcome = null;
      }
    });

    /* Coming back to the app is the moment a stale score is most annoying, so
       sync on focus rather than waiting out the poll interval. */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && trip) { sync.skip = 0; syncTick(); }
    });
    window.addEventListener("online", function () {
      if (trip) { sync.skip = 0; sync.fails = 0; syncTick(); }
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", fitSheet);
      window.visualViewport.addEventListener("scroll", fitSheet);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  })();
})();
