import { useState } from 'preact/hooks';
import { Modal } from '../../components/Modal';
import {
  backupFileName,
  buildBackup,
  getPreReplaceSnapshot,
  importBackup,
  markBackedUp,
  parseBackup,
  serializeBackup,
  type BackupSummary,
  type ImportMode,
} from '../../backup/backup';
import type { BackupFile } from '../../backup/schema';
import { db } from '../../db/db';
import { useLive } from '../../db/live';
import { shareOrDownload } from '../../platform/share';

type Status = { kind: 'ok' | 'error' | 'info'; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  const color = status.kind === 'error' ? 'var(--red)' : status.kind === 'ok' ? 'var(--green)' : 'var(--text-2)';
  return (
    <p role="status" style={{ color, fontWeight: 600 }}>
      {status.text}
    </p>
  );
}

async function exportFile(file: BackupFile, setStatus: (s: Status) => void, mark: boolean) {
  const blob = new Blob([serializeBackup(file)], { type: 'application/json' });
  const outcome = await shareOrDownload(blob, backupFileName(file.exportedAt));
  if (outcome === 'cancelled') {
    setStatus({ kind: 'info', text: 'Paylaşım iptal edildi; yedek kaydedilmedi.' });
    return;
  }
  if (mark) await markBackedUp(db);
  setStatus({
    kind: 'ok',
    text: outcome === 'shared' ? 'Yedek paylaşıldı. Dosyalar / iCloud Drive’a kaydettiğinden emin ol.' : 'Yedek dosyası indirildi.',
  });
}

export function BackupScreen() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: BackupFile; summary: BackupSummary } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const snapshot = useLive(() => getPreReplaceSnapshot(db), [], null);

  const doImport = async (mode: ImportMode) => {
    if (!pending) return;
    setBusy(true);
    try {
      const stats = await importBackup(db, pending.file, mode);
      setStatus({
        kind: 'ok',
        text:
          mode === 'merge'
            ? `Birleştirildi: ${stats.added} yeni, ${stats.updated} güncellendi, ${stats.skipped} aynı/eski kayıt atlandı.`
            : `Veriler değiştirildi (${stats.added} kayıt). Önceki verilerin aşağıda otomatik yedek olarak duruyor.`,
      });
      setPending(null);
    } catch (e) {
      setStatus({ kind: 'error', text: `İçe aktarma başarısız: ${(e as Error).message}` });
    } finally {
      setBusy(false);
      setConfirmReplace(false);
    }
  };

  return (
    <div class="stack">
      <a class="btn ghost" href="#/settings">
        ‹ Ayarlar
      </a>
      <h1>Yedekleme</h1>

      <section class="card orange small">
        <strong>Neden önemli?</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>Veriler sadece bu telefonda durur. Uygulama silinirse, Safari verileri temizlenirse ya da telefon değişirse kalıcı olarak gider.</li>
          <li>iCloud yedeği bu verileri güvenilir şekilde kapsamaz.</li>
          <li>Düzenli olarak dışa aktar ve dosyayı Dosyalar / iCloud Drive’a kaydet.</li>
        </ul>
      </section>

      <section class="card stack">
        <h2>Dışa aktar</h2>
        <button
          class="btn primary big block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setStatus(null);
            try {
              await exportFile(await buildBackup(db), setStatus, true);
            } catch (e) {
              setStatus({ kind: 'error', text: `Dışa aktarma başarısız: ${(e as Error).message}` });
            } finally {
              setBusy(false);
            }
          }}
        >
          Sadece veriler (JSON)
        </button>
        <p class="small muted" style={{ margin: 0 }}>
          Seanslar, ölçümler, program ve ayarlar. Küçük bir dosya.
        </p>
        <button class="btn block" disabled>
          Medya dahil tam yedek (ZIP) — Faz 2
        </button>
      </section>

      <section class="card stack">
        <h2>İçe aktar</h2>
        <label class="btn block big">
          Yedek dosyası seç
          <input
            class="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const input = e.target as HTMLInputElement;
              const f = input.files?.[0];
              input.value = '';
              if (!f) return;
              setStatus(null);
              const res = parseBackup(await f.text());
              if (!res.ok) {
                setPending(null);
                setStatus({ kind: 'error', text: res.error });
              } else {
                setPending({ file: res.file, summary: res.summary });
              }
            }}
          />
        </label>

        {pending && (
          <div class="card accent stack">
            <strong>Önizleme</strong>
            <div>
              {pending.summary.sessions} seans, {pending.summary.rom} ölçüm, {pending.summary.media} görsel, {pending.summary.exercises} egzersiz içeriyor.
            </div>
            <div class="small muted">Yedek tarihi: {new Date(pending.summary.exportedAt).toLocaleString('tr-TR')}</div>
            <button class="btn primary big block" disabled={busy} onClick={() => void doImport('merge')}>
              Birleştir
            </button>
            <p class="small muted" style={{ margin: 0 }}>
              Aynı kayıt iki tarafta varsa daha yeni olan kalır. Hiçbir şey silinmez.
            </p>
            <button class="btn danger block" disabled={busy} onClick={() => setConfirmReplace(true)}>
              Değiştir…
            </button>
            <button class="btn ghost block" onClick={() => setPending(null)}>
              Vazgeç
            </button>
          </div>
        )}
        <StatusLine status={status} />
      </section>

      {snapshot && (
        <section class="card stack">
          <h2>Otomatik yedek</h2>
          <p class="small muted" style={{ margin: 0 }}>
            Son "Değiştir" işleminden önceki veriler ({new Date(snapshot.exportedAt).toLocaleString('tr-TR')}): {snapshot.data.sessions.length} seans.
          </p>
          <button class="btn block" onClick={() => void exportFile(snapshot, setStatus, false)}>
            Bu yedeği dışa aktar
          </button>
          <button
            class="btn block"
            onClick={() => {
              const res = parseBackup(JSON.stringify(snapshot));
              if (res.ok) setPending({ file: res.file, summary: res.summary });
              else setStatus({ kind: 'error', text: res.error });
            }}
          >
            Bu yedeği geri yükle…
          </button>
        </section>
      )}

      {confirmReplace && (
        <Modal
          title="Mevcut verileri değiştir?"
          onClose={() => setConfirmReplace(false)}
          actions={
            <>
              <button class="btn danger big block" disabled={busy} onClick={() => void doImport('replace')}>
                Değiştir
              </button>
              <button class="btn block" onClick={() => setConfirmReplace(false)}>
                Vazgeç
              </button>
            </>
          }
        >
          <p>Mevcut seanslar, ölçümler, program ve ayarlar silinip yedekteki verilerle değiştirilecek.</p>
          <p class="small muted">Önce mevcut verilerin otomatik olarak cihazda yedeklenir; bu sayfadan geri yükleyebilirsin.</p>
        </Modal>
      )}
    </div>
  );
}
