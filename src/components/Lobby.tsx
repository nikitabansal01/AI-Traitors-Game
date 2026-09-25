"use client";

import { useEffect, useState } from "react";
import { CHARACTERS, CHARACTER_IDS } from "@/ai/characters";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import type { ClientAction, ClientGameView, GameMode } from "@/game/types";

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
  const isPro = view.config.gameMode === "pro";
  const you = view.players.find((p) => p.id === playerId);
  const taken = new Set(
    view.players.map((p) => p.characterId).filter(Boolean) as string[],
  );

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

  function setMode(mode: GameMode) {
    send({ type: "set_game_mode", mode });
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
        {isPro
          ? "Pro: pick a character. AI fills remaining faces."
          : "Amateurs: humans take seats. AI fills the rest."}
      </p>

      {isHost && seated && (
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("amateurs")}
            className={`px-3 py-3 text-sm ${
              !isPro
                ? "bg-[var(--ember)] text-[var(--night)]"
                : "ring-1 ring-[var(--line)] text-[var(--ink)]"
            }`}
          >
            Amateurs
          </button>
          <button
            type="button"
            onClick={() => setMode("pro")}
            className={`px-3 py-3 text-sm ${
              isPro
                ? "bg-[var(--ember)] text-[var(--night)]"
                : "ring-1 ring-[var(--line)] text-[var(--ink)]"
            }`}
          >
            Pro
          </button>
        </div>
      )}

      {!isHost && seated && (
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-[var(--ember)]">
          {isPro ? "Pro" : "Amateurs"}
        </p>
      )}

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

      {isPro && seated && (
        <div className="mt-8">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Your character
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CHARACTER_IDS.map((id) => {
              const c = CHARACTERS[id];
              const selected = you?.characterId === id;
              const locked = taken.has(id) && !selected;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={locked}
                  onClick={() => send({ type: "set_character", characterId: id })}
                  className={`flex items-start gap-3 px-3 py-3 text-left ring-1 transition ${
                    selected
                      ? "bg-[var(--ember)]/15 ring-[var(--ember)]"
                      : locked
                        ? "opacity-40 ring-[var(--line)]"
                        : "ring-[var(--line)] hover:ring-[var(--ember)]/60"
                  }`}
                >
                  <CharacterAvatar initials={c.initials} hue={c.hue} />
                  <span className="min-w-0">
                    <span className="block text-sm text-[var(--ink)]">{c.label}</span>
                    <span className="block text-xs text-[var(--muted)]">{c.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ul className="mt-8 space-y-2">
        {humans.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 border border-[var(--line)] bg-[var(--panel)] px-4 py-3"
          >
            <span className="flex min-w-0 items-center gap-3">
              {isPro && (
                <CharacterAvatar
                  initials={p.characterInitials}
                  hue={p.characterHue}
                  size="sm"
                />
              )}
              <span className="truncate">
                {p.name}
                {p.id === playerId ? " (you)" : ""}
              </span>
            </span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {p.id === view.hostId ? "Host" : "Human"}
              {isPro && !p.characterId ? " · pick" : ""}
            </span>
          </li>
        ))}
        {aiSlots > 0 && (
          <li className="border border-dashed border-[var(--line)] px-4 py-3 text-[var(--muted)]">
            + {aiSlots} AI {isPro ? "character" : "player"}
            {aiSlots === 1 ? "" : "s"} on start
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
              max={isPro ? 10 : 16}
              value={view.config.castSize}
              onChange={(e) =>
                send({ type: "set_cast_size", size: Number(e.target.value) })
              }
              className="mt-1 block w-full bg-[var(--panel-2)] px-3 py-2 text-[var(--ink)] ring-1 ring-[var(--line)]"
            />
          </label>
          <p className="text-xs text-[var(--muted)]">
            {view.config.traitorCount} Traitors · {isPro ? "Pro roleplay" : "Amateurs MVP"}
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
