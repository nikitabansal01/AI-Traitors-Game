"use client";

import { useEffect, useRef, useState } from "react";
import type { HostBeat } from "@/game/types";
import { playHostSfx } from "@/lib/sfx";

const MUTE_KEY = "ai-traitors-sfx-mute";

export function useMuted(): [boolean, (v: boolean) => void] {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(localStorage.getItem(MUTE_KEY) === "1");
  }, []);
  function update(v: boolean) {
    setMuted(v);
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  }
  return [muted, update];
}

export function CinematicOverlay({
  beat,
  muted,
  onDismiss,
}: {
  beat: HostBeat | null;
  muted: boolean;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const shownIdRef = useRef<string | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!beat) return;
    if (beat.id === shownIdRef.current) return;
    shownIdRef.current = beat.id;
    setVisible(true);
    playHostSfx(beat.sfx, mutedRef.current);
    const t = setTimeout(() => setVisible(false), beat.cinematicMs);
    return () => clearTimeout(t);
  }, [beat]);

  if (!beat || !visible) return null;

  const night = beat.kind === "night";
  const reveal = beat.kind === "banish_reveal" || beat.kind === "ended";
  const morning = beat.kind === "morning" || beat.kind === "welcome";

  return (
    <div
      className={`cinematic-overlay fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center ${
        night
          ? "cinematic-night"
          : reveal
            ? "cinematic-reveal"
            : morning
              ? "cinematic-morning"
              : "cinematic-default"
      }`}
      role="dialog"
      aria-label={beat.title}
    >
      <p className="mb-3 text-xs uppercase tracking-[0.4em] text-[var(--ember)] animate-[ember-pulse_2s_ease-in-out_infinite]">
        The Host
      </p>
      <h2 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)] md:text-6xl cinematic-title">
        {beat.title}
      </h2>
      {beat.detail && (
        <p className="mt-3 text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{beat.detail}</p>
      )}
      <p className="mt-6 max-w-lg text-lg text-[var(--ink)]/90 md:text-xl">{beat.line}</p>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          onDismiss();
        }}
        className="mt-10 text-xs uppercase tracking-[0.3em] text-[var(--muted)] underline hover:text-[var(--ember)]"
      >
        Continue
      </button>
    </div>
  );
}

export function HostStrip({
  beat,
  muted,
  onMuteToggle,
}: {
  beat: HostBeat | null;
  muted: boolean;
  onMuteToggle: () => void;
}) {
  if (!beat) return null;
  return (
    <div className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--night)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-start gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--ember)]">Host</p>
          <p className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)] md:text-xl">
            {beat.line}
          </p>
        </div>
        <button
          type="button"
          onClick={onMuteToggle}
          className="shrink-0 pt-1 text-[10px] uppercase tracking-widest text-[var(--muted)] hover:text-[var(--ember)]"
          aria-label={muted ? "Unmute sound" : "Mute sound"}
        >
          {muted ? "Sound off" : "Sound on"}
        </button>
      </div>
    </div>
  );
}
