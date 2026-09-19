# Ride Rater

A small web app for rating every ride at Universal Studios Hollywood, Disneyland Park
and Disney California Adventure, built for a trip in mid-September 2026.

**Live:** https://ddotrhodes.github.io/ride-rater/

Repo: [DdotRhodes/ride-rater](https://github.com/DdotRhodes/ride-rater) (public — GitHub
Pages on a free plan cannot serve a private repo). An older copy is still up at
https://rate-the-rides.surge.sh; it is no longer the canonical one.

## What it does

- **Now** — live wait times and one answer to "what do we do next", scored on the
  queue you would actually stand in. See [Live wait times](#live-wait-times).
- **128 attractions** across the three parks, grouped by land. 67 are rides; shows,
  walk-throughs, play areas, Halloween Horror Nights and Oogie Boogie Bash are behind
  toggles under **More** so the default list stays short.
- **Rate 1–10** with an optional one-line note. Two taps from list to saved.
- **Ranking** — your rides best to worst, or a combined average once someone has
  shared theirs with you.
- **Compare** — side-by-side scores with whoever you're rating alongside, sorted by
  biggest disagreement, plus exact matches and average gap.
- **Export** CSV or JSON to keep after the trip.

## How two people share

There is no server and no account. Everything lives in the browser on each phone.

To compare, one person taps **Share my link** — that produces a URL with their scores
compressed into the hash fragment. The other opens it and the scores merge into their
app next to their own. Send a fresh link whenever you want to update the other side.
A full 128-attraction set with notes packs into about 1.5 KB of URL, so it sends fine
over iMessage or Discord.

Nothing is uploaded anywhere. The scores only travel when someone deliberately sends
a link.

## Live wait times

The **Now** tab ranks what is worth doing next out of live queue data, and every
number on it is stamped with where it came from and how old it is.

### The two feeds

| | ThemeParks.wiki | Queue-Times |
|---|---|---|
| Reachable from the browser | yes (`Access-Control-Allow-Origin: *`) | **no** — sends no CORS headers at all |
| Disneyland / California Adventure | standby, single rider, Lightning Lane windows, showtimes, status, park hours | standby, single rider |
| Universal Hollywood | status and showtimes only, **no waits** | the only source of waits, including Horror Nights houses and their Express lines |

Because Queue-Times cannot be fetched from a page, it comes through `/waits` on the
sync service (`sync/netlify/functions/waits.mjs`), which is a thin proxy: three parks
only, an 8-second upstream timeout, 60 seconds of shared caching, and a 502 when
nothing upstream answers. Which feed wins is decided per field in `mergeRide()`, not
per feed — Disney's own numbers beat Queue-Times where both answer.

Attribution: Queue-Times asks for "Powered by Queue-Times.com" linking to
<https://queue-times.com/en-US>. It is on the Universal planner and under **More**,
and the proxy repeats it in every response.

### Ride matching is explicit, and audited

`public/live-map.js` maps every attraction to its id in each feed by hand, along with
the feed's own name at the time of mapping. Nothing is fuzzy-matched: a near miss
would be silent, and a must-do quietly losing its wait time is the failure this whole
design exists to prevent.

`node verify-map.mjs` re-fetches both feeds and audits the table against them — every
id resolves, every recorded name still matches, no id is claimed twice, and every
Queue-Times row is either mapped or explicitly dismissed in `ignoredFeedRows`. **Run
it before any deploy.** It exits non-zero on a problem.

An id that is missing from `/live` is not automatically wrong: ThemeParks only lists
what is scheduled, so an off-season scare zone drops out during the day. Those are
re-checked against the entity endpoint and reported as "dark right now" rather than
broken.

The app carries the same accounting at runtime. It logs unmapped attractions and
unclaimed feed rows to the console with a `[live]` prefix, and **More → Live wait
times** shows the same thing on screen: how many attractions matched, how many have
live data now, any must-do without a source, anything a feed has renamed, and any
attraction the feeds carry that this app does not.

### What it deliberately does not know

**Lightning Lane and Express return times are not available from any free source, and
the app never invents them.** Where ThemeParks reports that a park is *distributing*
Lightning Lane for a window, that is shown as the park's claim, worded so it cannot be
read as a claim about passes you are holding. Universal Express is only ever shown as
a *queue length* from Queue-Times, which is a real measurement.

### When things break

| Situation | What you see |
|---|---|
| A feed is unreachable | The bar names which one, and the app keeps the last numbers with their true age |
| Both feeds unreachable, nothing cached | "Couldn't reach the wait-time services. Nothing here is live." No wait chips at all |
| Data older than 20 min | "Waits from 25 min ago — couldn't refresh since" |
| Data older than 90 min | "Treat them as history, not fact", repeated on the recommendation card itself |
| Park closed | The hours bar and the planner both say so, instead of a screen of zero-minute walk-ons |
| A ride has no live wait | It is charged an assumed 30 minutes and says so, so ignorance never wins by looking free |

Polling is every 2.5 minutes while the app is visible, plus on foreground and on
regaining a connection, backing off after repeated failures. Both feeds move on a
roughly five-minute cycle, so polling faster would spend battery on identical bytes.

## Offline

It's a PWA with a service worker that precaches every asset, so it runs with no signal
at all — which matters, because park wifi is bad and the whole point is rating a ride
right after getting off it. Add to Home Screen for a full-screen app icon.

## Files

```
public/
  index.html            markup
  styles.css            styles (dark, mobile-first, safe-area aware)
  app.js                all logic — storage, rendering, share encoding
  data.js               the attraction list, trip flags, coordinates
  live.js               live feeds, park hours, the planner
  live-map.js           the hand-checked feed mapping table
  sw.js                 offline cache
  manifest.webmanifest  PWA manifest
  icon-*.png            app icons
sync/                   Netlify functions: trip sync, and the Queue-Times proxy
verify-map.mjs          audits live-map.js against both live feeds
test-fixes.mjs          sync + storage regressions
test-round2.mjs         list, ranking, compare, rating sheet
test-live.mjs           the live layer, feeds stubbed
deploy.py               publish to surge.sh (legacy mirror)
publish_github.py       publish to GitHub Pages (canonical)
```

## Tests

```bash
node verify-map.mjs     # hits both live feeds; exits 1 on a mapping problem
node test-fixes.mjs     # 10 checks
node test-round2.mjs    # 31 checks
node test-live.mjs      # 67 checks
```

The three `.mjs` suites drive a real Chromium at phone size against `public/` served
under the `/ride-rater/` subpath, the way Pages serves it. They stub the network, so
they neither depend on a park being open nor hit the real APIs — `verify-map.mjs` is
the one that talks to the outside world, and it is the one to re-run before a deploy.

## Where the ride data came from

Live park listings from the [ThemeParks.wiki API](https://api.themeparks.wiki/v1/destinations),
fetched 7 September 2026, cross-checked against park maps. Lands were assigned by hand.

Because it's live data it reflects what is actually operating right now, including the
seasonal state: Haunted Mansion Holiday rather than Haunted Mansion, the Cars Land
Haul-O-Ween overlays, and Fast & Furious: Hollywood Drift, which opened in 2026.

To refresh the list later, pull `/v1/entity/<parkId>/children` for each park:

| Park | ID |
|---|---|
| Disneyland Park | `7340550b-c14d-4def-80bb-acdb51d49a66` |
| Disney California Adventure | `832fcd51-ea19-4e77-85c7-75d5843b127c` |
| Universal Studios Hollywood | `bc4005c5-8c7e-41d7-b349-cdddf1796427` |

## Deploying changes

Bump `CACHE` in `public/sw.js` **first** whenever any file in `public/` changes —
otherwise phones that already installed the app keep serving the cached old version.
The service worker is cache-first for assets and never caches a wait time: requests to
`queue-times.com`, `api.themeparks.wiki` and the sync service bypass it entirely, so a
stale queue length can never be served with a fresh face.

Run `node verify-map.mjs` before publishing. A feed that has renamed or re-issued an
id will not break the app — waits match by id — but it is worth knowing about.

**GitHub Pages (canonical).** `publish_github.py` uploads `public/` to the repo root via
the GitHub contents API, enables Pages, and waits for the build. It needs `GITHUB_TOKEN`
from the OpenClaw secret store, which is only injected on the **Gateway exec path** — so
run it through the `trader` agent's `gateway_exec` tool, not an ordinary shell:

```bash
python3 rides/publish_github.py
```

It is idempotent: unchanged files are skipped, changed files are updated in place by sha.
It deliberately does **not** upload `public/CNAME` — on GitHub Pages a `CNAME` file sets a
custom domain, which would redirect the site at the old surge hostname and break it.

**surge.sh (legacy mirror).** `python3 deploy.py`. Account `micaopenclaw@proton.me`, free
tier; password in the secret store as `SURGE_PASSWORD`, write-only, though day to day
surge just uses the token cached in `~/.netrc`.

Every asset path in the app is relative (`./`), so it serves correctly from a subdirectory
like `/ride-rater/` as well as from a domain root. Share links are built from
`location.origin + location.pathname`, so they inherit whichever base the app is served
from.
