"use client";

import { useEffect, useState } from "react";
import type { ClientAction, ClientGameView } from "@/game/types";

export function Lobby({
  view,
  playerId,
  send,
  error,
  connected,
}: {
  view: ClientGameView;
  playerId: string;
  send: (a: ClientAction) => void;
  error: string | null;
  connected: boolean;
}) {
  const [name, setName] = useState("");
  const seated = view.players.some((p) => p.id === playerId);
  const isHost = view.hostId === playerId;
  const humans = view.players.filter((p) => p.kind === "human");
  const aiSlots = Math.max(0, view.config.castSize - humans.length);

  useEffect(() => {
    const saved = localStorage.getItem("ai-traitors-name");
    if (saved) setName(saved);
  }, []);

  function join(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    localStorage.setItem("ai-traitors-name", n);
    send({ type: "claim_seat", name: n, playerId });
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
        Room {view.roomCode} · {connected ? "Connected" : "Connecting…"}
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--ink)]">
        The Lobby
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Humans take seats. AI fills the rest when the host starts.
      </p>

      {!seated ? (
        <form onSubmit={join} className="mt-8 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            className="min-w-0 flex-1 bg-[var(--panel)] px-4 py-3 text-[var(--ink)] outline-none ring-1 ring-[var(--line)] focus:ring-[var(--ember)]"
          />
          <button
            type="submit"
            className="bg-[var(--ember)] px-5 py-3 font-medium text-[var(--night)]"
          >
            Join
          </button>
        </form>
      ) : (
        <p className="mt-6 text-[var(--ember)]">You are seated.</p>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <ul className="mt-8 space-y-2">
        {humans.map((p) => (
          <li
            key={p.id}
            className="flex justify-between border border-[var(--line)] bg-[var(--panel)] px-4 py-3"
          >
            <span>{p.name}{p.id === playerId ? " (you)" : ""}</span>
            <span className="text-xs text-[var(--muted)]">
              {p.id === view.hostId ? "Host" : "Human"}
            </span>
          </li>
        ))}
        {aiSlots > 0 && (
          <li className="border border-dashed border-[var(--line)] px-4 py-3 text-[var(--muted)]">
            + {aiSlots} AI player{aiSlots === 1 ? "" : "s"} on start
          </li>
        )}
      </ul>

      {isHost && seated && (
        <div className="mt-8 space-y-4 border border-[var(--line)] bg-[var(--panel)] p-4">
          <label className="block text-sm text-[var(--muted)]">
            Cast size
            <input
              type="number"
              min={6}
              max={16}
              value={view.config.castSize}
              onChange={(e) =>
                send({ type: "set_cast_size", size: Number(e.target.value) })
              }
              className="mt-1 block w-full bg-[var(--panel-2)] px-3 py-2 text-[var(--ink)] ring-1 ring-[var(--line)]"
            />
          </label>
          <p className="text-xs text-[var(--muted)]">
            {view.config.traitorCount} Traitors will be chosen at random.
          </p>
          <button
            type="button"
            onClick={() => send({ type: "start_game" })}
            className="w-full bg-[var(--ember)] py-3 font-medium text-[var(--night)]"
          >
            Begin the game
          </button>
        </div>
      )}

      {seated && !isHost && (
        <p className="mt-8 text-sm text-[var(--muted)]">Waiting for host to start…</p>
      )}
    </div>
  );
}
