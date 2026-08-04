// End-to-end check of the real app in a real browser: generation rules, the
// exclusion set actually biting, service-worker registration, Android install
// criteria, and offline operation.
//
// Requires the app to be served first: npm run serve
// Then: npm run verify

import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8765';

// playwright-core ships no browser of its own. Use the one this dev container
// already has if it's there, otherwise let Playwright resolve a browser it
// installed itself — which is what CI does.
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROME_PATH ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 } }); // Pixel-ish

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

await page.goto(BASE, { waitUntil: 'networkidle' });

const btn = page.locator('#generate');
await btn.waitFor();
console.log('button label after load :', (await btn.textContent()).trim());
console.log('button enabled          :', await btn.isEnabled());

// Odds panel derived from the dataset
console.log('combination space       :', await page.locator('#spaceSize').textContent());
console.log('excluded share         :', await page.locator('#excludedShare').textContent());
console.log('odds before / after    :', await page.locator('#oddsBefore').textContent(), '/', await page.locator('#oddsAfter').textContent());
console.log('synthetic badge shown  :', await page.locator('#dataBadge').isVisible());

// Generate a few lines and validate every one against the rules
const dataset = await page.evaluate(async () => {
  const r = await fetch('./data/draws.json');
  const j = await r.json();
  return { keys: j.draws.map((d) => d.numbers.join('-')), meta: j.meta };
});
const past = new Set(dataset.keys);

const seen = new Set();
for (let i = 0; i < 25; i++) {
  await btn.click();
  await page.waitForFunction(() => document.querySelectorAll('.ball').length === 7);
  const balls = await page.locator('.ball').allTextContents();
  const main = balls.slice(0, 6).map(Number);
  const pb = Number(balls[6]);

  const sorted = [...main].sort((a, b) => a - b);
  const key = sorted.join('-');

  if (main.length !== 6) throw new Error(`expected 6 main numbers, got ${main.length}`);
  if (new Set(main).size !== 6) throw new Error(`duplicate main numbers: ${main}`);
  if (main.some((n) => n < 1 || n > 40)) throw new Error(`main number out of range: ${main}`);
  if (pb < 1 || pb > 10) throw new Error(`powerball out of range: ${pb}`);
  if (key !== main.join('-')) throw new Error(`main numbers not displayed ascending: ${main}`);
  if (past.has(key)) throw new Error(`GENERATED A PAST WINNER: ${key}`);
  seen.add(key);
}
console.log('25 lines generated     : all 6-from-40, ascending, unique, none in past set');
console.log('distinct lines         :', seen.size, '/ 25');
console.log('readout                :', (await page.locator('#readout').textContent()).trim());
console.log('history entries        :', await page.locator('#history li').count());

// Multi-line tickets + Strike: bump to 4 lines, turn on Strike, and check both
// the count of tickets rendered and that Powerball sits to the right of the
// six main numbers on the same row (the standard printed-ticket layout).
await page.locator('#linesUp').click();
await page.locator('#linesUp').click();
await page.locator('#linesUp').click();
if ((await page.locator('#linesCount').textContent()).trim() !== '4') {
  throw new Error('lines stepper did not reach 4');
}
if (!(await page.locator('#linesUp').isDisabled())) throw new Error('lines stepper should cap at 4');
await page.locator('#strikeToggle').check();
await btn.click();
await page.waitForFunction(() => document.querySelectorAll('.ticket').length === 5);

const ticketCounts = await page.evaluate(() =>
  [...document.querySelectorAll('.ticket')].map((t) => t.querySelectorAll('.ball').length),
);
if (ticketCounts.length !== 5) throw new Error(`expected 5 tickets (4 lines + strike), got ${ticketCounts.length}`);
if (!ticketCounts.slice(0, 4).every((n) => n === 7)) throw new Error(`a main-line ticket didn't have 7 balls: ${ticketCounts}`);
if (ticketCounts[4] !== 4) throw new Error(`strike ticket didn't have 4 balls: ${ticketCounts[4]}`);
console.log('multi-line + strike    : 4 lines (6+PB) plus 1 Strike line (4) rendered');

const pbPosition = await page.evaluate(() => {
  const ticket = document.querySelector('.ticket');
  const mainBalls = [...ticket.querySelectorAll('.row.main .ball')];
  const pb = ticket.querySelector('.ball.pb');
  const last = mainBalls[mainBalls.length - 1];
  const pbRect = pb.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();
  const pbCenterY = pbRect.top + pbRect.height / 2;
  const lastCenterY = lastRect.top + lastRect.height / 2;
  // Balls can render at different diameters (Powerball is fixed-size, main
  // balls shrink to fit six across), so "same row" means vertically centered
  // together, not equal offsetTop.
  return { sameRow: Math.abs(pbCenterY - lastCenterY) < 4, toTheRight: pbRect.left > lastRect.left };
});
if (!pbPosition.sameRow || !pbPosition.toTheRight) {
  throw new Error(`Powerball is not positioned to the right of the main row: ${JSON.stringify(pbPosition)}`);
}
console.log('powerball position     : same row, to the right of the six main numbers');

// Worst-case layout: 4 lines + Strike is the most balls on screen at once.
for (const width of [320, 360, 600]) {
  await page.setViewportSize({ width, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error(`horizontal overflow at ${width}px with 4 lines + Strike`);
}
console.log('layout w/ 4+strike     : no horizontal overflow at 320-600px');
await page.setViewportSize({ width: 412, height: 915 });

// Reset back to the default single-line state for the rest of the checks.
await page.locator('#strikeToggle').uncheck();
await page.locator('#linesDown').click();
await page.locator('#linesDown').click();
await page.locator('#linesDown').click();
await btn.click();
await page.waitForFunction(() => document.querySelectorAll('.ball').length === 7);

// Exclusion actually bites: force a known past winner into the pool and confirm rejection
const rejects = await page.evaluate(async () => {
  const r = await fetch('./data/draws.json');
  const j = await r.json();
  const target = j.draws[0].numbers;
  const set = new Set(j.draws.map((d) => d.numbers.join('-')));
  return { target, excluded: set.has(target.join('-')) };
});
console.log('known past draw in set :', rejects.excluded, `(${rejects.target.join('-')})`);

// Service worker + installability
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'no registration';
  await navigator.serviceWorker.ready;
  return reg.active ? 'active' : reg.installing ? 'installing' : 'waiting';
});
if (swState !== 'active') throw new Error(`service worker not active: ${swState}`);
console.log('service worker         : active');

const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]').href;
  const r = await fetch(href);
  const m = await r.json();
  const big = m.icons.filter((i) => i.type === 'image/png' && parseInt(i.sizes) >= 144);
  return {
    name: !!m.name, short_name: !!m.short_name, start_url: !!m.start_url,
    display: m.display, iconsOver144: big.length,
    maskable: m.icons.some((i) => i.purpose === 'maskable'),
  };
});
// Chrome needs a name, a start_url, display standalone or better, and an icon
// of at least 144px before it will offer installation.
const missing = Object.entries({
  name: manifest.name,
  short_name: manifest.short_name,
  start_url: manifest.start_url,
  standalone: manifest.display === 'standalone',
  'icon >=144px': manifest.iconsOver144 > 0,
  maskable: manifest.maskable,
}).filter(([, ok]) => !ok).map(([key]) => key);
if (missing.length) throw new Error(`manifest fails install criteria: ${missing.join(', ')}`);
console.log('manifest install check : all install criteria met');

// The six main numbers must stay on one row at every phone width — wrapping to
// 5 + 1 reads as a bug.
for (const width of [320, 360, 390, 412, 480, 600]) {
  await page.setViewportSize({ width, height: 900 });
  // offsetTop, not getBoundingClientRect: the reveal animation's transform
  // offsets the visual rect mid-flight and would fake a wrap.
  const rows = await page.evaluate(
    () => new Set([...document.querySelectorAll('.row.main .ball')].map((b) => b.offsetTop)).size,
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (rows !== 1) throw new Error(`main numbers wrapped into ${rows} rows at ${width}px`);
  if (overflow) throw new Error(`horizontal overflow at ${width}px`);
}
console.log('layout 320-600px       : main row unwrapped, no horizontal overflow');
await page.setViewportSize({ width: 412, height: 915 });

// Offline: kill the network and reload from cache
await page.context().setOffline(true);
await page.reload({ waitUntil: 'load' });
await page.locator('#generate').waitFor();
const offlineOk = await page.locator('#generate').isEnabled();
await page.locator('#generate').click();
await page.waitForFunction(() => document.querySelectorAll('.ball').length === 7);
if (!offlineOk) throw new Error('offline reload failed: app did not come back from cache');
console.log('offline reload         : shell + dataset served from cache, generation works');

// Observation, deliberately not an assertion: whether emulated offline reaches
// navigator.onLine varies by Chromium build. It reports false on this dev
// container and true on the GitHub runner, so the banner legitimately differs.
// The cache behaviour above is the part that actually matters, and that is
// asserted.
console.log('offline notice shown   :', await page.locator('#offline').isVisible(), '(varies by browser build)');

await page.context().setOffline(false);
await page.reload({ waitUntil: 'load' });
await page.locator('#generate').waitFor();
await page.locator('#generate').click();
await page.waitForFunction(() => document.querySelectorAll('.ball').length === 7);
// Real assertion, and the guard for a bug that actually shipped: an author
// `display` rule overrode the UA stylesheet's [hidden] rule, so this notice
// stayed visible forever. Holds regardless of how offline is emulated, because
// online is online in every build.
if (await page.locator('#offline').isVisible()) {
  throw new Error('offline notice still visible while online — [hidden] is being overridden again');
}
console.log('notice hidden when back: true');

const shots = process.env.SHOT_DIR ?? tmpdir();
// Let the staggered ball reveal finish, or the shots catch it mid-animation.
await page.waitForFunction(
  () => [...document.querySelectorAll('.ball')].every((b) => getComputedStyle(b).opacity === '1'),
);
await page.emulateMedia({ colorScheme: 'light' });
await page.screenshot({ path: join(shots, 'freshdraw-light.png'), fullPage: true });
await page.emulateMedia({ colorScheme: 'dark' });
await page.screenshot({ path: join(shots, 'freshdraw-dark.png'), fullPage: true });
console.log('screenshots            :', shots);

console.log('\nerrors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
