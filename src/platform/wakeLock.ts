// Screen Wake Lock. Silently does nothing where unsupported (older iOS).
type Sentinel = { release(): Promise<void>; released?: boolean };

let sentinel: Sentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock;
  if (!wl) return;
  try {
    sentinel = await wl.request('screen');
  } catch {
    sentinel = null;
  }
}

function onVisibility() {
  // The lock is dropped automatically when the page is hidden; take it again on return.
  if (wanted && document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void acquire();
}

/** Must be called from a user gesture the first time. */
export async function keepScreenOn(): Promise<void> {
  if (wanted) return;
  wanted = true;
  document.addEventListener('visibilitychange', onVisibility);
  await acquire();
}

export async function allowScreenOff(): Promise<void> {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisibility);
  const s = sentinel;
  sentinel = null;
  try {
    await s?.release();
  } catch {
    /* ignore */
  }
}
