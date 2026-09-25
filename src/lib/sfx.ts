"use client";

import type { HostSfx } from "@/game/types";

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AC();
  }
  return audioCtx;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  gain = 0.08,
) {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

export function playHostSfx(sfx: HostSfx, muted: boolean) {
  if (muted || sfx === "none") return;
  const ac = ctx();
  if (!ac) return;
  void ac.resume();

  switch (sfx) {
    case "knock":
      tone(90, 0, 0.12, "sine", 0.14);
      tone(70, 0.18, 0.14, "sine", 0.12);
      break;
    case "gavel":
      tone(140, 0, 0.08, "triangle", 0.16);
      tone(60, 0.05, 0.2, "sine", 0.1);
      break;
    case "murmur":
      tone(220, 0, 0.4, "sine", 0.03);
      tone(330, 0.1, 0.5, "sine", 0.025);
      break;
    case "sting":
      tone(180, 0, 0.15, "sawtooth", 0.06);
      tone(90, 0.12, 0.35, "sine", 0.1);
      break;
    case "heartbeat":
      tone(55, 0, 0.1, "sine", 0.12);
      tone(55, 0.22, 0.12, "sine", 0.1);
      break;
    default:
      break;
  }
}
