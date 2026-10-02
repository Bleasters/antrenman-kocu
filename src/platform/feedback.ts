// Sound (Web Audio) and haptics. iOS requires the AudioContext to be created/resumed
// inside a user gesture, so call unlockAudio() from click handlers.
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    // A silent blip fully unlocks output on iOS.
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch {
    /* ignore */
  }
}

export function beep(freq = 880, ms = 120, volume = 0.25): void {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch {
    /* ignore */
  }
}

export const countdownBeep = () => beep(880, 120);
export const finishBeep = () => beep(1320, 380, 0.3);

/** navigator.vibrate does not exist on iOS; skip silently. */
export function vibrate(pattern: number | number[] = 60): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
