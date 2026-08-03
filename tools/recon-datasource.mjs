// Throwaway recon for D1: does lottoresults.co.nz publish full past-draw
// history, and in what shape? Delete this file once D1 is decided.
//
// Two things learned the hard way, both encoded below:
//
// 1. The site is http-only. Assuming https gave TypeError: fetch failed on
//    every request while the workflow still reported success.
// 2. Findings must go to STDOUT, not just the artifact. The dev container's
//    egress policy blocks github.com, so a session cannot download its own
//    build artifacts -- but it can read job logs. The log is the only channel
//    that actually reaches the reader.
//
// It fetches and reports. Nothing is committed.

const ORIGIN_CANDIDATES = ['https://lottoresults.co.nz', 'http://lottoresults.co.nz'];
const DELAY_MS = 1500;

// Identify the crawler honestly rather than impersonating a browser.
const UA = 'FreshDrawRecon/1 (+https://github.com/Dixon-App-Lab/apptest) one-off data-source survey';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ORIGIN = null;

async function get(url) {
  await sleep(DELAY_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { error: String(err) };
  }
}

// Collapse markup to readable text. The point is to see the draw as a human
// would, since the previous run's regex scoring proved worse than useless.
const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

for (const candidate of ORIGIN_CANDIDATES) {
  const probe = await get(`${candidate}/`);
  console.log(`scheme probe ${candidate} -> ${probe.status ?? probe.error}`);
  if (probe.status && probe.status < 400) {
    ORIGIN = candidate;
    break;
  }
}
if (!ORIGIN) {
  console.error('No scheme answered.');
  process.exit(1);
}

console.log(`\n${'='.repeat(70)}\nROBOTS.TXT\n${'='.repeat(70)}`);
const robots = await get(`${ORIGIN}/robots.txt`);
console.log(robots.body?.slice(0, 1500) ?? robots.error);

// The archive index: how far back does it go, and how are draws addressed?
console.log(`\n${'='.repeat(70)}\nINDEX  ${ORIGIN}/lotto/\n${'='.repeat(70)}`);
const index = await get(`${ORIGIN}/lotto/`);
console.log(`status ${index.status ?? index.error}`);

let drawLinks = [];
if (index.body) {
  console.log(`\n--- text (first 2500 chars) ---\n${text(index.body).slice(0, 2500)}`);

  const hrefs = [...index.body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  drawLinks = [...new Set(hrefs.filter((h) => /\/lotto\/\d{1,2}-[a-z]+-\d{4}/i.test(h)))];

  console.log(`\n--- dated /lotto/ links on the index: ${drawLinks.length} ---`);
  console.log(drawLinks.slice(0, 40).join('\n'));

  // Pagination or an archive jump-off decides whether every draw back to 1987
  // is reachable, or only a recent window.
  const paging = [...new Set(hrefs.filter((h) => /page|archive|year|20\d\d|19\d\d/i.test(h) && /lotto/i.test(h)))];
  console.log(`\n--- possible pagination/archive links: ${paging.length} ---`);
  console.log(paging.slice(0, 40).join('\n'));
}

// Two draw pages: one known, one from the index, so the shape is confirmed
// twice rather than inferred from a single example.
const targets = [`${ORIGIN}/lotto/01-august-2026`];
for (const l of drawLinks.slice(0, 1)) {
  const abs = new URL(l, `${ORIGIN}/lotto/`).toString();
  if (!targets.includes(abs)) targets.push(abs);
}

for (const url of targets) {
  console.log(`\n${'='.repeat(70)}\nDRAW PAGE  ${url}\n${'='.repeat(70)}`);
  const res = await get(url);
  console.log(`status ${res.status ?? res.error}`);
  if (!res.body) continue;

  console.log(`\n--- text (first 3000 chars) ---\n${text(res.body).slice(0, 3000)}`);

  // Table cells verbatim: if the six balls live in <td>s, this is the shape a
  // converter would parse, and worth seeing before writing one.
  const cells = [...res.body.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((m) => text(m[1]))
    .filter(Boolean);
  console.log(`\n--- first 60 table cells (${cells.length} total) ---`);
  console.log(cells.slice(0, 60).map((c, n) => `[${n}] ${c.slice(0, 60)}`).join('\n'));
}
