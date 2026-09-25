"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fillSuggestion, getCharacter } from "@/ai/characters";
import type { ClientAction, ClientGameView } from "@/game/types";

export function ChatPanel({
  view,
  send,
  canConclave,
}: {
  view: ClientGameView;
  send: (a: ClientAction) => void;
  canConclave: boolean;
}) {
  const [tab, setTab] = useState<"castle" | "conclave">("castle");
  const [text, setText] = useState("");
  const [asCharacter, setAsCharacter] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const channel = tab === "conclave" && canConclave ? "conclave" : "castle";
  const messages = channel === "conclave" ? view.conclaveChat : view.castleChat;
  const canSpeak = Boolean(view.you?.alive) || view.phase === "ended";
  const isPro = view.config.gameMode === "pro" && Boolean(view.yourCharacterId);
  const character = getCharacter(view.yourCharacterId);

  const livingNames = useMemo(
    () => view.players.filter((p) => p.alive).map((p) => p.name),
    [view.players],
  );
  const youName = view.players.find((p) => p.id === view.you?.id)?.name;

  const suggestions = useMemo(() => {
    if (!character) return [];
    const pool =
      channel === "conclave"
        ? character.suggestions.conclave
        : view.phase === "voting" || view.phase === "finale_vote"
          ? character.suggestions.voting
          : character.suggestions.discussion;
    return pool.slice(0, 3).map((t) => fillSuggestion(t, livingNames, youName));
  }, [character, channel, view.phase, livingNames, youName]);

  useEffect(() => {
    if (!canConclave) {
      setTab("castle");
      return;
    }
    if (view.phase === "night") setTab("conclave");
  }, [canConclave, view.phase]);

  useEffect(() => {
    if (!canConclave || view.phase === "night") return;
    const last = view.conclaveChat[view.conclaveChat.length - 1];
    if (last && Date.now() - last.at < 5000) setTab("conclave");
  }, [canConclave, view.conclaveChat, view.phase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, channel]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !canSpeak) return;
    send({
      type: "chat",
      channel,
      text,
      asCharacter: isPro && asCharacter,
    });
    setText("");
  }

  return (
    <div className="flex flex-col border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex border-b border-[var(--line)]">
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-sm tracking-wide ${tab === "castle" ? "bg-[var(--panel-2)] text-[var(--ink)]" : "text-[var(--muted)]"}`}
          onClick={() => setTab("castle")}
        >
          Castle
        </button>
        {canConclave && (
          <button
            type="button"
            className={`flex-1 px-3 py-2 text-sm tracking-wide ${tab === "conclave" ? "bg-[var(--blood)]/20 text-[var(--ember)]" : "text-[var(--muted)]"}`}
            onClick={() => setTab("conclave")}
          >
            Conclave
            {view.conclaveChat.length > 0 ? (
              <span className="ml-1 text-[10px] text-[var(--muted)]">
                ({view.conclaveChat.length})
              </span>
            ) : null}
          </button>
        )}
      </div>

      <div className="max-h-[min(38vh,280px)] space-y-2 overflow-y-auto overscroll-contain p-3 text-sm sm:max-h-[min(42vh,360px)]">
        {messages.length === 0 && (
          <p className="text-[var(--muted)]">
            {channel === "conclave"
              ? "The turret is quiet. Coordinate here."
              : "No messages yet."}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <span className="font-medium text-[var(--ember)]">{m.playerName}</span>
            <span className="text-[var(--muted)]"> · </span>
            <span className="text-[var(--ink)]">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {isPro && canSpeak && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--line)] px-2 py-2">
          {suggestions.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => setText(line)}
              className="max-w-full truncate bg-[var(--panel-2)] px-2 py-1 text-left text-[11px] text-[var(--muted)] ring-1 ring-[var(--line)] hover:text-[var(--ink)] hover:ring-[var(--ember)]/50"
            >
              {line}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={submit}
        className="sticky bottom-0 border-t border-[var(--line)] bg-[var(--night)]/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        {isPro && (
          <label className="mb-1.5 flex items-center gap-2 px-1 text-[11px] text-[var(--muted)]">
            <input
              type="checkbox"
              checked={asCharacter}
              onChange={(e) => setAsCharacter(e.target.checked)}
              className="accent-[var(--ember)]"
            />
            Send as {character?.label ?? "character"}
          </label>
        )}
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!canSpeak}
            placeholder={
              canSpeak
                ? channel === "conclave"
                  ? "Message Traitors…"
                  : "Message Castle…"
                : "Spectating"
            }
            className="min-w-0 flex-1 bg-[var(--panel-2)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-1 ring-[var(--line)] focus:ring-[var(--ember)]"
            maxLength={280}
          />
          <button
            type="submit"
            disabled={!canSpeak}
            className="bg-[var(--ember)] px-4 py-2.5 text-sm font-medium text-[var(--night)] disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
