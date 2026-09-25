"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import type { ClientAction, ClientGameView } from "@/game/types";
import { getOrCreatePlayerId, partyHost } from "@/lib/player";

export function useGameRoom(roomCode: string) {
  const [view, setView] = useState<ClientGameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string>("");
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const id = getOrCreatePlayerId();
    setPlayerId(id);

    const socket = new PartySocket({
      host: partyHost(),
      room: roomCode.toUpperCase(),
      query: { playerId: id },
    });
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(String(event.data)) as {
          type: string;
          view?: ClientGameView;
          error?: string;
        };
        if (data.type === "state" && data.view) setView(data.view);
        if (data.type === "error" && data.error) setError(data.error);
      } catch {
        /* ignore */
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [roomCode]);

  const send = useCallback((action: ClientAction) => {
    setError(null);
    socketRef.current?.send(JSON.stringify(action));
  }, []);

  return { view, error, connected, playerId, send };
}
