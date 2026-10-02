import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { RehabDB } from '../src/db/db';
import { ensureSeeded } from '../src/db/seed';
import type { Media } from '../src/db/types';
import { buildBackup, getPreReplaceSnapshot, importBackup, serializeBackup } from '../src/backup/backup';
import { buildFullBackupZip, isZip, parseAnyBackup, parseBackupZip } from '../src/backup/zip';

const dbs: RehabDB[] = [];
function freshDb() {
  const d = new RehabDB(`zip-${Math.random()}`);
  dbs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dbs.splice(0)) {
    d.close();
    await d.delete();
  }
});

const bytesOf = async (b: Blob) => Array.from(new Uint8Array(await b.arrayBuffer()));

function media(id: string, updatedAt = 1, p: Partial<Media> = {}): Media {
  return {
    id,
    createdAt: 1,
    updatedAt,
    date: '2026-09-01',
    region: 'ankle',
    kind: 'xray',
    note: 'Ameliyat sonrası 6. hafta',
    blob: new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3, id.length])], { type: 'image/jpeg' }),
    thumbBlob: new Blob([new Uint8Array([0xff, 0xd8, 9])], { type: 'image/jpeg' }),
    ...p,
  };
}

async function dumpMedia(d: RehabDB) {
  const list = (await d.media.toArray()).sort((a, b) => a.id.localeCompare(b.id));
  return Promise.all(
    list.map(async ({ blob, thumbBlob, ...rest }) => ({
      ...rest,
      blob: { type: blob.type, bytes: await bytesOf(blob) },
      thumb: thumbBlob ? { type: thumbBlob.type, bytes: await bytesOf(thumbBlob) } : null,
    })),
  );
}

describe('full ZIP backup', () => {
  it('round-trips data and media blobs into an empty database', async () => {
    const src = freshDb();
    await ensureSeeded(src, 1);
    await src.media.bulkPut([media('m1'), media('m2', 1, { kind: 'photo', region: undefined, thumbBlob: undefined, blob: new Blob([new Uint8Array([7, 7])], { type: 'image/png' }) })]);

    const { blob, file } = await buildFullBackupZip(src, 1000);
    expect(blob.type).toBe('application/zip');
    expect(file.kind).toBe('full');
    const parsed = await parseAnyBackup(blob);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.summary.media).toBe(2);

    const dst = freshDb();
    await importBackup(dst, parsed.file, 'replace', 2000, parsed.media);
    expect(await dumpMedia(dst)).toEqual(await dumpMedia(src));
    expect(await dst.exercises.count()).toBe(await src.exercises.count());
  });

  it('merge adds new media and keeps the newer copy', async () => {
    const d = freshDb();
    await d.media.put(media('keep', 5, { note: 'local' }));
    const src = freshDb();
    await src.media.bulkPut([media('keep', 3, { note: 'remote' }), media('new', 1)]);
    const parsed = await parseAnyBackup((await buildFullBackupZip(src)).blob);
    if (!parsed.ok) throw new Error(parsed.error);
    const stats = await importBackup(d, parsed.file, 'merge', 0, parsed.media);
    expect(stats).toMatchObject({ added: 1, skipped: 1 });
    expect((await d.media.get('keep'))?.note).toBe('local');
  });

  it('full replace snapshots the old media; data-only replace keeps media', async () => {
    const d = freshDb();
    await d.media.put(media('old'));
    const empty = freshDb();

    const dataOnly = await buildBackup(empty);
    await importBackup(d, dataOnly, 'replace');
    expect(await d.media.count()).toBe(1);

    const parsed = await parseAnyBackup((await buildFullBackupZip(empty)).blob);
    if (!parsed.ok) throw new Error(parsed.error);
    await importBackup(d, parsed.file, 'replace', 0, parsed.media);
    expect(await d.media.count()).toBe(0);
    const snap = await getPreReplaceSnapshot(d);
    expect(snap?.media?.map((m) => m.id)).toEqual(['old']);
  });

  it('parseAnyBackup accepts plain JSON too', async () => {
    const d = freshDb();
    await ensureSeeded(d);
    const json = new Blob([serializeBackup(await buildBackup(d))], { type: 'application/json' });
    const r = await parseAnyBackup(json);
    expect(r.ok && r.media.length === 0 && r.summary.media === 0).toBe(true);
  });

  it('reports broken archives', () => {
    expect(isZip(new Uint8Array([1, 2, 3, 4]))).toBe(false);
    expect(parseBackupZip(new Uint8Array([0x50, 0x4b, 3, 4, 0]))).toMatchObject({ ok: false });
    expect(parseBackupZip(zipSync({ 'x.txt': strToU8('hi') }))).toMatchObject({ ok: false, error: expect.stringContaining('backup.json') });
    const json = { app: 'rehab-pwa', schemaVersion: 1, exportedAt: 1, kind: 'full', data: { exercises: [], sessions: [], rom: [], settings: null, media: [{ id: 'a', createdAt: 1, updatedAt: 1, date: '2026-01-01', kind: 'xray', file: 'media/a.jpg', type: 'image/jpeg' }] } };
    expect(parseBackupZip(zipSync({ 'backup.json': strToU8(JSON.stringify(json)) }))).toMatchObject({ ok: false, error: expect.stringContaining('media/a.jpg') });
  });
});
