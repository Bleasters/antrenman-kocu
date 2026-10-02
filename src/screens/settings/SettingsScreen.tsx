import { useEffect, useState } from 'preact/hooks';
import { IconBell, IconInfo, IconList, IconReport, IconRuler, IconShield, IconTrash } from '../../components/Icons';
import { ListLink } from '../../components/ListLink';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Stepper } from '../../components/Stepper';
import { updateSettings, wipeAllData } from '../../db/repo';
import { db } from '../../db/db';
import { ensureSeeded } from '../../db/seed';
import { REGIONS, type InjuredSide, type Side } from '../../db/types';
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
    <>
    <h2 class="section-title">Depolama</h2>
    <section class="card stack">
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
      <p class="small muted" style={{ margin: '0px' }}>
        Safari sekmesi ile ana ekran uygulaması ayrı depolama kullanır. Verilerini ana ekran uygulamasında tut.
      </p>
    </section>
    </>
  );
}

function DangerZone() {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState('');
  return (
    <section class="card" style={{ marginTop: 'var(--s-6)' }}>
      <h2 class="card-title" style={{ color: 'var(--bad)', marginBottom: 'var(--s-1)' }}>
        <IconTrash aria-hidden="true" style={{ color: 'var(--bad)' }} />
        Tüm verileri sil
      </h2>
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
      <PageHeader title="Ayarlar" />

      <h2 class="section-title">Program ve araçlar</h2>
      <section class="card" style={{ padding: '0 var(--s-4)' }}>
        <ListLink href="#/settings/program" icon={IconList} title="Egzersiz programını düzenle" />
        <ListLink href="#/rom" icon={IconRuler} title="ROM ölçümü" />
        <ListLink href="#/report" icon={IconReport} title="Doktor raporu" />
        <ListLink href="#/settings/shortcuts" icon={IconBell} title="iOS Kısayol kurulumu" detail="Hatırlatmalar" />
      </section>

      <h2 class="section-title">Ağrı izleme eşikleri</h2>
      <section class="card stack">
        <div class="row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
          <IconInfo aria-hidden="true" style={{ color: 'var(--accent)', flex: 'none', marginTop: '2px' }} size={20} />
          <p class="callout muted" style={{ margin: '0' }}>
            <strong style={{ color: 'var(--text)' }}>Eşikleri fizyoterapistinle birlikte belirle.</strong> Bu uygulama tıbbi tavsiye vermez.
          </p>
        </div>
        <hr class="divider" />
        <Stepper label="Artış eşiği (sonra − önce ≥)" value={s.painIncreaseThreshold} min={1} max={10} onChange={(v) => void updateSettings({ painIncreaseThreshold: v })} />
        <Stepper label="Seans içi/sonrası üst sınır (>)" value={s.painMaxDuring} min={0} max={10} onChange={(v) => void updateSettings({ painMaxDuring: v })} />
        <label class="switch-row">
          <span class="callout">Ertesi sabah ağrı, seans öncesi seviyeye dönmeli</span>
          <input type="checkbox" checked={s.nextMorningMustReturn} onChange={(e) => void updateSettings({ nextMorningMustReturn: (e.target as HTMLInputElement).checked })} />
        </label>
      </section>

      <h2 class="section-title">Taraflar ve simetri</h2>
      <section class="card stack">
        <div class="row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
          <IconInfo aria-hidden="true" style={{ color: 'var(--accent)', flex: 'none', marginTop: '2px' }} size={20} />
          <p class="callout muted" style={{ margin: '0' }}>
            Yaralı taraf, sağlam tarafla karşılaştırılır. <strong style={{ color: 'var(--text)' }}>Hedefi fizyoterapistinle belirle.</strong>
          </p>
        </div>
        {REGIONS.map((r) => {
          const injured = s.injuredSides[r];
          return (
            <div class={`stack region-${r}`} key={r}>
              <hr class="divider" />
              <div class="row spread">
                <span class="row headline" style={{ gap: '0' }}>
                  <span class="region-dot" aria-hidden="true" />
                  {REGION_LABEL[r]}
                </span>
              </div>
              <div class="row spread">
                <span class="callout">Yaralı taraf</span>
                <div class="segmented" role="group" aria-label={`${REGION_LABEL[r]} yaralı taraf`} style={{ minWidth: '190px' }}>
                  {(['left', 'right', 'none'] as InjuredSide[]).map((side) => (
                    <button
                      key={side}
                      aria-pressed={injured === side}
                      onClick={() =>
                        void updateSettings({
                          injuredSides: { ...s.injuredSides, [r]: side },
                          // keep the default side used by exercises and ROM in step with the injured side
                          defaultSides: side === 'none' ? s.defaultSides : { ...s.defaultSides, [r]: side },
                        })
                      }
                    >
                      {side === 'left' ? 'Sol' : side === 'right' ? 'Sağ' : 'Yok'}
                    </button>
                  ))}
                </div>
              </div>
              {injured !== 'none' && (
                <Stepper
                  label="Hedef simetri"
                  unit="%"
                  step={5}
                  min={50}
                  max={100}
                  value={s.symmetryTargets[r]}
                  onChange={(v) => void updateSettings({ symmetryTargets: { ...s.symmetryTargets, [r]: v } })}
                />
              )}
              {r === 'wrist' && (
                <>
                  <div class="row spread">
                    <span class="callout">Baskın el</span>
                    <div class="segmented" role="group" aria-label="Baskın el" style={{ minWidth: '150px' }}>
                      {(['left', 'right'] as Side[]).map((side) => (
                        <button key={side} aria-pressed={s.dominantHand === side} onClick={() => void updateSettings({ dominantHand: side })}>
                          {side === 'left' ? 'Sol' : 'Sağ'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p class="small faint" style={{ margin: '0' }}>
                    Baskın taraf doğal olarak biraz farklı olabilir; simetriyi yorumlarken bunu hesaba kat.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </section>

      <h2 class="section-title">Yedekleme</h2>
      <section class="card stack">
        <div class="row spread">
          <span class="callout">Son yedek</span>
          <strong class="callout num">{s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString('tr-TR') : 'Hiç'}</strong>
        </div>
        <Stepper label="Hatırlatma (gün)" value={s.backupReminderDays} min={1} max={60} onChange={(v) => void updateSettings({ backupReminderDays: v })} />
        <a class="btn primary block big" href="#/settings/backup">
          <IconShield aria-hidden="true" />
          Yedekle / geri yükle
        </a>
      </section>

      <StorageInfo />
      <DangerZone />

      <div class="small faint center" style={{ padding: 'var(--s-4) 0' }}>
        <div>RehabFlow sürüm {__APP_VERSION__}</div>
        <div>Son güncelleme: {buildDate.toLocaleString('tr-TR')}</div>
        <div style={{ marginTop: 'var(--s-2)' }}>Veriler sadece bu cihazda saklanır. Uygulama hiçbir sunucuya veri göndermez.</div>
      </div>
    </div>
  );
}
