// Fails the build if the output references any external origin at runtime
// (CDNs, fonts, analytics...). Only XML/SVG namespace URIs are allowed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const ALLOWED = [
  /^https?:\/\/www\.w3\.org\//, // SVG/XML namespaces
  // Inert help links inside library error-message strings (never fetched):
  /^https:\/\/tinyurl\.com\/y2uuvskb$/, // Dexie "IndexedDB API missing"
  /^http:\/\/bit\.ly\/2kdckMn$/, // Dexie "Transaction committed too early"
  /^https:\/\/bit\.ly\/wb-precache$/, // Workbox precache error text
];
const URL_RE = /\b(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const problems = [];
for (const file of walk(DIST)) {
  if (!/\.(html|js|css|webmanifest|json)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    if (url.startsWith('//')) url = `https:${url}`;
    if (ALLOWED.some((re) => re.test(url))) continue;
    problems.push(`${file.replace(DIST, 'dist/')}: ${m[0].slice(0, 120)}`);
  }
}

if (problems.length) {
  console.error('External URLs found in build output:\n' + [...new Set(problems)].join('\n'));
  process.exit(1);
}
console.log('check-offline: no external URLs in dist/ ✓');
