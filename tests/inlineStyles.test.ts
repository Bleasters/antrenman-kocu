import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Preact 11 no longer appends "px" to numeric inline style values, so `marginTop: 12`
// is silently ignored by the browser. Lengths must be written as strings ('12px').
const UNITLESS = new Set(['opacity', 'fontWeight', 'flex', 'zIndex', 'lineHeight', 'flexGrow', 'flexShrink', 'order']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('inline styles', () => {
  it('have units on every length value', () => {
    const problems: string[] = [];
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      for (const block of src.match(/style=\{\{[^}]*\}\}/g) ?? []) {
        for (const m of block.matchAll(/\b([a-zA-Z]+): (-?\d+(?:\.\d+)?)(?=\s*[,}])/g)) {
          if (!UNITLESS.has(m[1])) problems.push(`${f}: ${m[0]}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
