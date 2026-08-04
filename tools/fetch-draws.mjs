// Builds data/draws.json from lottoresults.co.nz. Runs in Actions only: the
// dev container is refused at the proxy, so this cannot be run or tested from
// a session (see the D1 card on the dev board).
//
// Shape of a rendered draw, confirmed by recon:
//
//   Lotto Result for Saturday, 01 August 2026 Draw Number: 2608
//   Jackpot: $1,000,000   8 14 15 24 26 30   7   4   30 26 8 24
//   \_________ six main _________/  bonus  PB  \__ Strike __/
//
// Only the six main numbers and the Powerball go into the dataset. The bonus
// ball and Strike are dropped -- the exclusion set is keyed on six-number
// combinations by canonical() and nothing else enters it.
//
// Strike is always a subset of the six main numbers, which is a free check on
// the parse: if it is not a subset, the numbers were read wrong. That is an
// assertion here, not a warning, because silently writing a mis-parsed dataset
// would break the exclusion set while the app still looked fine.
//
// Powerball started partway through Lotto's history and Strike later still, so
// older draws legitimately carry fewer than twelve numbers. Token counts are
// reported rather than assumed.

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const DELAY_MS = 700;
// Scope and dry-run are separate: limiting how far back to go is a product
// decision, not a rehearsal. 0 = every month the archive lists.
const MONTHS_BACK = Number(process.env.MONTHS_BACK || 0);
const DRY_RUN = process.env.DRY_RUN === 'true';
const UA = 'FreshDrawFetch/1 (+https://github.com/Dixon-App-Lab/apptest) dataset build';

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ORIGIN = null;
let fetches = 0;

async function get(url, attempt = 1) {
  await sleep(DELAY_MS);
  fetches += 1;
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt < 3) {
      await sleep(1500 * attempt);
      return get(url, attempt + 1);
    }
    console.error(`  ! ${url} failed after ${attempt} attempts: ${err}`);
    return null;
  }
}

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const paths = (html, re) =>
  [...new Set([...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).filter((h) => re.test(h)))];

// One rendered result block -> a draw, or null with a reason.
function parseBlock(block) {
  // The jackpot is not always an amount: "Jackpot: Rollover" and "Jackpot:
  // Must Be Won" both occur. An earlier version skipped non-digits to find a
  // number, which on "Jackpot: Rollover 5 12 19 …" ate the first main number
  // and shifted every field left. Consume words and a $amount explicitly, and
  // never a bare number -- a bare number after "Jackpot:" is a ball.
  const head = block.match(
    /^Lotto Result for [A-Za-z]+,\s*(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})\s*Draw Number:\s*([\d,]+)\s*(?:Jackpot:\s*(?:[A-Za-z][A-Za-z ]*)?(?:\$[\d,]+)?\s*)?/i,
  );
  if (!head) return { error: 'no header' };

  const [, dd, monthName, yyyy, drawNo] = head;
  const month = MONTHS.indexOf(monthName.toLowerCase());
  if (month < 0) return { error: `bad month ${monthName}` };

  // The balls run immediately after the header. Take the maximal leading run
  // of 1-2 digit numbers and stop at the first word -- anchoring on position
  // rather than scanning the whole block keeps prose numbers out.
  const run = block.slice(head[0].length).match(/^((?:\d{1,2}\s+)*\d{1,2})(?!\d)/);
  if (!run) return { error: 'no number run' };

  const tok = run[1].trim().split(/\s+/).map(Number);
  if (tok.length < 6) return { error: `only ${tok.length} numbers` };

  const numbers = [...tok.slice(0, 6)].sort((a, b) => a - b);
  const bonus = tok[6] ?? null;

  // Do not count fixed positions from the left. Powerball began partway
  // through Lotto's history, so a 1987 draw renders six main, a bonus and four
  // Strike -- eleven numbers -- and reading tok[7] as the Powerball shifted
  // Strike left on every pre-Powerball draw. That was 21% of history.
  //
  // Identify Strike structurally instead: it is drawn from the main numbers,
  // so a trailing four that are all in main is Strike. Whatever remains
  // between the bonus and Strike is the Powerball, or nothing.
  const rest = tok.slice(7);
  let strike = [];
  let middle = rest;
  if (rest.length >= 4 && rest.slice(-4).every((n) => numbers.includes(n))) {
    strike = rest.slice(-4);
    middle = rest.slice(0, -4);
  }
  if (middle.length > 1) return { error: `${middle.length} unexplained numbers between bonus and strike` };
  const powerball = middle.length === 1 ? middle[0] : null;

  return {
    draw: Number(drawNo.replace(/,/g, '')),
    date: `${yyyy}-${String(month + 1).padStart(2, '0')}-${dd.padStart(2, '0')}`,
    numbers,
    powerball,
    _bonus: bonus,
    _strike: strike,
    _tokens: tok.length,
  };
}

for (const candidate of ['https://lottoresults.co.nz', 'http://lottoresults.co.nz']) {
  const probe = await get(`${candidate}/`);
  if (probe) {
    ORIGIN = candidate;
    break;
  }
}
if (!ORIGIN) {
  console.error('Site unreachable.');
  process.exit(1);
}
console.log(`origin: ${ORIGIN}`);

// Discover month pages. The archive indexes them; it may index years which in
// turn index months, so follow one level down before giving up.
const monthRe = new RegExp(`/lotto/(?:${MONTHS.join('|')})-\\d{4}$`, 'i');
const months = new Set();

for (const seed of [`${ORIGIN}/lotto/archive`, `${ORIGIN}/lotto/`]) {
  const html = await get(seed);
  if (!html) continue;
  paths(html, monthRe).forEach((p) => months.add(new URL(p, ORIGIN).pathname));

  for (const yearPath of paths(html, /\/lotto\/(archive\/)?(19|20)\d{2}\/?$/i)) {
    const y = await get(new URL(yearPath, ORIGIN).toString());
    if (y) paths(y, monthRe).forEach((p) => months.add(new URL(p, ORIGIN).pathname));
  }
}

// Sort chronologically, not alphabetically. Sorting the paths as strings put
// every September together, so the first smoke run sampled six Septembers and
// called them "the newest six".
const monthKey = (p) => {
  const m = p.match(/\/lotto\/([a-z]+)-(\d{4})$/i);
  return m ? Number(m[2]) * 12 + MONTHS.indexOf(m[1].toLowerCase()) : -1;
};
const monthList = [...months].sort((a, b) => monthKey(a) - monthKey(b));
console.log(`month pages discovered: ${monthList.length}`);
if (!monthList.length) {
  console.error('No month pages found -- the archive layout changed. Not writing anything.');
  process.exit(1);
}

// Dump one month's rendered text and stop. For diagnosing a parse against what
// the page actually says rather than against what it was assumed to say.
if (process.env.DEBUG_MONTH) {
  const html = await get(`${ORIGIN}${process.env.DEBUG_MONTH}`);
  if (!html) {
    console.error('debug fetch failed');
    process.exit(1);
  }
  const blocks = text(html).split(/(?=Lotto Result for )/).filter((b) => b.startsWith('Lotto Result for'));
  console.log(`\n${blocks.length} result block(s) on ${process.env.DEBUG_MONTH}\n`);
  blocks.forEach((b, n) => console.log(`--- block ${n} ---\n${b.slice(0, 420)}\n`));
  process.exit(0);
}

const todo = MONTHS_BACK > 0 ? monthList.slice(-MONTHS_BACK) : monthList;
console.log(
  `fetching ${todo.length} of ${monthList.length} month page(s)` +
    `${MONTHS_BACK ? ` — newest ${MONTHS_BACK} months (~${(MONTHS_BACK / 12).toFixed(1)} years)` : ' — full archive'}` +
    `${DRY_RUN ? '  [DRY RUN — writes nothing]' : ''}\n`,
);

const byDraw = new Map();
const shapes = new Map();
const problems = [];
const deadMonths = [];

for (const [i, path] of todo.entries()) {
  const html = await get(`${ORIGIN}${path}`);
  if (!html) {
    // A month the site links but does not serve. That is missing draws, not a
    // parse fault, so it is reported separately and does not count toward the
    // failure gate -- otherwise a few dead months could mask a real parse bug.
    deadMonths.push(path);
    continue;
  }

  const blocks = text(html).split(/(?=Lotto Result for )/).filter((b) => b.startsWith('Lotto Result for'));
  let ok = 0;

  for (const block of blocks) {
    const d = parseBlock(block);
    if (d.error) {
      problems.push(`${path}: ${d.error}`);
      continue;
    }

    const bad = [];
    if (new Set(d.numbers).size !== 6) bad.push('duplicate main numbers');
    if (d.numbers.some((n) => n < 1 || n > 40)) bad.push('main number out of 1-40');
    if (d.powerball !== null && (d.powerball < 1 || d.powerball > 10)) bad.push(`powerball ${d.powerball} out of 1-10`);
    // The self-check: Strike is drawn from the main numbers.
    if (d._strike.length === 4 && !d._strike.every((n) => d.numbers.includes(n))) bad.push('strike not a subset of main');

    if (bad.length) {
      problems.push(`draw ${d.draw} (${d.date}): ${bad.join('; ')} [tokens ${d._tokens}: ${d.numbers} b=${d._bonus} pb=${d.powerball} s=${d._strike}]`);
      continue;
    }

    shapes.set(d._tokens, (shapes.get(d._tokens) || 0) + 1);
    // Key on date and combination, not draw number. The site renders a few
    // 2006-era draws under a wrong draw number, and keying on draw number let
    // those overwrite genuine draws -- draw 101 lost its real 1989 result to a
    // 2006 one. Draw numbers are not unique in the source, so they cannot be
    // the identity here; a draw is a date plus what was drawn on it.
    byDraw.set(`${d.date}|${d.numbers.join('-')}`, { draw: d.draw, date: d.date, numbers: d.numbers, powerball: d.powerball });
    ok += 1;
  }

  if ((i + 1) % 25 === 0 || i === todo.length - 1) {
    console.log(`  [${i + 1}/${todo.length}] ${path} -> ${ok} draws (running total ${byDraw.size})`);
  }
}

const draws = [...byDraw.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.draw - b.draw));

// Report what the source got wrong rather than smoothing it over: a draw
// number appearing on two different dates is a site error, and a gap in the
// numbering is a combination missing from the exclusion set.
const seenNumbers = new Map();
const conflicts = [];
for (const d of draws) {
  if (seenNumbers.has(d.draw) && seenNumbers.get(d.draw) !== d.date) {
    conflicts.push(`draw ${d.draw} on both ${seenNumbers.get(d.draw)} and ${d.date}`);
  } else {
    seenNumbers.set(d.draw, d.date);
  }
}
// Count gaps inside the window that was actually requested. Measuring from
// draw 1 when only the last 15 years were asked for would report thousands
// "missing" that were never in scope, which tells the reader nothing.
const present = new Set(draws.map((d) => d.draw));
const highest = Math.max(...present);
const lowest = Math.min(...present);
const missingNumbers = [];
for (let n = lowest; n <= highest; n += 1) if (!present.has(n)) missingNumbers.push(n);

console.log(`\n${'='.repeat(60)}`);
console.log(`parsed draws     : ${draws.length}`);
console.log(`http requests    : ${fetches}`);
console.log(`token shapes     : ${[...shapes.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}->${v}`).join('  ')}`);
console.log(`without powerball: ${draws.filter((d) => d.powerball === null).length}`);
console.log(`problems         : ${problems.length}`);
console.log(`unreachable months: ${deadMonths.length}${deadMonths.length ? ` — ${deadMonths.join(', ')}` : ''}`);
problems.slice(0, 25).forEach((p) => console.log(`  - ${p}`));
if (problems.length > 25) console.log(`  ... and ${problems.length - 25} more`);

if (!draws.length) {
  console.error('\nNo draws parsed. Not writing anything.');
  process.exit(1);
}

// Gaps are expected on a smoke run; on a full run they mean missed pages.
const gaps = [];
for (let i = 1; i < draws.length; i += 1) {
  if (draws[i].draw !== draws[i - 1].draw + 1) gaps.push(`${draws[i - 1].draw}->${draws[i].draw}`);
}
console.log(`duplicate draw nos: ${conflicts.length}${conflicts.length ? ` — ${conflicts.slice(0, 6).join('; ')}` : ''}`);
console.log(`window           : draws ${lowest}-${highest} (${highest - lowest + 1} numbered)`);
console.log(`missing in window: ${missingNumbers.length} (${((missingNumbers.length / (highest - lowest + 1)) * 100).toFixed(1)}%)`);
console.log(`legacy gap check : ${gaps.length}${gaps.length ? ` (${gaps.slice(0, 10).join(', ')}${gaps.length > 10 ? ', …' : ''})` : ''}`);

if (DRY_RUN) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}

const failureRate = problems.length / (problems.length + draws.length);
if (failureRate > 0.01) {
  console.error(`\nParse failure rate ${(failureRate * 100).toFixed(2)}% exceeds 1%. Not writing a dataset this unreliable.`);
  process.exit(1);
}

const existing = JSON.parse(await readFile('data/draws.json', 'utf8'));
const out = {
  meta: {
    synthetic: false,
    source: `${ORIGIN}/lotto/`,
    fetched: new Date().toISOString().slice(0, 10),
    generator: 'tools/fetch-draws.mjs',
    game: existing.meta.game,
    mainPool: existing.meta.mainPool,
    mainCount: existing.meta.mainCount,
    powerballPool: existing.meta.powerballPool,
    drawCount: draws.length,
    firstDraw: draws[0].date,
    lastDraw: draws[draws.length - 1].date,
    // Coverage is not complete and the dataset should say so rather than let a
    // reader assume every draw is here. highestDrawNumber minus drawCount is
    // what the exclusion set is missing.
    lowestDrawNumber: lowest,
    highestDrawNumber: highest,
    missingDrawCount: missingNumbers.length,
    coverage: MONTHS_BACK
      ? `newest ${MONTHS_BACK} month pages; earlier draws deliberately not collected`
      : 'full archive as published by the source',
  },
  draws,
};

const json = `${JSON.stringify(out, null, 2)}\n`;
await writeFile('data/draws.json', json);
console.log(`\nwrote data/draws.json — ${draws.length} draws, ${out.meta.firstDraw} to ${out.meta.lastDraw}`);

// Phones cache-first, so a dataset change that does not move CACHE ships to
// nobody. Derive the version from the content, not from the last draw number:
// narrowing the window from 39 years to 15 changed 1,200 draws while the last
// draw stayed 2608, so a draw-number version would not have moved and every
// installed phone would have kept the old dataset indefinitely.
const sw = await readFile('sw.js', 'utf8');
if (!/const CACHE = '[^']*';/.test(sw)) {
  console.error('No CACHE declaration found in sw.js — refusing to ship data phones would not pick up.');
  process.exit(1);
}
const digest = createHash('sha256').update(json).digest('hex').slice(0, 8);
const cache = `freshdraw-d${draws[draws.length - 1].draw}-${digest}`;
const bumped = sw.replace(/const CACHE = '[^']*';/, `const CACHE = '${cache}';`);
await writeFile('sw.js', bumped);
console.log(bumped === sw ? `sw.js CACHE already ${cache} (data unchanged)` : `bumped sw.js CACHE -> ${cache}`);
