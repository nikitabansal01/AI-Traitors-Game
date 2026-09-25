"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { CinematicOverlay, HostStrip, useMuted } from "@/components/HostCinematic";
import type { ClientAction, ClientGameView } from "@/game/types";

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
      return "Night — Traitors";
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

export function GameBoard({
  view,
  playerId,
  send,
  error,
}: {
  view: ClientGameView;
  playerId: string;
  send: (a: ClientAction) => void;
  error: string | null;
}) {
  const isHost = view.hostId === playerId;
  const canConclave = Boolean(view.you?.isTraitor);
  const living = view.players.filter((p) => p.alive);
  const [muted, setMuted] = useMuted();
  const nightDim = view.phase === "night" && !view.you?.isTraitor;

  return (
    <div className={nightDim ? "phase-night-dim" : undefined}>
      <HostStrip
        beat={view.hostBeat}
        muted={muted}
        onMuteToggle={() => setMuted(!muted)}
      />
      <CinematicOverlay beat={view.hostBeat} muted={muted} onDismiss={() => undefined} />

      <div className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <header className="border border-[var(--line)] bg-[var(--panel)]/80 p-3 backdrop-blur sm:p-4">
            <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)] sm:text-xs">
                  Day {view.day} · Room {view.roomCode}
                </p>
                <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] sm:text-3xl md:text-4xl">
                  {phaseLabel(view.phase)}
                </h1>
                {view.morningMessage && view.phase !== "morning" && (
                  <p className="mt-1 text-sm text-[var(--muted)]">{view.morningMessage}</p>
                )}
              </div>
              <div className="text-right text-xs text-[var(--muted)] sm:text-sm">
                <div>Prize ${view.config.prizePot.toLocaleString()}</div>
                <Timer endsAt={view.phaseEndsAt} />
                {view.you && (
                  <div className="mt-1">
                    You:{" "}
                    <span className="text-[var(--ink)]">
                      {view.you.isTraitor ? "Traitor" : "Faithful"}
                      {view.you.hasShield ? " · Shield" : ""}
                      {!view.you.alive ? " · Eliminated" : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            {isHost && view.phase !== "ended" && view.started && (
              <button
                type="button"
                onClick={() => send({ type: "advance_phase" })}
                className="mt-3 text-xs uppercase tracking-widest text-[var(--muted)] underline hover:text-[var(--ember)]"
              >
                Skip phase
              </button>
            )}
          </header>

          {/* Mobile cast strip — keeps people visible without scrolling past chat */}
          <section className="border border-[var(--line)] bg-[var(--panel)] p-2 lg:hidden">
            <p className="mb-2 px-1 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
              Cast
            </p>
            <ul className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {view.players.map((p) => (
                <li
                  key={p.id}
                  className={`shrink-0 rounded-sm px-2.5 py-1.5 text-xs ring-1 ring-[var(--line)] ${
                    p.alive ? "bg-[var(--panel-2)]" : "opacity-40 line-through"
                  }`}
                >
                  <span className="text-[var(--ink)]">{p.name}</span>
                  {p.id === playerId && (
                    <span className="ml-1 text-[var(--ember)]">·you</span>
                  )}
                  {p.revealedRole && (
                    <span className="ml-1 text-[var(--muted)]">{p.revealedRole}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Actions above chat — must not sit under the thread */}
          {(view.phase === "voting" || view.phase === "finale_vote") && view.you?.alive && (
            <section className="border border-[var(--ember)]/50 bg-[var(--panel)] p-4">
              <h2 className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--ember)]">
                Cast your vote
              </h2>
              <div className="flex flex-wrap gap-2">
                {living
                  .filter((p) => p.id !== playerId)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => send({ type: "vote", targetId: p.id })}
                      className={`px-3 py-2 text-sm ${
                        view.yourVote === p.id
                          ? "bg-[var(--ember)] text-[var(--night)]"
                          : "bg-[var(--panel-2)] text-[var(--ink)] ring-1 ring-[var(--line)]"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
              </div>
            </section>
          )}

          {view.phase === "finale_choice" && view.you?.alive && (
            <section className="border border-[var(--ember)]/50 bg-[var(--panel)] p-4">
              <h2 className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--ember)]">
                End Game or Banish Again?
              </h2>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => send({ type: "finale_choice", choice: "end" })}
                  className={`px-4 py-2 ${view.yourFinaleChoice === "end" ? "bg-[var(--ember)] text-[var(--night)]" : "ring-1 ring-[var(--line)]"}`}
                >
                  End Game
                </button>
                <button
                  type="button"
                  onClick={() => send({ type: "finale_choice", choice: "banish" })}
                  className={`px-4 py-2 ${view.yourFinaleChoice === "banish" ? "bg-[var(--ember)] text-[var(--night)]" : "ring-1 ring-[var(--line)]"}`}
                >
                  Banish Again
                </button>
              </div>
            </section>
          )}

          {view.phase === "night" && view.you?.isTraitor && view.you.alive && (
            <section className="border border-[var(--blood)] bg-[var(--blood)]/20 p-4">
              <h2 className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--ember)]">
                Night action
              </h2>
              {view.recruitEligible && (
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => send({ type: "night_mode", mode: "murder" })}
                    className={`px-3 py-1 text-sm ${view.nightMode === "murder" ? "bg-[var(--ember)] text-[var(--night)]" : "ring-1 ring-[var(--line)]"}`}
                  >
                    Murder
                  </button>
                  <button
                    type="button"
                    onClick={() => send({ type: "night_mode", mode: "recruit" })}
                    className={`px-3 py-1 text-sm ${view.nightMode === "recruit" ? "bg-[var(--ember)] text-[var(--night)]" : "ring-1 ring-[var(--line)]"}`}
                  >
                    Recruit
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {living
                  .filter((p) => p.revealedRole !== "traitor" && p.id !== playerId)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => send({ type: "night_target", targetId: p.id })}
                      className={`px-3 py-2 text-sm ${
                        view.nightTargetId === p.id
                          ? "bg-[var(--ember)] text-[var(--night)]"
                          : "bg-[var(--panel-2)] ring-1 ring-[var(--line)]"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
              </div>
            </section>
          )}

          {view.phase === "night" && !view.you?.isTraitor && view.you?.alive && (
            <div className="border border-[var(--line)] bg-black/40 p-6 text-center">
              <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--muted)]">
                The castle sleeps
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Traitors are in the turret. Dawn will tell.
              </p>
            </div>
          )}

          {view.phase === "ended" && (
            <div className="border border-[var(--ember)] bg-[var(--blood)]/30 p-6 text-center">
              <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ember)]">
                {view.winners === "traitor" ? "Traitors win" : "Faithfuls win"}
              </h2>
              <p className="mt-2 text-[var(--muted)]">
                ${view.config.prizePot.toLocaleString()} ·{" "}
                {view.players
                  .filter((p) => view.winnerIds.includes(p.id))
                  .map((p) => p.name)
                  .join(", ")}
              </p>
            </div>
          )}

          {/* Thread then composer — natural chat order */}
          {view.phase !== "morning" && (
            <ChatPanel view={view} send={send} canConclave={canConclave} />
          )}
        </div>

        <aside className="hidden min-w-0 space-y-4 lg:sticky lg:top-16 lg:block lg:self-start">
          <section className="border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Cast</h2>
            <ul className="space-y-2">
              {view.players.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between px-2 py-1.5 text-sm ${
                    p.alive ? "" : "opacity-45 line-through"
                  }`}
                >
                  <span>
                    {p.name}
                    {p.kind === "ai" ? (
                      <span className="ml-1.5 text-[10px] text-[var(--muted)]">AI</span>
                    ) : null}
                    {p.id === playerId ? (
                      <span className="ml-1.5 text-[10px] text-[var(--ember)]">you</span>
                    ) : null}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {p.revealedRole ?? (p.alive ? "—" : "gone")}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Log</h2>
            <ul className="max-h-[280px] space-y-2 overflow-y-auto text-sm text-[var(--muted)]">
              {[...view.log].reverse().map((l) => (
                <li key={l.id}>{l.text}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Mobile log — after chat so it doesn't steal the fold */}
      <div className="mx-auto max-w-6xl px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 lg:hidden">
        <div className="border border-[var(--line)] bg-[var(--panel)] p-3">
          <h2 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Log</h2>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs text-[var(--muted)]">
            {[...view.log].reverse().slice(0, 12).map((l) => (
              <li key={l.id}>{l.text}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
