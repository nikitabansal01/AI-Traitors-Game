"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { randomRoomCode } from "@/lib/player";

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  function createRoom() {
    router.push(`/room/${randomRoomCode()}`);
  }

  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    router.push(`/room/${code}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,#3a2218_0%,transparent_50%),radial-gradient(ellipse_at_80%_0%,#1a2a28_0%,transparent_45%),linear-gradient(165deg,#0c0a09_0%,#1a1210_40%,#0e1412_100%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--ember)]">
          Multiplayer deception
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl leading-[0.95] text-[var(--ink)] sm:text-6xl md:text-8xl">
          AI Traitors
        </h1>
        <p className="mt-6 max-w-md text-lg text-[var(--muted)]">
          Join the cast. AI fills empty seats. Faithfuls hunt. Traitors murder.
          Someone at this table is lying.
        </p>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-stretch">
          <button
            type="button"
            onClick={createRoom}
            className="bg-[var(--ember)] px-8 py-4 text-base font-medium text-[var(--night)] transition hover:brightness-110"
          >
            Create room
          </button>
          <form onSubmit={joinRoom} className="flex flex-1 gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              className="min-w-0 flex-1 bg-[var(--panel)]/80 px-4 py-4 tracking-[0.2em] text-[var(--ink)] outline-none ring-1 ring-[var(--line)] backdrop-blur placeholder:tracking-[0.2em] placeholder:text-[var(--muted)] focus:ring-[var(--ember)]"
              maxLength={8}
            />
            <button
              type="submit"
              className="border border-[var(--line)] px-6 py-4 text-[var(--ink)] hover:border-[var(--ember)]"
            >
              Join
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
