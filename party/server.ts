import type * as Party from "partykit/server";
import { llmVoiceRewrite } from "../src/ai/characters";
import {
  addChat,
  advancePhase,
  castVote,
  claimSeat,
  createLobby,
  ensureAiFinaleChoices,
  ensureAiVotes,
  getClientView,
  setCastSize,
  setCharacter,
  setFinaleChoice,
  setGameMode,
  setNightMode,
  setNightTarget,
  startGame,
  tick,
} from "../src/game/engine";
import type { ClientAction, GameState } from "../src/game/types";
import { decideForAi, pickAiActors, pickAiTraitors, type AiDecision } from "../src/ai/director";

type Conn = Party.Connection & { playerId?: string };

/** Spacing so punchy lines can land */
const TIMING = {
  /** After host cinematic, wait before first AI beat */
  afterCinematicMs: 4_000,
  /** First Castle voice after game start */
  afterStartMs: 7_500,
  /** Discussion: attempt one Castle AI beat */
  castleBeatMs: 28_000,
  /** Discussion: Conclave whispers */
  conclaveBeatMs: 38_000,
  /** Voting / night / finale action polls */
  actionBeatMs: 12_000,
  /** Min gap between any two AI Castle messages (table-wide) */
  castleTableGapMs: 16_000,
  /** Min gap before the same AI speaks in Castle again */
  castlePerAiGapMs: 36_000,
  /** Stagger when multiple AI act in one beat */
  multiActorStaggerMs: 3_200,
};

function roomCodeFromId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "CASTLE";
}

export default class TraitorsRoom implements Party.Server {
  state: GameState;
  aiBusy = false;
  /** playerId -> last castle chat timestamp */
  lastAiChatAt = new Map<string, number>();
  /** Last time any AI posted to Castle */
  lastCastleAnyAt = 0;
  /** Conclave messages this night before locking a murder */
  nightConclaveBeats = 0;

  constructor(readonly room: Party.Room) {
    this.state = createLobby(roomCodeFromId(room.id));
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const playerId = url.searchParams.get("playerId");
    (conn as Conn).playerId = playerId ?? undefined;
    this.sendView(conn as Conn);
  }

  onClose(conn: Party.Connection) {
    const playerId = (conn as Conn).playerId;
    if (!playerId) return;
    const p = this.state.players.find((x) => x.id === playerId);
    if (p && p.kind === "human") p.connected = false;
    this.broadcastViews();
  }

  async onMessage(message: string, sender: Party.Connection) {
    let data: ClientAction;
    try {
      data = JSON.parse(message) as ClientAction;
    } catch {
      return;
    }

    const s = sender as Conn;
    const playerId =
      s.playerId ?? ("playerId" in data ? (data as { playerId?: string }).playerId : null);

    const result = await this.handleAction(data, playerId ?? null, s);
    if (result && !result.ok) {
      sender.send(JSON.stringify({ type: "error", error: result.error }));
    }
    this.broadcastViews();
  }

  onStart() {
    setInterval(() => {
      const changed = tick(this.state);
      if (changed) {
        this.broadcastViews();
        // Let the host beat land, then one AI voice
        setTimeout(() => {
          if (this.state.phase === "night") void this.runAiBeat("night");
          else if (this.state.phase === "discussion") void this.runAiBeat("castle");
          else void this.runAiBeat("default");
        }, TIMING.afterCinematicMs);
      }
    }, 1000);

    // Discussion pace: spaced Castle voices
    setInterval(() => {
      if (this.state.phase === "discussion") {
        void this.runAiBeat("castle");
      }
    }, TIMING.castleBeatMs);

    // Traitors whisper in Conclave during the day (slower than Castle)
    setInterval(() => {
      if (this.state.phase === "discussion") {
        void this.runAiBeat("conclave");
      }
    }, TIMING.conclaveBeatMs);

    // Voting / night / finale
    setInterval(() => {
      if (
        this.state.phase === "voting" ||
        this.state.phase === "finale_vote" ||
        this.state.phase === "finale_choice"
      ) {
        void this.runAiBeat("default");
      }
      if (this.state.phase === "night") {
        void this.runAiBeat("night");
      }
    }, TIMING.actionBeatMs);
  }

  async handleAction(
    data: ClientAction,
    playerId: string | null,
    sender: Conn,
  ): Promise<{ ok: boolean; error?: string } | void> {
    switch (data.type) {
      case "claim_seat": {
        const id = data.playerId || playerId;
        if (!id) return { ok: false, error: "Missing player id" };
        sender.playerId = id;
        return claimSeat(this.state, id, data.name);
      }
      case "set_cast_size": {
        if (!playerId) return { ok: false, error: "Not seated" };
        return setCastSize(this.state, data.size, playerId);
      }
      case "set_game_mode": {
        if (!playerId) return { ok: false, error: "Not seated" };
        return setGameMode(this.state, data.mode, playerId);
      }
      case "set_character": {
        if (!playerId) return { ok: false, error: "Not seated" };
        return setCharacter(this.state, playerId, data.characterId);
      }
      case "start_game": {
        if (!playerId) return { ok: false, error: "Not seated" };
        const r = startGame(this.state, playerId);
        if (r.ok) setTimeout(() => void this.runAiBeat("castle"), TIMING.afterStartMs);
        return r;
      }
      case "chat": {
        if (!playerId) return { ok: false, error: "Not seated" };
        let text = data.text;
        if (
          data.asCharacter &&
          this.state.config.gameMode === "pro"
        ) {
          const player = this.state.players.find((p) => p.id === playerId);
          if (player?.characterId) {
            const key = this.room.env.OPENAI_API_KEY as string | undefined;
            text = await llmVoiceRewrite(player.characterId, text, key);
          }
        }
        return addChat(this.state, playerId, data.channel, text);
      }
      case "vote": {
        if (!playerId) return { ok: false, error: "Not seated" };
        return castVote(this.state, playerId, data.targetId);
      }
      case "night_mode": {
        if (!playerId) return { ok: false, error: "Not seated" };
        return setNightMode(this.state, playerId, data.mode);
      }
      case "night_target": {
        if (!playerId) return { ok: false, error: "Not seated" };
        return setNightTarget(this.state, playerId, data.targetId);
      }
      case "confirm_night": {
        if (!playerId || playerId !== this.state.hostId) {
          return { ok: false, error: "Host only" };
        }
        ensureAiVotes(this.state);
        ensureAiFinaleChoices(this.state);
        advancePhase(this.state);
        return { ok: true };
      }
      case "finale_choice": {
        if (!playerId) return { ok: false, error: "Not seated" };
        return setFinaleChoice(this.state, playerId, data.choice);
      }
      case "advance_phase": {
        if (!playerId || playerId !== this.state.hostId) {
          return { ok: false, error: "Host only" };
        }
        ensureAiVotes(this.state);
        ensureAiFinaleChoices(this.state);
        advancePhase(this.state);
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown action" };
    }
  }

  applyAiDecision(playerId: string, decision: AiDecision) {
    switch (decision.type) {
      case "chat": {
        // Rate-limit Castle chat so punchy lines don't stack
        if (decision.channel === "castle") {
          const now = Date.now();
          if (now - this.lastCastleAnyAt < TIMING.castleTableGapMs) return;
          const last = this.lastAiChatAt.get(playerId) ?? 0;
          if (now - last < TIMING.castlePerAiGapMs) return;
          this.lastAiChatAt.set(playerId, now);
          this.lastCastleAnyAt = now;
        }
        addChat(this.state, playerId, decision.channel, decision.text);
        break;
      }
      case "vote":
        castVote(this.state, playerId, decision.targetId);
        break;
      case "finale":
        setFinaleChoice(this.state, playerId, decision.choice);
        break;
      case "night":
        setNightMode(this.state, playerId, decision.mode);
        setNightTarget(this.state, playerId, decision.targetId);
        break;
      default:
        break;
    }
  }

  async runAiBeat(mode: "castle" | "conclave" | "night" | "default" = "default") {
    if (this.aiBusy || !this.state.started || this.state.phase === "ended") return;
    if (
      !["discussion", "voting", "night", "finale_choice", "finale_vote"].includes(
        this.state.phase,
      )
    ) {
      return;
    }

    // Reset conclave planning when a new night starts
    if (this.state.phase === "night" && this.nightConclaveBeats > 0 && mode === "castle") {
      /* no-op */
    }
    if (this.state.phase !== "night") {
      this.nightConclaveBeats = 0;
    }

    this.aiBusy = true;
    try {
      const key = this.room.env.OPENAI_API_KEY as string | undefined;
      let actors = pickAiActors(this.state, 1);
      let preferConclave = false;

      if (mode === "conclave" || (mode === "night" && this.nightConclaveBeats < 2)) {
        actors = pickAiTraitors(this.state, mode === "night" ? 2 : 1);
        preferConclave = true;
        if (mode === "night") this.nightConclaveBeats += 1;
      } else if (mode === "night") {
        actors = pickAiTraitors(this.state, 1);
        preferConclave = false;
      } else if (mode === "castle") {
        actors = pickAiActors(this.state, 1);
      } else {
        actors = pickAiActors(this.state, this.state.phase === "discussion" ? 1 : 3);
      }

      if (!actors.length) return;

      for (const actor of actors) {
        const decision = await decideForAi(this.state, actor, key, { preferConclave });
        this.applyAiDecision(actor.id, decision);
        this.broadcastViews();
        if (actors.length > 1) {
          await new Promise((r) => setTimeout(r, TIMING.multiActorStaggerMs));
        }
      }
    } finally {
      this.aiBusy = false;
    }
  }

  sendView(conn: Conn) {
    const playerId = conn.playerId ?? null;
    const view = getClientView(this.state, playerId);
    conn.send(JSON.stringify({ type: "state", view }));
  }

  broadcastViews() {
    for (const conn of this.room.getConnections()) {
      this.sendView(conn as Conn);
    }
  }
}
