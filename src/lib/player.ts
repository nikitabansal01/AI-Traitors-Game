import { nanoid } from "nanoid";

const STORAGE_KEY = "ai-traitors-player-id";

export function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = `h_${nanoid(10)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function partyHost(): string {
  return process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";
}
