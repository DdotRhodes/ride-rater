# Ride Rater

A small web app for rating every ride at Universal Studios Hollywood, Disneyland Park
and Disney California Adventure, built for a trip in mid-September 2026.

**Live:** https://rate-the-rides.surge.sh

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
deploy.py               publish to surge.sh
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

```bash
python3 deploy.py
```

Bump `CACHE` in `public/sw.js` whenever `app.js`, `styles.css` or `data.js` change —
otherwise phones that already installed the app keep serving the cached old version.

Hosted on surge.sh under `micaopenclaw@proton.me` (free tier, email verified). The
account password is in the OpenClaw secret store as `SURGE_PASSWORD`, write-only. Day
to day it isn't needed: surge caches an auth token in `~/.netrc`.

It's a static site with no build step, so it can move to GitHub Pages, Netlify or
Cloudflare Pages by dropping `public/` in — nothing here is surge-specific except
`deploy.py` and the `CNAME` file.
