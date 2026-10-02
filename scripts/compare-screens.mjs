// Builds before/after contact sheets from two screenshot runs (scripts/screenshots.mjs).
// Usage: node scripts/compare-screens.mjs <beforeDir> <afterDir> <outDir>
// Each dir must contain dark/ and light/ subfolders.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const [BEFORE, AFTER, OUT] = process.argv.slice(2);
if (!OUT) throw new Error('usage: compare-screens.mjs <before> <after> <out>');
mkdirSync(OUT, { recursive: true });
const groups = [
  ['1-bugun', [['01-today-empty', 'Bugün · boş'], ['02-today', 'Bugün'], ['03-morning-pain', 'Sabah ağrısı']]],
  ['2-seans-a', [['13-session-select', 'Yeni seans'], ['14-session-before', 'Seans öncesi ağrı'], ['15-session-timer', 'Zamanlayıcı']]],
  ['3-seans-b', [['16-session-rest', 'Dinlenme'], ['17-session-reps', 'Tekrar sayacı'], ['20-session-result', 'Seans sonucu']]],
  ['4-ilerleme-rom-arsiv', [['04-progress', 'İlerleme'], ['05-rom', 'ROM ölçümü'], ['06-archive', 'Arşiv']]],
  ['5-ayarlar', [['08-settings', 'Ayarlar'], ['09-program', 'Program'], ['11-backup', 'Yedekleme']]],
  ['6-diger', [['00-onboarding', 'İlk açılış'], ['10-exercise-form', 'Egzersiz formu'], ['18-session-exit', 'Seanstan çık']]],
];
const img = (p) => (existsSync(p) ? `<img src="data:image/png;base64,${readFileSync(p).toString('base64')}">` : '<div class="missing">yok</div>');
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe });
for (const scheme of ['dark', 'light']) {
  for (const [name, items] of groups) {
    const cols = items
      .map(
        ([f, label]) =>
          `<section><h2>${label}</h2><div class="pair"><figure><figcaption>Önce</figcaption>${img(`${BEFORE}/${scheme}/${f}.png`)}</figure><figure><figcaption>Sonra</figcaption>${img(`${AFTER}/${scheme}/${f}.png`)}</figure></div></section>`,
      )
      .join('');
    const fg = scheme === 'dark' ? '#eceef2' : '#14171c';
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:${scheme === 'dark' ? '#25282e' : '#d6d9df'};color:${fg};font:600 15px system-ui}
      .wrap{display:flex;gap:36px;padding:24px;align-items:flex-start}
      h2{margin:0 0 8px;font-size:18px}.pair{display:flex;gap:12px;align-items:flex-start}
      figure{margin:0}figcaption{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:6px}
      img{width:300px;display:block;border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.35)}
    </style><div class="wrap">${cols}</div>`;
    const page = await browser.newPage({ viewport: { width: 2100, height: 800 } });
    await page.setContent(html);
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => document.querySelector('.wrap').scrollWidth);
    await page.setViewportSize({ width: w, height: 800 });
    await page.screenshot({ path: `${OUT}/${scheme}-${name}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
console.log(`contact sheets → ${OUT}`);
