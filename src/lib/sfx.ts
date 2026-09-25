"use client";

import type { HostSfx } from "@/game/types";

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  slideTo?: number,
) {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, slideTo),
      ac.currentTime + start + dur,
    );
  }
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

/** Soft noise burst for impacts / atmosphere */
function noiseBurst(start: number, dur: number, gain = 0.06, filterFreq = 800) {
  const ac = ctx();
  if (!ac) return;
  const len = Math.ceil(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(ac.destination);
  src.start(ac.currentTime + start);
  src.stop(ac.currentTime + start + dur + 0.02);
}

export function playHostSfx(sfx: HostSfx, muted: boolean) {
  if (muted || sfx === "none") return;
  const ac = ctx();
  if (!ac) return;
  void ac.resume();

  switch (sfx) {
    case "knock":
      // Door of destiny — three heavy knocks, then dread bass
      noiseBurst(0, 0.12, 0.14, 400);
      tone(75, 0, 0.14, "sine", 0.22);
      noiseBurst(0.28, 0.12, 0.16, 350);
      tone(65, 0.28, 0.15, "sine", 0.24);
      noiseBurst(0.58, 0.14, 0.18, 300);
      tone(55, 0.58, 0.18, "sine", 0.26);
      tone(40, 0.85, 0.9, "sine", 0.14, 28);
      break;

    case "gavel":
      // Courtroom strike + ringing overtones
      noiseBurst(0, 0.08, 0.2, 1200);
      tone(220, 0, 0.06, "triangle", 0.2);
      tone(90, 0.02, 0.25, "sine", 0.18);
      noiseBurst(0.35, 0.1, 0.22, 900);
      tone(180, 0.35, 0.08, "triangle", 0.22);
      tone(70, 0.38, 0.45, "sine", 0.16);
      tone(110, 0.55, 0.6, "sine", 0.06);
      break;

    case "murmur":
      // Uneasy castle hum — dissonant cluster
      tone(110, 0, 1.2, "sine", 0.045);
      tone(165, 0.15, 1.1, "sine", 0.035);
      tone(247, 0.35, 1.0, "triangle", 0.028);
      tone(185, 0.5, 0.9, "sine", 0.03, 140);
      noiseBurst(0.2, 0.8, 0.02, 600);
      break;

    case "sting":
      // Reveal shock — sharp dissonance into low hit
      tone(320, 0, 0.12, "sawtooth", 0.09);
      tone(240, 0.04, 0.14, "sawtooth", 0.08);
      tone(160, 0.1, 0.2, "triangle", 0.1);
      noiseBurst(0.08, 0.2, 0.12, 1500);
      tone(70, 0.22, 0.55, "sine", 0.18);
      tone(45, 0.35, 0.7, "sine", 0.12);
      break;

    case "heartbeat":
      // Accelerating dread pulse (night)
      tone(52, 0, 0.12, "sine", 0.2);
      noiseBurst(0.02, 0.08, 0.06, 200);
      tone(52, 0.28, 0.14, "sine", 0.18);
      tone(52, 0.7, 0.11, "sine", 0.2);
      noiseBurst(0.72, 0.07, 0.05, 200);
      tone(52, 0.92, 0.12, "sine", 0.17);
      tone(52, 1.2, 0.1, "sine", 0.22);
      tone(52, 1.38, 0.12, "sine", 0.2);
      tone(38, 1.6, 0.6, "sine", 0.1);
      break;

    case "rise":
      // Finale tension — ascending pressure
      tone(80, 0, 0.5, "sine", 0.08, 120);
      tone(100, 0.35, 0.55, "triangle", 0.07, 160);
      tone(140, 0.7, 0.6, "sine", 0.09, 220);
      tone(180, 1.05, 0.55, "sawtooth", 0.05, 280);
      noiseBurst(1.2, 0.35, 0.08, 2000);
      tone(60, 1.4, 0.5, "sine", 0.16);
      break;

    case "doom":
      // Traitors win / fatal morning — slow collapse
      tone(90, 0, 0.35, "sawtooth", 0.07);
      tone(70, 0.2, 0.5, "sine", 0.14, 40);
      noiseBurst(0.35, 0.4, 0.1, 400);
      tone(55, 0.55, 0.8, "sine", 0.18, 32);
      tone(42, 0.9, 1.1, "sine", 0.14, 28);
      tone(200, 0.1, 0.25, "triangle", 0.04);
      break;

    case "triumph":
      // Faithfuls win — bright resolve (still castle-dark, not cheery)
      tone(130, 0, 0.2, "triangle", 0.12);
      tone(195, 0.12, 0.25, "triangle", 0.11);
      tone(260, 0.28, 0.35, "sine", 0.1);
      tone(98, 0.2, 0.7, "sine", 0.1);
      tone(65, 0.45, 0.9, "sine", 0.12);
      noiseBurst(0.05, 0.15, 0.05, 1800);
      break;

    default:
      break;
  }
}
