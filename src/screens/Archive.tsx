import { useState } from 'preact/hooks';
import { BlobImage } from '../components/BlobImage';
import { IconClose, IconColumns, IconImage, IconInfo, IconPlus } from '../components/Icons';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { ZoomView } from '../components/ZoomView';
import { db } from '../db/db';
import { useLive } from '../db/live';
import { deleteMedia, saveMedia, updateMedia } from '../db/repo';
import { REGIONS, type Media, type MediaKind, type Region } from '../db/types';
import { formatLongTR, formatShortTR, todayISO } from '../logic/dates';
import { REGION_LABEL } from '../logic/labels';
import { VIDEO_WARN_BYTES } from '../logic/imageSize';
import { compressImage } from '../platform/image';
import { formatBytes } from '../platform/storage';

const KIND_TR: Record<MediaKind, string> = { xray: 'Röntgen', photo: 'Fotoğraf', exercise_video: 'Video' };
type Filter = Region | 'all';

interface Meta {
  date: string;
  region?: Region;
  kind: MediaKind;
  note: string;
}

function MetaFields({ meta, onChange }: { meta: Meta; onChange: (m: Meta) => void }) {
  return (
    <div class="stack">
      <label class="field">
        <span>Tarih</span>
        <input type="date" value={meta.date} max={todayISO()} onInput={(e) => onChange({ ...meta, date: (e.target as HTMLInputElement).value || todayISO() })} />
      </label>
      <div class="segmented" role="group" aria-label="Tür">
        {(['xray', 'photo'] as MediaKind[]).map((k) => (
          <button key={k} aria-pressed={meta.kind === k} onClick={() => onChange({ ...meta, kind: k })}>
            {KIND_TR[k]}
          </button>
        ))}
      </div>
      <div class="segmented" role="group" aria-label="Bölge">
        {([undefined, ...REGIONS] as (Region | undefined)[]).map((r) => (
          <button key={r ?? 'none'} aria-pressed={meta.region === r} onClick={() => onChange({ ...meta, region: r })}>
            {r ? REGION_LABEL[r] : 'Yok'}
          </button>
        ))}
      </div>
      <label class="field">
        <span>Not</span>
        <input type="text" value={meta.note} placeholder="ör. Ameliyat sonrası 6. hafta" onInput={(e) => onChange({ ...meta, note: (e.target as HTMLInputElement).value })} />
      </label>
    </div>
  );
}

function Viewer({ item, onClose }: { item: Media; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState<Meta>({ date: item.date, region: item.region, kind: item.kind, note: item.note ?? '' });
  return (
    <div class="viewer" role="dialog" aria-modal="true" aria-label="Görsel">
      <div class="row spread">
        <button class="btn" onClick={onClose}>
          <IconClose aria-hidden="true" />
          Kapat
        </button>
        <button class="btn" onClick={() => setEditing(true)}>
          Düzenle
        </button>
      </div>
      <div class="viewer-stage" style={{ marginTop: '8px' }}>
        <ZoomView label={item.note ?? KIND_TR[item.kind]}>
          <BlobImage blob={item.blob} alt={item.note ?? KIND_TR[item.kind]} />
        </ZoomView>
      </div>
      <div class="viewer-caption">
        {formatLongTR(item.date)} · {KIND_TR[item.kind]}
        {item.region ? ` · ${REGION_LABEL[item.region]}` : ''}
        {item.note ? ` — ${item.note}` : ''}
      </div>
      {editing && (
        <Modal
          title="Görseli düzenle"
          onClose={() => setEditing(false)}
          actions={
            <>
              <button
                class="btn primary big block"
                onClick={async () => {
                  await updateMedia(item.id, { ...meta, note: meta.note.trim() || undefined });
                  setEditing(false);
                  onClose();
                }}
              >
                Kaydet
              </button>
              <button
                class="btn danger block"
                onClick={async () => {
                  if (!confirm('Bu görsel kalıcı olarak silinsin mi?')) return;
                  await deleteMedia(item.id);
                  onClose();
                }}
              >
                Sil
              </button>
            </>
          }
        >
          <MetaFields meta={meta} onChange={setMeta} />
        </Modal>
      )}
    </div>
  );
}

function Compare({ a, b, onClose }: { a: Media; b: Media; onClose: () => void }) {
  const [mode, setMode] = useState<'side' | 'overlay'>('side');
  const [split, setSplit] = useState(50);
  const [first, second] = a.date <= b.date ? [a, b] : [b, a];
  const cap = (m: Media) => `${formatShortTR(m.date)}${m.note ? ` · ${m.note}` : ''}`;
  return (
    <div class="viewer" role="dialog" aria-modal="true" aria-label="Karşılaştırma">
      <div class="row spread">
        <button class="btn" onClick={onClose}>
          <IconClose aria-hidden="true" />
          Kapat
        </button>
        <div class="segmented grow" role="group" aria-label="Karşılaştırma modu">
          <button aria-pressed={mode === 'side'} onClick={() => setMode('side')}>
            Yan yana
          </button>
          <button aria-pressed={mode === 'overlay'} onClick={() => setMode('overlay')}>
            Üst üste
          </button>
        </div>
      </div>
      {mode === 'side' ? (
        <>
          <div class="viewer-stage two" style={{ marginTop: '8px' }}>
            {[first, second].map((m) => (
              <ZoomView key={m.id} label={cap(m)}>
                <BlobImage blob={m.blob} alt={cap(m)} />
              </ZoomView>
            ))}
          </div>
          <div class="viewer-stage two">
            <div class="viewer-caption">{cap(first)}</div>
            <div class="viewer-caption">{cap(second)}</div>
          </div>
        </>
      ) : (
        <>
          <div class="viewer-stage" style={{ marginTop: '8px' }}>
            <ZoomView label="Üst üste karşılaştırma">
              <div class="overlay-pair">
                <BlobImage blob={first.blob} alt={cap(first)} />
                <BlobImage blob={second.blob} alt={cap(second)} style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
                <div style={{ position: 'absolute', top: '0px', bottom: '0px', left: `${split}%`, width: '2px', background: '#fff', boxShadow: '0 0 0 1px rgb(0 0 0 / 0.6)' }} />
              </div>
            </ZoomView>
          </div>
          <div class="row spread viewer-caption">
            <span>◀ {cap(first)}</span>
            <span>{cap(second)} ▶</span>
          </div>
          <input type="range" min={0} max={100} value={split} aria-label="Kaydırıcı" onInput={(e) => setSplit(Number((e.target as HTMLInputElement).value))} />
        </>
      )}
    </div>
  );
}

export function Archive() {
  const media = useLive(() => db.media.orderBy('date').toArray(), [], undefined as Media[] | undefined);
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, setPending] = useState<{ blob: Blob; thumb: Blob; meta: Meta } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Media | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  if (!media) return null;
  const list = media.filter((m) => m.kind !== 'exercise_video' && (filter === 'all' || m.region === filter));
  const groups: { key: string; label: string; items: Media[] }[] =
    filter === 'all'
      ? [
          ...REGIONS.map((r) => ({ key: r, label: REGION_LABEL[r], items: list.filter((m) => m.region === r) })),
          { key: 'none', label: 'Bölgesiz', items: list.filter((m) => !m.region) },
        ].filter((g) => g.items.length)
      : [{ key: filter, label: REGION_LABEL[filter], items: list }];
  const byId = new Map(media.map((m) => [m.id, m]));

  const onFile = async (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError(
        file.type.startsWith('video/') && file.size > VIDEO_WARN_BYTES
          ? `Video çok büyük (${formatBytes(file.size)}). Videolar Faz 3'te desteklenecek.`
          : 'Sadece görsel dosyaları desteklenir.',
      );
      return;
    }
    setBusy(true);
    try {
      const { blob, thumb } = await compressImage(file);
      setPending({ blob, thumb, meta: { date: todayISO(), region: filter === 'all' ? undefined : filter, kind: 'xray', note: '' } });
    } catch (e) {
      setError(`Görsel işlenemedi: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="stack">
      <div class="row spread page-header">
        <h1 style={{ margin: '0px' }}>Arşiv</h1>
        {list.length >= 2 && (
          <button
            class={`btn compact${compareMode ? ' selected' : ' tinted'}`}
            aria-pressed={compareMode}
            onClick={() => {
              setCompareMode(!compareMode);
              setPicked([]);
            }}
          >
            <IconColumns aria-hidden="true" />
            Karşılaştır
          </button>
        )}
      </div>
      <div class="segmented" role="group" aria-label="Bölge">
        {(['all', ...REGIONS] as Filter[]).map((r) => (
          <button key={r} aria-pressed={filter === r} onClick={() => setFilter(r)}>
            {r === 'all' ? 'Tümü' : r === 'ankle' ? 'A. bileği' : REGION_LABEL[r]}
          </button>
        ))}
      </div>
      {compareMode && (
        <p class="banner info">
          <IconInfo aria-hidden="true" />
          <span class="grow">Karşılaştırmak için iki görsel seç ({picked.length}/2).</span>
        </p>
      )}

      {groups.length === 0 && (
        <EmptyState icon={IconImage} title="Henüz görsel yok" text="Röntgen ya da fotoğraf ekleyerek iyileşme sürecini zaman çizelgesinde takip et." />
      )}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 class={`section-title row region-${g.key}`} style={{ gap: '0' }}>
            <span class="region-dot" aria-hidden="true" />
            {g.label}
          </h2>
          <div class="media-grid">
            {g.items.map((m) => {
              const idx = picked.indexOf(m.id);
              return (
                <button
                  key={m.id}
                  class={`media-tile${idx >= 0 ? ' selected' : ''}`}
                  aria-label={`${KIND_TR[m.kind]} ${formatLongTR(m.date)}${m.note ? `, ${m.note}` : ''}`}
                  aria-pressed={compareMode ? idx >= 0 : undefined}
                  onClick={() => {
                    if (!compareMode) return setOpen(m);
                    setPicked(idx >= 0 ? picked.filter((x) => x !== m.id) : [...picked.slice(-1), m.id]);
                  }}
                >
                  <BlobImage blob={m.thumbBlob ?? m.blob} alt="" class="thumb" />
                  <span class="cap">
                    {formatShortTR(m.date)} · {m.kind === 'xray' ? 'Rö' : 'Foto'}
                  </span>
                  {idx >= 0 && <span class="badge">{idx + 1}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {error && <p style={{ color: 'var(--red)', fontWeight: 600 }}>{error}</p>}

      <div class="sticky-cta">
        {compareMode ? (
          <button class="btn primary big block" disabled={picked.length !== 2} onClick={() => setComparing(true)}>
            Seçilenleri karşılaştır
          </button>
        ) : (
          <label class={`btn primary big block${busy ? ' disabled' : ''}`}>
            {!busy && <IconPlus aria-hidden="true" />}
            {busy ? 'İşleniyor…' : 'Röntgen / fotoğraf ekle'}
            <input
              class="sr-only"
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                const input = e.target as HTMLInputElement;
                const f = input.files?.[0];
                input.value = '';
                if (f) void onFile(f);
              }}
            />
          </label>
        )}
      </div>

      {pending && (
        <Modal
          title="Görsel ekle"
          onClose={() => setPending(null)}
          actions={
            <>
              <button
                class="btn primary big block"
                onClick={async () => {
                  const { blob, thumb, meta } = pending;
                  await saveMedia({ blob, thumbBlob: thumb, date: meta.date, region: meta.region, kind: meta.kind, note: meta.note.trim() || undefined });
                  setPending(null);
                }}
              >
                Kaydet
              </button>
              <button class="btn block" onClick={() => setPending(null)}>
                Vazgeç
              </button>
            </>
          }
        >
          <BlobImage blob={pending.thumb} alt="Önizleme" style={{ width: '120px', borderRadius: '10px', display: 'block', marginBottom: '12px' }} />
          <p class="small muted">Sıkıştırıldı: {formatBytes(pending.blob.size)}</p>
          <MetaFields meta={pending.meta} onChange={(meta) => setPending({ ...pending, meta })} />
        </Modal>
      )}
      {open && <Viewer item={open} onClose={() => setOpen(null)} />}
      {comparing && picked.length === 2 && byId.get(picked[0]) && byId.get(picked[1]) && (
        <Compare a={byId.get(picked[0])!} b={byId.get(picked[1])!} onClose={() => setComparing(false)} />
      )}
    </div>
  );
}
