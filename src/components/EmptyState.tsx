import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';

interface Props {
  icon: LucideIcon;
  title: string;
  text?: string;
  children?: ComponentChildren;
  card?: boolean;
}

export function EmptyState({ icon: Icon, title, text, children, card = true }: Props) {
  return (
    <div class={`empty-state${card ? ' card' : ''}`}>
      <div class="empty-icon">
        <Icon aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
