"use client";

import { useSyncExternalStore } from "react";

// Web Audio API feedback synthesizer with zero asset overhead
let audioCtx: AudioContext | null = null;
const soundChangeEvent = "nihongo-sound-change";

function subscribeToSoundChange(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(soundChangeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(soundChangeEvent, callback);
  };
}

export function useAudioFeedbackEnabled(): boolean {
  return useSyncExternalStore(subscribeToSoundChange, isAudioFeedbackEnabled, () => true);
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function isAudioFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const val = localStorage.getItem("nihongo_sound_enabled");
    return val !== "false";
  } catch {
    return true;
  }
}

export function setAudioFeedbackEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("nihongo_sound_enabled", enabled ? "true" : "false");
  } catch {
    // Ignore storage errors
  }
  window.dispatchEvent(new Event(soundChangeEvent));
}

/**
 * Play cheerful two-tone chime for correct answer
 */
export function playCorrectSound(): void {
  if (!isAudioFeedbackEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Tone 1: 523.25 Hz (C5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    // Tone 2: 783.99 Hz (G5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(783.99, now + 0.1);
    gain2.gain.setValueAtTime(0.001, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.25, now + 0.13);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.38);

    // Haptic feedback if available on mobile
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([20, 30, 20]);
    }
  } catch {
    // Audio playback error (e.g., autoplay restrictions before interaction)
  }
}

/**
 * Play soft gentle tone for incorrect answer
 */
export function playIncorrectSound(): void {
  if (!isAudioFeedbackEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, now); // A3
    osc.frequency.linearRampToValueAtTime(174.61, now + 0.22); // F3

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(60);
    }
  } catch {
    // Audio playback error
  }
}

/**
 * Play celebratory fanfare on quiz or study completion
 */
export function playVictorySound(): void {
  if (!isAudioFeedbackEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 523.25, start: 0, dur: 0.12 },     // C5
      { freq: 659.25, start: 0.11, dur: 0.12 },  // E5
      { freq: 783.99, start: 0.22, dur: 0.14 },  // G5
      { freq: 1046.50, start: 0.36, dur: 0.35 }, // C6
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.2, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    });

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([40, 40, 40, 60]);
    }
  } catch {
    // Ignore audio error
  }
}
