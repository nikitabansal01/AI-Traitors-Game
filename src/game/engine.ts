import { nanoid } from "nanoid";
import { attachHostBeat } from "./host";
import {
  DEFAULT_CONFIG,
  type ChatChannel,
  type ChatMessage,
  type ClientGameView,
  type GameConfig,
  type GameLogEntry,
  type GameState,
  type Player,
  type Role,
} from "./types";

const AI_NAMES = [
  "Marlowe",
  "Vesper",
  "Cassian",
  "Nyra",
  "Orin",
  "Sable",
  "Quill",
  "Rowan",
  "Ivy",
  "Theo",
  "Liora",
  "Ash",
];

export function createLobby(roomCode: string, config: Partial<GameConfig> = {}): GameState {
  return {
    roomCode: roomCode.toUpperCase(),
    hostId: null,
    config: { ...DEFAULT_CONFIG, ...config },
    phase: "lobby",
    day: 0,
    players: [],
    votes: {},
    nightTargetId: null,
    nightMode: null,
    recruitEligible: false,
    lastBanishedRole: null,
    lastBanishedId: null,
    banishedIds: [],
    lastMurderedId: null,
    lastMurderBlocked: false,
    shieldHolderId: null,
    morningMessage: null,
    castleChat: [],
    conclaveChat: [],
    log: [],
    phaseEndsAt: null,
    finaleChoices: {},
    winners: null,
    winnerIds: [],
    started: false,
    hostBeat: null,
  };
}

function log(state: GameState, text: string, isPublic = true): void {
  const entry: GameLogEntry = {
    id: nanoid(8),
    text,
    at: Date.now(),
    public: isPublic,
  };
  state.log = [...state.log.slice(-80), entry];
}

function living(state: GameState): Player[] {
  return state.players.filter((p) => p.alive);
}

function livingTraitors(state: GameState): Player[] {
  return living(state).filter((p) => p.role === "traitor");
}

function livingFaithful(state: GameState): Player[] {
  return living(state).filter((p) => p.role === "faithful");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setPhase(state: GameState, phase: GameState["phase"], durationMs?: number): void {
  state.phase = phase;
  state.phaseEndsAt = durationMs != null ? Date.now() + durationMs : null;
  attachHostBeat(state);
}

export function claimSeat(
  state: GameState,
  playerId: string,
  name: string,
): { ok: true } | { ok: false; error: string } {
  if (state.started) return { ok: false, error: "Game already started" };
  const trimmed = name.trim().slice(0, 20);
  if (!trimmed) return { ok: false, error: "Name required" };

  const existing = state.players.find((p) => p.id === playerId);
  if (existing) {
    existing.name = trimmed;
    existing.connected = true;
    return { ok: true };
  }

  const humans = state.players.filter((p) => p.kind === "human");
  if (humans.length >= state.config.castSize) {
    return { ok: false, error: "Lobby is full" };
  }

  const player: Player = {
    id: playerId,
    name: trimmed,
    kind: "human",
    role: null,
    alive: true,
    hasShield: false,
    personalityId: null,
    connected: true,
  };
  state.players = [...state.players, player];
  if (!state.hostId) state.hostId = playerId;
  return { ok: true };
}

export function setCastSize(state: GameState, size: number, byPlayerId: string): { ok: boolean; error?: string } {
  if (state.started) return { ok: false, error: "Game already started" };
  if (byPlayerId !== state.hostId) return { ok: false, error: "Only host can change cast size" };
  const clamped = Math.min(16, Math.max(6, Math.floor(size)));
  state.config.castSize = clamped;
  state.config.traitorCount = clamped <= 8 ? 2 : 3;
  return { ok: true };
}

function fillAiSeats(state: GameState): void {
  const need = state.config.castSize - state.players.length;
  if (need <= 0) return;
  const used = new Set(state.players.map((p) => p.name.toLowerCase()));
  const names = shuffle(AI_NAMES).filter((n) => !used.has(n.toLowerCase()));
  const personalities = shuffle([
    "paranoid",
    "charming",
    "analytical",
    "volatile",
    "quiet",
    "bold",
    "loyal",
    "schemer",
  ]);

  for (let i = 0; i < need; i++) {
    state.players.push({
      id: `ai_${nanoid(8)}`,
      name: names[i] ?? `Agent${i + 1}`,
      kind: "ai",
      role: null,
      alive: true,
      hasShield: false,
      personalityId: personalities[i % personalities.length]!,
      connected: true,
    });
  }
}

function assignRoles(state: GameState): void {
  const ids = shuffle(state.players.map((p) => p.id));
  const traitorIds = new Set(ids.slice(0, state.config.traitorCount));
  state.players = state.players.map((p) => ({
    ...p,
    role: traitorIds.has(p.id) ? "traitor" : "faithful",
  }));
}

function grantMorningShield(state: GameState): void {
  // Clear previous unused shield
  for (const p of state.players) {
    if (p.hasShield) p.hasShield = false;
  }
  state.shieldHolderId = null;

  const candidates = livingFaithful(state);
  if (candidates.length === 0) return;
  // ~40% chance a shield appears each morning for P0 drama
  if (Math.random() > 0.4) return;
  const holder = candidates[Math.floor(Math.random() * candidates.length)]!;
  holder.hasShield = true;
  state.shieldHolderId = holder.id;
  log(state, `${holder.name} found a Shield.`, true);
}

export function startGame(
  state: GameState,
  byPlayerId: string,
): { ok: true } | { ok: false; error: string } {
  if (state.started) return { ok: false, error: "Already started" };
  if (byPlayerId !== state.hostId) return { ok: false, error: "Only host can start" };
  const humans = state.players.filter((p) => p.kind === "human");
  if (humans.length < 1) return { ok: false, error: "Need at least one human" };

  fillAiSeats(state);
  assignRoles(state);
  state.started = true;
  state.day = 1;
  state.castleChat = [];
  state.conclaveChat = [];
  log(state, "The game begins. Traitors have been chosen in secret.", true);

  // First night murder before day 1 breakfast — classic show flow
  // For simplicity P0: start at morning of day 1 with no murder yet, then discussion
  state.morningMessage = "Welcome to the castle. Trust no one.";
  grantMorningShield(state);
  setPhase(state, "discussion", state.config.discussionSeconds * 1000);
  return { ok: true };
}

export function addChat(
  state: GameState,
  playerId: string,
  channel: ChatChannel,
  text: string,
): { ok: true } | { ok: false; error: string } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Not in game" };
  if (!player.alive && state.phase !== "ended") {
    return { ok: false, error: "Eliminated players cannot chat" };
  }
  const trimmed = text.trim().slice(0, 280);
  if (!trimmed) return { ok: false, error: "Empty message" };

  if (channel === "conclave") {
    if (player.role !== "traitor") return { ok: false, error: "Conclave is for Traitors only" };
    if (!["night", "discussion", "voting", "finale_choice", "finale_vote", "morning"].includes(state.phase)) {
      // Allow conclave during active game phases
    }
  }

  if (channel === "castle" && !["discussion", "voting", "morning", "finale_choice", "finale_vote"].includes(state.phase) && state.phase !== "ended") {
    // Allow castle chat during daytime phases; night is quieter but still allow for humans waiting
  }

  const msg: ChatMessage = {
    id: nanoid(10),
    channel,
    playerId: player.id,
    playerName: player.name,
    text: trimmed,
    at: Date.now(),
  };

  if (channel === "castle") {
    state.castleChat = [...state.castleChat.slice(-100), msg];
  } else {
    state.conclaveChat = [...state.conclaveChat.slice(-100), msg];
  }
  return { ok: true };
}

export function castVote(
  state: GameState,
  playerId: string,
  targetId: string,
): { ok: true } | { ok: false; error: string } {
  if (state.phase !== "voting" && state.phase !== "finale_vote") {
    return { ok: false, error: "Not voting now" };
  }
  const voter = state.players.find((p) => p.id === playerId);
  if (!voter?.alive) return { ok: false, error: "Cannot vote" };
  const target = state.players.find((p) => p.id === targetId);
  if (!target?.alive) return { ok: false, error: "Invalid target" };
  if (targetId === playerId) return { ok: false, error: "Cannot vote yourself" };

  state.votes = { ...state.votes, [playerId]: targetId };
  return { ok: true };
}

export function setNightMode(
  state: GameState,
  playerId: string,
  mode: "murder" | "recruit",
): { ok: true } | { ok: false; error: string } {
  if (state.phase !== "night") return { ok: false, error: "Not night" };
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.alive || player.role !== "traitor") return { ok: false, error: "Traitors only" };
  if (mode === "recruit" && !state.recruitEligible) {
    return { ok: false, error: "Recruitment not available" };
  }
  state.nightMode = mode;
  state.nightTargetId = null;
  return { ok: true };
}

export function setNightTarget(
  state: GameState,
  playerId: string,
  targetId: string,
): { ok: true } | { ok: false; error: string } {
  if (state.phase !== "night") return { ok: false, error: "Not night" };
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.alive || player.role !== "traitor") return { ok: false, error: "Traitors only" };
  const target = state.players.find((p) => p.id === targetId);
  if (!target?.alive || target.role === "traitor") {
    return { ok: false, error: "Must target a living Faithful" };
  }
  if (!state.nightMode) state.nightMode = state.recruitEligible ? null : "murder";
  if (!state.nightMode) return { ok: false, error: "Choose murder or recruit first" };
  state.nightTargetId = targetId;
  return { ok: true };
}

function resolveBanishment(state: GameState): boolean {
  const alive = living(state);
  const tallies = new Map<string, number>();
  for (const voter of alive) {
    const target = state.votes[voter.id];
    if (!target) continue;
    tallies.set(target, (tallies.get(target) ?? 0) + 1);
  }

  let max = 0;
  let banishedId: string | null = null;
  let tie = false;
  for (const [id, count] of tallies) {
    if (count > max) {
      max = count;
      banishedId = id;
      tie = false;
    } else if (count === max && count > 0) {
      tie = true;
    }
  }

  state.votes = {};

  if (!banishedId || max === 0 || tie) {
    if (tie) {
      const tied = [...tallies.entries()].filter(([, c]) => c === max).map(([id]) => id);
      banishedId = tied[Math.floor(Math.random() * tied.length)] ?? null;
      log(state, "A tied vote — fate decides.", true);
    } else {
      log(state, "No one was banished.", true);
      state.lastBanishedId = null;
      state.lastBanishedRole = null;
      return false;
    }
  }

  const banished = state.players.find((p) => p.id === banishedId);
  if (!banished) return false;
  banished.alive = false;
  banished.hasShield = false;
  if (state.shieldHolderId === banished.id) state.shieldHolderId = null;
  state.lastBanishedId = banished.id;
  state.lastBanishedRole = banished.role;
  if (!state.banishedIds.includes(banished.id)) {
    state.banishedIds = [...state.banishedIds, banished.id];
  }
  log(
    state,
    `${banished.name} was banished. They were a ${banished.role === "traitor" ? "Traitor" : "Faithful"}.`,
    true,
  );

  if (banished.role === "traitor" && livingTraitors(state).length > 0) {
    state.recruitEligible = true;
  }

  return checkWinAfterElimination(state);
}

function checkWinAfterElimination(state: GameState): boolean {
  const traitors = livingTraitors(state);
  const faithful = livingFaithful(state);

  if (traitors.length === 0) {
    endGame(state, "faithful");
    return true;
  }
  if (faithful.length === 0) {
    endGame(state, "traitor");
    return true;
  }
  if (living(state).length <= 2) {
    // If any traitor remains among final 2, traitors win
    endGame(state, traitors.length > 0 ? "traitor" : "faithful");
    return true;
  }
  return false;
}

function endGame(state: GameState, winners: Role): void {
  state.winners = winners;
  state.winnerIds =
    winners === "traitor"
      ? livingTraitors(state).map((p) => p.id)
      : livingFaithful(state).map((p) => p.id);
  setPhase(state, "ended");
  log(
    state,
    winners === "traitor"
      ? `The Traitors steal the prize of $${state.config.prizePot.toLocaleString()}.`
      : `The Faithful share the prize of $${state.config.prizePot.toLocaleString()}.`,
    true,
  );
}

function resolveNight(state: GameState): boolean {
  const mode = state.nightMode ?? "murder";
  const targetId = state.nightTargetId;

  state.lastMurderedId = null;
  state.lastMurderBlocked = false;

  if (!targetId) {
    log(state, "The Traitors took no action tonight.", true);
    state.recruitEligible = false;
    state.nightMode = null;
    state.nightTargetId = null;
    return false;
  }

  const target = state.players.find((p) => p.id === targetId);
  if (!target?.alive) {
    state.nightMode = null;
    state.nightTargetId = null;
    return false;
  }

  if (mode === "recruit") {
    if (target.role === "faithful") {
      target.role = "traitor";
      log(state, `${target.name} was recruited into the Traitors.`, false);
      log(state, "A Faithful has been turned. Trust less.", true);
    }
    state.recruitEligible = false;
  } else {
    if (target.hasShield) {
      target.hasShield = false;
      if (state.shieldHolderId === target.id) state.shieldHolderId = null;
      state.lastMurderBlocked = true;
      state.lastMurderedId = target.id;
      log(state, `${target.name}'s Shield blocked the murder!`, true);
    } else {
      target.alive = false;
      state.lastMurderedId = target.id;
      log(state, `${target.name} was murdered.`, true);
    }
    state.recruitEligible = false;
  }

  state.nightMode = null;
  state.nightTargetId = null;
  return checkWinAfterElimination(state);
}

export function setFinaleChoice(
  state: GameState,
  playerId: string,
  choice: "end" | "banish",
): { ok: true } | { ok: false; error: string } {
  if (state.phase !== "finale_choice") return { ok: false, error: "Not in finale" };
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.alive) return { ok: false, error: "Cannot choose" };
  state.finaleChoices = { ...state.finaleChoices, [playerId]: choice };
  return { ok: true };
}

function resolveFinaleChoice(state: GameState): void {
  const alive = living(state);
  const choices = alive.map((p) => state.finaleChoices[p.id] ?? "banish");
  const allEnd = choices.every((c) => c === "end");
  state.finaleChoices = {};

  if (allEnd) {
    const traitorsLeft = livingTraitors(state).length > 0;
    endGame(state, traitorsLeft ? "traitor" : "faithful");
    return;
  }

  // Banish again
  state.votes = {};
  setPhase(state, "finale_vote", state.config.votingSeconds * 1000);
}

function enterFinaleOrNight(state: GameState): void {
  if (state.phase === "ended") return;
  const count = living(state).length;
  if (count <= 4) {
    state.finaleChoices = {};
    setPhase(state, "finale_choice", state.config.votingSeconds * 1000);
    log(state, "Finale: End Game or Banish Again?", true);
    return;
  }
  state.nightMode = state.recruitEligible ? null : "murder";
  state.nightTargetId = null;
  setPhase(state, "night", state.config.nightSeconds * 1000);
}

function beginMorning(state: GameState): void {
  if (state.phase === "ended") return;
  state.day += 1;
  if (state.lastMurderBlocked) {
    state.morningMessage = "A murder was attempted — but a Shield held.";
  } else if (state.lastMurderedId) {
    const victim = state.players.find((p) => p.id === state.lastMurderedId);
    state.morningMessage = victim
      ? `${victim.name} did not come down to breakfast.`
      : "Someone is missing at breakfast.";
  } else {
    state.morningMessage = "No one was murdered in the night.";
  }
  grantMorningShield(state);
  // Breakfast cinematic, then Round Table
  setPhase(state, "morning", 4500);
}

/**
 * Advance the phase when timer expires or host forces.
 * Returns true if state changed.
 */
export function advancePhase(state: GameState): boolean {
  if (!state.started || state.phase === "ended" || state.phase === "lobby") return false;

  const phase = state.phase;

  switch (phase) {
    case "morning":
      setPhase(state, "discussion", state.config.discussionSeconds * 1000);
      return true;
    case "discussion":
      state.votes = {};
      setPhase(state, "voting", state.config.votingSeconds * 1000);
      log(state, "Round Table voting begins.", true);
      return true;
    case "voting": {
      const ended = resolveBanishment(state);
      if (ended) return true;
      setPhase(state, "banish_reveal", 5000);
      return true;
    }
    case "banish_reveal":
      enterFinaleOrNight(state);
      return true;
    case "night": {
      autoNightIfNeeded(state);
      const ended = resolveNight(state);
      if (ended) return true;
      beginMorning(state);
      return true;
    }
    case "finale_choice":
      for (const p of living(state)) {
        if (!state.finaleChoices[p.id]) {
          state.finaleChoices[p.id] = "banish";
        }
      }
      resolveFinaleChoice(state);
      return true;
    case "finale_vote": {
      const ended = resolveBanishment(state);
      if (ended) return true;
      if (living(state).length <= 2) {
        checkWinAfterElimination(state);
        return true;
      }
      state.finaleChoices = {};
      setPhase(state, "finale_choice", state.config.votingSeconds * 1000);
      return true;
    }
    default:
      return false;
  }
}

function autoNightIfNeeded(state: GameState): void {
  if (state.nightTargetId) return;
  const faithful = livingFaithful(state);
  if (faithful.length === 0) return;
  if (!state.nightMode) {
    state.nightMode = state.recruitEligible && Math.random() < 0.5 ? "recruit" : "murder";
  }
  const pick = faithful[Math.floor(Math.random() * faithful.length)]!;
  state.nightTargetId = pick.id;
}

/** Auto-fill AI votes if missing when voting ends — called before resolve */
export function ensureAiVotes(state: GameState): void {
  if (state.phase !== "voting" && state.phase !== "finale_vote") return;
  const alive = living(state);
  for (const voter of alive) {
    if (voter.kind !== "ai") continue;
    if (state.votes[voter.id]) continue;
    const targets = alive.filter((p) => p.id !== voter.id);
    if (targets.length === 0) continue;
    // Mild bias: traitors avoid voting other traitors unless only option
    let pool = targets;
    if (voter.role === "traitor") {
      const nonTraitors = targets.filter((p) => p.role !== "traitor");
      if (nonTraitors.length) pool = nonTraitors;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    state.votes[voter.id] = pick.id;
  }
}

export function ensureAiFinaleChoices(state: GameState): void {
  if (state.phase !== "finale_choice") return;
  for (const p of living(state)) {
    if (p.kind !== "ai") continue;
    if (state.finaleChoices[p.id]) continue;
    // Traitors prefer end if they think they'll win; Faithful prefer banish if unsure
    if (p.role === "traitor") {
      state.finaleChoices[p.id] = living(state).length <= 3 ? "end" : "banish";
    } else {
      state.finaleChoices[p.id] = "banish";
    }
  }
}

export function tick(state: GameState, now = Date.now()): boolean {
  if (!state.phaseEndsAt || state.phase === "ended") return false;
  if (now < state.phaseEndsAt) return false;

  if (state.phase === "voting" || state.phase === "finale_vote") {
    ensureAiVotes(state);
  }
  if (state.phase === "finale_choice") {
    ensureAiFinaleChoices(state);
  }
  if (state.phase === "night") {
    autoNightIfNeeded(state);
  }
  return advancePhase(state);
}

export function toClientView(state: GameState, viewerId: string | null): ClientGameView {
  const you = viewerId ? state.players.find((p) => p.id === viewerId) : null;
  const isTraitor = you?.role === "traitor";
  const gameOver = state.phase === "ended";

  return {
    roomCode: state.roomCode,
    hostId: state.hostId,
    config: state.config,
    phase: state.phase,
    day: state.day,
    you: you
      ? {
          id: you.id,
          role: you.role,
          alive: you.alive,
          hasShield: you.hasShield,
          isTraitor: you.role === "traitor",
        }
      : null,
    players: state.players.map((p) => {
      let revealedRole: Role | null = null;
      if (gameOver) revealedRole = p.role;
      else if (state.banishedIds.includes(p.id)) revealedRole = p.role;
      if (isTraitor && p.role === "traitor") revealedRole = "traitor";
      if (you && p.id === you.id) revealedRole = you.role;

      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        alive: p.alive,
        hasShield: you?.id === p.id ? p.hasShield : false,
        connected: p.connected,
        revealedRole,
      };
    }),
    votes: state.phase === "voting" || state.phase === "finale_vote" || state.phase === "banish_reveal"
      ? state.votes
      : {},
    yourVote: you ? state.votes[you.id] ?? null : null,
    nightTargetId: isTraitor ? state.nightTargetId : null,
    nightMode: isTraitor ? state.nightMode : null,
    recruitEligible: isTraitor ? state.recruitEligible : false,
    lastBanishedRole: state.lastBanishedRole,
    lastBanishedId: state.lastBanishedId,
    lastMurderedId: state.lastMurderedId,
    lastMurderBlocked: state.lastMurderBlocked,
    morningMessage: state.morningMessage,
    castleChat: state.castleChat,
    conclaveChat: isTraitor ? state.conclaveChat : [],
    log: state.log.filter((l) => l.public),
    phaseEndsAt: state.phaseEndsAt,
    finaleChoices: state.phase === "finale_choice" ? state.finaleChoices : {},
    yourFinaleChoice: you ? state.finaleChoices[you.id] ?? null : null,
    winners: state.winners,
    winnerIds: state.winnerIds,
    started: state.started,
    livingCount: living(state).length,
    traitorAliveCountKnown: false,
    hostBeat: state.hostBeat,
  };
}

export function getClientView(state: GameState, viewerId: string | null): ClientGameView {
  return toClientView(state, viewerId);
}
