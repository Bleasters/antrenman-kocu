// Captures every screen at iPhone width with a deterministic fixture.
// Usage: npm run build && node scripts/screenshots.mjs --out <dir> [--scheme dark|light]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const OUT = arg('--out', 'screens');
const SCHEME = arg('--scheme', 'dark');
const PORT = 4190 + (SCHEME === 'dark' ? 0 : 1);
const URL = `http://localhost:${PORT}/antrenman-kocu/`;
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r, j) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r());
  setTimeout(() => j(new Error('preview timeout')), 20000);
});

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: SCHEME,
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();
const overflow = [];
const shot = async (name, full = false) => {
  await page.waitForTimeout(250);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 390) overflow.push(`${name}: page is ${w}px wide`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
};
const go = async (hash) => {
  await page.goto(`${URL}#${hash}`);
  await page.waitForTimeout(300);
};

try {
  // first launch: onboarding + empty state
  await page.goto(URL);
  await page.getByRole('heading').first().waitFor();
  await shot('00-onboarding');
  await page.getByRole('button', { name: 'Anladım' }).click();
  await shot('01-today-empty');

  // fixture: write straight into IndexedDB (same records the app itself stores)
  await page.evaluate(async () => {
    const open = () => new Promise((res, rej) => { const r = indexedDB.open('rehabflow'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const idb = await open();
    const all = (store) => new Promise((res) => { const q = idb.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); });
    const exercises = await all('exercises');
    const byRegion = (r) => exercises.filter((e) => e.region === r).sort((a, b) => a.order - b.order);
    const day = 86400000;
    const now = Date.now();
    const iso = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
    const sessions = [];
    const plan = [27, 25, 23, 20, 18, 16, 13, 11, 9, 6, 4, 2, 1];
    plan.forEach((ago, i) => {
      const t = now - ago * day - 2 * 3600000;
      const regions = i % 3 === 2 ? ['ankle', 'knee'] : ['ankle'];
      const k = i / plan.length;
      const before = Math.max(0, Math.round(5 - 3 * k));
      const after = before + (i === 6 ? 3 : i % 2);
      const entries = regions.flatMap((r) => byRegion(r).map((e) => ({
        exerciseId: e.id, region: e.region, name: e.name, kind: e.kind,
        sets: Array.from({ length: e.defaultSets }, () => ({
          reps: e.kind === 'reps' ? (e.defaultReps ?? 10) + Math.round(4 * k) : undefined,
          holdSec: e.kind === 'hold' ? (e.holdSec ?? 10) + Math.round(10 * k) : undefined,
          durationSec: e.kind === 'timed' ? e.durationSec : undefined,
          loadKg: e.kind === 'reps' && e.region === 'ankle' ? 1 + Math.round(2 * k) : undefined,
          done: true,
        })),
        painDuring: Math.min(10, after),
      })));
      const pb = Object.fromEntries(regions.map((r) => [r, r === 'knee' ? Math.max(0, before - 2) : before]));
      const pa = Object.fromEntries(regions.map((r) => [r, r === 'knee' ? Math.max(0, after - 2) : after]));
      sessions.push({
        id: `fx-s${i}`, createdAt: t, updatedAt: t, date: iso(t), startedAt: t, endedAt: t + 1800000, regions,
        painBefore: pb, painAfter: pa, painNextMorning: ago === 1 ? undefined : pb, entries,
        redFlags: i === 6 ? ['night_pain'] : undefined,
      });
    });
    const rom = [];
    [27, 20, 13, 6, 1].forEach((ago, i) => {
      const t = now - ago * day;
      rom.push({ id: `fx-r${i}a`, createdAt: t, updatedAt: t, date: iso(t), region: 'ankle', side: 'right', movement: 'ankle_dorsiflexion', angleDeg: 8 + i * 3.5, method: 'sensor', timing: 'pre', trials: [8 + i * 3.5 - 1, 8 + i * 3.5, 8 + i * 3.5 + 1.5] });
      rom.push({ id: `fx-r${i}b`, createdAt: t + 1, updatedAt: t + 1, date: iso(t), region: 'ankle', side: 'right', movement: 'ankle_dorsiflexion', angleDeg: 11 + i * 3.8, method: 'sensor', timing: 'post' });
      rom.push({ id: `fx-r${i}c`, createdAt: t + 2, updatedAt: t + 2, date: iso(t), region: 'wrist', side: 'left', movement: 'wrist_flexion', angleDeg: 35 + i * 6, method: 'manual', timing: 'pre', notes: i === 4 ? 'Fizyoterapist ölçümü' : undefined });
      // injured wrist extension + healthy-side references (symmetry)
      rom.push({ id: `fx-r${i}d`, createdAt: t + 3, updatedAt: t + 3, date: iso(t), region: 'wrist', side: 'left', movement: 'wrist_extension', angleDeg: 30 + i * 6, method: 'sensor', timing: 'pre' });
      if (i % 2 === 0) {
        rom.push({ id: `fx-r${i}e`, createdAt: t + 4, updatedAt: t + 4, date: iso(t), region: 'wrist', side: 'right', movement: 'wrist_extension', angleDeg: 66, method: 'sensor', timing: 'pre' });
        rom.push({ id: `fx-r${i}f`, createdAt: t + 5, updatedAt: t + 5, date: iso(t), region: 'wrist', side: 'right', movement: 'wrist_flexion', angleDeg: 72, method: 'manual', timing: 'pre' });
      }
      if (i < 2) rom.push({ id: `fx-r${i}g`, createdAt: t + 6, updatedAt: t + 6, date: iso(t), region: 'ankle', side: 'left', movement: 'ankle_dorsiflexion', angleDeg: 28, method: 'sensor', timing: 'pre' });
    });
    const xray = async (seed) => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 800;
      const g = c.getContext('2d');
      g.fillStyle = '#0b0d10'; g.fillRect(0, 0, 600, 800);
      const grd = g.createRadialGradient(300, 380, 40, 300, 380, 320); grd.addColorStop(0, '#cfd6dd'); grd.addColorStop(1, '#1a1f25');
      g.fillStyle = grd; g.beginPath(); g.ellipse(300, 400, 120, 330, 0.08 * seed, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8edf2'; g.fillRect(270, 330 + seed * 10, 60, 14); g.fillRect(292, 260, 14, 200);
      const b = (q) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));
      return { blob: await b(0.8), thumb: await b(0.5) };
    };
    const media = [];
    for (const [i, ago] of [[0, 26], [1, 5]]) {
      const t = now - ago * day; const { blob, thumb } = await xray(i);
      media.push({ id: `fx-m${i}`, createdAt: t, updatedAt: t, date: iso(t), region: 'ankle', kind: 'xray', note: i ? '8. hafta kontrol' : 'Ameliyat sonrası', blob, thumbBlob: thumb });
    }
    await new Promise((res, rej) => {
      const tx = idb.transaction(['sessions', 'rom', 'media'], 'readwrite');
      sessions.forEach((s) => tx.objectStore('sessions').put(s));
      rom.forEach((r) => tx.objectStore('rom').put(r));
      media.forEach((m) => tx.objectStore('media').put(m));
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  });

  await go('/');
  await page.reload();
  await page.waitForTimeout(500);
  await shot('02-today');
  await shot('02b-today-full', true);
  await page.evaluate(() => document.querySelector('.sym-summary')?.scrollIntoView({ block: 'center' }));
  await shot('02c-today-symmetry');
  await go('/morning-pain');
  await shot('03-morning-pain');
  await go('/progress');
  await page.locator('.uplot').first().waitFor().catch(() => {});
  await shot('04-progress');
  await shot('04b-progress-full', true);
  await go('/rom');
  await shot('05-rom');
  await shot('05b-rom-full', true);
  await go('/archive');
  await shot('06-archive');
  await page.locator('.media-tile, [data-media-tile]').first().click();
  await shot('06b-archive-viewer');
  await go('/report');
  await shot('07-report', true);
  await go('/settings');
  await shot('08-settings', true);
  await go('/settings/program');
  await shot('09-program', true);
  await page.locator('a[href^="#/settings/program/"]').first().click();
  await shot('10-exercise-form', true);
  await go('/settings/backup');
  await shot('11-backup', true);
  await go('/settings/shortcuts');
  await shot('12-shortcuts', true);
  // symmetry views
  await go('/progress');
  await page.getByText(/Simetri ·/).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => document.querySelector('.section-title + .card')?.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -60));
  await shot('21-progress-symmetry');
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes('Hareket açıklığı'))?.scrollIntoView({ block: 'start' }));
  await page.locator('select[aria-label="Hareket"]').selectOption('wrist_extension').catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollBy(0, -16));
  await shot('22-progress-rom-reference');
  await go('/settings');
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes('Taraflar ve simetri'))?.scrollIntoView({ block: 'start' }));
  await shot('23-settings-symmetry');
  await go('/report');
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes('Simetri ('))?.scrollIntoView({ block: 'start' }));
  await shot('24-report-symmetry');
  await go('/rom');
  await page.getByRole('button', { name: 'Bilek', exact: true }).click();
  await page.getByRole('button', { name: 'ulnar deviasyon' }).click();
  await page.getByRole('button', { name: 'Manuel' }).click();
  await page.getByLabel('Açı (°)').fill('18');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.getByText('Sağlam tarafı da ölçmek ister misin?').waitFor();
  await page.evaluate(() => window.scrollBy(0, 520));
  await shot('25-rom-healthy-prompt');

  // session flow (last: it adds a session)
  await go('/session');
  await page.getByRole('button', { name: /Ayak bileği/ }).first().click();
  await shot('13-session-select', true);
  await page.getByRole('button', { name: /Seansı başlat/ }).click();
  await page.getByRole('group', { name: 'Ayak bileği' }).getByRole('button', { name: '2', exact: true }).click();
  await shot('14-session-before');
  await page.getByRole('button', { name: /Egzersizlere geç/ }).click();
  await page.getByRole('button', { name: 'Başlat' }).click();
  await page.waitForTimeout(2300);
  await shot('15-session-timer');
  await page.getByRole('button', { name: 'Set bitti' }).click();
  await page.waitForTimeout(1200);
  await shot('16-session-rest');
  await page.getByRole('button', { name: /^Atla/ }).last().click();
  await page.getByRole('button', { name: 'Set bitti' }).click();
  await page.getByRole('button', { name: /Sonraki egzersiz/ }).click();
  await page.getByRole('button', { name: /^Atla/ }).first().click(); // skip hold
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: '+1' }).click();
  await shot('17-session-reps');
  await page.getByRole('button', { name: /Çık/ }).click();
  await shot('18-session-exit');
  await page.getByRole('button', { name: /Erken bitir/ }).click();
  await page.getByRole('group', { name: 'Ayak bileği' }).getByRole('button', { name: '3', exact: true }).click();
  await shot('19-session-after', true);
  await page.getByRole('button', { name: /Seansı bitir/ }).click();
  await page.getByRole('heading', { name: 'Seans kaydedildi' }).waitFor();
  await shot('20-session-result');
  console.log(`screens → ${OUT} (${SCHEME})`);
  if (overflow.length) {
    console.error('Horizontal overflow at 390px:\n' + overflow.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.kill();
}
