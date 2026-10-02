import { useEffect, useRef, useState } from 'preact/hooks';
import { countdownBeep, finishBeep, vibrate } from '../../platform/feedback';

/**
 * Wall-clock based countdown (immune to timer throttling). Beeps on the last 3 seconds
 * and on completion. Changing resetKey restarts it.
 */
export function useCountdown(totalSec: number, resetKey: string, autoStart: boolean, onDone: () => void) {
  const [running, setRunning] = useState(autoStart);
  const [remainingMs, setRemainingMs] = useState(totalSec * 1000);
  const endAt = useRef(Date.now() + totalSec * 1000);
  const lastSec = useRef(totalSec);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    endAt.current = Date.now() + totalSec * 1000;
    lastSec.current = totalSec;
    setRemainingMs(totalSec * 1000);
    setRunning(autoStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, totalSec]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const rem = endAt.current - Date.now();
      const sec = Math.ceil(rem / 1000);
      if (sec !== lastSec.current) {
        lastSec.current = sec;
        if (sec >= 1 && sec <= 3) countdownBeep();
      }
      if (rem <= 0) {
        clearInterval(id);
        setRemainingMs(0);
        setRunning(false);
        finishBeep();
        vibrate([120, 60, 120]);
        doneRef.current();
      } else {
        setRemainingMs(rem);
      }
    }, 100);
    return () => clearInterval(id);
  }, [running, resetKey]);

  return {
    running,
    remainingSec: Math.ceil(remainingMs / 1000),
    elapsedSec: Math.round(totalSec - remainingMs / 1000),
    start() {
      endAt.current = Date.now() + remainingMs;
      setRunning(true);
    },
    pause() {
      setRemainingMs(Math.max(0, endAt.current - Date.now()));
      setRunning(false);
    },
    reset() {
      endAt.current = Date.now() + totalSec * 1000;
      lastSec.current = totalSec;
      setRemainingMs(totalSec * 1000);
      setRunning(false);
    },
  };
}

export function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : String(s);
}
