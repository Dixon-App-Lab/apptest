// Renders the PWA icons from tools/icon.svg using the Chromium that ships with
// this environment, so there is no image-library dependency.
//
// Two things learned the hard way, both encoded below:
//
//  1. Chromium's headless window clamps to a minimum somewhere around 500px and
//     *crops* the screenshot rather than scaling the page down. Anything smaller
//     than that renders at the wrong scale, so every output here is 512px. That
//     is fine: Chrome's install criteria need one icon of at least 144px, and
//     Android downscales for the launcher itself.
//  2. Sizing the <svg> with CSS percentages or bare width/height did not scale
//     the viewBox reliably. Setting viewBox to the output box and scaling the
//     artwork with a transform does.
//
// Usage: node tools/build-icons.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SIZE = 512;
const BACKDROP = '#1b1638';

const source = readFileSync('tools/icon.svg', 'utf8');
const work = tmpdir();

// artScale < 1 insets the artwork into the maskable safe zone, so Android's
// circular or squircle crop cannot clip it.
function svgAt(artScale) {
  const inset = (SIZE * (1 - artScale)) / 2;
  return source
    .replace(/(<rect[^>]*\/>)/, `$1\n  <g transform="translate(${inset},${inset}) scale(${artScale})">`)
    .replace(/<\/svg>/, '  </g>\n</svg>');
}

function render(svg, outFile) {
  const page = join(work, 'icon-page.html');
  writeFileSync(
    page,
    `<style>html,body{margin:0;padding:0;background:${BACKDROP};overflow:hidden}svg{display:block}</style>\n${svg}`,
  );
  execFileSync(CHROME, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--virtual-time-budget=3000',
    `--screenshot=${outFile}`,
    `--window-size=${SIZE},${SIZE}`,
    `file://${page}`,
  ], { stdio: 'ignore' });
  console.log(`Wrote ${outFile}`);
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon.svg', source);
render(svgAt(1), 'icons/icon-512.png');
render(svgAt(0.76), 'icons/icon-maskable-512.png');
