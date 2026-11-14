// The website's hand-drawn pen marks (umless-site src/scripts/pen.ts), ported as-is so the
// app and installers draw the same wobble from the same seeds.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;

/** Catmull-Rom through the points, written as cubic beziers. */
export function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** The points of a strike across a w x h box (strikePath without the smoothing). */
export function strikePoints(w, h, seed = 1) {
  const r = rng(seed);
  const mid = h * (0.52 + (r() - 0.5) * 0.12);
  const slope = (r() - 0.5) * Math.min(6, h * 0.18);
  const n = Math.max(3, Math.min(7, Math.round(w / 70)));
  const pts = [];
  const x0 = -Math.min(6, w * 0.06) - r() * 3;
  const x1 = w + Math.min(7, w * 0.06) + r() * 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wobble = (r() - 0.5) * Math.min(3.2, h * 0.12);
    pts.push([x0 + (x1 - x0) * t, mid + slope * (t - 0.5) + wobble]);
  }
  const last = pts[pts.length - 1];
  pts.push([last[0] + 4 + r() * 3, last[1] - 2 - r() * 3]);
  return pts;
}

export const strikePath = (w, h, seed = 1) => smooth(strikePoints(w, h, seed));

/** A margin tick: short down-stroke then a long flick up to the right. */
export function tickPath(size, seed = 5) {
  const r = rng(seed);
  const s = size;
  return smooth([
    [s * 0.08, s * (0.52 + r() * 0.05)],
    [s * 0.25, s * 0.68],
    [s * 0.4, s * (0.86 + r() * 0.04)],
    [s * 0.62, s * 0.5],
    [s * 0.92, s * (0.1 + r() * 0.05)],
  ]);
}

/** A soft hand-drawn underline (one stroke) of width w. */
export function underlineStroke(w, seed = 23, h = 8) {
  const r = rng(seed);
  const pts = [];
  const n = Math.max(3, Math.round(w / 60));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([-2 + (w + 4) * t, h * 0.5 + (r() - 0.5) * 2.4 + Math.sin(t * Math.PI) * 1.2]);
  }
  const last = pts[pts.length - 1];
  pts.push([last[0] + 3, last[1] - 2.5]);
  return smooth(pts);
}

/** A wobbly straight-ish line from a to b. */
export function wobblyLine(x1, y1, x2, y2, seed = 17, j = 1.5) {
  const r = rng(seed);
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 60));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e = i === 0 || i === n ? 0 : 1;
    pts.push([x1 + (x2 - x1) * t + (r() - 0.5) * j * 2 * e, y1 + (y2 - y1) * t + (r() - 0.5) * j * 2 * e]);
  }
  return smooth(pts);
}
