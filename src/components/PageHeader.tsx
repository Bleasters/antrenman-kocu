import type { ComponentChildren } from 'preact';
import { IconChevronLeft } from './Icons';

interface Props {
  title: string;
  overline?: string;
  /** Back link (hash), e.g. '#/settings' */
  back?: { href: string; label: string };
  action?: ComponentChildren;
}

/** Large-title page header in the iOS style: optional back link, overline (date) and trailing action. */
export function PageHeader({ title, overline, back, action }: Props) {
  return (
    <header class="page-header">
      {back && (
        <a class="btn ghost back-link" href={back.href}>
          <IconChevronLeft aria-hidden="true" />
          {back.label}
        </a>
      )}
      {overline && <span class="overline">{overline}</span>}
      <div class="row">
        <h1>{title}</h1>
        {action}
      </div>
    </header>
  );
}
