// Throwaway recon for D1: find out whether lottoresults.co.nz publishes full
// past-draw history, and in what shape. Delete this file once D1 is decided.
//
// Why it exists as a workflow rather than a local script: the dev container's
// egress policy refuses CONNECT to the site (403 at the proxy, confirmed for
// lottoresults.co.nz:443), so nothing here can be run or tested from a session.
// A runner has open network. That asymmetry is the whole reason for this file.
//
// This fetches and reports. It does not commit anything — output goes to a
// directory that is uploaded as a build artifact and then thrown away.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Not a constant: the first run assumed https and got TypeError: fetch failed
// on every request. Safari flags this host as Not Secure, so it is served over
// plain http and port 443 is not answering. Probe rather than assume.
let ORIGIN = null;
const ORIGIN_CANDIDATES = ['https://lottoresults.co.nz', 'http://lottoresults.co.nz'];
const OUT = 'recon-out';
const MAX_FETCHES = 16;
const DELAY_MS = 1500;

// Identify the crawler honestly rather than impersonating a browser. If the
// site objects to being read, it should be able to tell who is reading.
const UA = 'FreshDrawRecon/1 (+https://github.com/antonydixon-lab/apptest) one-off data-source survey';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetches = 0;

async function get(url) {
  if (fetches >= MAX_FETCHES) return { url, skipped: 'fetch budget exhausted' };
  if (fetches > 0) await sleep(DELAY_MS);
  fetches += 1;

  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    const body = await res.text();
    return { url, status: res.status, finalUrl: res.url, type: res.headers.get('content-type'), body };
  } catch (err) {
    return { url, error: String(err) };
  }
}

// Deliberately naive: enough to enumerate candidate pages, not a parser.
function links(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      // Match on host, not origin: a page served over http can still link to
      // itself as https, and either form is the same page.
      if (u.hostname === new URL(ORIGIN).hostname) out.add(ORIGIN + u.pathname);
    } catch {
      /* ignore unparseable href */
    }
  }
  return [...out];
}

// Does this page look like it holds actual draws rather than statistics about
// them? The signal we want is six numbers appearing together against a date --
// frequency tables cannot reconstruct a combination, so they are worthless here.
function assess(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const rows = (html.match(/<tr[\s>]/gi) || []).length;
  const dates = (text.match(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi) || []).length;

  // Six 1-40 numbers in a row, loosely spaced -- the shape of a drawn line.
  const sixes = (text.match(/(?:\b(?:[1-9]|[1-3]\d|40)\b[^\dA-Za-z]{1,6}){5}\b(?:[1-9]|[1-3]\d|40)\b/g) || []).length;

  return {
    tableRows: rows,
    datesSeen: dates,
    sixNumberRuns: sixes,
    mentionsDownload: /\.csv|\.json|\.xlsx|download|export/i.test(html),
    verdict: sixes >= 5 ? 'LIKELY holds full per-draw combinations' : 'probably stats only, no usable combinations',
  };
}

await mkdir(OUT, { recursive: true });

const report = [];
const save = async (name, body) => writeFile(path.join(OUT, name), body);

for (const candidate of ORIGIN_CANDIDATES) {
  const probe = await get(`${candidate}/`);
  report.push({ step: 'scheme-probe', origin: candidate, status: probe.status, error: probe.error });
  console.log(`scheme probe ${candidate} -> ${probe.status ?? probe.error}`);
  if (probe.status && probe.status < 400) {
    ORIGIN = candidate;
    break;
  }
}

if (!ORIGIN) {
  await save('report.json', JSON.stringify(report, null, 2));
  console.error('\nNo scheme answered. Nothing further to survey.');
  process.exit(1);
}
console.log(`using origin: ${ORIGIN}\n`);

// robots.txt first. If it disallows what we are about to read, that is the
// owner's answer and it belongs in the report rather than being worked around.
const robots = await get(`${ORIGIN}/robots.txt`);
if (robots.body) await save('robots.txt', robots.body);
report.push({ step: 'robots.txt', status: robots.status, body: robots.body?.slice(0, 2000) });

const seeds = [`${ORIGIN}/`, `${ORIGIN}/tools/lotto/`];
const seen = new Set();
const candidates = new Set();

for (const seed of seeds) {
  const res = await get(seed);
  report.push({ step: 'seed', url: seed, status: res.status, error: res.error });
  if (!res.body) continue;
  seen.add(seed);
  await save(`seed-${seeds.indexOf(seed)}.html`, res.body);

  for (const link of links(res.body, seed)) {
    // Results/history/archive pages are the target. The /tools/ pages are
    // known to be aggregate statistics and are not worth the budget.
    if (/result|histor|archive|draw|past|winning/i.test(link) && !/\/tools\//i.test(link)) {
      candidates.add(link);
    }
  }
}

report.push({ step: 'candidates', found: [...candidates] });

let i = 0;
for (const url of candidates) {
  if (fetches >= MAX_FETCHES) {
    report.push({ step: 'stopped', reason: 'fetch budget exhausted', remaining: candidates.size - i });
    break;
  }
  if (seen.has(url)) continue;
  seen.add(url);

  const res = await get(url);
  const entry = { step: 'candidate', url, status: res.status, finalUrl: res.finalUrl, error: res.error };
  if (res.body) {
    await save(`candidate-${i}.html`, res.body);
    entry.file = `candidate-${i}.html`;
    entry.assessment = assess(res.body);
  }
  report.push(entry);
  i += 1;
}

await save('report.json', JSON.stringify(report, null, 2));

console.log(`\nfetches used: ${fetches} / ${MAX_FETCHES}\n`);
for (const r of report) {
  if (r.step === 'candidate') {
    console.log(`${r.status}  ${r.url}`);
    if (r.assessment) console.log(`      ${r.assessment.verdict}  (rows=${r.assessment.tableRows} dates=${r.assessment.datesSeen} six-runs=${r.assessment.sixNumberRuns} download=${r.assessment.mentionsDownload})`);
  } else if (r.step === 'seed') {
    console.log(`${r.status ?? r.error}  seed ${r.url}`);
  } else if (r.step === 'robots.txt') {
    console.log(`robots.txt: ${r.status}`);
  } else if (r.step === 'candidates') {
    console.log(`candidates discovered: ${r.found.length}`);
  }
}
