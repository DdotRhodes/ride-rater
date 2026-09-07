/* Ride Rater — offline-first ratings with link sharing and optional live sync.
   Your data lives in this browser first, always. Live sync is a bonus layer on
   top: turn it off and every feature still works, link sharing included. */
(function () {
  "use strict";

  var K = { me: "rr.me", ratings: "rr.ratings", peers: "rr.peers", prefs: "rr.prefs", trip: "rr.trip" };
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
  var peers = load(K.peers, {});
  var prefs = load(K.prefs, { extras: false, separate: false });

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

  var state = { park: "USH", filter: "all", q: "", view: "rides", rankMode: "me", editing: null, pick: null };

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
    var list = parkRides(park), n = 0;
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
      b.onclick = function () { state.park = b.dataset.park; renderAll(); scrollMainTop(); };
    });
  }

  function renderProgress() {
    var all = RIDES.filter(visible), n = 0;
    all.forEach(function (r) { if (ratings[r.id]) n++; });
    $("#progressCount").textContent = n;
    $("#progressWrap").innerHTML = '<span id="progressCount">' + n + '</span><span class="muted">/' + all.length + " rated</span>";
  }

  function renderList() {
    var el = $("#list");
    var q = state.q.trim().toLowerCase();
    var flagFilter = FLAGS[state.filter] ? state.filter : null;
    var pool = flagFilter ? flaggedRides(state.park, flagFilter) : parkRides(state.park);
    var list = pool.filter(function (r) {
      if (q && r.n.toLowerCase().indexOf(q) === -1 && r.land.toLowerCase().indexOf(q) === -1) return false;
      if (state.filter === "todo" && ratings[r.id]) return false;
      if (state.filter === "done" && !ratings[r.id]) return false;
      if (state.filter === "rides" && r.type !== "ride") return false;
      return true;
    });
    list.sort(function (a, b) { return landRank(a) - landRank(b); });

    if (!list.length) {
      el.innerHTML = '<div class="empty-note">Nothing here.<br>Try a different filter, or turn on shows and extras under More.</div>';
      return;
    }

    var peer = firstPeer();
    var html = "", land = null;
    list.forEach(function (r) {
      if (r.land !== land) {
        land = r.land;
        html += '<div class="landhead">' + esc(land) + "</div>";
      }
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
      if (typeLabel(r.type)) sub.push(typeLabel(r.type));
      if (r.note) sub.push(r.note);
      if (mine && mine.n) sub.push("“" + mine.n + "”");
      html += '<button class="item' + (hasFlag(r, "closed") ? " closed" : "") + '" data-id="' + r.id + '">' +
        '<div class="item-main">' +
        '<div class="item-name">' + esc(r.n) + badges(r) + "</div>" +
        (sub.length ? '<div class="item-sub">' + esc(sub.join(" · ")) + "</div>" : "") +
        "</div>" + right + "</button>";
    });
    el.innerHTML = html;
    $$("#list .item").forEach(function (b) {
      b.onclick = function () { openSheet(b.dataset.id); };
    });
  }

  /* ---------------- rendering: ranking ---------------- */
  function renderRank() {
    var el = $("#rankList");
    var peer = firstPeer();
    var rows = [];

    RIDES.filter(visible).forEach(function (r) {
      var mine = ratings[r.id];
      if (state.rankMode === "me") {
        if (mine) rows.push({ r: r, v: mine.s, label: null });
      } else {
        var vals = [], who = [];
        if (mine) { vals.push(mine.s); who.push("you " + mine.s); }
        peerList().forEach(function (p) {
          var t = p.ratings[r.id];
          if (t) { vals.push(t.s); who.push(shortName(p.name) + " " + t.s); }
        });
        if (vals.length) {
          var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
          rows.push({ r: r, v: avg, label: who.join(" · ") });
        }
      }
    });

    if (!rows.length) {
      el.innerHTML = '<div class="empty-note">No ratings yet.<br>Go ride something.</div>';
      return;
    }
    rows.sort(function (a, b) { return b.v - a.v; });

    var parkName = {};
    PARKS.forEach(function (p) { parkName[p.key] = p.short; });

    el.innerHTML = rows.map(function (row, i) {
      var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
      var v = state.rankMode === "both" ? (Math.round(row.v * 10) / 10) : row.v;
      var sub = row.label || parkName[row.r.p];
      return '<div class="rankrow"><div class="rankpos' + (i < 3 ? " top" : "") + '">' + medal + "</div>" +
        '<div class="item-main"><div class="item-name">' + esc(row.r.n) + "</div>" +
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
    var peer = firstPeer();
    if (!peer) {
      el.innerHTML = '<div class="empty-note">Join the same trip and your scores appear beside each other by themselves. Or open their one-off link — note that sending yours does not bring theirs back.</div>';
      return;
    }
    var both = [], onlyMe = [], onlyThem = [];
    RIDES.forEach(function (r) {
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
    if (state.view === "rides") renderList();
    if (state.view === "rank") renderRank();
    if (state.view === "compare") { renderSync(); renderCompare(); }
    if (state.view === "more") renderStats();
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

    var peer = firstPeer(), ps = $("#peerScore");
    if (peer && peer.ratings[id]) {
      var t = peer.ratings[id];
      ps.innerHTML = esc(peer.name) + " gave this <b>" + t.s + "/10</b>" + (t.n ? " — “" + esc(t.n) + "”" : "");
      ps.classList.remove("hidden");
    } else ps.classList.add("hidden");

    drawScores();
    $("#sheetBack").classList.remove("hidden");
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

  function closeSheet() {
    $("#sheetBack").classList.add("hidden");
    state.editing = null;
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
    download("ride-ratings.json", JSON.stringify({ me: me, ratings: ratings, peers: peers }, null, 2), "application/json");
  }

  /* ---------------- wiring ---------------- */
  function setView(v) {
    state.view = v;
    $$(".view").forEach(function (s) { s.classList.add("hidden"); });
    $("#view-" + v).classList.remove("hidden");
    $$(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.view === v); });
    renderAll();
    scrollMainTop();
  }

  function boot() {
    $("#app").classList.remove("hidden");
    $("#whoami").textContent = "Rating as " + me.name;
    $("#nameEdit").value = me.name;
    $("#toggleExtras").checked = !!prefs.extras;
    $("#toggleSeparate").checked = !!prefs.separate;
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

    $("#sheetClose").onclick = closeSheet;
    $("#sheetBack").onclick = function (e) { if (e.target === $("#sheetBack")) closeSheet(); };
    $("#saveBtn").onclick = saveRating;
    $("#clearBtn").onclick = clearRating;

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

    $("#forgetPeers").onclick = function () {
      if (!confirm("Remove everyone else's ratings? Yours stay.")) return;
      peers = {};
      var ok = save(K.peers, peers);
      renderAll();
      toast(ok ? "Removed" : STORAGE_ERR);
    };
    $("#resetBtn").onclick = function () {
      if (!confirm("Erase all ratings, including yours? This cannot be undone.")) return;
      [K.me, K.ratings, K.peers, K.prefs, K.trip].forEach(function (k) { localStorage.removeItem(k); });
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

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  })();
})();
