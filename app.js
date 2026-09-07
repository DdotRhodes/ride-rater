/* Ride Rater — offline-first, local-only ratings with link sharing.
   No server, no accounts. Your data lives in this browser. */
(function () {
  "use strict";

  var K = { me: "rr.me", ratings: "rr.ratings", peers: "rr.peers", prefs: "rr.prefs" };
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function load(k, d) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }
    catch (e) { return d; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { toast("Couldn't save — storage is full or blocked."); }
  }
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

  /* ---------------- helpers ---------------- */
  function peerList() {
    return Object.keys(peers).map(function (id) {
      return { id: id, name: peers[id].name, ratings: peers[id].ratings };
    });
  }
  function firstPeer() { var p = peerList(); return p.length ? p[0] : null; }

  function visible(r) {
    if (r.tag && !prefs.separate) return false;
    if (r.type !== "ride" && !prefs.extras) return false;
    return true;
  }
  function parkRides(park) {
    return RIDES.filter(function (r) { return r.p === park && visible(r); });
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

  /* ---------------- rendering: rides ---------------- */
  function renderParkTabs() {
    var el = $("#parkTabs");
    el.innerHTML = PARKS.map(function (p) {
      var c = ratedCount(p.key);
      return '<button class="ptab' + (p.key === state.park ? " active" : "") + '" data-park="' + p.key + '">' +
        esc(p.short) + ' <span class="muted">' + c.n + "/" + c.total + "</span></button>";
    }).join("");
    $$("#parkTabs .ptab").forEach(function (b) {
      b.onclick = function () { state.park = b.dataset.park; renderAll(); window.scrollTo(0, 0); };
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
    var list = parkRides(state.park).filter(function (r) {
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
      html += '<button class="item" data-id="' + r.id + '"><div class="item-main">' +
        '<div class="item-name">' + esc(r.n) + "</div>" +
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
      el.innerHTML = '<div class="empty-note">Once someone opens your link — or you open theirs — their scores show up here beside yours.</div>';
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

  function renderAll() {
    renderParkTabs();
    renderProgress();
    if (state.view === "rides") renderList();
    if (state.view === "rank") renderRank();
    if (state.view === "compare") renderCompare();
    if (state.view === "more") renderStats();
  }

  /* ---------------- rating sheet ---------------- */
  function openSheet(id) {
    var r = byId[id];
    if (!r) return;
    state.editing = id;
    var existing = ratings[id];
    state.pick = existing ? existing.s : null;

    $("#sheetName").textContent = r.n;
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
    ratings[state.editing] = { s: state.pick, n: note, t: Date.now() };
    save(K.ratings, ratings);
    var score = state.pick;
    closeSheet();
    renderAll();
    toast("Saved " + score + "/10");
  }

  function clearRating() {
    if (!state.editing) return;
    delete ratings[state.editing];
    save(K.ratings, ratings);
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
    window.scrollTo(0, 0);
  }

  function boot() {
    $("#app").classList.remove("hidden");
    $("#whoami").textContent = "Rating as " + me.name;
    $("#nameEdit").value = me.name;
    $("#toggleExtras").checked = !!prefs.extras;
    $("#toggleSeparate").checked = !!prefs.separate;
    renderAll();
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
      me.name = v; save(K.me, me);
      $("#whoami").textContent = "Rating as " + me.name;
      toast("Name updated");
    };
    $("#toggleExtras").onchange = function () { prefs.extras = this.checked; save(K.prefs, prefs); renderAll(); };
    $("#toggleSeparate").onchange = function () { prefs.separate = this.checked; save(K.prefs, prefs); renderAll(); };

    $("#forgetPeers").onclick = function () {
      if (!confirm("Remove everyone else's ratings? Yours stay.")) return;
      peers = {}; save(K.peers, peers); renderAll(); toast("Removed");
    };
    $("#resetBtn").onclick = function () {
      if (!confirm("Erase all ratings, including yours? This cannot be undone.")) return;
      [K.me, K.ratings, K.peers, K.prefs].forEach(function (k) { localStorage.removeItem(k); });
      location.reload();
    };

    $("#onboardGo").onclick = function () {
      var v = $("#nameInput").value.trim().slice(0, 18);
      if (!v) { toast("Put a name in first."); $("#nameInput").focus(); return; }
      me = { id: Math.random().toString(36).slice(2, 9), name: v };
      save(K.me, me);
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
    await ingestHash();
    peers = load(K.peers, {});
    if (me) boot();
    else {
      $("#onboard").classList.remove("hidden");
      if (pendingWelcome) {
        $("#onboard").querySelector(".fineprint").textContent =
          pendingWelcome + " Add your name to start rating alongside them.";
        pendingWelcome = null;
      }
      setTimeout(function () { $("#nameInput").focus(); }, 300);
    }
    /* A link to the same page with a different #hash is a same-document
       navigation — no reload, so start() never re-runs. Catch it explicitly,
       otherwise a second share link from the same person silently does nothing. */
    window.addEventListener("hashchange", async function () {
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

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  })();
})();
