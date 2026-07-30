// Produces a stand-in historical dataset shaped exactly like real NZ Lotto
// results, so the exclusion logic and its data pipeline can be built and tested
// before real draw data is available. Replace data/draws.json with real results
// and nothing in app.js needs to change.
//
// Seeded so re-running gives an identical file — a random dataset would make
// every run a spurious diff.
//
// Usage: node tools/generate-synthetic-draws.mjs

import { writeFileSync, mkdirSync } from 'node:fs';

const MAIN_POOL = 40;
const MAIN_COUNT = 6;
const POWERBALL_POOL = 10;
const FIRST_DRAW = '1987-08-01'; // first NZ Lotto draw
const LAST_DRAW = '2026-07-25';

// mulberry32 — small seeded PRNG, enough for placeholder data.
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(19870801);
const randInt = (n) => Math.floor(rand() * n) + 1;

function drawDates(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const day = cursor.getUTCDay(); // 3 = Wed, 6 = Sat
    if (day === 3 || day === 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function pickMain() {
  const picked = new Set();
  while (picked.size < MAIN_COUNT) picked.add(randInt(MAIN_POOL));
  return [...picked].sort((a, b) => a - b);
}

const dates = drawDates(FIRST_DRAW, LAST_DRAW);
const seen = new Set();
const draws = [];

for (const [i, date] of dates.entries()) {
  // A real 6-from-40 combination has never repeated, and with ~4k draws in a
  // 3.8M space it is very unlikely to — but dedupe so the dataset can't lie.
  let numbers;
  let key;
  do {
    numbers = pickMain();
    key = numbers.join('-');
  } while (seen.has(key));
  seen.add(key);

  draws.push({ draw: i + 1, date, numbers, powerball: randInt(POWERBALL_POOL) });
}

const payload = {
  meta: {
    synthetic: true,
    warning: 'PLACEHOLDER DATA — these are not real NZ Lotto results.',
    generated: new Date().toISOString().slice(0, 10),
    generator: 'tools/generate-synthetic-draws.mjs',
    game: 'NZ Lotto',
    mainPool: MAIN_POOL,
    mainCount: MAIN_COUNT,
    powerballPool: POWERBALL_POOL,
    drawCount: draws.length,
    firstDraw: draws[0].date,
    lastDraw: draws.at(-1).date,
  },
  draws,
};

// One draw per line: keeps a 4k-row dataset readable and gives clean diffs when
// real data lands.
const body = draws.map((d) => `    ${JSON.stringify(d)}`).join(',\n');
const json = `{\n  "meta": ${JSON.stringify(payload.meta, null, 2).replace(/\n/g, '\n  ')},\n  "draws": [\n${body}\n  ]\n}\n`;

mkdirSync('data', { recursive: true });
writeFileSync('data/draws.json', json);

console.log(`Wrote data/draws.json — ${draws.length} draws, ${draws[0].date} to ${draws.at(-1).date}`);
