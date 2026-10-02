// WCAG AA contrast check for the design tokens in src/styles/base.css (both themes).
// Text pairs need 4.5:1, chart/graphic strokes 3:1. Tints are blended over the surface.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');
const block = (start) => {
  const i = css.indexOf(start);
  if (i < 0) throw new Error(`block not found: ${start}`);
  let depth = 0;
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(i, j);
  }
  throw new Error('unbalanced');
};
const tokens = (src) => Object.fromEntries([...src.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]));
const dark = tokens(block(':root {'));
const light = { ...dark, ...tokens(block('@media (prefers-color-scheme: light) {\n  :root {')) };

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (fg, a, bg) => '#' + hex(fg).map((c, i) => Math.round((c * a + hex(bg)[i] * (1 - a)) * 255).toString(16).padStart(2, '0')).join('');

let failures = 0;
for (const [name, t, tint] of [
  ['dark', dark, 0.14],
  ['light', light, 0.1],
]) {
  const checks = [];
  for (const fg of ['text', 'text-2', 'text-3']) for (const bg of ['bg', 'surface', 'surface-2']) checks.push([`${fg} on ${bg}`, t[fg], t[bg], 4.5]);
  checks.push(['accent-ink on accent', t['accent-ink'], t.accent, 4.5]);
  checks.push(['accent on accent-tint', t.accent, mix(t.accent, tint, t.surface), 4.5]);
  for (const k of ['wrist', 'ankle', 'knee']) {
    checks.push([`${k} stroke on surface`, t[k], t.surface, 3]);
    checks.push([`${k} text on its tint`, t[k], mix(t[k], tint, t.surface), 4.5]);
  }
  for (const k of ['ok', 'warn', 'bad']) checks.push([`${k} on its tint`, t[k], mix(t[k], tint, t.surface), 4.5]);
  for (const k of ['text', 'text-2']) checks.push([`${k} on warn card`, t[k], mix(t.warn, tint, t.surface), 4.5]);
  for (const [label, a, b, need] of checks) {
    const r = ratio(a, b);
    if (r < need) {
      failures++;
      console.error(`✗ ${name}: ${label} ${r.toFixed(2)} < ${need}`);
    }
  }
}
if (failures) process.exit(1);
console.log('check-contrast: all token pairs meet WCAG AA ✓');
