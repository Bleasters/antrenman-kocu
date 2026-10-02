import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { RehabDB } from '../db/db';
import type { Media } from '../db/types';
import { buildBackup, parseBackup, serializeBackup, summarize, type BackupSummary } from './backup';
import type { BackupFile, MediaMeta } from './schema';

const JSON_NAME = 'backup.json';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};
const extFor = (type: string) => EXT[type] ?? 'bin';

async function bytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

/** Builds a full backup: backup.json (data + media metadata) and every media blob. */
export async function buildFullBackupZip(database: RehabDB, now = Date.now()): Promise<{ blob: Blob; file: BackupFile }> {
  const file = await buildBackup(database, now);
  const media = await database.media.toArray();
  const files: Zippable = {};
  const meta: MediaMeta[] = [];
  for (const m of media) {
    const type = m.blob.type || 'application/octet-stream';
    const path = `media/${m.id}.${extFor(type)}`;
    // already-compressed formats: store without deflate
    files[path] = [await bytes(m.blob), { level: 0 }];
    let thumb: string | undefined;
    let thumbType: string | undefined;
    if (m.thumbBlob) {
      thumbType = m.thumbBlob.type || 'image/jpeg';
      thumb = `media/${m.id}_thumb.${extFor(thumbType)}`;
      files[thumb] = [await bytes(m.thumbBlob), { level: 0 }];
    }
    meta.push({
      id: m.id,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      date: m.date,
      region: m.region,
      kind: m.kind,
      note: m.note,
      file: path,
      type,
      thumb,
      thumbType,
    });
  }
  const full: BackupFile = { ...file, kind: 'full', data: { ...file.data, media: meta } };
  files[JSON_NAME] = [strToU8(serializeBackup(full)), { level: 6 }];
  const zipped = zipSync(files);
  return { blob: new Blob([zipped as BlobPart], { type: 'application/zip' }), file: full };
}

export type AnyParseResult =
  | { ok: true; file: BackupFile; media: Media[]; summary: BackupSummary }
  | { ok: false; error: string };

export function isZip(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

export function parseBackupZip(data: Uint8Array): AnyParseResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    return { ok: false, error: 'ZIP dosyası açılamadı.' };
  }
  const json = entries[JSON_NAME];
  if (!json) return { ok: false, error: 'ZIP içinde backup.json bulunamadı.' };
  const parsed = parseBackup(strFromU8(json));
  if (!parsed.ok) return parsed;
  const media: Media[] = [];
  for (const m of parsed.file.data.media ?? []) {
    const bin = entries[m.file];
    if (!bin) return { ok: false, error: `Yedekte eksik medya dosyası: ${m.file}` };
    const thumbBin = m.thumb ? entries[m.thumb] : undefined;
    media.push({
      id: m.id,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      date: m.date,
      region: m.region,
      kind: m.kind,
      note: m.note,
      blob: new Blob([bin as BlobPart], { type: m.type }),
      thumbBlob: thumbBin ? new Blob([thumbBin as BlobPart], { type: m.thumbType ?? 'image/jpeg' }) : undefined,
    });
  }
  return { ok: true, file: parsed.file, media, summary: summarize(parsed.file) };
}

/** Accepts either a .json (data only) or a .zip (full) backup. */
export async function parseAnyBackup(file: Blob): Promise<AnyParseResult> {
  const data = await bytes(file);
  if (isZip(data)) return parseBackupZip(data);
  const res = parseBackup(new TextDecoder().decode(data));
  return res.ok ? { ...res, media: [] } : res;
}
