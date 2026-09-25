import OpenAI from "openai";
import {
  characterPromptBlock,
  getCharacter,
  tableName,
} from "./characters";
import { PERSONALITIES, personalityPromptBlock } from "./personalities";
import type { ChatMessage, GameState, Player } from "../game/types";

export type AiDecision =
  | { type: "chat"; channel: "castle" | "conclave"; text: string }
  | { type: "vote"; targetId: string }
  | { type: "finale"; choice: "end" | "banish" }
  | { type: "night"; mode: "murder" | "recruit"; targetId: string }
  | { type: "noop" };

const FORBIDDEN_CHAT =
  /\b(i saw|i heard|overheard|mission|sabotage|clue|letter|turret door|in your room|last night i|we had a deal|you promised|secret meeting)\b/i;

function living(state: GameState): Player[] {
  return state.players.filter((p) => p.alive);
}

function voiceStats(player: Player) {
  const character = getCharacter(player.characterId);
  if (character) return character;
  return (
    PERSONALITIES[player.personalityId ?? "analytical"] ?? PERSONALITIES.analytical!
  );
}

/** Numbered Castle lines the model may cite as evidence */
function castleTranscript(messages: ChatMessage[], limit = 24): {
  block: string;
  speakers: string[];
  empty: boolean;
} {
  const slice = messages.slice(-limit);
  if (!slice.length) return { block: "(no Castle messages yet)", speakers: [], empty: true };
  const speakers = [...new Set(slice.map((m) => m.playerName))];
  const block = slice
    .map((m, i) => `#${i + 1} ${m.playerName}: ${m.text}`)
    .join("\n");
  return { block, speakers, empty: false };
}

function publicEventMemory(state: GameState): string {
  const lines: string[] = [];
  lines.push(`Day ${state.day} | Phase: ${state.phase}`);
  lines.push(
    `Alive (${living(state).length}): ${living(state)
      .map((p) => tableName(p))
      .join(", ")}`,
  );
  if (state.banishedIds.length) {
    const banished = state.banishedIds
      .map((id) => {
        const pl = state.players.find((x) => x.id === id);
        return pl ? `${tableName(pl)}=${pl.role}` : null;
      })
      .filter(Boolean);
    lines.push(`Banished (role revealed): ${banished.join(", ")}`);
  } else {
    lines.push("Banished: none yet");
  }
  lines.push(`Morning note: ${state.morningMessage ?? "none"}`);
  if (state.lastMurderBlocked) {
    const shielded = state.players.find((p) => p.id === state.lastMurderedId);
    lines.push(
      `Public: a Shield blocked murder${shielded ? ` on ${tableName(shielded)}` : ""}.`,
    );
  } else if (state.lastMurderedId && state.phase !== "night") {
    const victim = state.players.find((p) => p.id === state.lastMurderedId);
    if (victim) lines.push(`Public: ${tableName(victim)} was murdered (morning reveal).`);
  }
  // Public log — factual host/engine lines only
  const publicLog = state.log
    .filter((l) => l.public)
    .slice(-12)
    .map((l) => `- ${l.text}`);
  if (publicLog.length) {
    lines.push("Public log:");
    lines.push(...publicLog);
  }
  return lines.join("\n");
}

function voteMemory(state: GameState): string {
  if (
    state.phase !== "voting" &&
    state.phase !== "finale_vote" &&
    state.phase !== "banish_reveal"
  ) {
    return "Votes: not public / not in progress (do not invent past votes).";
  }
  const entries = Object.entries(state.votes);
  if (!entries.length) return "Votes: none in yet.";
  return `Votes so far: ${entries
    .map(([vid, tid]) => {
      const v = state.players.find((p) => p.id === vid);
      const t = state.players.find((p) => p.id === tid);
      return v && t ? `${tableName(v)}→${tableName(t)}` : null;
    })
    .filter(Boolean)
    .join(", ")}`;
}

function heuristicDecision(
  state: GameState,
  player: Player,
  opts: { preferConclave?: boolean } = {},
): AiDecision {
  const others = living(state).filter((p) => p.id !== player.id);
  const p = voiceStats(player);
  const { speakers, empty: castleQuiet } = castleTranscript(state.castleChat);

  if (opts.preferConclave && player.role === "traitor") {
    const faithful = others.filter((x) => x.role === "faithful");
    const target = faithful[Math.floor(Math.random() * Math.max(faithful.length, 1))];
    const name = target ? tableName(target) : "someone";
    const lines = state.recruitEligible
      ? [
          `Recruit ${name}? Or murder?`,
          `${name} — recruit or cut?`,
          `I'm leaning murder on ${name}. Objections?`,
        ]
      : [
          `${name} feels like the threat. Murder?`,
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
          text: `At the table, keep heat on ${tableName(suspect)}. Don't overplay it.`,
        };
      }
    }
    if (Math.random() > p.talkativeness) return { type: "noop" };

    // Prefer reacting to someone who actually spoke
    const speakerLiving = speakers
      .map((name) => others.find((o) => tableName(o) === name))
      .filter(Boolean) as Player[];
    const pool = speakerLiving.length ? speakerLiving : others;
    const suspect = pool[Math.floor(Math.random() * pool.length)];
    if (!suspect) return { type: "noop" };
    const suspectName = tableName(suspect);
    const soft = p.aggression < 0.5;

    const lines = castleQuiet
      ? soft
        ? [
            `${suspectName}, what's your read so far?`,
            `Anyone watching ${suspectName} yet?`,
          ]
        : [
            `${suspectName} — say something. Silence is loud.`,
            `Who's looking at ${suspectName}?`,
          ]
      : soft
        ? [
            `${suspectName}, can you clarify what you just said?`,
            `I'm stuck on ${suspectName}'s last line — say more.`,
          ]
        : [
            `${suspectName}, that last comment doesn't sit right. Explain.`,
            `Who else caught what ${suspectName} just said?`,
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
        text: pick
          ? `Turret time. I want ${tableName(pick)}. Agree?`
          : `Who are we taking tonight?`,
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
  const character = getCharacter(player.characterId);
  if (character) {
    if (player.role === "traitor") {
      return `TRAITOR goals: survive, look Faithful, eliminate threats, coordinate in Conclave.
Traitor play as ${character.label}: ${character.traitorPlay}
Never admit you are a Traitor. Never expose Conclave plans in Castle chat.
Social bluffs OK. Invented events/quotes/missions are NOT.`;
    }
    return `FAITHFUL goals: find Traitors using public state + Castle chat.
Faithful play as ${character.label}: ${character.faithfulPlay}
Build doubt only from real lines or public events. Prefer questions if unsure.`;
  }

  const p =
    PERSONALITIES[player.personalityId ?? "analytical"] ?? PERSONALITIES.analytical!;
  if (player.role === "traitor") {
    return `TRAITOR goals: survive, look Faithful, eliminate threats, coordinate in Conclave.
Traitor play for your personality: ${p.traitorPlay}
Never admit you are a Traitor. Never expose Conclave plans in Castle chat.
Social bluffs OK. Invented events/quotes/missions are NOT.`;
  }
  return `FAITHFUL goals: find Traitors using public state + Castle chat.
Faithful play for your personality: ${p.faithfulPlay}
Build doubt only from real lines or public events. Prefer questions if unsure.`;
}

function voiceBlock(player: Player): string {
  if (player.characterId) return characterPromptBlock(player.characterId);
  return personalityPromptBlock(player.personalityId);
}

function buildPrompt(
  state: GameState,
  player: Player,
  opts: { preferConclave?: boolean } = {},
): string {
  const castle = castleTranscript(state.castleChat, 24);
  const recentConclave =
    player.role === "traitor"
      ? state.conclaveChat
          .slice(-10)
          .map((m, i) => `#C${i + 1} ${m.playerName}: ${m.text}`)
          .join("\n") || "(no Conclave messages yet)"
      : "(hidden — you are not a Traitor)";

  const fellowTraitors =
    player.role === "traitor"
      ? living(state)
          .filter((p) => p.role === "traitor" && p.id !== player.id)
          .map((p) => tableName(p))
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

  const shieldSelf =
    player.hasShield ? "You personally hold a Shield (secret to others)." : "You do not hold a Shield.";

  const persuasionGuide = castle.empty
    ? `Castle is empty. You may ONLY: ask a living player a question, note the morning note, or noop. Do not invent prior conversation.`
    : `Persuasion from MEMORY (required when casting doubt):
- Cite a Castle line by number, e.g. "On #3 you said…" or paraphrase that line only.
- Or cite a PUBLIC STATE / log fact (banishment, morning note, listed votes).
- plant_doubt / evidence / pressure must attach to a real #line or public fact.
- Do not invent contradictions that are not in the transcript.`;

  return `You are ${tableName(player)} in AI Traitors.
Voice/style only if Pro character — you are at this castle table, not living the celebrity's real life.

${voiceBlock(player)}
${rolePlaybook(player)}

=== KNOWN PUBLIC STATE (authoritative — memorize this) ===
${publicEventMemory(state)}
${voteMemory(state)}
Recruit available tonight: ${state.recruitEligible ? "yes" : "no"}
${shieldSelf}
${player.role === "traitor" ? `PRIVATE (Traitors only): Fellow Traitors = ${fellowTraitors}` : "PRIVATE: you do not know who the Traitors are."}

=== UNKNOWN (never claim these as fact) ===
- Who murdered whom beyond the morning note
- Other players' Shields
- Secret deals, private chats, missions, clues, letters, overheard night sounds
- Votes not listed above
- Anything not in Castle transcript or public state

=== CASTLE TRANSCRIPT (public memory — your evidence base) ===
Speakers so far: ${castle.speakers.join(", ") || "none"}
${castle.block}

=== CONCLAVE ===
${recentConclave}
${conclaveForce}${nightHint}

${persuasionGuide}

Reply with ONLY compact JSON (no markdown):
{"type":"chat","channel":"castle"|"conclave","text":"..."}
{"type":"vote","targetId":"<id>"}
{"type":"finale","choice":"end"|"banish"}
{"type":"night","mode":"murder"|"recruit","targetId":"<id>"}
{"type":"noop"}

Living player ids: ${living(state)
    .map((p) => `${tableName(p)}=${p.id}`)
    .join(", ")}

Rules:
- Faithful never use channel conclave.
- Traitors: Conclave to plan; Castle performs as Faithful — never leak Conclave.
- Chat under 160 characters. No emoji.
- During discussion prefer chat or noop (not vote).
- During voting/finale_vote you MUST vote if alive.
- Stay in voice.`;
}

function chatLooksHallucinated(text: string): boolean {
  return FORBIDDEN_CHAT.test(text);
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
      temperature: 0.55,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Social-deduction contestant. Your memory is ONLY the state block and numbered Castle/Conclave lines in the user message. Persuade by citing those. Never invent events, quotes, or evidence. Prefer questions if the transcript is thin. Output one JSON object only.",
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
    if (parsed.type === "chat" && chatLooksHallucinated(parsed.text)) {
      return heuristicDecision(state, player, opts);
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
    const pa = voiceStats(a).talkativeness;
    const pb = voiceStats(b).talkativeness;
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
