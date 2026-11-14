// Writes Umless's master logo SVGs with the letters as outlines (Fraunces glyph paths), so
// they render the same everywhere without the font. Run it only when the design changes;
// scripts/make-icons.sh turns the SVGs it writes into every raster.
//
//   node packaging/brand/tools/outline.mjs
//
// The struck "Um" follows the website: the favicon's tile and red strike, and the
// wordmark's strike (pen.ts strikePath, seed 11, over the "Um").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import wawoff2 from 'wawoff2';
import { strikePath, smooth, wobblyLine } from './pen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const brand = path.resolve(here, '..');
const OUT = process.env.UMLESS_BRAND_OUT || brand;
const out = (name, svg) => {
  fs.mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true });
  fs.writeFileSync(path.join(OUT, name), svg.trim() + '\n');
  console.log('wrote packaging/brand/' + name);
};

const C = {
  paper: '#F7F3EA', ink: '#1B1915', pen: '#D8412B',
  inkDark: '#F2EDE2', penDark: '#E8573F',
};

const ttf = Buffer.from(await wawoff2.decompress(fs.readFileSync(path.join(brand, 'fonts/fraunces-latin-opsz-normal.woff2'))));
const fraunces = fontkit.create(ttf);
const geist = fontkit.create(Buffer.from(await wawoff2.decompress(fs.readFileSync(path.join(brand, 'fonts/geist-latin-wght-normal.woff2')))));

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Outlines `text` in Fraunces. `x` is the left edge of the first glyph's advance box (or its
 * centre with anchor 'middle'); `baseline` the baseline; `tracking` extra space between
 * glyphs in output units. Returns the path data and the advance boxes of each glyph.
 */
function outline(text, { wght, opsz, size, x = 0, baseline, tracking = 0, anchor = 'start', face = fraunces }) {
  const font = face.getVariation(opsz ? { wght, opsz } : { wght });
  const s = size / font.unitsPerEm;
  const glyphs = font.glyphsForString(text);
  const adv = glyphs.map((g) => g.advanceWidth * s);
  const width = adv.reduce((a, b) => a + b, 0) + tracking * (glyphs.length - 1);
  let pen = anchor === 'middle' ? x - width / 2 : x;
  const boxes = [];
  let d = '';
  glyphs.forEach((g, i) => {
    const p = g.path.scale(s, -s).translate(pen, baseline);
    d += p.toSVG();
    boxes.push({ x: pen, w: adv[i] });
    pen += adv[i] + tracking;
  });
  d = d.replace(/-?\d+\.\d+/g, (n) => String(r2(Number(n))));
  const asc = font.ascent * s;
  const cap = font.capHeight * s;
  const xh = font.xHeight * s;
  return { d, boxes, width, asc, cap, xh, left: anchor === 'middle' ? x - width / 2 : x };
}

// ---- 1. The master: the favicon's tile and strike, letters outlined ----------------------
// Favicon: 64 x 64, rx 14, "Um" 34 px centred on x = 32 with its baseline at 44, letter
// spacing -1, and this red strike (stroke 4).
const FAVICON_STRIKE = 'M7 35.5 C17 33.6 27 34.8 37 33.2 S51 32.6 57 31.4 C59 31 60.5 29.6 61 28.6';
// Fraunces is wider than the favicon's Georgia fallback: at 34 px its "Um" would fill the
// tile edge to edge, so it is set at 30 px (as wide as Georgia's was) and one unit higher to
// stay centred.
const master = outline('Um', { wght: 600, opsz: 24, size: 30, x: 32, baseline: 43, tracking: -1, anchor: 'middle' });
const masterSvg = (tile = true) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  ${tile ? `<rect width="64" height="64" rx="14" fill="${C.paper}"/>` : ''}
  <path d="${master.d}" fill="${C.ink}"/>
  <path d="${FAVICON_STRIKE}" fill="none" stroke="${C.pen}" stroke-width="4" stroke-linecap="round"/>
</svg>`;
out('umless-mark.svg', masterSvg());

// ---- 2. The small mark, for 16 to 32 px --------------------------------------------------
// The tile runs to the edge, the letters are as wide as it allows and sturdier (Fraunces at
// its smallest optical size, heavier), and the strike is thicker and simpler: it crosses
// the x-height of both letters and lifts at the end like the favicon's.
// Tuned at 16, 20, 24 and 32 px: a medium weight keeps the three stems of the "m" apart at
// 16 px (heavier fills its counters); the baseline (y 22) falls on a pixel edge.
const SMALL = { wght: 640, opsz: 9, size: 17.2, tracking: -1.5, ...JSON.parse(process.env.UMLESS_SMALL || '{}') };
const SB = 22;
const small = outline('Um', { ...SMALL, x: 16, baseline: SB, anchor: 'middle' });
// Lower than the master's strike: through the stems, leaving the m's arches readable at 16 px.
const smallStrikeY = SB - 3.4;
const smallStrike = smooth([[1.4, smallStrikeY + 0.6], [10, smallStrikeY + 0.2], [20, smallStrikeY], [27.6, smallStrikeY - 0.5], [30.4, smallStrikeY - 2.6]]);
const smallSvg = ({ tile = C.paper, letters = C.ink, strike = C.pen, extra = '' } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${tile}"/>
  <path d="${small.d}" fill="${letters}"/>
  <path d="${smallStrike}" fill="none" stroke="${strike}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${extra}
</svg>`;
out('umless-mark-small.svg', smallSvg());

// ---- 3. The wordmark: "Umless", the "Um" struck --------------------------------------------
// As the site's .wordmark: Fraunces 560, tracking -0.02em; the strike is strikePath(100, 24,
// seed 11) stretched over the "Um" box (left -2%, width 104%, top 22%, height 66% of the
// line), drawn 2.6 px at 27 px type.
const WM = { size: 100, wght: 560, opsz: 36 };
const wm = outline('Umless', { ...WM, x: 0, baseline: 0, tracking: -0.02 * WM.size });
const umW = wm.boxes[0].w + wm.boxes[1].w - 0.02 * WM.size;
// line-height 1: the em box is centred on the font's ascent + descent.
const font = fraunces.getVariation({ wght: WM.wght, opsz: WM.opsz });
const em = WM.size;
const contentH = (font.ascent - font.descent) * em / font.unitsPerEm;
const lineTop = -(font.ascent * em / font.unitsPerEm) + (contentH - em) / 2;
const box = { x: -0.02 * umW, y: lineTop + 0.22 * em, w: 1.04 * umW, h: 0.66 * em };
const strikeD = strikePath(100, 24, 11).replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, a, b) =>
  `${r2(box.x + (Number(a) / 100) * box.w)} ${r2(box.y + (Number(b) / 24) * box.h)}`);
const strokeW = r2((2.6 / 27) * em);
const pad = strokeW;
const vb = { x: Math.min(-pad, box.x - pad), y: lineTop - pad, w: 0, h: em + 2 * pad };
vb.w = wm.width + pad - vb.x + 6;
const wordmarkSvg = (ink, pen, title = 'Umless') => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(vb.x)} ${r2(vb.y)} ${r2(vb.w)} ${r2(vb.h)}" role="img" aria-label="${title}">
  <path d="${wm.d}" fill="${ink}"/>
  <path d="${strikeD}" fill="none" stroke="${pen}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
out('umless-wordmark.svg', wordmarkSvg(C.ink, C.pen));
out('umless-wordmark-light.svg', wordmarkSvg(C.inkDark, C.penDark));
// For the app window: the letters follow the page's text colour, the strike its pen colour.
out('derived/wordmark-currentcolor.svg', wordmarkSvg('currentColor', 'var(--pen)'));

// ---- 4. Derived state icons (rasterised by make-icons.sh) ------------------------------------
// Windows / Linux tray, in colour: idle is the small mark; listening turns the tile red;
// working turns it ink; error adds a red dot with a white bar, as a badge.
out('derived/tray-idle.svg', smallSvg());
out('derived/tray-listening.svg', smallSvg({ tile: C.pen, letters: C.paper, strike: C.ink }));
out('derived/tray-working.svg', smallSvg({ tile: C.ink, letters: C.paper, strike: C.pen }));
out('derived/tray-error.svg', smallSvg({
  extra: `\n  <circle cx="25" cy="7" r="6.4" fill="${C.pen}" stroke="${C.paper}" stroke-width="1.4"/>\n  <rect x="24.1" y="3.4" width="1.8" height="4.6" rx=".9" fill="#fff"/><circle cx="25" cy="10" r="1" fill="#fff"/>`,
}));

// macOS menu bar, templates (black + alpha; macOS tints them). No tile: the letters and a
// thinner strike through the middle of the x-height (a gap cut around it ate the "m").
const menu = outline('Um', { ...SMALL, size: 12.4, tracking: -0.9, x: 11, baseline: 15.4, anchor: 'middle' });
const my = 15.4 - menu.xh * 0.5;
const menuStrike = smooth([[0.8, my + 1], [7, my + 0.3], [14, my - 0.1], [19.6, my - 0.9], [21.4, my - 3]]);
const menuSvg = (kind) => {
  const strike = kind === 'working' ? menuHalf : menuStrike;
  if (kind === 'listening') {
    // A solid rounded tile with the struck "Um" knocked out of it.
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22">
  <mask id="k"><rect width="22" height="22" rx="5" fill="#fff"/><path d="${menuSmall.d}" fill="#000"/><path d="${menuSmallStrike}" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/></mask>
  <rect width="22" height="22" rx="5" fill="#000" mask="url(#k)"/>
</svg>`;
  }
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22">
  <path d="${menu.d}" fill="#000"/>
  <path d="${strike}" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
};
// Working: the pen is halfway across.
const menuHalf = smooth([[0.8, my + 1], [5, my + 0.5], [10, my + 0.1]]);
// Listening: slightly smaller letters inside the tile.
const menuSmall = outline('Um', { ...SMALL, size: 10.4, tracking: -0.8, x: 11, baseline: 14.6, anchor: 'middle' });
const msy = 14.6 - menuSmall.xh * 0.42;
const menuSmallStrike = smooth([[2.4, msy + 0.8], [8, msy + 0.2], [14, msy - 0.1], [18.4, msy - 0.7], [19.8, msy - 2.4]]);
for (const k of ['idle', 'listening', 'working']) out(`derived/menubar-${k}.svg`, menuSvg(k));

// ---- 5. Installer artwork (rasterised by make-icons.sh) --------------------------------------
const sans = (text, o) => outline(text, { face: geist, wght: 500, ...o });
const smallInner = smallSvg().replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
/** A struck "Um" of a given size, its strike from pen.ts like the wordmark's. */
function struckUm(size, cx, baseline, seed = 11) {
  const um = outline('Um', { wght: 600, opsz: 72, size, x: cx, baseline, tracking: -0.02 * size, anchor: 'middle' });
  const top = baseline - size * 0.74;
  const b = { x: um.left - 0.02 * um.width, y: top + 0.1 * size, w: 1.04 * um.width, h: 0.66 * size };
  const d = strikePath(100, 24, seed).replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, a, c) =>
    `${r2(b.x + (Number(a) / 100) * b.w)} ${r2(b.y + (Number(c) / 24) * b.h)}`);
  return `<path d="${um.d}" fill="${C.ink}"/><path d="${d}" fill="none" stroke="${C.pen}" stroke-width="${r2(size * 0.075)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Inno Setup's tall image on the Welcome and Finish pages (164 x 314).
const t1 = sans('Talk messy.', { size: 16, x: 82, baseline: 214, anchor: 'middle' });
const t2 = sans('It types clean.', { size: 16, x: 82, baseline: 236, anchor: 'middle' });
out('derived/wizard.svg', `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 164 314">
  <rect width="164" height="314" fill="${C.paper}"/>
  ${struckUm(70, 82, 160)}
  <path d="${t1.d}" fill="${C.ink}"/><path d="${t2.d}" fill="${C.ink}"/>
  <path d="${wobblyLine(24, 284, 140, 283, 7, 0.6)}" fill="none" stroke="#D9D1C0" stroke-width="1.2" stroke-linecap="round"/>
</svg>`);
// Inno Setup's small top-right image (55 x 58): the small mark.
out('derived/wizard-small.svg', `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 55 58">
  <rect width="55" height="58" fill="#FFFFFF"/>
  <g transform="translate(5.5 7) scale(1.375)">${smallInner}</g>
</svg>`);

// The dmg window's background (660 x 400): the wordmark, and a red pen arrow from where
// Finder puts Umless.app (170, 200) to the Applications link (490, 200).
const wmH = 46;
const wmScale = wmH / vb.h;
const wmW = vb.w * wmScale;
const cap = sans('Drag Umless onto Applications to install it.', { size: 14, wght: 450, x: 330, baseline: 352, anchor: 'middle' });
const arrow = smooth([[262, 206], [300, 192], [345, 190], [398, 200]]);
const head = smooth([[384, 186], [399, 200], [382, 213]]);
out('derived/dmg-background.svg', `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 400">
  <rect width="660" height="400" fill="${C.paper}"/>
  <g transform="translate(${r2(330 - wmW / 2 - vb.x * wmScale)} ${r2(30 - vb.y * wmScale)}) scale(${r2(wmScale * 1000) / 1000})">
    <path d="${wm.d}" fill="${C.ink}"/>
    <path d="${strikeD}" fill="none" stroke="${C.pen}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <path d="${arrow}" fill="none" stroke="${C.pen}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${head}" fill="none" stroke="${C.pen}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${cap.d}" fill="#5D574C"/>
</svg>`);

console.log('master Um width', r2(master.width), '· small Um width', r2(small.width), '· wordmark', r2(vb.w), 'x', r2(vb.h));
