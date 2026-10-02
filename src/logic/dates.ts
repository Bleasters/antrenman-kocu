export const APP_TZ = 'Europe/Istanbul';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Local calendar date (Europe/Istanbul) as YYYY-MM-DD. */
export function toISODate(ts: number): string {
  return ymdFormatter.format(new Date(ts));
}

export function todayISO(now = Date.now()): string {
  return toISODate(now);
}

function parse(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function format(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return format(parse(date) + n * 86_400_000);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

/** Monday of the ISO week containing date. */
export function startOfWeek(date: string): string {
  const dow = new Date(parse(date)).getUTCDay(); // 0=Sun
  const offset = (dow + 6) % 7;
  return addDays(date, -offset);
}

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function formatShortTR(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${TR_MONTHS[m - 1]}`;
}

export function formatLongTR(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${TR_MONTHS[m - 1]} ${y}`;
}
