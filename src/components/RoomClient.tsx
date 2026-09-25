"use client";

import { GameBoard } from "@/components/GameBoard";
import { Lobby } from "@/components/Lobby";
import { useGameRoom } from "@/lib/useGameRoom";

export function RoomClient({ code }: { code: string }) {
  const { view, error, connected, playerId, send } = useGameRoom(code);

  if (!view || !playerId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
        Connecting to the castle…
      </div>
    );
  }

  if (!view.started) {
    return (
      <Lobby
        view={view}
        playerId={playerId}
        send={send}
        error={error}
        connected={connected}
      />
    );
  }

  return (
    <GameBoard view={view} playerId={playerId} send={send} error={error} />
  );
}
