import { MorningPainCard } from '../components/MorningPainCard';
import { RuleCard } from '../components/RuleCard';
import { discardActiveSession, readActiveProgress } from '../db/repo';
import { useLive } from '../db/live';
import { evaluateAll, useExercises, useSessions, useSettings } from '../hooks';
import { formatLongTR, todayISO } from '../logic/dates';
import { backupOverdue, daysSinceBackup, morningPainTarget, weeklySummary } from '../logic/stats';
import { isStandalone } from '../platform/storage';
import { navigate } from '../router';
import { prefs } from '../state';
import { useState } from 'preact/hooks';

const TREND = { up: { arrow: '↑', text: 'artıyor' }, down: { arrow: '↓', text: 'azalıyor' }, flat: { arrow: '→', text: 'sabit' } };

function BackupBand({ last, installedAt, days }: { last?: number; installedAt: number; days: number }) {
  const [, force] = useState(0);
  const now = Date.now();
  if (!backupOverdue(last, installedAt, days, now) || prefs.backupSnoozeUntil > now) return null;
  const d = daysSinceBackup(last, installedAt, now);
  return (
    <div class="banner warn" role="status">
      <span class="grow">{last ? `Son yedek ${d} gün önce.` : `Henüz yedek almadın (${d} gündür kullanıyorsun).`}</span>
      <button
        class="btn ghost"
        onClick={() => {
          prefs.snoozeBackup();
          force((x) => x + 1);
        }}
      >
        Ertele
      </button>
      <button class="btn primary" onClick={() => navigate('/settings/backup')}>
        Yedekle
      </button>
    </div>
  );
}

export function Today() {
  const settings = useSettings();
  const sessions = useSessions();
  const exercises = useExercises();
  const active = useLive(readActiveProgress, [], null);
  if (!settings || !sessions) return null;

  const today = todayISO();
  const morningTarget = morningPainTarget(sessions, today);
  const evals = evaluateAll(sessions, settings, exercises ?? []);
  const lastEval = evals[evals.length - 1];
  const week = weeklySummary(sessions, today);

  return (
    <div class="stack">
      <BackupBand last={settings.lastBackupAt} installedAt={settings.createdAt} days={settings.backupReminderDays} />
      {!isStandalone() && (
        <div class="banner info small">
          <span class="grow">
            Ana ekrana ekle: Safari → Paylaş → <em>Ana Ekrana Ekle</em>. Safari sekmesindeki veriler ana ekran uygulamasına
            taşınmaz.
          </span>
        </div>
      )}

      <header>
        <h1>Bugün</h1>
        <div class="muted">{formatLongTR(today)}</div>
      </header>

      {active && (
        <section class="card accent">
          <h2>Yarım kalan seans</h2>
          <div class="bottom-actions two">
            <button class="btn danger" onClick={() => void discardActiveSession()}>
              Sil
            </button>
            <button class="btn primary" onClick={() => navigate('/session')}>
              Devam et
            </button>
          </div>
        </section>
      )}

      {morningTarget && <MorningPainCard session={morningTarget} />}

      {lastEval ? (
        <RuleCard ev={lastEval} />
      ) : (
        <section class="card grey">
          <h2>Henüz seans yok</h2>
          <p class="muted">İlk seansından sonra ağrı izleme sonucu burada görünecek.</p>
        </section>
      )}

      <section class="card">
        <h2>Son 7 gün</h2>
        <div class="stat-grid">
          <div>
            <div class="stat">{week.count}</div>
            <div class="small muted">seans</div>
          </div>
          <div>
            <div class="stat">
              {week.avgThis ?? '–'} {week.trend && <span aria-hidden="true">{TREND[week.trend].arrow}</span>}
            </div>
            <div class="small muted">
              ort. ağrı{week.trend ? ` · ${TREND[week.trend].text}` : ''}
              {week.avgPrev != null ? ` (önceki hafta ${week.avgPrev})` : ''}
            </div>
          </div>
        </div>
      </section>

      <div class="sticky-cta">
        <button class="btn primary huge block" onClick={() => navigate('/session')}>
          {active ? 'Seansa devam et' : 'Seansı Başlat'}
        </button>
      </div>
    </div>
  );
}
