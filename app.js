const HISTORY_KEY = 'freshdraw.history.v2';
const MAX_HISTORY = 10;
const MAX_LINES = 4;
const STRIKE_COUNT = 4;
const ATTEMPT_CAP = 10000; // guards against an exhausted pool; never reached in practice

const el = {
  balls: document.getElementById('balls'),
  placeholder: document.getElementById('placeholder'),
  generate: document.getElementById('generate'),
  readout: document.getElementById('readout'),
  dataBadge: document.getElementById('dataBadge'),
  dataProvenance: document.getElementById('dataProvenance'),
  funFacts: document.getElementById('funFacts'),
  factsSource: document.getElementById('factsSource'),
  historyPanel: document.getElementById('historyPanel'),
  history: document.getElementById('history'),
  clearHistory: document.getElementById('clearHistory'),
  offline: document.getElementById('offline'),
  spaceSize: document.getElementById('spaceSize'),
  excludedShare: document.getElementById('excludedShare'),
  oddsBefore: document.getElementById('oddsBefore'),
  oddsAfter: document.getElementById('oddsAfter'),
  linesCount: document.getElementById('linesCount'),
  linesDown: document.getElementById('linesDown'),
  linesUp: document.getElementById('linesUp'),
  strikeToggle: document.getElementById('strikeToggle'),
};

const nz = new Intl.NumberFormat('en-NZ');

let config = null;
let excluded = null; // Set of canonical keys, e.g. "3-11-19-24-31-38"
let history = loadHistory();
let lineCount = 1;
let strikeEnabled = false;

/* ---------- randomness ---------- */

// Rejection sampling on the browser's CSPRNG. A plain `% max` would bias the
// low end of the range, since 2^32 is not a multiple of 40.
function randomInt(max) {
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return (value % max) + 1;
}

function drawNumbers(count, pool) {
  const picked = new Set();
  while (picked.size < count) picked.add(randomInt(pool));
  return [...picked].sort((a, b) => a - b);
}

/* ---------- exclusion ---------- */

const canonical = (numbers) => numbers.join('-');

// batchExcluded holds the canonical keys already handed out earlier in this
// same generate click, so a multi-line ticket never repeats a line.
function generateLine(batchExcluded) {
  for (let attempt = 1; attempt <= ATTEMPT_CAP; attempt++) {
    const numbers = drawNumbers(config.mainCount, config.mainPool);
    const key = canonical(numbers);
    if (!excluded.has(key) && !batchExcluded.has(key)) {
      batchExcluded.add(key);
      return { numbers, powerball: randomInt(config.powerballPool), attempts: attempt };
    }
  }
  throw new Error('Could not find an unused combination within the attempt cap.');
}

// Strike is a separate NZ Lotto game — four numbers, no Powerball — and its
// own past results aren't part of this app's dataset, so there is nothing to
// exclude against.
function generateStrikeLine() {
  return { numbers: drawNumbers(STRIKE_COUNT, config.mainPool) };
}

/* ---------- maths for the honesty panel ---------- */

function combinations(n, k) {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

function describeOdds() {
  const total = combinations(config.mainPool, config.mainCount);
  const remaining = total - excluded.size;
  const share = (excluded.size / total) * 100;

  el.spaceSize.textContent = nz.format(total);
  el.excludedShare.textContent = `${nz.format(excluded.size)} of them (${share.toFixed(3)}%)`;
  el.oddsBefore.textContent = `1 in ${nz.format(total)}`;
  el.oddsAfter.textContent = `1 in ${nz.format(remaining)}`;
}

/* ---------- rendering ---------- */

function renderLines(lines, strike) {
  const tickets = lines.map((line, i) => ticketNode(line, i, lines.length > 1));
  if (strike) tickets.push(strikeNode(strike));
  el.balls.replaceChildren(...tickets);
}

function ticketNode({ numbers, powerball }, index, labelled) {
  const ticket = document.createElement('div');
  ticket.className = 'ticket';

  if (labelled) {
    const label = document.createElement('span');
    label.className = 'ticket-label';
    label.textContent = `L${index + 1}`;
    ticket.append(label);
  }

  // Main numbers and Powerball sit in the same row, Powerball to the right —
  // the layout of a standard printed Lotto ticket.
  const main = document.createElement('div');
  main.className = 'row main';
  main.append(...numbers.map((n, i) => ball(n, i)));

  ticket.append(main, ball(powerball, numbers.length, true));
  return ticket;
}

function strikeNode({ numbers }) {
  const ticket = document.createElement('div');
  ticket.className = 'ticket strike';

  const label = document.createElement('span');
  label.className = 'ticket-label';
  label.textContent = 'STK';

  const row = document.createElement('div');
  row.className = 'row strike';
  row.append(...numbers.map((n, i) => ball(n, i)));

  ticket.append(label, row);
  return ticket;
}

function ball(value, index, isPowerball = false) {
  const node = document.createElement('span');
  node.className = isPowerball ? 'ball pb' : 'ball';
  node.textContent = value;
  node.style.animationDelay = `${index * 40}ms`;
  if (isPowerball) node.setAttribute('aria-label', `Powerball ${value}`);
  return node;
}

function renderReadout(lines, strike) {
  const checked = `Checked against ${nz.format(excluded.size)} past draws`;
  const redraws = lines.reduce((sum, line) => sum + (line.attempts - 1), 0);
  const detail =
    redraws === 0
      ? (lines.length === 1 ? 'the line was unused' : 'all lines were unused')
      : `redrawn ${redraws} ${redraws === 1 ? 'time' : 'times'} to avoid past winners`;
  const strikeNote = strike ? ' Strike line is separate and not checked.' : '';
  el.readout.textContent = `${checked} — ${detail}.${strikeNote}`;
}

function renderHistory() {
  el.historyPanel.hidden = history.length === 0;
  el.history.replaceChildren(
    ...history.map((entry) => {
      const li = document.createElement('li');
      const rows = document.createElement('div');
      rows.className = 'hist-lines';

      entry.lines.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'hist-line';
        const nums = document.createElement('span');
        nums.className = 'line';
        nums.textContent = line.numbers.join('  ');
        const pb = document.createElement('span');
        pb.className = 'pb';
        pb.textContent = `PB ${line.powerball}`;
        row.append(nums, pb);
        rows.append(row);
      });

      if (entry.strike) {
        const row = document.createElement('div');
        row.className = 'hist-line';
        const nums = document.createElement('span');
        nums.className = 'line';
        nums.textContent = entry.strike.numbers.join('  ');
        const pb = document.createElement('span');
        pb.className = 'pb';
        pb.textContent = 'Strike';
        row.append(nums, pb);
        rows.append(row);
      }

      li.append(rows);
      return li;
    }),
  );
}

function renderDataBadge() {
  el.dataProvenance.textContent = config.synthetic
    ? `The comparison set is currently ${nz.format(excluded.size)} placeholder draws generated by tools/generate-synthetic-draws.mjs — the right shape and size for real NZ Lotto history, but not real results. Swapping in real data means replacing data/draws.json; no other code changes.`
    : `The comparison set is ${nz.format(excluded.size)} real draws, ${config.firstDraw} to ${config.lastDraw}.`;

  if (!config.synthetic) return;
  el.dataBadge.hidden = false;
  el.dataBadge.textContent =
    'Using placeholder draw data — the numbers below are generated correctly, but the "already won" set is synthetic, not real NZ Lotto history.';
}

/* ---------- fun facts ---------- */

// Every fact pairs an observation with what chance predicts for it. That
// pairing is the feature, not padding: a bare frequency table sitting next to a
// Generate button reads as a tip sheet, and this app's whole claim is that the
// machine has no memory. Nothing here is framed as due, hot or cold.
function renderFunFacts(draws) {
  const n = draws.length;
  const p = config.mainCount / config.mainPool;
  const expected = n * p;
  const sd = Math.sqrt(n * p * (1 - p));

  const freq = new Map();
  const pairs = new Map();
  const triplets = new Map();
  const lastSeen = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

  draws.forEach((draw, index) => {
    const s = draw.numbers;
    for (let i = 0; i < s.length; i += 1) {
      bump(freq, s[i]);
      lastSeen.set(s[i], index);
      for (let j = i + 1; j < s.length; j += 1) {
        bump(pairs, `${s[i]} & ${s[j]}`);
        for (let k = j + 1; k < s.length; k += 1) bump(triplets, `${s[i]}, ${s[j]} & ${s[k]}`);
      }
    }
  });

  const ranked = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);
  const counts = ranked(freq);
  const [hiN, hiC] = counts[0];
  const [loN, loC] = counts[counts.length - 1];
  const withinTwo = counts.filter(([, c]) => Math.abs(c - expected) <= 2 * sd).length;

  const [pairKey, pairCount] = ranked(pairs)[0];
  const pairSpace = combinations(config.mainPool, 2);
  const [tripKey, tripCount] = ranked(triplets)[0];
  const tripSpace = combinations(config.mainPool, 3);

  const [waitN, waitDraws] = [...lastSeen.entries()]
    .map(([ball, index]) => [ball, n - 1 - index])
    .sort((a, b) => b[1] - a[1])[0];

  const space = combinations(config.mainPool, config.mainCount);
  const repeats = n - new Set(draws.map((draw) => canonical(draw.numbers))).size;

  const facts = [
    [
      `${hiN} leads ${loN} by ${hiC - loC} — and that is less of a gap than chance usually manages`,
      `${hiN} has come up ${hiC} times, ${loN} only ${loC}. Across ${nz.format(n)} draws every number is expected about ${Math.round(expected)} times, with a normal spread of roughly ${Math.round(sd)} either side. ${withinTwo === counts.length ? `All ${counts.length}` : `${withinTwo} of the ${counts.length}`} numbers land within two of those — the signature of nothing happening.`,
    ],
    [
      `${pairKey} is the most frequent pairing, ${pairCount} times`,
      `There are ${nz.format(pairSpace)} possible pairs and the average one appears about ${Math.round((n * combinations(config.mainCount, 2)) / pairSpace)} times. Some pair has to lead, and the leader of a long list always sits well above the average. That is arithmetic, not affinity.`,
    ],
    [
      `${tripKey} is the most frequent trio, ${tripCount} times`,
      `Out of ${nz.format(tripSpace)} possible trios, averaging about ${((n * combinations(config.mainCount, 3)) / tripSpace).toFixed(1)} appearances each. The more combinations you look across, the further ahead the front-runner gets by luck alone.`,
    ],
    [
      `${waitN} has not appeared for ${waitDraws} draws`,
      `Its chance in the next draw is ${Math.round(p * 100)}% — the same as every other number's, and the same as it was ${waitDraws} draws ago. A ball that has been skipped is not owed anything.`,
    ],
    [
      repeats === 0
        ? `Not one combination has ever repeated in ${nz.format(n)} draws`
        : `${repeats} combination${repeats === 1 ? ' has' : 's have'} come up twice in ${nz.format(n)} draws`,
      `Less surprising than it sounds: these draws cover ${((n / space) * 100).toFixed(3)}% of the ${nz.format(space)} possible lines. That tiny share is exactly why skipping them barely moves the odds.`,
    ],
  ];

  el.funFacts.replaceChildren(
    ...facts.map(([headline, why]) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = headline;
      const span = document.createElement('span');
      span.textContent = why;
      li.append(b, span);
      return li;
    }),
  );

  let host = null;
  try {
    host = new URL(config.source).host;
  } catch {
    /* older datasets carry no source; the sentence just omits it */
  }
  el.factsSource.textContent = host
    ? `Draw history from ${host}, covering ${config.firstDraw} to ${config.lastDraw}. The counts above are worked out from that history by this app, not taken from the site.`
    : `Counted from the loaded draw history, ${config.firstDraw} to ${config.lastDraw}.`;
}

/* ---------- history persistence ---------- */

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return []; // private mode, or a stale shape from an older version
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* not worth interrupting the user over */
  }
}

/* ---------- wiring ---------- */

function updateLinesControl() {
  el.linesCount.textContent = lineCount;
  el.linesDown.disabled = lineCount <= 1;
  el.linesUp.disabled = lineCount >= MAX_LINES;
}

function onGenerate() {
  const lines = [];
  const batchExcluded = new Set();
  try {
    for (let i = 0; i < lineCount; i++) lines.push(generateLine(batchExcluded));
  } catch (error) {
    el.readout.textContent = error.message;
    return;
  }
  const strike = strikeEnabled ? generateStrikeLine() : null;

  el.placeholder?.remove();
  renderLines(lines, strike);
  renderReadout(lines, strike);

  history = [
    {
      lines: lines.map((line) => ({ numbers: line.numbers, powerball: line.powerball })),
      strike: strike ? { numbers: strike.numbers } : null,
    },
    ...history,
  ].slice(0, MAX_HISTORY);
  saveHistory();
  renderHistory();
}

async function init() {
  renderHistory();

  try {
    const response = await fetch('./data/draws.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();

    config = payload.meta;
    excluded = new Set(payload.draws.map((draw) => canonical(draw.numbers)));

    describeOdds();
    renderDataBadge();
    renderFunFacts(payload.draws);

    el.generate.disabled = false;
    el.generate.textContent = 'Generate a line';
    el.generate.addEventListener('click', onGenerate);
  } catch (error) {
    el.generate.textContent = 'Draw data unavailable';
    el.readout.textContent = `Could not load the past-draw set (${error.message}). Generating without it would defeat the point, so the button stays disabled.`;
  }

  el.clearHistory.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  updateLinesControl();
  el.linesDown.addEventListener('click', () => {
    lineCount = Math.max(1, lineCount - 1);
    updateLinesControl();
  });
  el.linesUp.addEventListener('click', () => {
    lineCount = Math.min(MAX_LINES, lineCount + 1);
    updateLinesControl();
  });
  el.strikeToggle.addEventListener('change', () => {
    strikeEnabled = el.strikeToggle.checked;
  });

  const showOffline = () => {
    el.offline.hidden = navigator.onLine;
  };
  addEventListener('online', showOffline);
  addEventListener('offline', showOffline);
  showOffline();

  if ('serviceWorker' in navigator) {
    // Relative path so the scope follows the deploy path — this app is served
    // from a subdirectory on GitHub Pages, not a domain root.
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* app works fine without offline support */
    });
  }
}

init();
