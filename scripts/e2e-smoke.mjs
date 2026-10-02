// End-to-end smoke test against the production build (npm run build first).
// - walks through a full session on an iPhone-sized viewport
// - asserts that no request ever leaves the local origin
// - reloads with the network offline to prove the service worker serves the app
// Usage: node scripts/e2e-smoke.mjs [--screens <dir>]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const PORT = 4179;
const ORIGIN = `http://localhost:${PORT}`;
const URL = `${ORIGIN}/antrenman-kocu/`;
const screensDir = process.argv.includes('--screens') ? process.argv[process.argv.indexOf('--screens') + 1] : null;
if (screensDir && !existsSync(screensDir)) mkdirSync(screensDir, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview timeout')), 20000);
});

const external = [];
const errors = [];
let browser;
let step = 0;
const shot = async (page, name) => screensDir && page.screenshot({ path: `${screensDir}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true });

try {
  browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    serviceWorkers: 'allow',
  });
  context.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(URL);
  await page.getByRole('button', { name: 'Anladım' }).click();
  await page.getByRole('heading', { name: 'Bugün' }).waitFor();
  await shot(page, 'today-empty');

  // Program screen shows seeded samples
  await page.goto(`${URL}#/settings/program`);
  await page.getByText('Örnek — düzenle').first().waitFor();
  await shot(page, 'program');

  // Full session: ankle only
  await page.goto(`${URL}#/session`);
  await page.getByRole('button', { name: /Ayak bileği/ }).click();
  await shot(page, 'session-regions');
  await page.getByRole('button', { name: 'Seansı başlat' }).click();
  await page.getByRole('heading', { name: 'Seans öncesi ağrı' }).waitFor();
  await page.getByRole('group', { name: 'Ayak bileği' }).getByRole('button', { name: '2', exact: true }).click();
  await shot(page, 'session-before');
  await page.getByRole('button', { name: /Egzersizlere geç/ }).click();

  // Exercise 1 (timed): start the timer, then mark sets done manually
  await page.getByRole('heading', { name: 'Ayak bileği alfabesi' }).waitFor();
  await page.getByRole('button', { name: 'Başlat' }).click();
  await page.waitForTimeout(1200);
  await shot(page, 'session-timer');
  await page.getByRole('button', { name: 'Set bitti' }).click();
  await page.getByText('Dinlenme').waitFor();
  await shot(page, 'session-rest');
  await page.getByRole('button', { name: 'Atla ›' }).last().click();

  // Crash recovery: reload in the middle of a session
  await page.reload();
  await page.getByRole('heading', { name: 'Ayak bileği alfabesi' }).waitFor();
  const dots = await page.locator('.set-dots span.done').count();
  if (dots !== 1) throw new Error(`expected 1 completed set after reload, got ${dots}`);
  await page.getByRole('button', { name: 'Set bitti' }).click();
  await page.getByRole('button', { name: /Sonraki egzersiz/ }).click();

  // Exercise 2 (hold): skip; exercise 3 (reps): count to target
  await page.getByRole('button', { name: 'Atla ›' }).first().click();
  await page.getByRole('heading', { name: 'Bantlı dorsifleksiyon' }).waitFor();
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: '+1' }).click();
  await shot(page, 'session-reps');
  await page.getByRole('button', { name: 'Set bitti' }).click();
  await page.getByRole('button', { name: 'Atla ›' }).last().click(); // skip rest

  // Leave early → after pain
  await page.getByRole('button', { name: '✕ Çık' }).click();
  await page.getByRole('button', { name: /Erken bitir/ }).click();
  await page.getByRole('heading', { name: 'Seans sonrası' }).waitFor();
  await page.getByRole('group', { name: 'Ayak bileği' }).getByRole('button', { name: '5', exact: true }).click();
  await shot(page, 'session-after');
  await page.getByRole('button', { name: /Seansı bitir/ }).click();
  await page.getByRole('heading', { name: 'Seans kaydedildi' }).waitFor();
  await page.getByText('Yükü azalt').waitFor(); // 2 → 5 is +3 ≥ threshold 2
  await shot(page, 'session-result');
  await page.getByRole('button', { name: /Bugün'e dön/ }).click();
  await shot(page, 'today-after');

  await page.goto(`${URL}#/progress`);
  await page.locator('.uplot').first().waitFor();
  await shot(page, 'progress');

  await page.goto(`${URL}#/settings`);
  await shot(page, 'settings');

  // Export (download fallback in headless Chromium)
  await page.goto(`${URL}#/settings/backup`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Sadece veriler/ }).click()]);
  const name = download.suggestedFilename();
  if (!/^rehab-yedek-\d{4}-\d{2}-\d{2}\.json$/.test(name)) throw new Error(`bad backup filename ${name}`);
  await page.getByText('Yedek dosyası indirildi.').waitFor();
  await shot(page, 'backup');

  // Deep link
  await page.goto(`${URL}#/morning-pain`);
  await page.getByRole('heading', { name: 'Sabah ağrısı' }).waitFor();

  // Offline: wait for the service worker, cut the network, reload
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // ensure the page is controlled
  await context.setOffline(true);
  await page.goto(`${URL}#/`);
  await page.getByRole('heading', { name: 'Bugün' }).waitFor({ timeout: 5000 });
  await shot(page, 'offline');
  console.log('offline reload ✓');
} finally {
  await browser?.close();
  server.kill();
}

if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
if (external.length) {
  console.error('External requests:\n' + external.join('\n'));
  process.exit(1);
}
console.log('e2e smoke ✓ (no external requests)');
