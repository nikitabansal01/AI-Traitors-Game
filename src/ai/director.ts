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
  | { type: "angel_shield"; targetId: string }
  | { type: "noop" };

const FORBIDDEN_CHAT =
  /\b(i saw|i heard|overheard|mission|sabotage|clue|letter|turret door|in your room|last night i|we had a deal|you promised|secret meeting)\b/i;

const CHAT_MAX_CHARS = 200;

type CastleLine = {
  num: number;
  playerId: string;
  playerName: string;
  text: string;
  alive: boolean;
};

type EvidenceHook = {
  lineNum: number;
  speaker: string;
  quote: string;
  suspectName: string;
  elimFact: string | null;
};

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

function roleWord(role: Player["role"]): string {
  if (role === "traitor") return "Traitor";
  if (role === "angel") return "Angel";
  if (role === "faithful") return "Faithful";
  return "unknown";
}

function clipQuote(text: string, max = 42): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Numbered Castle lines the model may cite as evidence */
function castleTranscript(
  state: GameState,
  messages: ChatMessage[],
  limit = 28,
): {
  block: string;
  speakers: string[];
  empty: boolean;
  lines: CastleLine[];
} {
  const slice = messages.slice(-limit);
  if (!slice.length) {
    return { block: "(no Castle messages yet)", speakers: [], empty: true, lines: [] };
  }

  const byId = new Map(state.players.map((p) => [p.id, p]));
  const livingNames = new Set(living(state).map((p) => tableName(p)));
  const lines: CastleLine[] = slice.map((m, i) => {
    const author = byId.get(m.playerId);
    const name = author ? tableName(author) : m.playerName;
    const alive = author ? author.alive : livingNames.has(m.playerName);
    return {
      num: i + 1,
      playerId: m.playerId,
      playerName: name,
      text: m.text,
      alive,
    };
  });

  const speakers = [
    ...new Set(lines.filter((l) => l.alive).map((l) => l.playerName)),
  ];

  const block = lines
    .map((l) => {
      const tag = l.alive ? "" : " [GONE — eliminated]";
      return `#${l.num} ${l.playerName}${tag}: ${l.text}`;
    })
    .join("\n");
  return { block, speakers, empty: false, lines };
}

/** Chronological elimination sequence with role reveals — core persuasion memory */
function eliminationTimeline(state: GameState): string {
  const byName = new Map(
    state.players.map((p) => [p.name.toLowerCase(), p]),
  );
  const events: string[] = [];
  let step = 0;

  for (const entry of state.log.filter((l) => l.public)) {
    const banished = entry.text.match(/^(.+?) was banished\. They were a (.+)\.?$/i);
    if (banished) {
      step += 1;
      const name = banished[1]!;
      const role = banished[2]!;
      const p = byName.get(name.toLowerCase());
      const label = p ? tableName(p) : name;
      events.push(
        `${step}. BANISH ${label} → revealed ${role}. (Wrong banish hurts Faithfuls; correct Traitor banish is progress.)`,
      );
      continue;
    }
    const murdered = entry.text.match(/^(.+?) was murdered\.?$/i);
    if (murdered) {
      step += 1;
      const name = murdered[1]!;
      const p = byName.get(name.toLowerCase());
      const label = p ? tableName(p) : name;
      events.push(
        `${step}. MURDER ${label} → role hidden. Traitors chose this kill; ask who pushed heat off themselves beforehand.`,
      );
      continue;
    }
    const shield = entry.text.match(/^(.+?)'s Shield blocked the murder!?$/i);
    if (shield) {
      step += 1;
      const name = shield[1]!;
      const p = byName.get(name.toLowerCase());
      const label = p ? tableName(p) : name;
      events.push(
        `${step}. SHIELD saved ${label}. Traitors wanted them dead — that is a real clue about tonight's danger.`,
      );
      continue;
    }
    if (/turned|recruited|Trust less/i.test(entry.text)) {
      step += 1;
      events.push(`${step}. PUBLIC: ${entry.text}`);
    }
  }

  if (!events.length) {
    return "ELIMINATION SEQUENCE: none yet — no banish/murder history to cite.";
  }

  const livingCount = living(state).length;
  const banishedTraitors = state.banishedIds.filter((id) => {
    const p = state.players.find((x) => x.id === id);
    return p?.role === "traitor";
  }).length;
  const banishedGood = state.banishedIds.length - banishedTraitors;

  return [
    "ELIMINATION SEQUENCE (cite these steps when persuading):",
    ...events,
    `Scoreboard: ${banishedTraitors} Traitor(s) correctly banished, ${banishedGood} good player(s) wrongly banished, ${state.murderedIds.length} murdered, ${livingCount} still alive.`,
  ].join("\n");
}

/** Fresh each AI turn — who is still in play vs gone */
function eliminationRoster(state: GameState): string {
  const alive = living(state);
  const dead = state.players.filter((p) => !p.alive);
  const lines: string[] = [
    `STILL AT THE TABLE (${alive.length}): ${
      alive.map((p) => tableName(p)).join(", ") || "none"
    }`,
  ];

  if (!dead.length) {
    lines.push("ELIMINATED: none yet");
  } else {
    lines.push(
      "ELIMINATED (GONE from the game — do NOT address, vote, recruit, or ask them questions):",
    );
    for (const p of dead) {
      if (state.banishedIds.includes(p.id)) {
        lines.push(`- ${tableName(p)} — BANISHED (revealed ${roleWord(p.role)})`);
      } else {
        lines.push(`- ${tableName(p)} — MURDERED (not at breakfast; role unknown)`);
      }
    }
  }

  lines.push(
    "This roster is current for THIS turn. Ignore any older chat that treats eliminated players as present.",
  );
  return lines.join("\n");
}

/** Who talked, who stayed quiet, who named whom — table dynamics for reasoning */
function tableDynamics(state: GameState, lines: CastleLine[]): string {
  const alive = living(state);
  if (!alive.length) return "TABLE DYNAMICS: n/a";

  const speakCount = new Map<string, number>();
  for (const p of alive) speakCount.set(tableName(p), 0);
  for (const l of lines) {
    if (!l.alive) continue;
    if (speakCount.has(l.playerName)) {
      speakCount.set(l.playerName, (speakCount.get(l.playerName) ?? 0) + 1);
    }
  }

  const named = new Map<string, Set<string>>();
  for (const l of lines) {
    if (!l.alive) continue;
    const lower = l.text.toLowerCase();
    for (const other of alive) {
      const label = tableName(other);
      if (label === l.playerName) continue;
      if (label.length < 3) continue;
      if (lower.includes(label.toLowerCase())) {
        if (!named.has(l.playerName)) named.set(l.playerName, new Set());
        named.get(l.playerName)!.add(label);
      }
    }
  }

  const quiet = alive
    .map((p) => tableName(p))
    .filter((n) => (speakCount.get(n) ?? 0) === 0);
  const vocal = [...speakCount.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([n, c]) => `${n}(${c})`);

  const heat: string[] = [];
  for (const [speaker, targets] of named) {
    if (targets.size) heat.push(`${speaker}→${[...targets].join("/")}`);
  }

  const out = [
    "TABLE DYNAMICS (from Castle transcript — use as soft evidence, not proof):",
    `Lines spoken: ${[...speakCount.entries()].map(([n, c]) => `${n}:${c}`).join(", ") || "none"}`,
  ];
  if (quiet.length) out.push(`Silent so far: ${quiet.join(", ")}`);
  if (vocal.length) out.push(`Most vocal: ${vocal.join(", ")}`);
  if (heat.length) out.push(`Name-drops in chat: ${heat.slice(0, 8).join("; ")}`);

  const lastBanished = state.lastBanishedId
    ? state.players.find((p) => p.id === state.lastBanishedId)
    : null;
  if (lastBanished) {
    out.push(
      `Last reveal: ${tableName(lastBanished)} was ${roleWord(lastBanished.role)}. Ask who pushed that banish and whether it helped Traitors.`,
    );
  }
  return out.join("\n");
}

/** Compact persuasion brief injected into every LLM turn */
function evidenceBrief(state: GameState, lines: CastleLine[]): string {
  const parts = [
    eliminationTimeline(state),
    tableDynamics(state, lines),
  ];

  const citeable = lines.filter((l) => l.alive).slice(-6);
  if (citeable.length) {
    parts.push("READY-TO-CITE LINES (paraphrase or reference by #):");
    for (const l of citeable) {
      parts.push(`- #${l.num} ${l.playerName}: "${clipQuote(l.text, 56)}"`);
    }
  }

  parts.push(
    "REASONING PATTERN for Castle chat: CLAIM about a LIVING player → cite #line and/or elimination step → one sentence why it matters for today's vote. Do not invent facts.",
  );
  return parts.join("\n");
}

function latestElimFact(state: GameState): string | null {
  const lastBanished = state.lastBanishedId
    ? state.players.find((p) => p.id === state.lastBanishedId)
    : null;
  if (lastBanished) {
    return `${tableName(lastBanished)} was banished as ${roleWord(lastBanished.role)}`;
  }
  if (state.lastMurderBlocked) {
    const shielded = state.players.find((p) => p.id === state.lastMurderedId);
    if (shielded) return `Shield blocked murder on ${tableName(shielded)}`;
  }
  const lastMurder = state.lastMurderedId
    ? state.players.find((p) => p.id === state.lastMurderedId && !p.alive)
    : null;
  if (lastMurder) return `${tableName(lastMurder)} was murdered`;
  return null;
}

/** Pick a real Castle line + optional elim fact for heuristic persuasion */
function pickEvidenceHook(
  state: GameState,
  self: Player,
  preferSuspect?: Player | null,
): EvidenceHook | null {
  const { lines } = castleTranscript(state, state.castleChat, 28);
  const livingOthers = living(state).filter((p) => p.id !== self.id);
  if (!livingOthers.length) return null;

  const usable = lines.filter(
    (l) => l.alive && l.playerId !== self.id && l.text.trim().length > 8,
  );
  if (!usable.length) return null;

  const elimFact = latestElimFact(state);
  const preferName = preferSuspect ? tableName(preferSuspect) : null;

  // Prefer a line that mentions the preferred suspect, else a recent line from them, else any recent
  let picked =
    (preferName &&
      usable
        .slice()
        .reverse()
        .find((l) => l.text.toLowerCase().includes(preferName.toLowerCase()))) ||
    (preferName &&
      usable
        .slice()
        .reverse()
        .find((l) => l.playerName === preferName)) ||
    usable[usable.length - 1]!;

  let suspect =
    preferSuspect && preferSuspect.alive
      ? preferSuspect
      : livingOthers.find((p) => tableName(p) === picked.playerName) ??
        livingOthers[Math.floor(Math.random() * livingOthers.length)]!;

  // If the cited speaker is the suspect, heat is on them for what they said; else for being named
  if (picked.playerName !== tableName(suspect)) {
    const named = livingOthers.find((p) =>
      picked.text.toLowerCase().includes(tableName(p).toLowerCase()),
    );
    if (named) suspect = named;
  }

  return {
    lineNum: picked.num,
    speaker: picked.playerName,
    quote: clipQuote(picked.text, 36),
    suspectName: tableName(suspect),
    elimFact,
  };
}

function publicEventMemory(state: GameState, lines: CastleLine[]): string {
  const out: string[] = [];
  out.push(`Day ${state.day} | Phase: ${state.phase}`);
  out.push(eliminationRoster(state));
  out.push(evidenceBrief(state, lines));
  out.push(`Morning note: ${state.morningMessage ?? "none"}`);
  if (state.lastMurderBlocked) {
    const shielded = state.players.find((p) => p.id === state.lastMurderedId);
    out.push(
      `Public: a Shield blocked murder${shielded ? ` on ${tableName(shielded)}` : ""}.`,
    );
  } else if (state.lastMurderedId && state.phase !== "night") {
    const victim = state.players.find((p) => p.id === state.lastMurderedId);
    if (victim && !victim.alive) {
      out.push(`Most recent murder: ${tableName(victim)} is gone.`);
    }
  }
  const publicLog = state.log
    .filter((l) => l.public)
    .slice(-12)
    .map((l) => `- ${l.text}`);
  if (publicLog.length) {
    out.push("Public log:");
    out.push(...publicLog);
  }
  return out.join("\n");
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
  const { speakers, empty: castleQuiet } = castleTranscript(state, state.castleChat);

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
        const hook = pickEvidenceHook(state, player, suspect);
        return {
          type: "chat",
          channel: "conclave",
          text: hook
            ? `Push ${tableName(suspect)} using #${hook.lineNum} ("${hook.quote}")${
                hook.elimFact ? ` + ${hook.elimFact}` : ""
              }. Stay calm.`
            : `At the table, keep heat on ${tableName(suspect)}. Don't overplay it.`,
        };
      }
    }
    if (Math.random() > p.talkativeness) return { type: "noop" };

    // Prefer reacting to someone who actually spoke
    const speakerLiving = speakers
      .map((name) => others.find((o) => tableName(o) === name))
      .filter(Boolean) as Player[];
    let pool = speakerLiving.length ? speakerLiving : others;
    if (player.role === "traitor") {
      const faithfulPool = pool.filter((x) => x.role !== "traitor");
      if (faithfulPool.length) pool = faithfulPool;
    }
    const suspect = pool[Math.floor(Math.random() * pool.length)];
    if (!suspect) return { type: "noop" };
    const suspectName = tableName(suspect);
    const soft = p.aggression < 0.5;
    const hook = pickEvidenceHook(state, player, suspect);
    const elim = latestElimFact(state);

    let text: string;
    if (castleQuiet) {
      text = elim
        ? soft
          ? `${suspectName}, after ${elim} — who do you trust now, and why?`
          : `${suspectName}, ${elim}. Your read? Silence after that is weird.`
        : soft
          ? `${suspectName}, what's your read so far?`
          : `${suspectName} — say something. Silence is loud.`;
    } else if (hook) {
      text = soft
        ? elim
          ? `On #${hook.lineNum} ${hook.speaker} said "${hook.quote}". With ${elim}, I'm watching ${suspectName} — clear that up.`
          : `On #${hook.lineNum} ${hook.speaker} said "${hook.quote}". ${suspectName}, how does that fit?`
        : elim
          ? `#${hook.lineNum} ("${hook.quote}") + ${elim} → heat on ${suspectName}. Explain or we vote you.`
          : `#${hook.lineNum} ${hook.speaker}: "${hook.quote}". That puts ${suspectName} in a bad light — answer it.`;
    } else {
      text = soft
        ? `${suspectName}, can you clarify what you just said?`
        : `${suspectName}, that last comment doesn't sit right. Explain.`;
    }

    return {
      type: "chat",
      channel: "castle",
      text: text.slice(0, CHAT_MAX_CHARS),
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

  if (state.phase === "night" && player.role === "angel") {
    if (state.angelShieldTargetId) return { type: "noop" };
    const alive = living(state);
    if (!alive.length) return { type: "noop" };
    const target =
      Math.random() < 0.25
        ? player
        : alive[Math.floor(Math.random() * alive.length)]!;
    return { type: "angel_shield", targetId: target.id };
  }

  if (state.phase === "night" && player.role === "traitor") {
    if (!state.nightTargetId && state.conclaveChat.slice(-3).length < 2) {
      const targets = others.filter((x) => x.role !== "traitor");
      const pick = targets[Math.floor(Math.random() * Math.max(targets.length, 1))];
      return {
        type: "chat",
        channel: "conclave",
        text: pick
          ? `Turret time. I want ${tableName(pick)}. Agree?`
          : `Who are we taking tonight?`,
      };
    }
    const targets = others.filter((x) => x.role !== "traitor");
    if (!targets.length) return { type: "noop" };
    const unshielded = targets.filter((x) => !x.hasShield);
    const pool = unshielded.length && Math.random() < 0.7 ? unshielded : targets;
    const target = pool[Math.floor(Math.random() * pool.length)]!;
    const mode =
      state.recruitEligible && Math.random() < 0.45 ? "recruit" : "murder";
    return { type: "night", mode, targetId: target.id };
  }

  return { type: "noop" };
}

function rolePlaybook(player: Player): string {
  const evidenceMandate =
    "Persuade using real Castle #lines + elimination sequence (who was banished/revealed, who was murdered, shield saves). Connect facts into a short causal story. No invented evidence.";
  const character = getCharacter(player.characterId);
  if (character) {
    if (player.role === "traitor") {
      return `TRAITOR goals: survive, look Faithful, eliminate threats, coordinate in Conclave.
Traitor play as ${character.label}: ${character.traitorPlay}
Never admit you are a Traitor. Never expose Conclave plans in Castle chat.
${evidenceMandate} Social bluffs OK; invented events/quotes/missions are NOT.`;
    }
    if (player.role === "angel") {
      return `ANGEL goals: look like a Faithful by day; at night guess who Traitors will murder and Shield them (self allowed).
Angel play as ${character.label}: ${character.faithfulPlay}
Never announce you are the Angel in Castle. Win with the Faithfuls.
${evidenceMandate}`;
    }
    return `FAITHFUL goals: find Traitors using public state + Castle chat + elimination logic.
Faithful play as ${character.label}: ${character.faithfulPlay}
${evidenceMandate} Prefer pointed questions if the evidence is thin.`;
  }

  const p =
    PERSONALITIES[player.personalityId ?? "analytical"] ?? PERSONALITIES.analytical!;
  if (player.role === "traitor") {
    return `TRAITOR goals: survive, look Faithful, eliminate threats, coordinate in Conclave.
Traitor play for your personality: ${p.traitorPlay}
Never admit you are a Traitor. Never expose Conclave plans in Castle chat.
${evidenceMandate} Social bluffs OK; invented events/quotes/missions are NOT.`;
  }
  if (player.role === "angel") {
    return `ANGEL goals: look like a Faithful by day; at night guess who Traitors will murder and Shield them (self allowed).
Angel play for your personality: ${p.faithfulPlay}
Never announce you are the Angel in Castle. Win with the Faithfuls.
${evidenceMandate}`;
  }
  return `FAITHFUL goals: find Traitors using public state + Castle chat + elimination logic.
Faithful play for your personality: ${p.faithfulPlay}
${evidenceMandate} Prefer pointed questions if the evidence is thin.`;
}

function voiceBlock(player: Player): string {
  if (player.characterId) return characterPromptBlock(player.characterId);
  return personalityPromptBlock(player.personalityId);
}

function persuasionGuideFor(
  state: GameState,
  player: Player,
  castleEmpty: boolean,
): string {
  const tactics = voiceStats(player).tactics?.join(", ") ?? "evidence, plant_doubt";
  if (castleEmpty && !state.banishedIds.length && !state.murderedIds.length) {
    return `Castle is empty and no eliminations yet. You may ONLY: ask a living player a question, note the morning note, or noop. Do not invent prior conversation.`;
  }

  return `PERSUASION & LOGIC (required for Castle chat that names or pressures someone):
Your preferred tactics: ${tactics}.

Build believable arguments from REAL evidence only:
1) CLAIM — one living player you want others to distrust / defend / question.
2) EVIDENCE — at least one of:
   - Numbered Castle line ("On #4 X said …" or accurate paraphrase of that line)
   - Elimination step ("After we banished Y as Faithful…" / "Z was murdered…")
   - Table dynamic (who was silent, who name-dropped whom, who pushed the last wrong banish)
   - Morning note / public log / listed votes
3) WHY IT MATTERS — one tight link: how that evidence makes your claim more likely for today's vote.

Good patterns:
- "On #5 Cassian said X. Combined with Y being murdered after Cassian redirected heat, I'm on Cassian."
- "We banished A as Faithful — that mistake helped Traitors. Who pushed hardest for A?"
- "Shield saved B last night. Who insisted B was safe right before that?"

Hard rules:
- Never invent quotes, private deals, night sounds, or facts not in transcript/public state.
- Never address or persuade about ELIMINATED players as if they can answer.
- Traitors: argue like a Faithful using real public evidence; never leak Conclave.
- If evidence is thin, ask a pointed question that forces someone to explain a real #line or elim step — do not fabricate certainty.`;
}

function buildPrompt(
  state: GameState,
  player: Player,
  opts: { preferConclave?: boolean } = {},
): string {
  const castle = castleTranscript(state, state.castleChat, 28);
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
      ? `\nREQUIRED THIS TURN: reply ONLY with {"type":"chat","channel":"conclave","text":"..."}\nTalk to fellow Traitors (${fellowTraitors}). Propose or react to a murder/recruit plan using who is loud/quiet at the table. Do NOT use castle.`
      : "";

  const nightHint =
    state.phase === "night" && player.role === "traitor" && !opts.preferConclave
      ? `\nNight: If Conclave has not agreed yet, chat in conclave. If a name is already clear in Conclave, output a night action.`
      : state.phase === "night" && player.role === "angel"
        ? `\nNight (Angel): Guess who Traitors will murder. Output {"type":"angel_shield","targetId":"<id>"} — may be yourself. Do not chat about being the Angel.`
        : "";

  const shieldSelf =
    player.hasShield ? "You personally hold a Shield (secret to others)." : "You do not hold a Shield.";
  const angelPick = state.angelShieldTargetId
    ? state.players.find((p) => p.id === state.angelShieldTargetId)
    : null;
  const angelPrivate =
    player.role === "angel"
      ? `PRIVATE (Angel): You alone choose tonight's Shield. Current pick: ${
          angelPick ? tableName(angelPick) : "none yet"
        }.`
      : "";

  const discussionFocus =
    state.phase === "discussion" || state.phase === "morning"
      ? `\nTHIS PHASE: Prefer persuasive Castle chat (or noop). Lead with evidence. Aim to move the table's read using the elimination sequence + Castle lines.`
      : "";

  return `You are ${tableName(player)} in AI Traitors.
Voice/style only if Pro character — you are at this castle table, not living the celebrity's real life.

${voiceBlock(player)}
${rolePlaybook(player)}

=== KNOWN PUBLIC STATE (authoritative — memorize this) ===
${publicEventMemory(state, castle.lines)}
${voteMemory(state)}
Recruit available tonight: ${state.recruitEligible ? "yes" : "no"}
${shieldSelf}
${
    player.role === "traitor"
      ? `PRIVATE (Traitors only): Fellow Traitors = ${fellowTraitors}`
      : player.role === "angel"
        ? angelPrivate
        : "PRIVATE: you do not know who the Traitors or Angel are."
  }

=== UNKNOWN (never claim these as fact) ===
- Murderer identities beyond public reveals
- Other players' Shields (unless you are Angel and chose them)
- Secret deals, private chats, missions, clues, letters, overheard night sounds
- Votes not listed above
- Anything not in Castle transcript or public state

=== CASTLE TRANSCRIPT (public memory — your evidence base) ===
Living speakers only (for who can still answer): ${castle.speakers.join(", ") || "none"}
${castle.block}

=== CONCLAVE ===
${recentConclave}
${conclaveForce}${nightHint}${discussionFocus}

${persuasionGuideFor(state, player, castle.empty)}

Reply with ONLY compact JSON (no markdown):
{"type":"chat","channel":"castle"|"conclave","text":"..."}
{"type":"vote","targetId":"<id>"}
{"type":"finale","choice":"end"|"banish"}
{"type":"night","mode":"murder"|"recruit","targetId":"<id>"}
{"type":"angel_shield","targetId":"<id>"}
{"type":"noop"}

Living player ids (ONLY valid vote/night/chat targets): ${living(state)
    .map((p) => `${tableName(p)}=${p.id}`)
    .join(", ")}

Rules:
- Faithful and Angel never use channel conclave.
- Angel: do not admit Angel role in Castle; at night prefer angel_shield.
- Traitors: Conclave to plan; Castle performs as Faithful — never leak Conclave.
- Chat under ${CHAT_MAX_CHARS} characters. No emoji.
- During discussion prefer evidence-based chat or noop (not vote).
- During voting/finale_vote you MUST vote if alive — target MUST be a living id above.
- Never speak to or vote for anyone marked ELIMINATED / [GONE].
- Stay in voice.`;
}

function chatLooksHallucinated(text: string): boolean {
  return FORBIDDEN_CHAT.test(text);
}

function chatAddressesGone(state: GameState, text: string): boolean {
  const dead = state.players.filter((p) => !p.alive);
  const lower = text.toLowerCase();
  return dead.some((p) => {
    const label = tableName(p).toLowerCase();
    if (label.length < 3) return false;
    // Direct address patterns — "Name," / "Name —" / "Name?"
    return (
      lower.includes(`${label},`) ||
      lower.includes(`${label} —`) ||
      lower.includes(`${label} -`) ||
      lower.includes(`${label}?`) ||
      lower.startsWith(`${label} `)
    );
  });
}

/** Accusatory / pressure chat should ground in transcript #lines or elim facts */
function chatHasGrounding(state: GameState, text: string): boolean {
  const lower = text.toLowerCase();
  if (/#\d+/.test(text)) return true;
  if (
    /\b(banish|banished|murder|murdered|shield|morning|vote|voted|revealed|faithful|traitor|silent|silence)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  // Mentions a quote marker / "you said"
  if (/\b(you said|said "|on #|line #)\b/i.test(text)) return true;

  const { lines } = castleTranscript(state, state.castleChat, 28);
  for (const l of lines.slice(-10)) {
    const snippet = clipQuote(l.text, 18).toLowerCase().replace(/…$/, "");
    if (snippet.length >= 8 && lower.includes(snippet.slice(0, 12))) return true;
  }

  // Soft questions without a hard accuse are fine
  if (text.includes("?") && !/\b(traitor|liar|guilty|vote you|throwing)\b/i.test(text)) {
    return true;
  }
  return false;
}

function chatLooksLikeUngroundedAccusation(state: GameState, text: string): boolean {
  const pressure =
    /\b(traitor|liar|guilty|suspicious|suspect|watching you|vote|heat on|doesn't sit|explain)\b/i.test(
      text,
    );
  if (!pressure) return false;
  // Need some evidence available; otherwise questions are OK
  const hasHistory =
    state.castleChat.length > 0 ||
    state.banishedIds.length > 0 ||
    state.murderedIds.length > 0 ||
    Boolean(state.morningMessage);
  if (!hasHistory) return false;
  return !chatHasGrounding(state, text);
}

function sanitizeDecision(
  state: GameState,
  player: Player,
  decision: AiDecision,
  opts: { preferConclave?: boolean },
): AiDecision {
  const aliveIds = new Set(living(state).map((p) => p.id));
  if (!player.alive) return { type: "noop" };

  if (decision.type === "vote" || decision.type === "night") {
    if (!aliveIds.has(decision.targetId) || decision.targetId === player.id) {
      return heuristicDecision(state, player, opts);
    }
  }
  if (decision.type === "angel_shield") {
    if (!aliveIds.has(decision.targetId) || player.role !== "angel") {
      return heuristicDecision(state, player, opts);
    }
  }
  if (decision.type === "chat") {
    const text = decision.text?.slice(0, CHAT_MAX_CHARS) ?? "";
    decision = { ...decision, text };
    if (
      chatLooksHallucinated(text) ||
      chatAddressesGone(state, text) ||
      (decision.channel === "castle" && chatLooksLikeUngroundedAccusation(state, text))
    ) {
      return heuristicDecision(state, player, opts);
    }
  }
  return decision;
}

export async function decideForAi(
  state: GameState,
  player: Player,
  apiKey?: string,
  opts: { preferConclave?: boolean } = {},
): Promise<AiDecision> {
  if (!player.alive) return { type: "noop" };
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) return heuristicDecision(state, player, opts);

  try {
    const client = new OpenAI({ apiKey: key });
    const discussing =
      state.phase === "discussion" || state.phase === "morning";
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: discussing ? 0.45 : 0.55,
      max_tokens: discussing ? 260 : 200,
      messages: [
        {
          role: "system",
          content:
            "Social-deduction contestant with strong logical persuasion. Each turn: (1) re-read STILL AT THE TABLE / ELIMINATED and the ELIMINATION SEQUENCE — authoritative; (2) ground Castle chat in CLAIM → real #line or elim step → why it matters; (3) only living players may be addressed, voted, or night-targeted. Never invent quotes or events. Prefer sharp evidence-based arguments over vague vibes. Output one JSON object only.",
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
    return sanitizeDecision(state, player, parsed, opts);
  } catch {
    return heuristicDecision(state, player, opts);
  }
}

export function pickAiActors(state: GameState, limit = 2): Player[] {
  const ais = living(state).filter((p) => p.kind === "ai");
  if (state.phase === "night") {
    const traitors = ais.filter((p) => p.role === "traitor");
    const angel = ais.find((p) => p.role === "angel" && !state.angelShieldTargetId);
    const nightActors = angel ? [angel, ...traitors] : traitors;
    return nightActors.slice(0, Math.max(limit, angel ? 2 : 1));
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
