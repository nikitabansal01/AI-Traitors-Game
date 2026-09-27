/**
 * Confirm two distinct humans land in the same room by code.
 */
import WebSocket from "ws";

const HOST = process.env.PARTY_HOST || "127.0.0.1:1999";
const ROOM = `JOIN${Math.floor(Math.random() * 9000 + 1000)}`;

function connect(playerId) {
  return new Promise((resolve, reject) => {
    const url = `ws://${HOST}/parties/main/${ROOM}?playerId=${encodeURIComponent(playerId)}`;
    const ws = new WebSocket(url);
    let latest = null;
    ws.on("open", () => resolve({ ws, get: () => latest }));
    ws.on("message", (data) => {
      latest = JSON.parse(String(data));
    });
    ws.on("error", reject);
  });
}

function wait(get, pred, ms = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const m = get();
      if (m && pred(m)) {
        clearInterval(iv);
        resolve(m);
      } else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        reject(new Error("timeout"));
      }
    }, 40);
  });
}

async function main() {
  console.log("testing room code", ROOM);
  const a = await connect("h_join_a");
  const b = await connect("h_join_b");
  const tv = await connect(`display_${ROOM}`);

  await wait(a.get, (m) => m.type === "state");

  a.ws.send(JSON.stringify({ type: "claim_seat", name: "Alice", playerId: "h_join_a" }));
  await wait(a.get, (m) => m.view?.players?.some((p) => p.id === "h_join_a"));

  b.ws.send(JSON.stringify({ type: "claim_seat", name: "Bob", playerId: "h_join_b" }));
  const both = await wait(
    a.get,
    (m) => m.view?.players?.filter((p) => p.kind === "human").length >= 2,
  );

  const humans = both.view.players.filter((p) => p.kind === "human").map((p) => p.name);
  console.log("humans in room", humans);
  if (!humans.includes("Alice") || !humans.includes("Bob")) {
    throw new Error("both humans not in same room");
  }

  // TV spectator must not get a role even after start
  a.ws.send(JSON.stringify({ type: "set_cast_size", size: 6 }));
  await new Promise((r) => setTimeout(r, 100));
  a.ws.send(JSON.stringify({ type: "start_game" }));
  await wait(a.get, (m) => m.view?.started === true, 8000);

  const tvState = await wait(tv.get, (m) => m.view?.started === true, 8000);
  if (tvState.view.you != null) throw new Error("TV view must not have you/role");
  if (tvState.view.conclaveChat?.length) throw new Error("TV must not see conclave");
  if (tvState.view.players.length < 2) throw new Error("TV should see cast");

  console.log("join-by-code ok; TV spectator has no role/conclave");
  a.ws.close();
  b.ws.close();
  tv.ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
