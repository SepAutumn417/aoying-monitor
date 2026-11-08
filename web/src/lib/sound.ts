/**
 * Distinct chimes per signal action, synthesised with the Web Audio API.
 *
 * No audio files: five small oscillator envelopes cost nothing to ship, never
 * 404, and can be tuned per action. Each action gets a different *shape* as well
 * as a different pitch — a rising pair reads as "something started", a falling
 * pair as "something came off", a low double thud as "it is over" — so the
 * alerts stay distinguishable on a phone speaker or at low volume, which is
 * where a pitch-only difference tends to collapse.
 *
 * Browsers refuse to start audio before a user gesture, so the context is
 * created lazily and `unlock()` is called from the first click/keypress. Until
 * then `play()` is a silent no-op rather than an error.
 */

import type { SignalAction } from "./signals";

export type Note = {
  /** Hz. */
  frequency: number;
  /** Seconds from the start of the chime. */
  at: number;
  /** Seconds. */
  duration: number;
  /** Peak gain, 0–1. */
  gain: number;
  type: OscillatorType;
};

/**
 * Five recognisable shapes. The values are deliberately not musical notes:
 * what matters is that the intervals differ, not that they are in tune.
 *
 * Exported so a test can assert the five signatures really are distinct —
 * "each action sounds different" is the requirement, not an implementation
 * detail.
 */
export const PATTERNS: Record<SignalAction, Note[]> = {
  // Rising major third, bright and insistent — a position just opened.
  open: [
    { frequency: 784, at: 0, duration: 0.16, gain: 0.28, type: "triangle" },
    { frequency: 1046, at: 0.14, duration: 0.26, gain: 0.26, type: "triangle" },
  ],
  // One higher, shorter ping — he pressed the same bet again.
  add: [{ frequency: 1175, at: 0, duration: 0.2, gain: 0.24, type: "sine" }],
  // Falling pair — something came off the table.
  reduce: [
    { frequency: 880, at: 0, duration: 0.15, gain: 0.24, type: "triangle" },
    { frequency: 659, at: 0.13, duration: 0.24, gain: 0.22, type: "triangle" },
  ],
  // Two low thuds — the trade is closed, for better or worse.
  close: [
    { frequency: 392, at: 0, duration: 0.18, gain: 0.3, type: "sine" },
    { frequency: 294, at: 0.17, duration: 0.34, gain: 0.28, type: "sine" },
  ],
  // A single soft tick — leverage moved, the position did not.
  leverage: [{ frequency: 1318, at: 0, duration: 0.09, gain: 0.16, type: "square" }],
};

export const SOUND_LABEL: Record<SignalAction, string> = {
  open: "上行双音",
  add: "高音单响",
  reduce: "下行双音",
  close: "低音双击",
  leverage: "轻点",
};

let context: AudioContext | null = null;
let muted = false;
let volume = 0.7;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  return context;
}

/**
 * Call from a user gesture. Safe to call repeatedly; resolves the suspended
 * state that browsers impose on autoplay.
 */
export function unlock(): void {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

export function setVolume(value: number): void {
  volume = Math.min(1, Math.max(0, value));
}

export function getVolume(): number {
  return volume;
}

/**
 * Play the chime for one action. Returns true when audio was actually
 * scheduled — callers use that to show "声音已关闭" instead of pretending.
 */
export function play(action: SignalAction, options?: { force?: boolean }): boolean {
  if (muted && !options?.force) return false;
  const ctx = audioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    // A gesture already happened if we get here from a click; try once, and if
    // the browser still refuses, stay quiet rather than queueing stale sounds.
    void ctx.resume().catch(() => undefined);
  }
  const now = ctx.currentTime + 0.02;
  for (const note of PATTERNS[action]) {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, now + note.at);
    // Short attack, exponential decay: a bell, not a click.
    envelope.gain.setValueAtTime(0.0001, now + note.at);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, note.gain * volume),
      now + note.at + 0.012,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.duration);
    oscillator.connect(envelope);
    envelope.connect(ctx.destination);
    oscillator.start(now + note.at);
    oscillator.stop(now + note.at + note.duration + 0.02);
  }
  return true;
}

/** Test seam: drop the shared context so a fresh one is built next call. */
export function resetAudio(): void {
  context = null;
  muted = false;
  volume = 0.7;
}
