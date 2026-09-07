# Ride Rater

A small web app for rating every ride at Universal Studios Hollywood, Disneyland Park
and Disney California Adventure, built for a trip in mid-September 2026.

**Live:** https://ddotrhodes.github.io/ride-rater/

Repo: [DdotRhodes/ride-rater](https://github.com/DdotRhodes/ride-rater) (public — GitHub
Pages on a free plan cannot serve a private repo). An older copy is still up at
https://rate-the-rides.surge.sh; it is no longer the canonical one.

## What it does

- **125 attractions** across the three parks, grouped by land. 67 are rides; shows,
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
A full 125-attraction set with notes packs into about 1.5 KB of URL, so it sends fine
over iMessage or Discord.

Nothing is uploaded anywhere. The scores only travel when someone deliberately sends
a link.

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
  data.js               the attraction list
  sw.js                 offline cache
  manifest.webmanifest  PWA manifest
  icon-*.png            app icons
deploy.py               publish to surge.sh (legacy mirror)
publish_github.py       publish to GitHub Pages (canonical)
```

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

Bump `CACHE` in `public/sw.js` **first** whenever `app.js`, `styles.css` or `data.js`
change — otherwise phones that already installed the app keep serving the cached old
version.

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
