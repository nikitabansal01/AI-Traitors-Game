"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import { CinematicOverlay, HostStrip, useMuted } from "@/components/HostCinematic";
import type { ClientGameView } from "@/game/types";

function phaseLabel(phase: string): string {
  switch (phase) {
    case "lobby":
      return "Lobby";
    case "morning":
      return "Breakfast";
    case "discussion":
      return "Round Table";
    case "voting":
      return "Banishment Vote";
    case "banish_reveal":
      return "Reveal";
    case "night":
      return "Night";
    case "finale_choice":
      return "Finale";
    case "finale_vote":
      return "Final Banishment";
    case "ended":
      return "Game Over";
    default:
      return phase;
  }
}

function Timer({ endsAt }: { endsAt: number | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const s = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  return <div className="text-[var(--ember)]">{s}s</div>;
}

/** Shared TV / cast screen — public only: no roles, no Conclave, no player actions */
export function TvDisplay({
  view,
  connected,
}: {
  view: ClientGameView;
  connected: boolean;
}) {
  const [muted, setMuted] = useMuted();
  const isPro = view.config.gameMode === "pro";
  const living = view.players.filter((p) => p.alive);
  const messages = view.castleChat.slice(-40);

  if (!view.started) {
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-8 py-12 text-center">
        <Image
          src="/logo.jpg"
          alt="Traitors"
          width={160}
          height={160}
          priority
          className="mx-auto mb-6 h-28 w-28 rounded-sm object-cover ring-1 ring-[var(--line)] md:h-36 md:w-36"
        />
        <p className="text-sm uppercase tracking-[0.35em] text-[var(--ember)]">
          Shared display · {connected ? "Live" : "Connecting…"}
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl text-[var(--ink)] md:text-7xl">
          Room {view.roomCode}
        </h1>
        <p className="mt-6 text-xl text-[var(--muted)]">
          Join on your phone with this code — same link from the host.
        </p>
        <ul className="mx-auto mt-12 grid w-full max-w-lg gap-3 text-left">
          {view.players
            .filter((p) => p.kind === "human")
            .map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-lg"
              >
                {isPro && (
                  <CharacterAvatar
                    initials={p.characterInitials}
                    hue={p.characterHue}
                  />
                )}
                <span>{p.name}</span>
              </li>
            ))}
          {view.players.filter((p) => p.kind === "human").length === 0 && (
            <li className="text-[var(--muted)]">Waiting for players…</li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className={view.phase === "night" ? "phase-night-dim" : undefined}>
      <HostStrip
        beat={view.hostBeat}
        muted={muted}
        onMuteToggle={() => setMuted(!muted)}
      />
      <CinematicOverlay beat={view.hostBeat} muted={muted} onDismiss={() => undefined} />

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <header className="border border-[var(--line)] bg-[var(--panel)]/80 p-6 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">
              Day {view.day} · Room {view.roomCode} · Shared display
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)] md:text-6xl">
                {phaseLabel(view.phase)}
              </h1>
              <div className="text-right text-lg text-[var(--muted)]">
                <div>${view.config.prizePot.toLocaleString()}</div>
                <Timer endsAt={view.phaseEndsAt} />
              </div>
            </div>
            {view.morningMessage && (
              <p className="mt-3 text-xl text-[var(--muted)]">{view.morningMessage}</p>
            )}
          </header>

          {view.phase === "night" && (
            <div className="border border-[var(--line)] bg-black/40 p-10 text-center">
              <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--muted)] md:text-4xl">
                The castle sleeps
              </p>
              <p className="mt-3 text-lg text-[var(--muted)]">
                Traitors are in the turret. Dawn will tell.
              </p>
            </div>
          )}

          {view.phase === "ended" && (
            <div className="border border-[var(--ember)] bg-[var(--blood)]/30 p-10 text-center">
              <h2 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ember)] md:text-5xl">
                {view.winners === "traitor" ? "Traitors win" : "Faithfuls win"}
              </h2>
            </div>
          )}

          {view.phase !== "morning" && view.phase !== "night" && (
            <section className="border border-[var(--line)] bg-[var(--panel)] p-5">
              <h2 className="mb-4 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                Castle
              </h2>
              <div className="max-h-[min(50vh,420px)] space-y-3 overflow-y-auto text-lg">
                {messages.length === 0 && (
                  <p className="text-[var(--muted)]">No messages yet.</p>
                )}
                {messages.map((m) => (
                  <div key={m.id}>
                    <span className="font-medium text-[var(--ember)]">{m.playerName}</span>
                    <span className="text-[var(--muted)]"> · </span>
                    <span className="text-[var(--ink)]">{m.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="border border-[var(--line)] bg-[var(--panel)] p-5">
            <h2 className="mb-4 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
              Cast · {living.length} living
            </h2>
            <ul className="space-y-3 text-lg">
              {view.players.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-3 ${
                    p.alive ? "" : "opacity-40 line-through"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {isPro && (
                      <CharacterAvatar
                        initials={p.characterInitials}
                        hue={p.characterHue}
                      />
                    )}
                    {p.name}
                  </span>
                  <span className="text-sm uppercase tracking-wider text-[var(--muted)]">
                    {p.revealedRole ?? (p.alive ? "—" : "gone")}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="border border-[var(--line)] bg-[var(--panel)] p-5">
            <h2 className="mb-3 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
              Log
            </h2>
            <ul className="max-h-[280px] space-y-2 overflow-y-auto text-base text-[var(--muted)]">
              {[...view.log].reverse().slice(0, 16).map((l) => (
                <li key={l.id}>{l.text}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
