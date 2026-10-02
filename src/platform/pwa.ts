import { signal } from '@preact/signals';
import { registerSW } from 'virtual:pwa-register';

export const needRefresh = signal(false);
let update: ((reload?: boolean) => Promise<void>) | null = null;

export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  update = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh.value = true;
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Check for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void reg.update().catch(() => {});
      });
    },
  });
}

export function applyUpdate(): void {
  void update?.(true);
}
