/* Ride Rater — live waits, park hours, and the "what do I do next" planner.
   ---------------------------------------------------------------------------
   Everything here is a layer on top of the app, never underneath it. If every
   request fails, the ratings app carries on exactly as it did before: the live
   panels show the last data they had with its true age, and the planner says it
   is planning blind rather than inventing numbers.

   Two feeds, because neither one is enough on its own:

     ThemeParks.wiki  — Disney's own numbers, straight from the browser. Standby,
                        single rider, Lightning Lane return windows, showtimes,
                        live status, and the real opening hours for a given date.
                        Carries no wait times for Universal Hollywood.
     Queue-Times      — via the sync service's /waits route, because the site
                        sends no CORS headers. The only source of Universal
                        waits, including Horror Nights houses and Express lines.

   Which one wins is decided per field in mergeRide(), not per feed.
*/
window.LIVE = (function () {
  "use strict";

  var TP = "https://api.themeparks.wiki/v1/entity/";
  var QT = "https://ride-rater-sync.netlify.app/waits";

  var CACHE_KEY = "rr.live";
  var REQUEST_TIMEOUT_MS = 11000;
  /* Both feeds move on roughly a five-minute cycle, so polling faster than that
     spends the phone's battery and the park's wifi on identical bytes. */
  var POLL_MS = 150000;
  /* Opening hours for a date do not change while you are standing in the park.
     Re-fetching them every poll would triple the request count for nothing. */
  var SCHEDULE_TTL_MS = 6 * 60 * 60 * 1000;
  /* Past this, the numbers are old enough that acting on them is worse than
     knowing you have none. The app keeps showing them, clearly marked. */
  var STALE_MS = 20 * 60 * 1000;
  var USELESS_MS = 90 * 60 * 1000;

  var MAP = window.LIVE_MAP || { parks: {}, rides: {} };
  var RIDES = window.RIDES || [];
  var GEO = window.RIDE_GEO || {};
  var TRIP = window.TRIP_FLAGS || {};

  var byId = {};
  RIDES.forEach(function (r) { byId[r.id] = r; });
  function flags(id) { return (TRIP[id] && TRIP[id].f) || []; }
  function has(id, f) { return flags(id).indexOf(f) !== -1; }

  /* Rides whose own last call is earlier than the event around them. Both come
     from the trip notes already in data.js; they are repeated as times here
     because the planner needs a number, and neither feed publishes one. */
  var LAST_CALL = {
    "u-mario-kart": "21:00", /* Super Nintendo World runs 7–10pm; the ride stops about 9 */
    "u-hp-journey": "23:15", /* Forbidden Journey runs late on Horror Nights */
  };

  /* ------------------------------------------------------------------ state */
  var state = {
    parks: {},      /* parkKey -> { live, liveAt, sched, schedAt, qtAt } */
    rides: {},      /* rideId  -> merged record */
    sources: {      /* per feed: last success, last error, consecutive failures */
      tp: { ok: 0, err: null, fails: 0 },
      qt: { ok: 0, err: null, fails: 0 },
    },
    drift: [],      /* feed renamed something out from under a mapped id */
    /* The other half of the match: rows the feeds sent that no attraction in
       this app claimed. Without these, coverage would only ever be able to
       answer "did my rides find data", never "is the feed telling me about
       something I do not have". */
    orphans: { tp: [], qt: [] },
    busy: false,
    attribution: null,
  };
  var listeners = [];
  var pollTimer = null;
  var skipPolls = 0;
  var queued = null;      /* a refresh asked for while another was in flight */
  var loadingPark = null; /* which park that in-flight refresh is for */

  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  /* ------------------------------------------------------------------ cache
     The whole point of writing this to disk is the moment you open the app in a
     dead zone: better a wait time from twenty minutes ago, labelled as such,
     than an empty screen. Only merged output is cached — the raw feeds are far
     too big for localStorage and nothing needs them again. */
  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        v: 1,
        rides: state.rides,
        parks: mapValues(state.parks, function (p) {
          return { sched: p.sched, schedAt: p.schedAt, liveAt: p.liveAt, qtAt: p.qtAt };
        }),
        sources: state.sources,
        drift: state.drift,
        orphans: state.orphans,
        attribution: state.attribution,
      }));
    } catch (e) { /* full or blocked: live data is the first thing worth losing */ }
  }
  function loadCache() {
    var raw;
    try { raw = localStorage.getItem(CACHE_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var c = JSON.parse(raw);
      if (!c || c.v !== 1) return;
      state.rides = c.rides || {};
      state.parks = c.parks || {};
      state.drift = c.drift || [];
      state.orphans = c.orphans || { tp: [], qt: [] };
      state.attribution = c.attribution || null;
      /* Restored counters describe a previous session's network, not this one.
         Carrying the failure count over would start the app already backed off. */
      if (c.sources) {
        state.sources.tp.ok = c.sources.tp ? c.sources.tp.ok || 0 : 0;
        state.sources.qt.ok = c.sources.qt ? c.sources.qt.ok || 0 : 0;
      }
    } catch (e) { /* corrupt cache is the same as no cache */ }
  }
  function mapValues(o, fn) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) { out[k] = fn(o[k]); });
    return out;
  }

  /* ---------------------------------------------------------------- fetching */
  function get(url) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var init = { cache: "no-store" };
    if (ctrl) init.signal = ctrl.signal;
    return fetch(url, init).then(function (res) {
      if (!res.ok) throw new Error("http_" + res.status);
      return res.json();
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function parkTp(key) { return MAP.parks[key] && MAP.parks[key].tp; }
  function parkQt(key) { return MAP.parks[key] && MAP.parks[key].qt; }

  /* ------------------------------------------------------------------ merge */
  function num(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? v : null; }

  /* Build one record per app ride out of whatever arrived. Called with the raw
     feed payloads indexed by their own ids; anything missing is simply absent,
     which is what lets a half-successful refresh still be useful. */
  function mergeRide(id, tpEntry, qtEntry, qtSingle, qtExpress) {
    var m = MAP.rides[id] || {};
    var rec = {
      standby: null, single: null, express: null,
      ll: null, paidLL: null, boarding: null,
      status: null, showtimes: null, forecastNow: null,
      updated: 0, from: [],
    };

    if (tpEntry) {
      rec.from.push("tp");
      var q = tpEntry.queue || {};
      rec.standby = q.STANDBY ? num(q.STANDBY.waitTime) : null;
      rec.single = q.SINGLE_RIDER ? num(q.SINGLE_RIDER.waitTime) : null;
      if (q.RETURN_TIME) {
        rec.ll = {
          state: q.RETURN_TIME.state || null,
          start: q.RETURN_TIME.returnStart || null,
          end: q.RETURN_TIME.returnEnd || null,
        };
      }
      if (q.PAID_RETURN_TIME) {
        rec.paidLL = {
          state: q.PAID_RETURN_TIME.state || null,
          price: q.PAID_RETURN_TIME.price ? q.PAID_RETURN_TIME.price.formatted : null,
          start: q.PAID_RETURN_TIME.returnStart || null,
          end: q.PAID_RETURN_TIME.returnEnd || null,
        };
      }
      if (q.BOARDING_GROUP) rec.boarding = q.BOARDING_GROUP;
      rec.status = tpEntry.status || null;
      if (tpEntry.showtimes && tpEntry.showtimes.length) rec.showtimes = tpEntry.showtimes;
      rec.forecastNow = forecastForNow(tpEntry.forecast);
      var t = Date.parse(tpEntry.lastUpdated || "");
      if (t) rec.updated = Math.max(rec.updated, t);
    }

    if (qtEntry) {
      rec.from.push("qt");
      /* Disney's own feed wins where both answer — Queue-Times is reading the
         same numbers second-hand. At Universal it is the only voice in the room. */
      if (rec.standby === null) rec.standby = qtEntry.is_open ? num(qtEntry.wait_time) : null;
      if (rec.status === null) rec.status = qtEntry.is_open ? "OPERATING" : "CLOSED";
      var qt = Date.parse(qtEntry.last_updated || "");
      if (qt) rec.updated = Math.max(rec.updated, qt);
    }
    if (qtSingle && rec.single === null && qtSingle.is_open) rec.single = num(qtSingle.wait_time);
    if (qtExpress && qtExpress.is_open) rec.express = num(qtExpress.wait_time);

    if (!rec.from.length) return null;
    rec.mapped = { tp: m.tp || null, qt: m.qt || null };
    return rec;
  }

  /* The feed publishes an hour-by-hour forecast for the day. Comparing the
     number on the board against what this ride normally does at this hour is
     the one piece of judgement a wait time alone cannot give you. */
  function forecastForNow(list) {
    if (!Array.isArray(list) || !list.length) return null;
    var now = Date.now(), best = null, bestGap = Infinity;
    for (var i = 0; i < list.length; i++) {
      var t = Date.parse(list[i].time || "");
      if (!t) continue;
      var gap = Math.abs(t - now);
      if (gap < bestGap) { bestGap = gap; best = list[i]; }
    }
    /* An hour either side. Beyond that it is a different part of the day and
       comparing against it would be noise dressed up as insight. */
    if (!best || bestGap > 90 * 60 * 1000) return null;
    return num(best.waitTime);
  }

  function noteDrift(id, feed, expected, got) {
    if (!expected || !got || expected === got) return;
    state.drift.push({ id: id, feed: feed, expected: expected, got: got });
  }

  /* ---------------------------------------------------------------- refresh */
  function parksToLoad(current) {
    /* The trip is a two-day Park Hopper, so at Disney the other gate is a real
       option and its waits are part of the decision. Universal stands alone. */
    if (current === "DL") return ["DL", "DCA"];
    if (current === "DCA") return ["DCA", "DL"];
    return ["USH"];
  }

  function refresh(currentPark, opts) {
    if (state.busy) {
      /* Switching parks mid-fetch used to drop the request on the floor and
         leave the new park blank until the next poll, two and a half minutes
         later. Remember what was asked for and run it when this one lands —
         unless it is the fetch already running, which would just double it. */
      if (currentPark !== loadingPark) queued = { park: currentPark, opts: opts };
      return Promise.resolve();
    }
    loadingPark = currentPark;
    var keys = parksToLoad(currentPark || "USH");
    var force = !!(opts && opts.force);
    state.busy = true;
    emit();

    var now = Date.now();
    var jobs = [];

    /* --- ThemeParks: live data per park --- */
    var tpLive = {};
    keys.forEach(function (k) {
      var id = parkTp(k);
      if (!id) return;
      jobs.push(get(TP + id + "/live").then(function (d) {
        tpLive[k] = d && d.liveData ? d.liveData : [];
      }));
    });

    /* --- ThemeParks: opening hours, only when the cached copy has aged out --- */
    var tpSched = {};
    keys.forEach(function (k) {
      var id = parkTp(k);
      var p = state.parks[k];
      if (!id) return;
      if (!force && p && p.sched && p.schedAt && now - p.schedAt < SCHEDULE_TTL_MS) return;
      jobs.push(get(TP + id + "/schedule").then(function (d) {
        tpSched[k] = { schedule: (d && d.schedule) || [], timezone: (d && d.timezone) || null };
      }).catch(function () { /* hours are a bonus; a failure must not sink the waits */ }));
    });

    /* --- Queue-Times, through the proxy, in one request for both parks --- */
    var qtIds = keys.map(parkQt).filter(function (v) { return v != null; });
    var qtData = null;
    var qtJob = get(QT + "?parks=" + qtIds.join(",")).then(function (d) { qtData = d; });

    var tpOk = false, qtOk = false;
    var tpJob = Promise.all(jobs).then(function () { tpOk = true; })
      .catch(function (e) { state.sources.tp.err = (e && e.message) || "failed"; });
    var qtWrapped = qtJob.then(function () { qtOk = true; })
      .catch(function (e) { state.sources.qt.err = (e && e.message) || "failed"; });

    /* allSettled by construction: one feed going down must never stop the other
       one's numbers from reaching the screen. */
    return Promise.all([tpJob, qtWrapped]).then(function () {
      applyResults(keys, tpLive, tpSched, qtData, tpOk, qtOk);
    }).finally(function () {
      state.busy = false;
      saveCache();
      emit();
      if (queued) {
        var q = queued; queued = null;
        refresh(q.park, q.opts);
      }
    });
  }

  function applyResults(keys, tpLive, tpSched, qtData, tpOk, qtOk) {
    var now = Date.now();
    if (tpOk) { state.sources.tp.ok = now; state.sources.tp.err = null; state.sources.tp.fails = 0; }
    else state.sources.tp.fails++;
    if (qtOk) { state.sources.qt.ok = now; state.sources.qt.err = null; state.sources.qt.fails = 0; }
    else state.sources.qt.fails++;

    /* Back off after repeated failures rather than hammering a dead connection
       every two and a half minutes for the rest of the day. */
    skipPolls = Math.min(Math.max(state.sources.tp.fails, state.sources.qt.fails), 6);
    if (tpOk && qtOk) skipPolls = 0;

    if (qtData && qtData.attribution) state.attribution = qtData.attribution;

    /* Index each feed by its own id so the mapping table is the only place that
       decides what corresponds to what. */
    var tpIndex = {};
    Object.keys(tpLive).forEach(function (k) {
      tpLive[k].forEach(function (e) { if (e && e.id) tpIndex[e.id] = e; });
    });
    var qtIndex = {};
    if (qtData && qtData.parks) {
      Object.keys(qtData.parks).forEach(function (pid) {
        (qtData.parks[pid].rides || []).forEach(function (r) { if (r && r.id != null) qtIndex[r.id] = r; });
      });
    }

    state.drift = [];
    var claimedTp = {}, claimedQt = {};
    var touched = keys.slice();
    RIDES.forEach(function (r) {
      if (touched.indexOf(r.p) === -1) return;
      var m = MAP.rides[r.id];
      if (!m) return;
      if (m.tp) claimedTp[m.tp] = r.id;
      if (m.qt != null) claimedQt[m.qt] = r.id;
      if (m.qtSingle != null) claimedQt[m.qtSingle] = r.id;
      if (m.qtExpress != null) claimedQt[m.qtExpress] = r.id;
      var tpEntry = m.tp ? tpIndex[m.tp] : null;
      var qtEntry = m.qt != null ? qtIndex[m.qt] : null;
      noteDrift(r.id, "ThemeParks", m.tpn, tpEntry && tpEntry.name);
      noteDrift(r.id, "Queue-Times", m.qtn, qtEntry && qtEntry.name);
      var rec = mergeRide(r.id, tpEntry, qtEntry,
        m.qtSingle ? qtIndex[m.qtSingle] : null,
        m.qtExpress ? qtIndex[m.qtExpress] : null);
      /* A ride that answered before and is silent now keeps its old record —
         with its old timestamp, so the age badge tells the truth about it. */
      if (rec) {
        rec.at = now;
        /* Neither feed is obliged to stamp a row. When one does not, the moment
           it arrived is the newest honest bound on its age — and it is a bound
           that only ever moves forward with a real fetch, so it cannot make old
           data look fresh. */
        if (!rec.updated) rec.updated = now;
        state.rides[r.id] = rec;
      }
    });

    if (tpOk || qtOk) noteOrphans(tpIndex, qtIndex, claimedTp, claimedQt, tpOk, qtOk);

    keys.forEach(function (k) {
      var p = state.parks[k] || (state.parks[k] = {});
      if (tpLive[k]) p.liveAt = now;
      if (qtOk) p.qtAt = now;
      if (tpSched[k]) { p.sched = tpSched[k].schedule; p.schedAt = now; p.tz = tpSched[k].timezone; }
    });
  }

  /* Rows the feeds sent that nothing in the catalogue claimed. Most are
     restaurants, roaming bands and character meets and are dismissed by rule;
     anything left over is a real attraction this app cannot show, so it is kept
     and surfaced under More rather than thrown away.

     The same accounting runs in verify-map.mjs before a deploy. This copy exists
     because a feed can add a ride the morning of the trip, long after anyone
     last ran the verifier. */
  var TP_NOT_ATTRACTION = { RESTAURANT: 1, PARK: 1, DESTINATION: 1, HOTEL: 1 };
  var TP_ENTERTAINMENT = /^meet |^disneyland band|^pearly band|dapper dans|straw hatters|bootstrappers|piano player|jambalaya jazz|line dancing|cavalcade|encounter$|storytelling|citizens of|flag retreat|bandstand|stage$|dance party|dance off/i;
  var QT_QUEUE_DUPLICATE = /(single rider|express)/i;

  function noteOrphans(tpIndex, qtIndex, claimedTp, claimedQt, tpOk, qtOk) {
    var dismissedQt = (MAP.ignoredFeedRows && MAP.ignoredFeedRows.qt) || {};
    if (tpOk) {
      state.orphans.tp = Object.keys(tpIndex).filter(function (id) {
        var e = tpIndex[id];
        if (claimedTp[id]) return false;
        if (TP_NOT_ATTRACTION[e.entityType]) return false;
        return !TP_ENTERTAINMENT.test(e.name || "");
      }).map(function (id) { return { id: id, name: tpIndex[id].name, type: tpIndex[id].entityType }; });
    }
    if (qtOk) {
      state.orphans.qt = Object.keys(qtIndex).filter(function (id) {
        if (claimedQt[id]) return false;
        if (dismissedQt[id]) return false;
        return !QT_QUEUE_DUPLICATE.test(qtIndex[id].name || "");
      }).map(function (id) { return { id: id, name: qtIndex[id].name }; });
    }
    /* Console as well as the debug view: the view needs someone to go and look
       at it, and this is the kind of thing you want to find in a log after the
       fact rather than not at all. */
    if (typeof console !== "undefined" && console.warn) {
      if (state.orphans.qt.length) {
        console.warn("[live] Queue-Times rows with no attraction in this app:",
          state.orphans.qt.map(function (o) { return o.id + " " + o.name; }));
      }
      if (state.orphans.tp.length) {
        console.warn("[live] ThemeParks rows with no attraction in this app:",
          state.orphans.tp.map(function (o) { return o.name; }));
      }
      if (state.drift.length) {
        console.warn("[live] a feed has renamed a mapped attraction:", state.drift);
      }
    }
  }

  /* ------------------------------------------------------------- park hours */
  function todayKey() {
    /* Both parks are in America/Los_Angeles and so, on this trip, is the phone.
       Formatting in that zone explicitly means the date still lines up if the
       phone is left on another one. */
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /* Every block the feed lists for today, so a day with a day-park close and a
     separate ticketed event afterwards is described as the two things it is. */
  function hours(parkKey) {
    var p = state.parks[parkKey];
    if (!p || !p.sched) return null;
    var day = todayKey();
    var rows = p.sched.filter(function (s) { return s.date === day; });
    if (!rows.length) return null;
    var out = { date: day, operating: null, ticketed: null, all: rows, open: false, opensAt: null };
    rows.forEach(function (s) {
      var span = { start: Date.parse(s.openingTime || ""), end: Date.parse(s.closingTime || ""), desc: s.description || null };
      if (!span.start || !span.end) return;
      if (s.type === "OPERATING" && !out.operating) out.operating = span;
      if (s.type === "TICKETED_EVENT" && !out.ticketed) out.ticketed = span;
    });
    /* Whether the gates are open this second, which is a different question
       from whether the app has data. A closed park with a full set of zeroes
       must read as "closed", never as "no queues anywhere". */
    var now = Date.now();
    [out.operating, out.ticketed].forEach(function (span) {
      if (!span) return;
      if (now >= span.start && now <= span.end) out.open = true;
      else if (now < span.start && (out.opensAt === null || span.start < out.opensAt)) out.opensAt = span.start;
    });
    return out;
  }

  /* --------------------------------------------------- when a ride is usable
     Live status says what is true this second. It cannot say "and this stops in
     forty minutes", which is the fact that decides whether to walk over. That
     comes from the park's published hours plus the trip's own day/night split. */
  function todayAt(hhmm) {
    var h = hhmm.split(":");
    var d = new Date();
    d.setHours(parseInt(h[0], 10), parseInt(h[1], 10), 0, 0);
    return d.getTime();
  }

  function window_(id) {
    var r = byId[id];
    if (!r) return null;
    var hrs = hours(r.p);
    if (!hrs) return null;
    var op = hrs.operating, ev = hrs.ticketed;

    if (r.p === "USH") {
      /* Universal splits in two: the day park shuts, then Horror Nights takes
         the same ground over on a separate ticket. Which side a ride is on is
         already recorded in the trip flags. */
      var isHouse = r.tag === "hhn";
      var night = has(id, "hhn");
      var dayOnly = has(id, "day") && !night;
      if (isHouse) return ev ? { start: ev.start, end: ev.end } : null;
      if (dayOnly) return op ? { start: op.start, end: op.end } : null;
      if (night) {
        var end = ev ? ev.end : (op ? op.end : null);
        if (LAST_CALL[id]) end = Math.min(end || Infinity, todayAt(LAST_CALL[id]));
        return { start: op ? op.start : null, end: end };
      }
      return op ? { start: op.start, end: op.end } : null;
    }

    /* Disney: Oogie Boogie Bash attractions live inside the ticketed block,
       everything else inside the ordinary operating day. On the Sunday that
       block is what closes California Adventure at six. */
    if (r.tag === "oogie") return ev ? { start: ev.start, end: ev.end } : null;
    return op ? { start: op.start, end: op.end } : null;
  }

  /* -------------------------------------------------------------- distances */
  function metres(a, b) {
    var R = 6371000, toRad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toRad, dLon = (b[1] - a[1]) * toRad;
    var la = a[0] * toRad, lb = b[0] * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(la) * Math.cos(lb);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /* About 4 km/h, which is what walking through a crowd actually averages, plus
     a minute for the fact that no path across a park is a straight line. */
  function walkMinutes(fromLatLng, rideId) {
    var g = GEO[rideId];
    if (!fromLatLng || !g) return null;
    return Math.round(metres(fromLatLng, g) / 66) + 1;
  }
  /* Esplanade, bag check and tapstiles. There is no version of hopping gates
     that takes less than this, and pretending otherwise ruins every estimate
     downstream. */
  var HOP_MINUTES = 20;

  /* ---------------------------------------------------------------- planner */
  function ageOf(rec) { return rec && rec.updated ? Date.now() - rec.updated : null; }

  /* The queue you would actually stand in, given how you are riding today.
     A show has no queue: what it costs you is the wait for the next
     performance, which the feed does publish, so use that instead of nothing. */
  function usableWait(id, rec, prefs) {
    if (!rec) return { minutes: null, kind: null };
    if (prefs.express && rec.express !== null) return { minutes: rec.express, kind: "express" };
    if (prefs.single && rec.single !== null &&
      (rec.standby === null || rec.single < rec.standby)) return { minutes: rec.single, kind: "single" };
    if (rec.standby !== null) return { minutes: rec.standby, kind: "standby" };
    if (rec.single !== null && prefs.single) return { minutes: rec.single, kind: "single" };
    var show = minutesToNextShow(rec);
    if (show !== null) return { minutes: show, kind: "show" };
    return { minutes: null, kind: null };
  }

  function minutesToNextShow(rec) {
    if (!rec || !rec.showtimes || !rec.showtimes.length) return null;
    var now = Date.now(), best = null;
    rec.showtimes.forEach(function (s) {
      var t = Date.parse(s.startTime || "");
      if (t && t > now && (best === null || t < best)) best = t;
    });
    return best === null ? null : Math.round((best - now) / 60000);
  }

  /* What to charge a candidate whose wait nobody knows. Zero would make
     ignorance the cheapest thing on the list, which is how a ride the app has
     no data for ends up as the headline recommendation. A middling wait is the
     neutral assumption, and the card says out loud that it is one. */
  var ASSUMED_WAIT = 30;

  function valueOf(r) {
    if (has(r.id, "skip")) return 10;
    if (has(r.id, "must")) return 100;
    if (r.type === "ride") return 55;
    if (r.type === "show") return 35;
    return 25;
  }

  /* Rank what is worth doing next. Returns every candidate with the reasoning
     attached, so the UI can explain itself rather than present a bare order. */
  function plan(opts) {
    var park = opts.park;
    var prefs = { express: !!opts.express, single: !!opts.single };
    var rated = opts.rated || {};
    var at = opts.position || null;      /* [lat, lng] or null */
    var now = Date.now();
    /* The gates being shut beats every per-ride rule below it. Without this, an
       attraction the schedule says nothing about — a Horror Nights house on a
       night with no ticketed block published — reads as available at 3am. */
    var parkHours = hours(park);
    var parkShut = parkHours && !parkHours.open;

    var out = [];
    RIDES.forEach(function (r) {
      if (r.p !== park) return;
      if (has(r.id, "closed")) return;   /* not running on the trip dates at all */
      if (rated[r.id]) return;           /* rating it is how you mark it done */

      var rec = state.rides[r.id] || null;
      var win = window_(r.id);
      var w = usableWait(r.id, rec, prefs);
      var walk = walkMinutes(at, r.id);
      var cost = (w.minutes === null ? ASSUMED_WAIT : w.minutes) + (walk === null ? 0 : walk);

      var item = {
        ride: r, live: rec, wait: w.minutes, waitKind: w.kind, walk: walk,
        window: win, reasons: [], blocked: null, score: 0,
        vsTypical: null, minutesLeft: null,
      };

      /* --- is it available at all right now --- */
      if (parkShut) {
        item.blocked = parkHours.opensAt ? "later" : "done";
        if (parkHours.opensAt) item.opensIn = Math.round((parkHours.opensAt - now) / 60000);
      } else if (win && win.start && now < win.start) {
        item.blocked = "later";
        item.opensIn = Math.round((win.start - now) / 60000);
      } else if (win && win.end && now > win.end) {
        item.blocked = "done";
      } else if (rec && (rec.status === "CLOSED" || rec.status === "DOWN" || rec.status === "REFURBISHMENT")) {
        /* Inside its hours but not running. Worth keeping on the list — a ride
           that goes down usually comes back — but never worth walking to now. */
        item.blocked = rec.status === "DOWN" ? "down" : "shut";
      }

      if (win && win.end) {
        item.minutesLeft = Math.round((win.end - now) / 60000);
        if (!item.blocked && item.minutesLeft < cost) item.blocked = "too-late";
      }

      /* --- score the ones you could actually go and do --- */
      var value = valueOf(r);
      var score = value - cost * 1.2;

      /* Something that stops before the rest of the day does cannot simply be
         done later, so it climbs as its window closes. */
      if (item.minutesLeft !== null && item.minutesLeft < 180) {
        score += 40 * (1 - Math.max(0, item.minutesLeft) / 180);
        if (item.minutesLeft < 75) item.reasons.push("Only " + item.minutesLeft + " min left on this one");
      }

      /* The feed's own forecast for this hour. Being well under it is the
         difference between a good time to go and an average one. */
      if (rec && rec.forecastNow !== null && rec.standby !== null) {
        item.vsTypical = rec.standby - rec.forecastNow;
        if (item.vsTypical <= -10) { score += 12; item.reasons.push("Shorter than usual for this hour"); }
        else if (item.vsTypical >= 15) { score -= 8; item.reasons.push("Longer than usual for this hour"); }
      }

      if (w.kind === "express") item.reasons.push("Express line");
      if (w.kind === "single") item.reasons.push("Single rider line");
      if (w.kind === "show") item.reasons.push("Next performance in " + w.minutes + " min");
      if (has(r.id, "must")) item.reasons.push("On your must-do list");
      /* Ignorance is charged an assumed wait above, and said out loud here, so
         it can neither win by looking free nor be mistaken for a short queue. */
      if (w.minutes === null && !item.blocked) {
        score -= 8;
        item.reasons.push("No live wait for this one — assuming about " + ASSUMED_WAIT + " min");
      }

      item.score = score;
      out.push(item);
    });

    out.sort(function (a, b) {
      /* Anything you cannot do right now sinks below everything you can, in one
         move, so the top of the list is always actionable. */
      if (!!a.blocked !== !!b.blocked) return a.blocked ? 1 : -1;
      return b.score - a.score;
    });
    return out;
  }

  /* --------------------------------------------------------------- freshness
     One place decides what "old" means, so the badge on a wait time and the
     warning on the planner can never disagree. */
  function freshness(park) {
    /* Scoped to one park on purpose. Disney data half an hour old must not make
       the bar over a Universal screen read "waits from just now" — the two
       parks are fetched separately and can fail independently. */
    var newest = 0;
    Object.keys(state.rides).forEach(function (id) {
      var r = byId[id];
      if (park && (!r || r.p !== park)) return;
      var u = state.rides[id].updated;
      if (u > newest) newest = u;
    });
    var age = newest ? Date.now() - newest : null;
    return {
      newest: newest || null,
      age: age,
      stale: age !== null && age > STALE_MS,
      useless: age === null || age > USELESS_MS,
      busy: state.busy,
      tp: state.sources.tp,
      qt: state.sources.qt,
      /* Universal's waits come from Queue-Times alone, so that feed failing
         there is a blackout, not a degradation. */
      anyOk: !!(state.sources.tp.ok || state.sources.qt.ok),
    };
  }

  /* ------------------------------------------------------------- coverage
     What the mapping table did and did not manage to line up, as data the app
     can show. An unmatched must-do is the failure this whole design exists to
     make impossible to miss, so it is counted separately. */
  function coverage(park) {
    var rows = RIDES.filter(function (r) { return !park || r.p === park; });
    var mapped = 0, live = 0, missing = [], mustMissing = [];
    rows.forEach(function (r) {
      var m = MAP.rides[r.id];
      if (m && (m.tp || m.qt != null)) mapped++;
      else missing.push(r);
      if (state.rides[r.id]) live++;
      else if (has(r.id, "must") && !has(r.id, "closed")) mustMissing.push(r);
    });
    return {
      total: rows.length, mapped: mapped, live: live,
      unmapped: missing, mustWithoutLive: mustMissing, drift: state.drift,
      /* Source side. Not filtered by park: the orphan lists describe the last
         refresh, which covers whichever parks were loaded then. */
      orphans: state.orphans,
    };
  }

  /* Said once at startup, before any network call, so a mapping mistake shows
     up in the console even if every feed is unreachable. */
  function auditCatalogue() {
    var missing = RIDES.filter(function (r) {
      var m = MAP.rides[r.id];
      return !m || (!m.tp && m.qt == null);
    });
    if (!missing.length || typeof console === "undefined" || !console.warn) return;
    console.warn("[live] attractions with no entry in live-map.js (they can never show a wait):",
      missing.map(function (r) { return r.p + " " + r.n; }));
  }

  /* ------------------------------------------------------------------- loop */
  function startPolling(getPark) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      if (skipPolls > 0) { skipPolls--; return; }
      refresh(getPark());
    }, POLL_MS);
    document.addEventListener("visibilitychange", function () {
      /* Coming back to the app is exactly when a twenty-minute-old wait is most
         likely to send you to the wrong side of the park. */
      if (!document.hidden) { skipPolls = 0; refresh(getPark()); }
    });
    window.addEventListener("online", function () {
      skipPolls = 0;
      state.sources.tp.fails = 0;
      state.sources.qt.fails = 0;
      refresh(getPark());
    });
  }

  loadCache();
  auditCatalogue();

  return {
    refresh: refresh,
    onChange: function (fn) { listeners.push(fn); },
    startPolling: startPolling,
    ride: function (id) { return state.rides[id] || null; },
    hours: hours,
    window: window_,
    plan: plan,
    freshness: freshness,
    coverage: coverage,
    walkMinutes: walkMinutes,
    hopMinutes: HOP_MINUTES,
    attribution: function () { return state.attribution; },
    ageOf: ageOf,
    _state: state,
  };
})();
