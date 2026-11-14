// Contact sheet of SVGs at given pixel sizes, each also blown up 8x (nearest) to judge pixels.
// node preview.mjs out.png bg file.svg:16,20,24,32 ...
import sharp from 'sharp';
import fs from 'node:fs';
const [outPath, bg, ...specs] = process.argv.slice(2);
const at = (svg, px) => {
  const s = svg.replace('<svg ', `<svg width="${px}" height="${px}" `);
  return sharp(Buffer.from(s), { density: 72 }).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
};
const comps = []; let x = 10, y = 10, rowH = 0;
for (const spec of specs) {
  const [file, sizes] = spec.split(':');
  const svg = fs.readFileSync(file, 'utf8');
  x = 10;
  for (const px of sizes.split(',').map(Number)) {
    const img = await at(svg, px);
    comps.push({ input: img, left: x, top: y });
    const z = px <= 32 ? Math.floor(256 / px) : 1;
    if (z > 1) comps.push({ input: await sharp(img).resize(px * z, px * z, { kernel: 'nearest' }).png().toBuffer(), left: x, top: y + px + 8 });
    x += Math.max(px, px * z) + 20; rowH = Math.max(rowH, px + 8 + (z > 1 ? px * z : 0) + 20);
  }
  y += rowH; rowH = 0;
}
await sharp({ create: { width: 1700, height: y + 10, channels: 4, background: bg } }).composite(comps).png().toFile(outPath);
