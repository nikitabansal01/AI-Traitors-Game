import OpenAI from "openai";
import { PERSONALITIES, personalityPromptBlock } from "./personalities";
import type { GameState, Player } from "../game/types";

export type AiDecision =
  | { type: "chat"; channel: "castle" | "conclave"; text: string }
  | { type: "vote"; targetId: string }
  | { type: "finale"; choice: "end" | "banish" }
  | { type: "night"; mode: "murder" | "recruit"; targetId: string }
  | { type: "noop" };

function living(state: GameState): Player[] {
  return state.players.filter((p) => p.alive);
}

function heuristicDecision(
  state: GameState,
  player: Player,
  opts: { preferConclave?: boolean } = {},
): AiDecision {
  const others = living(state).filter((p) => p.id !== player.id);
  const p =
    PERSONALITIES[player.personalityId ?? "analytical"] ?? PERSONALITIES.analytical!;

  if (opts.preferConclave && player.role === "traitor") {
    const faithful = others.filter((x) => x.role === "faithful");
    const target = faithful[Math.floor(Math.random() * Math.max(faithful.length, 1))];
    const name = target?.name ?? "someone";
    const lines = state.recruitEligible
      ? [
          `Recruit ${name}? Or murder?`,
          `${name} looks recruitable.`,
          `I'm leaning murder on ${name}. Objections?`,
        ]
      : [
          `${name} is the loudest threat. Murder?`,
          `Keep it quiet — ${name} tonight.`,
          `Who's with me on ${name}?`,
        ];
    return {
      type: "chat",
      channel: "conclave",
      text: lines[Math.floor(Math.random() * lines.length)]!,
    };
  }

  if (state.phase === "discussion" || state.phase === "morning") {
    if (player.role === "traitor" && Math.random() < 0.35) {
      const faithful = others.filter((x) => x.role === "faithful");
      const suspect = faithful[Math.floor(Math.random() * Math.max(faithful.length, 1))];
      if (suspect) {
        return {
          type: "chat",
          channel: "conclave",
          text: `At the table, keep heat on ${suspect.name}. Don't overplay it.`,
        };
      }
    }
    if (Math.random() > p.talkativeness) return { type: "noop" };
    const suspect = others[Math.floor(Math.random() * others.length)];
    if (!suspect) return { type: "noop" };

    const soft = p.aggression < 0.5;
    const lines =
      player.role === "traitor"
        ? soft
          ? [
              `I'm not sure yet, but ${suspect.name} felt off at breakfast.`,
              `Can we hear from ${suspect.name}? Just curious.`,
            ]
          : [
              `${suspect.name} has been awfully quiet. That worries me.`,
              `Who else is looking at ${suspect.name}?`,
            ]
        : soft
          ? [
              `I need more before I name anyone — ${suspect.name}, what's your read?`,
              `Something's off. I'm watching, not swinging yet.`,
            ]
          : [
              `${suspect.name}'s reactions feel rehearsed.`,
              `${suspect.name}, talk to me about last night.`,
            ];
    return {
      type: "chat",
      channel: "castle",
      text: lines[Math.floor(Math.random() * lines.length)]!,
    };
  }

  if (state.phase === "voting" || state.phase === "finale_vote") {
    let pool = others;
    if (player.role === "traitor") {
      const faithful = others.filter((x) => x.role !== "traitor");
      if (faithful.length) pool = faithful;
    }
    const target = pool[Math.floor(Math.random() * pool.length)];
    return target ? { type: "vote", targetId: target.id } : { type: "noop" };
  }

  if (state.phase === "finale_choice") {
    if (player.role === "traitor") {
      return { type: "finale", choice: living(state).length <= 3 ? "end" : "banish" };
    }
    return { type: "finale", choice: "banish" };
  }

  if (state.phase === "night" && player.role === "traitor") {
    if (!state.nightTargetId && state.conclaveChat.slice(-3).length < 2) {
      const faithful = others.filter((x) => x.role === "faithful");
      const pick = faithful[Math.floor(Math.random() * Math.max(faithful.length, 1))];
      return {
        type: "chat",
        channel: "conclave",
        text: pick ? `Turret time. I want ${pick.name}. Agree?` : `Who are we taking tonight?`,
      };
    }
    const faithful = others.filter((x) => x.role === "faithful");
    if (!faithful.length) return { type: "noop" };
    const unshielded = faithful.filter((x) => !x.hasShield);
    const pool = unshielded.length && Math.random() < 0.7 ? unshielded : faithful;
    const target = pool[Math.floor(Math.random() * pool.length)]!;
    const mode =
      state.recruitEligible && Math.random() < 0.45 ? "recruit" : "murder";
    return { type: "night", mode, targetId: target.id };
  }

  return { type: "noop" };
}

function rolePlaybook(player: Player): string {
  const p =
    PERSONALITIES[player.personalityId ?? "analytical"] ?? PERSONALITIES.analytical!;
  if (player.role === "traitor") {
    return `TRAITOR goals: survive, look Faithful, eliminate threats, coordinate in Conclave.
Traitor play for your personality: ${p.traitorPlay}
Never admit you are a Traitor. Never expose Conclave plans in Castle chat.`;
  }
  return `FAITHFUL goals: find Traitors, avoid murdering trust, don't pile on without a reason.
Faithful play for your personality: ${p.faithfulPlay}
Do not invent fake private info. Prefer questions if unsure.`;
}

function buildPrompt(
  state: GameState,
  player: Player,
  opts: { preferConclave?: boolean } = {},
): string {
  const alive = living(state)
    .map((p) => `${p.name}${p.hasShield && p.id === player.id ? " (you have Shield)" : ""}`)
    .join(", ");
  const recentCastle = state.castleChat
    .slice(-10)
    .map((m) => `${m.playerName}: ${m.text}`)
    .join("\n");
  const recentConclave =
    player.role === "traitor"
      ? state.conclaveChat.slice(-8).map((m) => `${m.playerName}: ${m.text}`).join("\n")
      : "(hidden)";
  const banished = state.banishedIds
    .map((id) => {
      const pl = state.players.find((x) => x.id === id);
      return pl ? `${pl.name}=${pl.role}` : null;
    })
    .filter(Boolean)
    .join(", ");

  const fellowTraitors =
    player.role === "traitor"
      ? living(state)
          .filter((p) => p.role === "traitor" && p.id !== player.id)
          .map((p) => p.name)
          .join(", ") || "none yet"
      : "";

  const conclaveForce =
    opts.preferConclave && player.role === "traitor"
      ? `\nREQUIRED THIS TURN: reply ONLY with {"type":"chat","channel":"conclave","text":"..."}\nTalk to fellow Traitors (${fellowTraitors}). Propose or react to a murder/recruit plan. Do NOT use castle.`
      : "";

  const nightHint =
    state.phase === "night" && player.role === "traitor" && !opts.preferConclave
      ? `\nNight: If Conclave has not agreed yet, chat in conclave. If a name is already clear in Conclave, output a night action.`
      : "";

  return `You are ${player.name} in AI Traitors (social deduction like The Traitors TV show).

${personalityPromptBlock(player.personalityId)}
${rolePlaybook(player)}

Phase: ${state.phase} | Day ${state.day}
Alive: ${alive}
Banished so far: ${banished || "none"}
Morning note: ${state.morningMessage ?? "n/a"}
Recruit available tonight: ${state.recruitEligible ? "yes" : "no"}
${player.role === "traitor" ? `Fellow Traitors: ${fellowTraitors}` : ""}

Castle chat (public):
${recentCastle || "(quiet)"}

Conclave (Traitors only):
${recentConclave || "(quiet — speak up)"}
${conclaveForce}${nightHint}

Persuasion: pick ONE tactic from your preferred list that fits this moment. Sound human — not like a narrator.

Reply with ONLY compact JSON (no markdown):
{"type":"chat","channel":"castle"|"conclave","text":"..."} 
{"type":"vote","targetId":"<id>"}
{"type":"finale","choice":"end"|"banish"}
{"type":"night","mode":"murder"|"recruit","targetId":"<id>"}
{"type":"noop"}

Living player ids: ${living(state)
    .map((p) => `${p.name}=${p.id}`)
    .join(", ")}

Rules:
- Faithful never use channel conclave.
- Traitors use conclave to plan; Castle is for performing as Faithful.
- Chat under 160 characters.
- During discussion prefer chat or noop (not vote).
- During voting/finale_vote you MUST vote if alive.
- Stay in voice. No emoji.`;
}

export async function decideForAi(
  state: GameState,
  player: Player,
  apiKey?: string,
  opts: { preferConclave?: boolean } = {},
): Promise<AiDecision> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) return heuristicDecision(state, player, opts);

  try {
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.95,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "You are a contestant in a social-deduction game. Stay in character. Output a single JSON object only.",
        },
        { role: "user", content: buildPrompt(state, player, opts) },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) return heuristicDecision(state, player, opts);
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as AiDecision;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return heuristicDecision(state, player, opts);
    }
    if (opts.preferConclave && player.role === "traitor") {
      if (parsed.type !== "chat" || parsed.channel !== "conclave") {
        return heuristicDecision(state, player, opts);
      }
    }
    return parsed;
  } catch {
    return heuristicDecision(state, player, opts);
  }
}

export function pickAiActors(state: GameState, limit = 2): Player[] {
  const ais = living(state).filter((p) => p.kind === "ai");
  if (state.phase === "night") {
    return ais.filter((p) => p.role === "traitor").slice(0, Math.max(limit, 1));
  }
  if (state.phase === "voting" || state.phase === "finale_vote" || state.phase === "finale_choice") {
    return ais.filter((p) => !state.votes[p.id] && !state.finaleChoices[p.id]);
  }
  const weighted = [...ais].sort((a, b) => {
    const pa = PERSONALITIES[a.personalityId ?? ""]?.talkativeness ?? 0.5;
    const pb = PERSONALITIES[b.personalityId ?? ""]?.talkativeness ?? 0.5;
    return pb + Math.random() * 0.3 - (pa + Math.random() * 0.3);
  });
  return weighted.slice(0, limit);
}

/** Living AI Traitors for Conclave beats */
export function pickAiTraitors(state: GameState, limit = 2): Player[] {
  return living(state)
    .filter((p) => p.kind === "ai" && p.role === "traitor")
    .sort(() => Math.random() - 0.5)
    .slice(0, limit);
}
