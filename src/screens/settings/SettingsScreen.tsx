import { useEffect, useState } from 'preact/hooks';
import { Modal } from '../../components/Modal';
import { Stepper } from '../../components/Stepper';
import { updateSettings, wipeAllData } from '../../db/repo';
import { db } from '../../db/db';
import { ensureSeeded } from '../../db/seed';
import { REGIONS, type Side } from '../../db/types';
import { useSettings } from '../../hooks';
import { REGION_LABEL } from '../../logic/labels';
import { formatBytes, isPersisted, isStandalone, requestPersistence, storageEstimate } from '../../platform/storage';

function StorageInfo() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    void isPersisted().then(setPersisted);
    void storageEstimate().then(setEst);
  }, []);
  return (
    <section class="card stack">
      <h2>Depolama</h2>
      <div class="row spread">
        <span>Kalıcı depolama</span>
        <strong>{persisted === undefined ? '…' : persisted === null ? 'Desteklenmiyor' : persisted ? 'Verildi ✓' : 'Verilmedi'}</strong>
      </div>
      {persisted === false && (
        <button class="btn block" onClick={async () => setPersisted(await requestPersistence())}>
          Kalıcı depolama iste
        </button>
      )}
      <div class="row spread">
        <span>Kullanım</span>
        <strong>{est ? `${formatBytes(est.usage)} / ${formatBytes(est.quota)}` : '–'}</strong>
      </div>
      <div class="row spread">
        <span>Çalışma modu</span>
        <strong>{isStandalone() ? 'Ana ekran uygulaması' : 'Tarayıcı sekmesi'}</strong>
      </div>
      <p class="small muted" style={{ margin: 0 }}>
        Safari sekmesi ile ana ekran uygulaması ayrı depolama kullanır. Verilerini ana ekran uygulamasında tut.
      </p>
    </section>
  );
}

function DangerZone() {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState('');
  return (
    <section class="card">
      <h2>Tüm verileri sil</h2>
      <p class="small muted">Seanslar, ölçümler, program ve ayarlar kalıcı olarak silinir. Önce yedek al.</p>
      <button class="btn danger block" onClick={() => setStage(1)}>
        Tüm verileri sil…
      </button>
      {stage === 1 && (
        <Modal
          title="Emin misin?"
          onClose={() => setStage(0)}
          actions={
            <>
              <button class="btn danger block" onClick={() => setStage(2)}>
                Evet, devam et
              </button>
              <button class="btn block" onClick={() => setStage(0)}>
                Vazgeç
              </button>
            </>
          }
        >
          <p>Bu işlem geri alınamaz. Yedeğin yoksa tüm kayıtların kaybolur.</p>
        </Modal>
      )}
      {stage === 2 && (
        <Modal
          title="Son onay"
          onClose={() => setStage(0)}
          actions={
            <>
              <button
                class="btn danger big block"
                disabled={typed.trim().toLocaleUpperCase('tr') !== 'SİL'}
                onClick={async () => {
                  await wipeAllData();
                  await ensureSeeded(db);
                  setStage(0);
                  setTyped('');
                  location.hash = '#/';
                }}
              >
                Kalıcı olarak sil
              </button>
              <button class="btn block" onClick={() => setStage(0)}>
                Vazgeç
              </button>
            </>
          }
        >
          <label class="field">
            <span>
              Onaylamak için <strong>SİL</strong> yaz
            </span>
            <input type="text" autoComplete="off" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
          </label>
        </Modal>
      )}
    </section>
  );
}

export function SettingsScreen() {
  const s = useSettings();
  if (!s) return null;
  const buildDate = new Date(__BUILD_TIME__);
  return (
    <div class="stack">
      <h1>Ayarlar</h1>

      <section class="card stack">
        <h2>Program</h2>
        <a class="btn block big" href="#/settings/program">
          Egzersiz programını düzenle ›
        </a>
      </section>

      <section class="card stack">
        <h2>Araçlar</h2>
        <a class="btn block" href="#/rom">
          ROM ölçümü ›
        </a>
        <a class="btn block" href="#/report">
          Doktor raporu ›
        </a>
        <a class="btn block" href="#/settings/shortcuts">
          iOS Kısayol kurulumu (hatırlatmalar) ›
        </a>
      </section>

      <section class="card stack">
        <h2>Ağrı izleme eşikleri</h2>
        <p class="small" style={{ margin: 0 }}>
          <strong>Eşikleri fizyoterapistinle birlikte belirle.</strong> Bu uygulama tıbbi tavsiye vermez.
        </p>
        <Stepper label="Artış eşiği (sonra − önce ≥)" value={s.painIncreaseThreshold} min={1} max={10} onChange={(v) => void updateSettings({ painIncreaseThreshold: v })} />
        <Stepper label="Seans içi/sonrası üst sınır (>)" value={s.painMaxDuring} min={0} max={10} onChange={(v) => void updateSettings({ painMaxDuring: v })} />
        <label class="switch-row">
          <span>Ertesi sabah ağrı, seans öncesi seviyeye dönmeli</span>
          <input type="checkbox" checked={s.nextMorningMustReturn} onChange={(e) => void updateSettings({ nextMorningMustReturn: (e.target as HTMLInputElement).checked })} />
        </label>
      </section>

      <section class="card stack">
        <h2>Varsayılan taraflar</h2>
        {REGIONS.map((r) => (
          <div class="row spread" key={r}>
            <span>{REGION_LABEL[r]}</span>
            <div class="segmented" style={{ minWidth: 160 }}>
              {(['left', 'right'] as Side[]).map((side) => (
                <button key={side} aria-pressed={s.defaultSides[r] === side} onClick={() => void updateSettings({ defaultSides: { ...s.defaultSides, [r]: side } })}>
                  {side === 'left' ? 'Sol' : 'Sağ'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section class="card stack">
        <h2>Yedekleme</h2>
        <div class="row spread">
          <span>Son yedek</span>
          <strong>{s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString('tr-TR') : 'Hiç'}</strong>
        </div>
        <Stepper label="Hatırlatma (gün)" value={s.backupReminderDays} min={1} max={60} onChange={(v) => void updateSettings({ backupReminderDays: v })} />
        <a class="btn primary block big" href="#/settings/backup">
          Yedekle / geri yükle ›
        </a>
      </section>

      <StorageInfo />
      <DangerZone />

      <section class="card small muted">
        <div>RehabFlow sürüm {__APP_VERSION__}</div>
        <div>Son güncelleme: {buildDate.toLocaleString('tr-TR')}</div>
        <div>Veriler sadece bu cihazda saklanır. Uygulama hiçbir sunucuya veri göndermez.</div>
      </section>
    </div>
  );
}
