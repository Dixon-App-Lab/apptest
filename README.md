# Fresh Draw

An installable PWA that generates an NZ Lotto line — 6 numbers from 40 plus a
Powerball — skipping any combination of six that has already been drawn.

Built as an R&D experiment: the point is the learnings (PWA install and offline
behaviour on Android, a real data pipeline, honest UI about probability), not a
betting tool.

## It does not improve your odds, and says so

There are 3,838,380 ways to choose 6 numbers from 40. NZ Lotto has run roughly
4,000 draws since 1987, so past winners are about **0.1%** of the space.
Excluding them moves your chance of matching all six from 1 in 3,838,380 to
1 in 3,834,311 — no meaningful difference. Each combination is equally likely
every draw, and the machine has no memory.

The app states this in its own UI rather than implying an edge. What the filter
actually gives you is a line nobody has ever won with, which is a fun property
and a genuine set-membership problem, but not an advantage.

## Current status: placeholder draw data

`data/draws.json` currently holds **4,069 synthetic draws** — the right shape,
size, and date range as real NZ Lotto history, but not real results. The app
shows a warning banner while this is the case.

There is no official public MyLotto API. Real history has to come from a CSV
export or a scrape of a third-party aggregator. Swapping it in means replacing
`data/draws.json` with the same schema and flipping `meta.synthetic` to `false`
— no code changes.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The whole app. No framework, no build step. |
| `sw.js` | Service worker. Cache-first; bump `CACHE` on every deploy. |
| `manifest.webmanifest` | Install metadata. All paths relative, so it works from a Pages subpath. |
| `data/draws.json` | The past-draw set, with a `meta` block describing the game's shape. |
| `icons/` | Generated — edit `tools/icon.svg`, not these. |
| `tools/` | Dataset generator, icon builder, browser verification. Development only; not deployed. |

## Working on it

```sh
npm install          # playwright-core, for the verification run
npm run serve        # http://127.0.0.1:8765
npm run verify       # drives a real browser against the running server
npm run data         # regenerate the synthetic dataset
npm run icons        # re-render icons from tools/icon.svg
```

`npm run verify` is the real test: it checks generation rules (6 distinct
numbers in range, ascending, never a past winner), that the exclusion set
actually contains known past draws, that the main row never wraps between 320px
and 600px, service-worker registration, Android install criteria, and that the
app still works with the network cut.

The same run happens in CI on every pull request
(`.github/workflows/verify.yml`), with the rendered screenshots uploaded as a
build artifact. It uses whatever Chromium Playwright installs; set `CHROME_PATH`
to point it at a specific browser.

## Installing it on Android

1. Enable Pages once: **Settings → Pages → Source → GitHub Actions.**
2. Merge to `main`; the workflow publishes over HTTPS, which Chrome requires
   before it will offer installation.
3. Open the Pages URL in Chrome on the phone → menu → **Add to Home screen**.

It then launches standalone, with no browser chrome, and works offline.

## Process docs

This repo was started from an SDLC framework template; that material lives in
[`docs/sdlc-framework.md`](docs/sdlc-framework.md), with the working state in
[`docs/dev-board.html`](docs/dev-board.html) and `CLAUDE.md`.
