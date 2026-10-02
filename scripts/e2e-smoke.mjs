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
  await page.getByText('3 hareket seçili').waitFor();
  // skip one exercise for this session only
  await page.getByRole('checkbox', { name: /Havlu ile baldır germe/ }).uncheck();
  await page.getByText('2 hareket seçili').waitFor();
  // jump to the editor and come back: selection is kept
  await page.getByRole('button', { name: 'Ayak bileği alfabesi düzenle' }).click();
  await page.getByRole('heading', { name: 'Egzersizi düzenle' }).waitFor();
  await page.getByRole('link', { name: '‹ Seansa dön' }).click();
  await page.getByText('2 hareket seçili').waitFor();
  if (await page.getByRole('checkbox', { name: /Havlu ile baldır germe/ }).isChecked()) throw new Error('pick was not kept');
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

  // the unticked hold exercise is not in the session: next is the reps exercise
  await page.getByRole('heading', { name: 'Bantlı dorsifleksiyon' }).waitFor();
  await page.getByText('Egzersiz 2/2').waitFor();
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

  // ---------- Phase 2 ----------
  // ROM with a simulated sensor: dispatch devicemotion with a controllable gravity vector
  await page.evaluate(() => {
    window.__g = [0, 0, 9.81];
    setInterval(() => {
      const [x, y, z] = window.__g;
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x, y, z }, interval: 16 }));
    }, 16);
  });
  await page.goto(`${URL}#/rom`);
  await page.getByRole('heading', { name: 'ROM ölçümü' }).waitFor();
  await page.getByRole('button', { name: 'Sensörü etkinleştir' }).click();
  const tilt = (deg) => page.evaluate((d) => {
    const r = (d * Math.PI) / 180;
    window.__g = [0, 9.81 * Math.sin(r), 9.81 * Math.cos(r)];
  }, deg);
  for (const deg of [20, 22, 40]) {
    await tilt(0);
    await page.getByRole('button', { name: 'Sıfırla' }).click();
    await page.getByText('Sıfırlandı.').waitFor();
    await tilt(deg);
    await page.getByRole('button', { name: 'Ölç', exact: true }).click();
    if (deg !== 40) await page.getByRole('status').filter({ hasText: `${deg}°` }).waitFor();
  }
  // the 3rd trial saves the median automatically and it shows up in the list
  await page.getByText(/Ayak bileği dorsifleksiyon \(Sağ\): 22° kaydedildi/).waitFor();
  await page.locator('.list li').filter({ hasText: '3 ölçümün medyanı: 20°, 22°, 40°' }).waitFor();
  await shot(page, 'rom-sensor');
  // undo removes it, a single trial can be saved early
  await page.getByRole('button', { name: 'Geri al' }).click();
  await page.getByText('Henüz ölçüm yok.').waitFor();
  await tilt(0);
  await page.getByRole('button', { name: 'Sıfırla' }).click();
  await page.getByText('Sıfırlandı.').waitFor();
  await tilt(22);
  await page.getByRole('button', { name: 'Ölç', exact: true }).click();
  await page.getByText(/1\. ölçüm: 22°\. Medyan için 2 ölçüm daha/).waitFor();
  await page.getByRole('button', { name: 'Şimdi kaydet (1 ölçüm)' }).click();
  await page.locator('.list li').filter({ hasText: 'Tek ölçüm: 22°' }).waitFor();
  // the tap jolts the phone: shake for 300 ms right after the press, the first press must still succeed
  const joltThenSteady = (deg) => page.evaluate((d) => {
    const r = (d * Math.PI) / 180;
    const steady = [0, 9.81 * Math.sin(r), 9.81 * Math.cos(r)];
    let i = 0;
    const id = setInterval(() => { i++; window.__g = [Math.sin(i) * 3, Math.cos(i) * 3, 9.81]; }, 5);
    setTimeout(() => { clearInterval(id); window.__g = steady; }, 300);
  }, deg);
  await joltThenSteady(0);
  await page.getByRole('button', { name: 'Sıfırla' }).click();
  await page.getByText('Sıfırlandı.').waitFor();
  await joltThenSteady(15);
  await page.getByRole('button', { name: 'Ölç', exact: true }).click();
  await page.getByText(/1\. ölçüm: 15°/).waitFor();
  await page.getByRole('button', { name: 'Baştan al' }).click();
  // add a note to a saved measurement
  await page.getByRole('button', { name: 'Not ekle' }).first().click();
  await page.getByLabel('Not', { exact: true }).fill('sabah, ısınmadan önce');
  await page.getByRole('button', { name: 'Notu kaydet' }).click();
  await page.locator('.list li').filter({ hasText: 'sabah, ısınmadan önce' }).waitFor();
  await page.getByRole('button', { name: 'Notu düzenle' }).first().waitFor();
  await shot(page, 'rom-notes');
  // shaky window is rejected
  await page.evaluate(() => {
    let i = 0;
    setInterval(() => { i++; window.__g = [Math.sin(i) * 2, 0, 9.81]; }, 5);
  });
  await page.getByRole('button', { name: 'Sıfırla' }).click();
  await page.getByText(/Sabit tut/).first().waitFor();
  await page.reload();
  // manual entry
  await page.getByRole('button', { name: 'Manuel' }).click();
  await page.getByLabel('Açı (°)').fill('12');
  await page.getByLabel('Tarih').fill('2026-09-20');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.getByText('12° kaydedildi').waitFor();
  await shot(page, 'rom-manual');

  // Archive: upload two images, compare
  await page.goto(`${URL}#/archive`);
  for (const note of ['Ameliyat sonrası', '6. hafta']) {
    await page.locator('input[type=file]').setInputFiles('public/pwa-512.png');
    await page.getByRole('heading', { name: 'Görsel ekle' }).waitFor();
    await page.getByRole('group', { name: 'Bölge' }).last().getByRole('button', { name: 'Ayak bileği' }).click();
    await page.getByLabel('Not').fill(note);
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.getByRole('button', { name: new RegExp(note) }).waitFor();
  }
  await shot(page, 'archive');
  await page.getByRole('button', { name: /Ameliyat sonrası/ }).click();
  await page.getByRole('dialog', { name: 'Görsel' }).waitFor();
  await shot(page, 'archive-viewer');
  await page.getByRole('button', { name: '✕ Kapat' }).click();
  await page.getByRole('button', { name: 'Karşılaştır', exact: true }).click();
  await page.getByRole('button', { name: /Ameliyat sonrası/ }).click();
  await page.getByRole('button', { name: /6\. hafta/ }).click();
  await page.getByRole('button', { name: 'Seçilenleri karşılaştır' }).click();
  await page.getByRole('button', { name: 'Üst üste' }).click();
  await page.getByLabel('Kaydırıcı').fill('30');
  await shot(page, 'archive-compare');
  await page.getByRole('button', { name: '✕ Kapat' }).click();

  // Progress shows ROM + load charts
  await page.goto(`${URL}#/progress`);
  await page.getByRole('heading', { name: 'Hareket açıklığı (ROM)' }).waitFor();
  await page.locator('.uplot').nth(3).waitFor();
  await shot(page, 'progress-phase2');

  // Full ZIP backup → re-import (merge)
  await page.goto(`${URL}#/settings/backup`);
  const [zipDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Medya dahil tam yedek/ }).click()]);
  if (!/^rehab-yedek-\d{4}-\d{2}-\d{2}\.zip$/.test(zipDl.suggestedFilename())) throw new Error(`bad zip name ${zipDl.suggestedFilename()}`);
  const zipPath = await zipDl.path();
  await page.locator('input[type=file]').setInputFiles({ name: 'rehab-yedek.zip', mimeType: 'application/zip', buffer: (await import('node:fs')).readFileSync(zipPath) });
  await page.getByText(/2 görsel/).waitFor();
  await page.getByRole('button', { name: 'Birleştir' }).click();
  await page.getByText(/Birleştirildi: 0 yeni/).waitFor();
  await shot(page, 'backup-zip');

  // Report + shortcuts
  await page.goto(`${URL}#/report`);
  await page.getByRole('heading', { name: 'Rehabilitasyon özeti' }).waitFor();
  await page.getByText('Ayak bileği dorsifleksiyon').first().waitFor();
  await shot(page, 'report');
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4' });
  if (pdf.length < 1000) throw new Error('report pdf empty');
  if (screensDir) (await import('node:fs')).writeFileSync(`${screensDir}/report.pdf`, pdf);
  await page.emulateMedia({ media: 'screen' });
  await page.goto(`${URL}#/settings/shortcuts`);
  await page.getByRole('heading', { name: 'iOS Kısayol kurulumu' }).waitFor();
  await page.goto(`${URL}#/rom`);
  await page.getByRole('heading', { name: 'ROM ölçümü' }).waitFor();

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
} catch (e) {
  const pages = browser?.contexts()[0]?.pages() ?? [];
  if (pages[0]) await pages[0].screenshot({ path: `${screensDir ?? '.'}/FAILED.png`, fullPage: true }).catch(() => {});
  throw e;
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
