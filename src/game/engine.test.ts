import {
  castVote,
  claimSeat,
  createLobby,
  ensureAiVotes,
  getClientView,
  setCharacter,
  setGameMode,
  startGame,
  tick,
} from "./engine";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function run() {
  const state = createLobby("TEST");
  assert(state.config.gameMode === "amateurs", "default Amateurs");

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
  assert(started.ok, "start Amateurs");
  assert(state.players.length === 6, `cast size ${state.players.length}`);
  assert(state.players.filter((p) => p.role === "traitor").length === 2, "2 traitors");
  assert(state.phase === "discussion", "discussion phase");
  assert(
    state.players.filter((p) => p.kind === "ai").every((p) => p.personalityId && !p.characterId),
    "Amateurs AI use personalities only",
  );

  const traitor =
    state.players.find((p) => p.role === "traitor" && p.kind === "human") ??
    state.players.find((p) => p.role === "traitor")!;
  const viewT = getClientView(state, traitor.id);
  assert(viewT.you?.isTraitor === true, "traitor knows role");
  assert(viewT.conclaveChat !== undefined, "conclave present");

  const faithful = state.players.find((p) => p.role === "faithful")!;
  const viewF = getClientView(state, faithful.id);
  assert(viewF.conclaveChat.length === 0, "faithful no conclave");
  assert(viewF.you?.isTraitor === false, "faithful role");

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

  const pro = createLobby("PRO");
  claimSeat(pro, "h1", "Alice");
  claimSeat(pro, "h2", "Bob");
  assert(setGameMode(pro, "pro", "h1").ok, "set Pro");
  assert(pro.config.gameMode === "pro", "pro mode");
  assert(setCharacter(pro, "h1", "messi").ok, "Alice Messi");
  assert(!setCharacter(pro, "h2", "messi").ok, "unique characters");
  assert(setCharacter(pro, "h2", "taylor").ok, "Bob Taylor");
  pro.config.castSize = 6;
  pro.config.traitorCount = 2;
  const proStart = startGame(pro, "h1");
  assert(proStart.ok, "start Pro");
  assert(
    pro.players.every((p) => p.characterId),
    "Pro cast all have characters",
  );
  assert(
    pro.players.filter((p) => p.kind === "ai").every((p) => !p.personalityId),
    "Pro AI skip archetype personalities",
  );

  console.log("engine tests passed", {
    phase: state.phase,
    living: state.players.filter((p) => p.alive).length,
    banished: state.banishedIds.length,
    proMode: pro.config.gameMode,
    proCast: pro.players.map((p) => p.characterId),
  });
}

run();
