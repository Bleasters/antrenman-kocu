import { signal } from '@preact/signals';

/** True while a session is running (hides tab bar and update banner). */
export const sessionActive = signal(false);

const LS = {
  onboarded: 'rf.onboarded',
  backupSnoozeUntil: 'rf.backupSnoozeUntil',
  lastRegions: 'rf.lastRegions',
};

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode */
  }
}

export const prefs = {
  get onboarded() {
    return lsGet(LS.onboarded) === '1';
  },
  setOnboarded() {
    lsSet(LS.onboarded, '1');
  },
  get backupSnoozeUntil() {
    return Number(lsGet(LS.backupSnoozeUntil) ?? 0);
  },
  snoozeBackup(ms = 86_400_000) {
    lsSet(LS.backupSnoozeUntil, String(Date.now() + ms));
  },
  get lastRegions(): string[] {
    try {
      return JSON.parse(lsGet(LS.lastRegions) ?? '[]') as string[];
    } catch {
      return [];
    }
  },
  setLastRegions(r: string[]) {
    lsSet(LS.lastRegions, JSON.stringify(r));
  },
};

/**
 * Per-session exercise picks on the "new session" screen, kept in memory while the user
 * hops to the program editor and back. `excluded`: active exercises unticked for this
 * session; `included`: inactive exercises ticked for this session.
 */
export const sessionPick = signal<{ excluded: string[]; included: string[] }>({ excluded: [], included: [] });

/** Regions ticked on the new-session screen (null = not chosen yet, fall back to last used). */
export const sessionRegions = signal<string[] | null>(null);

/** Set when the program editor was opened from the new-session screen. */
export const returnToSession = signal(false);
