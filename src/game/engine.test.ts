import {
  advancePhase,
  castVote,
  claimSeat,
  createLobby,
  ensureAiVotes,
  getClientView,
  startGame,
  tick,
} from "./engine";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function run() {
  const state = createLobby("TEST");
  const a = claimSeat(state, "h1", "Alice");
  const b = claimSeat(state, "h2", "Bob");
  assert(a.ok && b.ok, "claim seats");
  assert(state.hostId === "h1", "host is Alice");

  state.config.castSize = 6;
  state.config.traitorCount = 2;
  state.config.discussionSeconds = 1;
  state.config.votingSeconds = 1;
  state.config.nightSeconds = 1;

  const started = startGame(state, "h1");
  assert(started.ok, "start");
  assert(state.players.length === 6, `cast size ${state.players.length}`);
  assert(state.players.filter((p) => p.role === "traitor").length === 2, "2 traitors");
  assert(state.phase === "discussion", "discussion phase");

  const traitor = state.players.find((p) => p.role === "traitor" && p.kind === "human")
    ?? state.players.find((p) => p.role === "traitor")!;
  const viewT = getClientView(state, traitor.id);
  assert(viewT.you?.isTraitor === true, "traitor knows role");
  assert(viewT.conclaveChat !== undefined, "conclave present");

  const faithful = state.players.find((p) => p.role === "faithful")!;
  const viewF = getClientView(state, faithful.id);
  assert(viewF.conclaveChat.length === 0, "faithful no conclave");
  assert(viewF.you?.isTraitor === false, "faithful role");

  // Force voting
  state.phaseEndsAt = Date.now() - 1;
  tick(state);
  assert(String(state.phase) === "voting", `expected voting, got ${state.phase}`);

  for (const p of state.players.filter((x) => x.alive)) {
    const target = state.players.find((x) => x.alive && x.id !== p.id)!;
    castVote(state, p.id, target.id);
  }
  ensureAiVotes(state);
  state.phaseEndsAt = Date.now() - 1;
  tick(state);
  assert(
    ["banish_reveal", "ended"].includes(state.phase),
    `after vote: ${state.phase}`,
  );

  if (String(state.phase) === "banish_reveal") {
    state.phaseEndsAt = Date.now() - 1;
    tick(state);
  }

  console.log("engine tests passed", {
    phase: state.phase,
    living: state.players.filter((p) => p.alive).length,
    banished: state.banishedIds.length,
  });
}

run();
