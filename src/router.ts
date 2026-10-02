import { signal } from '@preact/signals';

/** Hash router: GitHub Pages never sees the path, so reloads never 404. */
function current(): string {
  const h = location.hash.replace(/^#/, '');
  const path = h.split('?')[0] || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export const route = signal(current());

window.addEventListener('hashchange', () => {
  route.value = current();
  window.scrollTo(0, 0);
});

export function navigate(path: string, replace = false): void {
  const target = `#${path}`;
  if (replace) {
    history.replaceState(null, '', target);
    route.value = current();
  } else if (location.hash !== target) {
    location.hash = target;
  }
}

/** Matches '/settings/program/:id' style patterns. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/');
  const a = path.split('/');
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
