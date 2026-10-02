import type { LucideIcon } from 'lucide-preact';
import { IconChevronRight } from './Icons';

/** Inset-grouped navigation row: icon tile, title, optional detail, chevron. */
export function ListLink({ href, icon: Icon, title, detail, tone }: { href: string; icon: LucideIcon; title: string; detail?: string; tone?: string }) {
  return (
    <a class="list-link" href={href}>
      <span class="list-icon" style={tone ? { background: `var(--${tone}-tint)`, color: `var(--${tone})` } : undefined}>
        <Icon aria-hidden="true" />
      </span>
      <span class="grow">
        <span style={{ display: 'block' }}>{title}</span>
        {detail && <span class="small muted">{detail}</span>}
      </span>
      <IconChevronRight class="chev" aria-hidden="true" />
    </a>
  );
}
