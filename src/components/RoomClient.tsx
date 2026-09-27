"use client";

import { GameBoard } from "@/components/GameBoard";
import { Lobby } from "@/components/Lobby";
import { TvDisplay } from "@/components/TvDisplay";
import { useGameRoom } from "@/lib/useGameRoom";

export function RoomClient({
  code,
  display = false,
}: {
  code: string;
  display?: boolean;
}) {
  const { view, error, connected, playerId, send } = useGameRoom(code, {
    display,
  });

  if (!view || !playerId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
        Connecting to the castle…
      </div>
    );
  }

  if (display) {
    return <TvDisplay view={view} connected={connected} />;
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
