import type { GameState, HostBeat, HostBeatKind, HostSfx, Phase, Role } from "./types";

let beatSeq = 0;

function beat(
  kind: HostBeatKind,
  title: string,
  line: string,
  opts: { detail?: string | null; sfx?: HostSfx; cinematicMs?: number } = {},
): HostBeat {
  beatSeq += 1;
  return {
    id: `beat_${Date.now()}_${beatSeq}`,
    kind,
    title,
    line,
    detail: opts.detail ?? null,
    sfx: opts.sfx ?? "none",
    cinematicMs: opts.cinematicMs ?? 4200,
    at: Date.now(),
  };
}

function playerName(state: GameState, id: string | null): string {
  if (!id) return "Someone";
  return state.players.find((p) => p.id === id)?.name ?? "Someone";
}

function roleWord(role: Role | null): string {
  return role === "traitor" ? "Traitor" : "Faithful";
}

/** Build the host beat for the state's current phase + recent events */
export function buildHostBeat(state: GameState): HostBeat {
  switch (state.phase as Phase) {
    case "discussion":
      if (state.day <= 1 && !state.lastMurderedId && !state.lastMurderBlocked && state.banishedIds.length === 0) {
        return beat(
          "welcome",
          "Welcome to the castle",
          "Among you are Traitors. Find them — or become their next victim.",
          {
            sfx: "murmur",
            cinematicMs: 5000,
            detail: `Prize: $${state.config.prizePot.toLocaleString()}`,
          },
        );
      }
      return beat(
        "discussion",
        "The Round Table",
        "Look around this table. Someone here is lying. Deliberate.",
        { sfx: "murmur", cinematicMs: 3500 },
      );

    case "morning":
      if (state.lastMurderBlocked) {
        return beat(
          "morning",
          "Breakfast",
          `${playerName(state, state.lastMurderedId)}'s Shield held. The Traitors failed — for now.`,
          { sfx: "sting", cinematicMs: 4800, detail: "A murder was attempted." },
        );
      }
      if (state.lastMurderedId) {
        return beat(
          "morning",
          "Breakfast",
          `${playerName(state, state.lastMurderedId)} did not come down this morning.`,
          { sfx: "knock", cinematicMs: 5000, detail: "Murdered in the night." },
        );
      }
      return beat(
        "morning",
        "Breakfast",
        "A quiet night. Everyone is accounted for — or so it seems.",
        { sfx: "murmur", cinematicMs: 4000 },
      );

    case "voting":
      return beat(
        "voting",
        "Banishment",
        "Write a name. One of you leaves this castle tonight.",
        { sfx: "gavel", cinematicMs: 3200 },
      );

    case "banish_reveal": {
      const name = playerName(state, state.lastBanishedId);
      if (!state.lastBanishedId) {
        return beat(
          "banish_reveal",
          "No banishment",
          "The table could not decide. Suspicion thickens.",
          { sfx: "murmur", cinematicMs: 3500 },
        );
      }
      return beat(
        "banish_reveal",
        `${name} is banished`,
        `${name} was a ${roleWord(state.lastBanishedRole)}.`,
        {
          sfx: "sting",
          cinematicMs: 5500,
          detail: state.lastBanishedRole === "traitor" ? "A Traitor falls." : "A Faithful falls.",
        },
      );
    }

    case "night":
      return beat(
        "night",
        "Night falls",
        "Faithfuls — to bed. Traitors — to the turret.",
        { sfx: "heartbeat", cinematicMs: 4000 },
      );

    case "finale_choice":
      return beat(
        "finale_choice",
        "The finale",
        "End the game together — or banish again. Choose carefully.",
        {
          sfx: "murmur",
          cinematicMs: 4500,
          detail: `${state.players.filter((p) => p.alive).length} remain.`,
        },
      );

    case "finale_vote":
      return beat(
        "finale_vote",
        "Final banishment",
        "One more name. There may be no second chances.",
        { sfx: "gavel", cinematicMs: 3500 },
      );

    case "ended":
      if (state.winners === "traitor") {
        return beat(
          "ended",
          "The Traitors win",
          `They steal $${state.config.prizePot.toLocaleString()}. The Faithfuls never saw it coming.`,
          { sfx: "sting", cinematicMs: 6000 },
        );
      }
      return beat(
        "ended",
        "The Faithfuls win",
        `They share $${state.config.prizePot.toLocaleString()}. Every Traitor has been banished.`,
        { sfx: "sting", cinematicMs: 6000 },
      );

    default:
      return beat("discussion", "The castle waits", "Something stirs.", { cinematicMs: 2500 });
  }
}

export function attachHostBeat(state: GameState): void {
  state.hostBeat = buildHostBeat(state);
}
