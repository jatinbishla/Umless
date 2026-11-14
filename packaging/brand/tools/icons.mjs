// Turns packaging/brand/*.svg into every raster the app and installers use. Run through
// scripts/make-icons.sh, which also builds the macOS .icns from the iconset written here.
// The outputs are committed, so building Umless never needs this script or its tools.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const brand = path.resolve(here, '..');
const repo = path.resolve(brand, '../..');
const svg = (name) => fs.readFileSync(path.join(brand, name), 'utf8');
const write = (rel, buf) => {
  const p = path.join(repo, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  console.log(`  ${rel} (${buf.length} bytes)`);
};

/** Renders an SVG to exactly w x h pixels (RGBA). */
function render(source, w, h = w) {
  const sized = source.replace('<svg ', `<svg width="${w}" height="${h}" `);
  return sharp(Buffer.from(sized), { density: 72 }).resize(w, h, { fit: 'fill' }).ensureAlpha();
}
const png = (source, w, h) => render(source, w, h).png({ compressionLevel: 9 }).toBuffer();
const raw = async (source, w) => (await render(source, w).raw().toBuffer({ resolveWithObject: true })).data;

const MASTER = svg('umless-mark.svg');
const SMALL = svg('umless-mark-small.svg');
// The mark at a size: the small version up to 32 px, the master above.
const mark = (px) => (px <= 32 ? SMALL : MASTER);

/** The master on Apple's icon grid: the tile at 824/1024 of the canvas with a soft shadow. */
function macIcon(px) {
  const inner = MASTER.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const k = 824 / 1024;
  const o = (1 - k) / 2 * 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.6" stdDeviation="0.9" flood-color="#1B1915" flood-opacity="0.28"/></filter></defs>
  <g transform="translate(${o} ${o + 0.3}) scale(${k})" filter="url(#s)">${inner}</g>
</svg>`;
}

/** An .ico holding PNG images (Windows Vista and later read PNG entries at every size). */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); // planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

/** A 24-bit .bmp (what Inno Setup's wizard images must be), flattened onto `bg`. */
async function bmp(source, w, h, bg = '#F7F3EA') {
  const { data } = await render(source, w, h).flatten({ background: bg }).raw().toBuffer({ resolveWithObject: true });
  const row = Math.ceil((w * 3) / 4) * 4;
  const out = Buffer.alloc(54 + row * h);
  out.write('BM', 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18);
  out.writeInt32LE(h, 22); // positive: bottom-up rows
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(row * h, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 3;
      out[dst + x * 3] = data[s + 2];
      out[dst + x * 3 + 1] = data[s + 1];
      out[dst + x * 3 + 2] = data[s];
    }
  }
  return out;
}

console.log('macOS iconset (scripts/make-icons.sh turns it into packaging/macos/Umless.icns)');
const iconset = path.join(repo, 'dist/brand/Umless.iconset');
fs.rmSync(iconset, { recursive: true, force: true });
for (const pt of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const px = pt * scale;
    const source = px <= 32 ? SMALL : macIcon(px);
    write(path.relative(repo, path.join(iconset, `icon_${pt}x${pt}${scale === 2 ? '@2x' : ''}.png`)), await png(source, px));
  }
}

console.log('macOS menu bar (templates, 18 pt at 2x)');
for (const k of ['idle', 'listening', 'working']) {
  write(`crates/umless-shell/assets/menubar-${k}.png`, await png(svg(`derived/menubar-${k}.svg`), 36));
}

console.log('Windows');
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 256];
write('packaging/windows/umless.ico', ico(await Promise.all(icoSizes.map(async (size) => ({ size, data: await png(mark(size), size) })))));
write('packaging/windows/wizard.bmp', await bmp(svg('derived/wizard.svg'), 164, 314));
write('packaging/windows/wizard-2x.bmp', await bmp(svg('derived/wizard.svg'), 328, 628));
write('packaging/windows/wizard-small.bmp', await bmp(svg('derived/wizard-small.svg'), 55, 58, '#FFFFFF'));
write('packaging/windows/wizard-small-2x.bmp', await bmp(svg('derived/wizard-small.svg'), 110, 116, '#FFFFFF'));

console.log('Windows and Linux tray and window icons (raw RGBA, read with include_bytes!)');
for (const k of ['idle', 'listening', 'working', 'error']) {
  write(`crates/umless-shell/assets/tray-${k}.rgba`, await raw(svg(`derived/tray-${k}.svg`), 32));
}
write('crates/umless-shell/assets/window-64.rgba', await raw(MASTER, 64));

console.log('Linux');
write('packaging/linux/umless.svg', Buffer.from(MASTER));
write('packaging/linux/umless-256.png', await png(MASTER, 256));
write('packaging/linux/umless-512.png', await png(MASTER, 512));

console.log('macOS dmg background');
write('packaging/macos/dmg-background.png', await png(svg('derived/dmg-background.svg'), 660, 400));
write('packaging/macos/dmg-background@2x.png', await png(svg('derived/dmg-background.svg'), 1320, 800));

console.log('App window: fonts and wordmark');
const font = (file) => fs.readFileSync(path.join(brand, 'fonts', file)).toString('base64');
write('apps/cli/src/ui/fonts.css', Buffer.from(`/* Generated by scripts/make-icons.sh from packaging/brand/fonts (SIL Open Font License). */
@font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 100 900; font-display: block; src: url(data:font/woff2;base64,${font('fraunces-latin-opsz-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Geist'; font-style: normal; font-weight: 100 900; font-display: block; src: url(data:font/woff2;base64,${font('geist-latin-wght-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400; font-display: block; src: url(data:font/woff2;base64,${font('jetbrains-mono-latin-400-normal.woff2')}) format('woff2'); }
`));
write('apps/cli/src/ui/wordmark.svg', Buffer.from(svg('derived/wordmark-currentcolor.svg').replace('<svg ', '<svg class="wordmark" ')));

console.log('Previews (dist/brand, not committed)');
for (const px of [16, 20, 24, 32, 128, 512]) write(`dist/brand/mark-${px}.png`, await png(mark(px), px));
