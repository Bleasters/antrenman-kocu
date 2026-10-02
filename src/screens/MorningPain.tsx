import { MorningPainCard } from '../components/MorningPainCard';
import { useSessions } from '../hooks';
import { todayISO } from '../logic/dates';
import { morningPainTarget } from '../logic/stats';
import { useRef } from 'preact/hooks';
import type { Session } from '../db/types';

/** Deep link target: #/morning-pain */
export function MorningPain() {
  const sessions = useSessions();
  // Keep showing the same session after it is filled so the user sees their answer.
  const pinned = useRef<string | null>(null);
  if (!sessions) return null;
  let target: Session | null | undefined = pinned.current ? sessions.find((s) => s.id === pinned.current) : null;
  if (!target) {
    target = morningPainTarget(sessions, todayISO());
    if (target) pinned.current = target.id;
  }
  return (
    <div class="stack">
      <h1>Sabah ağrısı</h1>
      {target ? (
        <MorningPainCard session={target} />
      ) : (
        <div class="card grey">
          <p>Girilecek sabah ağrısı yok. Son seansın için zaten girilmiş ya da henüz seans yok.</p>
        </div>
      )}
      <a class="btn block big" href="#/">
        Bugün'e dön
      </a>
    </div>
  );
}
