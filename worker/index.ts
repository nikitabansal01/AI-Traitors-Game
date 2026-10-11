import { routePartykitRequest, Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
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
  setAngelShield,
  setNightMode,
  setNightTarget,
  startGame,
  tick,
} from "../src/game/engine";
import type { ClientAction, GameState } from "../src/game/types";
import { decideForAi, pickAiActors, pickAiTraitors, type AiDecision } from "../src/ai/director";

export type Env = {
  /** Binding name `Main` → PartySocket party `"main"` (PartyKit-compatible path). */
  Main: DurableObjectNamespace<TraitorsRoom>;
  OPENAI_API_KEY?: string;
};

type ConnState = { playerId?: string };
type Conn = Connection<ConnState>;

/** Spacing so punchy lines can land */
const TIMING = {
  afterCinematicMs: 4_000,
  afterStartMs: 7_500,
  castleBeatMs: 28_000,
  conclaveBeatMs: 38_000,
  actionBeatMs: 12_000,
  castleTableGapMs: 16_000,
  castlePerAiGapMs: 36_000,
  multiActorStaggerMs: 3_200,
  /** Active phases need 1s ticks for timers; idle rooms should not write every second */
  alarmActiveMs: 1_000,
  alarmIdleMs: 15_000,
  /** Coalesce Durable Object storage writes (free tier counts SQLite rows_written) */
  persistMinMs: 5_000,
};

function roomCodeFromId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "CASTLE";
}

export class TraitorsRoom extends Server<Env> {
  static options = { hibernate: false };

  state!: GameState;
  aiBusy = false;
  lastAiChatAt = new Map<string, number>();
  lastCastleAnyAt = 0;
  nightConclaveBeats = 0;
  lastCastleBeatAt = 0;
  lastConclaveBeatAt = 0;
  lastActionBeatAt = 0;
  pendingCinematicAiAt: number | null = null;
  /** True when in-memory state differs from last durable write */
  dirty = false;
  lastPersistAt = 0;

  async onStart() {
    const saved = await this.ctx.storage.get<GameState>("game");
    this.state = saved ?? createLobby(roomCodeFromId(this.name));
    this.dirty = false;
    const existing = await this.ctx.storage.getAlarm();
    if (existing == null) {
      await this.scheduleAlarm();
    }
  }

  needsFrequentAlarm(): boolean {
    if (!this.state?.started) return false;
    return !["lobby", "ended"].includes(this.state.phase);
  }

  alarmDelayMs(): number {
    return this.needsFrequentAlarm() ? TIMING.alarmActiveMs : TIMING.alarmIdleMs;
  }

  async scheduleAlarm(delayMs = this.alarmDelayMs()) {
    await this.ctx.storage.setAlarm(Date.now() + delayMs);
  }

  markDirty() {
    this.dirty = true;
  }

  /** Persist only when dirty. Debounced unless force=true (e.g. before hibernate-sensitive moments). */
  async persist(force = false) {
    if (!this.state) return;
    if (!this.dirty && !force) return;
    const now = Date.now();
    if (!force && now - this.lastPersistAt < TIMING.persistMinMs) return;
    this.dirty = false;
    this.lastPersistAt = now;
    await this.ctx.storage.put("game", this.state);
  }

  onConnect(conn: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const playerId = url.searchParams.get("playerId") ?? undefined;
    (conn as Conn).setState({ playerId });
    this.sendView(conn as Conn);
  }

  onClose(conn: Connection) {
    const playerId = (conn as Conn).state?.playerId;
    if (!playerId) return;
    const p = this.state.players.find((x) => x.id === playerId);
    if (p && p.kind === "human") {
      p.connected = false;
      this.markDirty();
      void this.broadcastViews();
      void this.persist();
    }
  }

  async onMessage(sender: Connection, message: WSMessage) {
    let data: ClientAction;
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)) as ClientAction;
    } catch {
      return;
    }

    const s = sender as Conn;
    const playerId =
      s.state?.playerId ??
      ("playerId" in data ? (data as { playerId?: string }).playerId : null);

    const result = await this.handleAction(data, playerId ?? null, s);
    if (result && !result.ok) {
      sender.send(JSON.stringify({ type: "error", error: result.error }));
      return;
    }
    // Successful actions mutate in-memory state — durable write only if dirty
    this.markDirty();
    await this.broadcastViews();
    await this.persist(true);
  }

  async onAlarm() {
    if (!this.state) {
      const saved = await this.ctx.storage.get<GameState>("game");
      this.state = saved ?? createLobby(roomCodeFromId(this.name));
      this.dirty = false;
    }

    const now = Date.now();
    const changed = tick(this.state);
    if (changed) {
      this.markDirty();
      this.pendingCinematicAiAt = now + TIMING.afterCinematicMs;
      await this.broadcastViews();
    }

    if (this.pendingCinematicAiAt != null && now >= this.pendingCinematicAiAt) {
      this.pendingCinematicAiAt = null;
      if (this.state.phase === "night") void this.runAiBeat("night");
      else if (this.state.phase === "discussion") void this.runAiBeat("castle");
      else void this.runAiBeat("default");
    }

    if (this.state.phase === "discussion" && now - this.lastCastleBeatAt >= TIMING.castleBeatMs) {
      this.lastCastleBeatAt = now;
      void this.runAiBeat("castle");
    }
    if (this.state.phase === "discussion" && now - this.lastConclaveBeatAt >= TIMING.conclaveBeatMs) {
      this.lastConclaveBeatAt = now;
      void this.runAiBeat("conclave");
    }
    if (
      (this.state.phase === "voting" ||
        this.state.phase === "finale_vote" ||
        this.state.phase === "finale_choice" ||
        this.state.phase === "night") &&
      now - this.lastActionBeatAt >= TIMING.actionBeatMs
    ) {
      this.lastActionBeatAt = now;
      if (this.state.phase === "night") void this.runAiBeat("night");
      else void this.runAiBeat("default");
    }

    // Flush pending dirty state if debounce window elapsed — never write every tick
    await this.persist();
    await this.scheduleAlarm();
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
        sender.setState({ playerId: id });
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
        if (r.ok) {
          this.pendingCinematicAiAt = Date.now() + TIMING.afterStartMs;
        }
        return r;
      }
      case "chat": {
        if (!playerId) return { ok: false, error: "Not seated" };
        let text = data.text;
        if (data.asCharacter && this.state.config.gameMode === "pro") {
          const player = this.state.players.find((p) => p.id === playerId);
          if (player?.characterId) {
            text = await llmVoiceRewrite(player.characterId, text, this.env.OPENAI_API_KEY);
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
      case "angel_shield": {
        if (!playerId) return { ok: false, error: "Not seated" };
        return setAngelShield(this.state, playerId, data.targetId);
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

  applyAiDecision(playerId: string, decision: AiDecision): boolean {
    switch (decision.type) {
      case "chat": {
        if (decision.channel === "castle") {
          const now = Date.now();
          if (now - this.lastCastleAnyAt < TIMING.castleTableGapMs) return false;
          const last = this.lastAiChatAt.get(playerId) ?? 0;
          if (now - last < TIMING.castlePerAiGapMs) return false;
          this.lastAiChatAt.set(playerId, now);
          this.lastCastleAnyAt = now;
        }
        addChat(this.state, playerId, decision.channel, decision.text);
        return true;
      }
      case "vote":
        castVote(this.state, playerId, decision.targetId);
        return true;
      case "finale":
        setFinaleChoice(this.state, playerId, decision.choice);
        return true;
      case "night":
        setNightMode(this.state, playerId, decision.mode);
        setNightTarget(this.state, playerId, decision.targetId);
        return true;
      case "angel_shield":
        setAngelShield(this.state, playerId, decision.targetId);
        return true;
      default:
        return false;
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

    if (this.state.phase !== "night") {
      this.nightConclaveBeats = 0;
    }

    this.aiBusy = true;
    try {
      const key = this.env.OPENAI_API_KEY;
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
        const applied = this.applyAiDecision(actor.id, decision);
        if (applied) {
          this.markDirty();
          await this.broadcastViews();
        }
        if (actors.length > 1) {
          await new Promise((r) => setTimeout(r, TIMING.multiActorStaggerMs));
        }
      }
    } finally {
      this.aiBusy = false;
      await this.persist();
    }
  }

  sendView(conn: Conn) {
    const playerId = conn.state?.playerId ?? null;
    const view = getClientView(this.state, playerId);
    conn.send(JSON.stringify({ type: "state", view }));
  }

  /** Fan-out websocket views only — does not touch Durable Object storage. */
  async broadcastViews() {
    for (const conn of this.getConnections<ConnState>()) {
      this.sendView(conn);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("AI Traitors realtime", { status: 200 })
    );
  },
} satisfies ExportedHandler<Env>;
