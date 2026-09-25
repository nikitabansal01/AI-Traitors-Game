export type Role = "faithful" | "traitor";
export type PlayerKind = "human" | "ai";
export type ChatChannel = "castle" | "conclave";
/** Amateurs = MVP v0. Pro = character roleplay. */
export type GameMode = "amateurs" | "pro";

export type Phase =
  | "lobby"
  | "morning"
  | "discussion"
  | "voting"
  | "banish_reveal"
  | "night"
  | "finale_choice"
  | "finale_vote"
  | "ended";

export type NightMode = "murder" | "recruit" | null;

export type HostSfx =
  | "knock"
  | "gavel"
  | "murmur"
  | "sting"
  | "heartbeat"
  | "rise"
  | "doom"
  | "triumph"
  | "none";

export type HostBeatKind =
  | "welcome"
  | "morning"
  | "discussion"
  | "voting"
  | "banish_reveal"
  | "night"
  | "finale_choice"
  | "finale_vote"
  | "ended";

/** Host narrator beat — drives cinematics + Host strip */
export interface HostBeat {
  id: string;
  kind: HostBeatKind;
  title: string;
  line: string;
  detail: string | null;
  sfx: HostSfx;
  cinematicMs: number;
  at: number;
}

export interface Player {
  id: string;
  name: string;
  kind: PlayerKind;
  role: Role | null;
  alive: boolean;
  hasShield: boolean;
  /** Amateurs AI archetypes (paranoid, charming, …) */
  personalityId: string | null;
  /** Pro mode famous character id */
  characterId: string | null;
  connected: boolean;
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  playerId: string;
  playerName: string;
  text: string;
  at: number;
}

export interface GameLogEntry {
  id: string;
  text: string;
  at: number;
  /** Visible to everyone */
  public: boolean;
}

export interface GameConfig {
  castSize: number;
  traitorCount: number;
  discussionSeconds: number;
  votingSeconds: number;
  nightSeconds: number;
  prizePot: number;
  /** Default Amateurs preserves MVP v0 */
  gameMode: GameMode;
}

export const DEFAULT_CONFIG: GameConfig = {
  castSize: 10,
  traitorCount: 3,
  discussionSeconds: 75,
  votingSeconds: 35,
  nightSeconds: 45,
  prizePot: 100_000,
  gameMode: "amateurs",
};

export interface GameState {
  roomCode: string;
  hostId: string | null;
  config: GameConfig;
  phase: Phase;
  day: number;
  players: Player[];
  /** playerId -> targetPlayerId */
  votes: Record<string, string>;
  /** Traitor night target (murder or recruit invite) */
  nightTargetId: string | null;
  nightMode: NightMode;
  /** Traitors may recruit after a Traitor was banished this game cycle */
  recruitEligible: boolean;
  lastBanishedRole: Role | null;
  lastBanishedId: string | null;
  /** Players who were banished (roles are public) */
  banishedIds: string[];
  lastMurderedId: string | null;
  lastMurderBlocked: boolean;
  shieldHolderId: string | null;
  /** Morning announcement text */
  morningMessage: string | null;
  castleChat: ChatMessage[];
  conclaveChat: ChatMessage[];
  log: GameLogEntry[];
  phaseEndsAt: number | null;
  /** finale: End Game vs Banish Again */
  finaleChoices: Record<string, "end" | "banish">;
  winners: Role | null;
  winnerIds: string[];
  started: boolean;
  /** Latest host narrator beat (public) */
  hostBeat: HostBeat | null;
}

/** Client-safe view of the game for a specific viewer */
export interface ClientGameView {
  roomCode: string;
  hostId: string | null;
  config: GameConfig;
  phase: Phase;
  day: number;
  you: {
    id: string;
    role: Role | null;
    alive: boolean;
    hasShield: boolean;
    isTraitor: boolean;
  } | null;
  players: Array<{
    id: string;
    name: string;
    kind: PlayerKind;
    alive: boolean;
    hasShield: boolean;
    connected: boolean;
    characterId: string | null;
    characterLabel: string | null;
    characterInitials: string | null;
    characterHue: number | null;
    /** Only revealed after banishment or game end, or if you are traitor seeing fellow traitors */
    revealedRole: Role | null;
  }>;
  /** Your character in Pro mode */
  yourCharacterId: string | null;
  votes: Record<string, string>;
  yourVote: string | null;
  nightTargetId: string | null;
  nightMode: NightMode;
  recruitEligible: boolean;
  lastBanishedRole: Role | null;
  lastBanishedId: string | null;
  lastMurderedId: string | null;
  lastMurderBlocked: boolean;
  morningMessage: string | null;
  castleChat: ChatMessage[];
  conclaveChat: ChatMessage[];
  log: GameLogEntry[];
  phaseEndsAt: number | null;
  finaleChoices: Record<string, "end" | "banish">;
  yourFinaleChoice: "end" | "banish" | null;
  winners: Role | null;
  winnerIds: string[];
  started: boolean;
  livingCount: number;
  traitorAliveCountKnown: boolean;
  hostBeat: HostBeat | null;
}

export type ClientAction =
  | { type: "claim_seat"; name: string; playerId: string }
  | { type: "set_cast_size"; size: number }
  | { type: "set_game_mode"; mode: GameMode }
  | { type: "set_character"; characterId: string }
  | { type: "start_game" }
  | { type: "chat"; channel: ChatChannel; text: string; asCharacter?: boolean }
  | { type: "vote"; targetId: string }
  | { type: "night_mode"; mode: "murder" | "recruit" }
  | { type: "night_target"; targetId: string }
  | { type: "confirm_night" }
  | { type: "finale_choice"; choice: "end" | "banish" }
  | { type: "advance_phase" };
