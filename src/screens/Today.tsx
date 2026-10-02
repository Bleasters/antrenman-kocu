import { MorningPainCard } from '../components/MorningPainCard';
import { RuleCard } from '../components/RuleCard';
import { discardActiveSession, readActiveProgress } from '../db/repo';
import { useLive } from '../db/live';
import { evaluateAll, useExercises, useSessions, useSettings } from '../hooks';
import { formatLongTR, todayISO } from '../logic/dates';
import { backupOverdue, daysSinceBackup, morningPainTarget, romDue, weeklySummary } from '../logic/stats';
import { db } from '../db/db';
import type { RomMeasurement } from '../db/types';
import { isStandalone } from '../platform/storage';
import { navigate } from '../router';
import { prefs } from '../state';
import { useState } from 'preact/hooks';
import { EmptyState } from '../components/EmptyState';
import {
  IconActivity,
  IconCalendar,
  IconPhone,
  IconPlaySmall,
  IconRuler,
  IconShield,
  IconTimer,
  IconTrendDown,
  IconTrendFlat,
  IconTrendUp,
} from '../components/Icons';
import { PageHeader } from '../components/PageHeader';

const TREND = {
  up: { Icon: IconTrendUp, text: 'artıyor', cls: 'trend-up' },
  down: { Icon: IconTrendDown, text: 'azalıyor', cls: 'trend-down' },
  flat: { Icon: IconTrendFlat, text: 'sabit', cls: 'trend-flat' },
};

const dayFormatter = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' });

function BackupBand({ last, installedAt, days }: { last?: number; installedAt: number; days: number }) {
  const [, force] = useState(0);
  const now = Date.now();
  if (!backupOverdue(last, installedAt, days, now) || prefs.backupSnoozeUntil > now) return null;
  const d = daysSinceBackup(last, installedAt, now);
  return (
    <div class="banner warn" role="status">
      <IconShield aria-hidden="true" />
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
  const rom = useLive<RomMeasurement[] | undefined>(() => db.rom.toArray(), [], undefined);
  if (!settings || !sessions) return null;

  const today = todayISO();
  const morningTarget = morningPainTarget(sessions, today);
  const evals = evaluateAll(sessions, settings, exercises ?? []);
  const lastEval = evals[evals.length - 1];
  const week = weeklySummary(sessions, today);
  const trend = week.trend ? TREND[week.trend] : null;

  return (
    <div class="stack">
      <BackupBand last={settings.lastBackupAt} installedAt={settings.createdAt} days={settings.backupReminderDays} />
      {!isStandalone() && (
        <div class="banner info">
          <IconPhone aria-hidden="true" />
          <span class="grow small">
            Ana ekrana ekle: Safari → Paylaş → <em>Ana Ekrana Ekle</em>. Safari sekmesindeki veriler ana ekran uygulamasına taşınmaz.
          </span>
        </div>
      )}

      <PageHeader title="Bugün" overline={dayFormatter.format(new Date())} />
      <span class="sr-only">{formatLongTR(today)}</span>

      {active && (
        <section class="card accent">
          <div class="row" style={{ gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
            <div class="status-icon accent">
              <IconTimer aria-hidden="true" />
            </div>
            <h2 class="grow" style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>
              Yarım kalan seans
            </h2>
          </div>
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

      {rom && romDue(rom, today) && (
        <section class="card">
          <div class="row" style={{ gap: 'var(--s-3)' }}>
            <div class="status-icon accent">
              <IconRuler aria-hidden="true" />
            </div>
            <div class="grow">
              <h2 style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>ROM ölçümü zamanı</h2>
              <div class="small muted">Son 7 günde hareket açıklığı ölçmedin.</div>
            </div>
            <a class="btn tinted" href="#/rom">
              Ölç
            </a>
          </div>
        </section>
      )}

      {lastEval ? (
        <RuleCard ev={lastEval} />
      ) : (
        <EmptyState icon={IconActivity} title="Henüz seans yok" text="İlk seansından sonra ağrı izleme sonucu burada görünecek." />
      )}

      <section class="card">
        <div class="card-title" style={{ marginBottom: 'var(--s-3)' }}>
          <IconCalendar aria-hidden="true" />
          <h2 style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>Son 7 gün</h2>
        </div>
        <div class="stat-grid">
          <div>
            <div class="stat-label">Seans</div>
            <div class="stat">{week.count}</div>
          </div>
          <div>
            <div class="stat-label">Ort. ağrı</div>
            <div class="stat row" style={{ gap: 'var(--s-1)' }}>
              {week.avgThis ?? '–'}
              {trend && (
                <span class={trend.cls} aria-hidden="true" style={{ display: 'inline-flex' }}>
                  <trend.Icon size={22} />
                </span>
              )}
            </div>
            <div class="small muted">
              {trend ? trend.text : ''}
              {week.avgPrev != null ? `${trend ? ' · ' : ''}önceki hafta ${week.avgPrev}` : ''}
            </div>
          </div>
        </div>
      </section>

      <div class="sticky-cta">
        <button class="btn primary huge block" onClick={() => navigate('/session')}>
          <IconPlaySmall aria-hidden="true" fill="currentColor" />
          {active ? 'Seansa devam et' : 'Seansı Başlat'}
        </button>
      </div>
    </div>
  );
}
