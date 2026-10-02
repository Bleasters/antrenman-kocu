import '../styles/print.css';
import { useState } from 'preact/hooks';
import { BlobImage } from '../components/BlobImage';
import { MiniChart } from '../components/MiniChart';
import { db } from '../db/db';
import { useLive } from '../db/live';
import { useSessions, useSettings } from '../hooks';
import { addDays, formatLongTR, formatShortTR, todayISO } from '../logic/dates';
import { RED_FLAG_LABEL, REGION_LABEL, SIDE_LABEL } from '../logic/labels';
import { LEVEL_TITLE } from '../logic/painRules';
import { buildReport } from '../logic/report';
import { MOVEMENTS } from '../logic/rom';

const TREND = { up: '↑ artıyor', down: '↓ azalıyor', flat: '→ sabit' };
const fmt = (v: number | null) => (v == null ? '–' : String(v));
const C = { before: '#2b6cb0', after: '#c05621', left: '#2b6cb0', right: '#c05621' };

export function Report() {
  const sessions = useSessions();
  const settings = useSettings();
  const rom = useLive(() => db.rom.toArray(), [], []);
  const xrays = useLive(() => db.media.where('kind').equals('xray').sortBy('date'), [], []);
  const today = todayISO();
  const [from, setFrom] = useState(addDays(today, -27));
  const [to, setTo] = useState(today);
  const [chosen, setChosen] = useState<string[]>([]);
  if (!sessions || !settings) return null;

  const r = buildReport({ sessions, rom, settings, from, to });
  const pickedXrays = xrays.filter((x) => chosen.includes(x.id));

  return (
    <div class="stack">
      <div class="no-print stack">
        <a class="btn ghost" href="#/progress">
          ‹ İlerleme
        </a>
        <h1>Doktor raporu</h1>
        <div class="row">
          <label class="field grow">
            <span>Başlangıç</span>
            <input type="date" value={from} max={to} onInput={(e) => setFrom((e.target as HTMLInputElement).value || from)} />
          </label>
          <label class="field grow">
            <span>Bitiş</span>
            <input type="date" value={to} min={from} max={today} onInput={(e) => setTo((e.target as HTMLInputElement).value || to)} />
          </label>
        </div>
        {xrays.length > 0 && (
          <details class="card">
            <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>Rapora röntgen ekle ({chosen.length} seçili)</summary>
            {xrays.map((x) => (
              <label key={x.id} class="check-row" style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={chosen.includes(x.id)}
                  style={{ accentColor: 'var(--accent)' }}
                  onChange={() => setChosen(chosen.includes(x.id) ? chosen.filter((c) => c !== x.id) : [...chosen, x.id])}
                />
                <BlobImage blob={x.thumbBlob ?? x.blob} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                <span>
                  {formatLongTR(x.date)}
                  {x.region ? ` · ${REGION_LABEL[x.region]}` : ''}
                  {x.note ? ` · ${x.note}` : ''}
                </span>
              </label>
            ))}
          </details>
        )}
        <button class="btn primary big block" onClick={() => window.print()}>
          Yazdır / PDF olarak kaydet
        </button>
        <p class="small muted" style={{ margin: 0 }}>
          iPhone'da: Yazdır ekranında önizlemeyi iki parmakla büyüt ya da Paylaş → <em>Dosyalar'a Kaydet</em> ile PDF olarak sakla.
        </p>
      </div>

      <article class="report">
        <h1>Rehabilitasyon özeti</h1>
        <div>
          Dönem: <strong>{formatLongTR(r.from)} – {formatLongTR(r.to)}</strong> · Oluşturma: {formatLongTR(today)}
        </div>

        <h2>Özet</h2>
        <table>
          <tbody>
            <tr>
              <th>Seans sayısı</th>
              <td class="num">{r.sessionCount}</td>
              <th>Bölgelere göre</th>
              <td>
                {(['wrist', 'ankle', 'knee'] as const)
                  .filter((k) => r.byRegion[k])
                  .map((k) => `${REGION_LABEL[k]} ${r.byRegion[k]}`)
                  .join(', ') || '–'}
              </td>
            </tr>
            <tr>
              <th>Ağrı izleme sonuçları</th>
              <td colSpan={3}>
                🟢 {LEVEL_TITLE.green}: {r.levels.green} · 🟠 {LEVEL_TITLE.orange}: {r.levels.orange} · 🔴 Kırmızı bayrak: {r.levels.red}
                {r.levels.provisional ? ` · (${r.levels.provisional} geçici)` : ''}
              </td>
            </tr>
            <tr>
              <th>Eşikler</th>
              <td colSpan={3}>
                Artış ≥ {settings.painIncreaseThreshold} · Üst sınır &gt; {settings.painMaxDuring} · Ertesi sabah dönüş: {settings.nextMorningMustReturn ? 'açık' : 'kapalı'}
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Ağrı (0–10)</h2>
        {r.pain.length === 0 ? (
          <p>Bu dönemde seans yok.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Bölge</th>
                  <th>Seans</th>
                  <th>Önce ort.</th>
                  <th>Sonra ort.</th>
                  <th>Ertesi sabah ort.</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {r.pain.map((p) => (
                  <tr key={p.region}>
                    <td>{REGION_LABEL[p.region]}</td>
                    <td class="num">{p.n}</td>
                    <td class="num">{fmt(p.before)}</td>
                    <td class="num">{fmt(p.after)}</td>
                    <td class="num">{fmt(p.morning)}</td>
                    <td>{p.trend ? TREND[p.trend] : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div class="legend" style={{ marginTop: 6 }}>
              <span>
                <i style={{ background: C.before }} />
                Önce
              </span>
              <span>
                <i style={{ background: C.after }} />
                Sonra
              </span>
            </div>
            <div class="charts">
              {r.pain.map((p) => (
                <figure key={p.region}>
                  <figcaption>{REGION_LABEL[p.region]}</figcaption>
                  <MiniChart
                    labels={p.points.map((x) => formatShortTR(x.date))}
                    yMax={10}
                    series={[
                      { label: 'Önce', color: C.before, values: p.points.map((x) => x.before) },
                      { label: 'Sonra', color: C.after, values: p.points.map((x) => x.after) },
                    ]}
                  />
                </figure>
              ))}
            </div>
          </>
        )}

        <h2>Hareket açıklığı (ROM)</h2>
        {r.rom.length === 0 ? (
          <p>Bu dönemde ölçüm yok.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Hareket</th>
                  <th>Taraf</th>
                  <th>İlk</th>
                  <th>Son</th>
                  <th>Fark</th>
                  <th>Ölçüm</th>
                </tr>
              </thead>
              <tbody>
                {r.rom.map((m) => (
                  <tr key={`${m.movement}-${m.side}`}>
                    <td>{MOVEMENTS[m.movement].label}</td>
                    <td>{SIDE_LABEL[m.side]}</td>
                    <td class="num">
                      {m.first.angle}° <span style={{ color: '#666' }}>({formatShortTR(m.first.date)})</span>
                    </td>
                    <td class="num">
                      {m.last.angle}° <span style={{ color: '#666' }}>({formatShortTR(m.last.date)})</span>
                    </td>
                    <td class="num">
                      <strong>
                        {m.diff > 0 ? '+' : ''}
                        {m.diff}°
                      </strong>
                    </td>
                    <td class="num">{m.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div class="charts" style={{ marginTop: 6 }}>
              {r.rom
                .filter((m) => m.n > 1)
                .map((m) => (
                  <figure key={`${m.movement}-${m.side}`}>
                    <figcaption>
                      {MOVEMENTS[m.movement].label} ({SIDE_LABEL[m.side]})
                    </figcaption>
                    <MiniChart labels={m.points.map((x) => formatShortTR(x.date))} unit="°" series={[{ label: 'Açı', color: m.side === 'left' ? C.left : C.right, values: m.points.map((x) => x.angle) }]} />
                  </figure>
                ))}
            </div>
            <p class="disclaimer">Telefon eğim ölçeriyle ölçülen değerlerin doğruluğu yaklaşık ±5°'dir.</p>
          </>
        )}

        <h2>Kırmızı bayraklar</h2>
        {r.redFlags.length === 0 ? (
          <p>Bu dönemde kırmızı bayrak işaretlenmedi.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Belirti</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {r.redFlags.map((f, i) => (
                <tr key={i}>
                  <td>{formatLongTR(f.date)}</td>
                  <td>{f.flags.map((x) => RED_FLAG_LABEL[x]).join(', ')}</td>
                  <td>{f.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pickedXrays.length > 0 && (
          <>
            <h2>Röntgenler</h2>
            <div class="xrays">
              {pickedXrays.map((x) => (
                <figure key={x.id}>
                  <BlobImage blob={x.blob} alt={x.note ?? 'Röntgen'} />
                  <figcaption>
                    {formatLongTR(x.date)}
                    {x.region ? ` · ${REGION_LABEL[x.region]}` : ''}
                    {x.note ? ` · ${x.note}` : ''}
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        )}

        <p class="disclaimer">
          Bu rapor hasta tarafından RehabFlow uygulamasıyla kaydedilen verilerden otomatik oluşturulmuştur. Ağrı değerleri hastanın öz bildirimidir. Uygulama tıbbi
          tavsiye vermez; ağrı izleme eşikleri hasta tarafından ayarlanmıştır.
        </p>
      </article>
    </div>
  );
}
