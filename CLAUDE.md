@AGENTS.md

# Fresh Draw — project memory

**Owner:** Antony Dixon (non-coder — product decisions his, engineering
decisions yours). Contact via the GitHub account that owns this repo — the
repo is public, so no email address here.
**Live:** `https://antonydixon-lab.github.io/apptest/` once G1 is done. Pages
is not enabled yet.

## Mission

An R&D experiment, not a product. A single-purpose installable PWA that
generates an NZ Lotto line (6 from 40 plus a Powerball) while skipping any
six-number combination that has already been drawn. The point is the
**learnings** — how PWA install and offline actually behave on Android, what a
real static data pipeline costs, and how to present a probability constraint
honestly — not a betting tool and not a product with users.

---

## The one thing that must never be gotten wrong

**Never imply that excluding past winners improves the odds.** It does not, and
the app's credibility rests entirely on saying so plainly.

There are 3,838,380 ways to choose 6 from 40. ~4,069 past draws are ~0.106% of
that space. Excluding them moves the odds from 1 in 3,838,380 to 1 in 3,834,311
— a rounding error. Every draw is independent; the machine has no memory.

The honesty panel in `index.html` ("Does skipping past winners improve my
odds?") is load-bearing, not decoration. If a change would make the app read as
though it confers an advantage — a "smart picks" label, a "hot numbers" feature,
a strategy framing — raise it with the owner rather than building it.

The **one** function that defines a combination's identity is `canonical()` in
`app.js`. It sorts ascending and joins with `-`. The dataset generator, the
exclusion `Set`, and the verification harness all depend on that exact shape;
derive it in a second place slightly differently and the exclusion silently
stops working while still appearing to.

## The data contract

`data/draws.json` is the interface between the app and reality:

```
meta: { synthetic, mainPool, mainCount, powerballPool, drawCount, firstDraw, lastDraw }
draws: [ { draw, date, numbers: [6 ascending], powerball } ]
```

- `meta.synthetic` drives the warning banner. It is currently `true` — the
  dataset is a generated stand-in, not real NZ Lotto history. Setting it to
  `false` is what claims the data is real, so only do that when it is.
- `meta.mainPool` / `mainCount` / `powerballPool` drive both the generator and
  the odds arithmetic. Ranges come from the data, not from hardcoded
  assumptions about the game — including assumptions I might have from training
  data about NZ Lotto's format history, which were never verified here.
- Swapping in real draws is a file replacement. If it needs a code change,
  something has drifted from this contract.

---

## Essential technical context

**Stack:** none. Hand-written HTML, CSS and ES modules; no framework, no build
step, no runtime dependencies. `playwright-core` is the single devDependency,
used only by the verification harness. This is deliberate — the project exists
to be read and understood.

**Codebase map:**

- `index.html` / `styles.css` / `app.js` — the whole app
- `sw.js` — cache-first service worker; **bump `CACHE` on every deploy** or
  phones keep serving stale files
- `data/draws.json` — the past-draw set (see contract above)
- `tools/` — dataset generator, icon builder, browser verification. Dev only;
  the deploy workflow copies just the runtime files
- `docs/dev-board.html` — current state, always read first

**Verification:** `npm run serve` then `npm run verify` drives real Chromium
against the app: generation rules, the exclusion set actually biting, layout at
320–600px, service-worker registration, Android install criteria, offline
operation. It has already caught two bugs that reading the code did not. Run it
before claiming anything works.

**Known environment quirks — these cost time to rediscover:**

- **The dev container's egress policy blocks the lotto data sources.**
  `mylotto.co.nz`, `lotteryresults.co.nz`, even `en.wikipedia.org` return 403 at
  the proxy CONNECT. Do not try to route around it. Anything needing live draw
  data has to run in GitHub Actions or on the owner's machine.
- **Headless Chromium clamps its window below ~500px and crops instead of
  scaling.** Sub-500px screenshots come out wrong, which is why every generated
  icon is 512px. Documented at the top of `tools/build-icons.mjs`.
- **An author `display` rule silently defeats the `hidden` attribute.** The
  global `[hidden] { display: none !important }` in `styles.css` exists because
  of a real bug, not as boilerplate. Don't remove it.

---

## Collaboration patterns

**Owner's preferences:** plain English over jargon; product scope is his,
engineering is yours; flag the concern then keep building rather than stopping;
prefers being told when an assumption turned out wrong.

**Your role:**
- Surface decisions that need the owner — don't guess.
- Call out scope creep or architectural risk.
- No builds without an explicit "go."
- Test feedback beats assumed correctness.

**Code decision patterns:**
- Prefer existing files to creating new ones. This app is four files; keep it
  that way unless there's a real reason.
- No comments unless the WHY is non-obvious. The comments that exist mostly
  record a constraint that was learned the hard way — keep those.
- No abstractions beyond what the task requires.
- Validate only at boundaries.

---

## Guardrails

- **Read `docs/dev-board.html` before assuming anything about current state.**
  Run `git status` and `git fetch` too — a file being right in the working tree
  doesn't mean it's current.
- **This repo was templated from an SDLC framework** (`docs/sdlc-framework.md`).
  If a doc reads as though it describes a large live system with real users, it
  may be leftover template boilerplate — check the code. This exact confusion
  already happened once, in the session that built v1.
- Don't set `meta.synthetic` to `false` while the data is synthetic.
- Don't add features that frame the app as improving the odds.
- Don't mock the browser in the verification harness — the whole value is that
  it drives a real one.
- Never force-push or rewrite shared history without asking.
- **Commit AND push every session.** An unpushed commit doesn't exist as far as
  anyone else is concerned.

---

## When you're stuck

- **"What's next?"** → dev board, Backlog / Blocked
- **"What happened recently?"** → dev board, Standup Log (newest first)
- **"Is this shipped?"** → dev board, ✅ Shipped
- **"Why is the data fake?"** → D0 on the board; the container can't reach the
  sources
- **"Does the app work?"** → `npm run serve` + `npm run verify`, don't guess
