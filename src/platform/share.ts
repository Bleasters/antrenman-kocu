export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Opens the iOS share sheet (Web Share API with files) so the user can save to Files/iCloud
 * Drive. Falls back to <a download> where file sharing is unsupported.
 */
export async function shareOrDownload(blob: Blob, filename: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // fall through to download on other errors
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
