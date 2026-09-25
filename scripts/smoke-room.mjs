/**
 * Smoke: two humans + AI through discussion → vote → night.
 */
import WebSocket from "ws";

const HOST = process.env.PARTY_HOST || "127.0.0.1:1999";
const ROOM = `SMOKE${Math.floor(Math.random() * 9000 + 1000)}`;

function connect(playerId) {
  return new Promise((resolve, reject) => {
    const url = `ws://${HOST}/parties/main/${ROOM}?playerId=${encodeURIComponent(playerId)}`;
    console.log("connect", url);
    const ws = new WebSocket(url);
    let latest = null;
    const waiters = [];

    ws.on("open", () => {
      resolve({
        ws,
        getLatest: () => latest,
        waitUntil: (pred, timeoutMs = 5000) =>
          new Promise((res, rej) => {
            const start = Date.now();
            const check = () => {
              if (latest && pred(latest)) return res(latest);
              if (Date.now() - start > timeoutMs) {
                return rej(new Error(`timeout waiting; last=${JSON.stringify(latest?.view?.phase)} err=${latest?.error}`));
              }
            };
            check();
            waiters.push(() => {
              check();
            });
            const iv = setInterval(() => {
              try {
                check();
              } catch (e) {
                clearInterval(iv);
                rej(e);
              }
              if (latest && pred(latest)) {
                clearInterval(iv);
              }
            }, 50);
            // also resolve via waiters
            const original = waiters[waiters.length - 1];
            waiters[waiters.length - 1] = () => {
              if (latest && pred(latest)) {
                clearInterval(iv);
                res(latest);
              }
            };
            void original;
          }),
      });
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      latest = msg;
      for (const w of [...waiters]) w();
      if (msg.type === "error") console.error("server error:", msg.error);
    });
    ws.on("error", reject);
  });
}

function send(ws, action) {
  console.log(">>", action.type);
  ws.send(JSON.stringify(action));
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("room", ROOM);
  const a = await connect("h_smoke_a");
  const b = await connect("h_smoke_b");

  await a.waitUntil((m) => m.type === "state");

  send(a.ws, { type: "claim_seat", name: "SmokeA", playerId: "h_smoke_a" });
  await a.waitUntil((m) => m.view?.players?.some((p) => p.id === "h_smoke_a"));

  send(b.ws, { type: "claim_seat", name: "SmokeB", playerId: "h_smoke_b" });
  await a.waitUntil((m) => m.view?.players?.length >= 2);

  send(a.ws, { type: "set_cast_size", size: 6 });
  await sleep(200);
  send(a.ws, { type: "start_game" });
  const started = await a.waitUntil((m) => m.view?.started === true, 8000);
  console.log("started", started.view.phase, "players", started.view.players.length);

  send(a.ws, { type: "advance_phase" });
  let v = await a.waitUntil((m) => m.view?.phase === "voting", 5000);
  console.log("phase", v.view.phase);

  const target = v.view.players.find((p) => p.alive && p.id !== "h_smoke_a")?.id;
  send(a.ws, { type: "vote", targetId: target });
  send(b.ws, { type: "vote", targetId: target });
  await sleep(200);
  send(a.ws, { type: "advance_phase" });
  v = await a.waitUntil((m) => m.view?.phase === "banish_reveal" || m.view?.phase === "ended", 5000);
  console.log("after vote", v.view.phase, "living", v.view.livingCount);

  if (v.view.phase === "banish_reveal") {
    send(a.ws, { type: "advance_phase" });
    v = await a.waitUntil((m) => m.view?.phase === "night" || m.view?.phase === "finale_choice" || m.view?.phase === "ended", 5000);
  }
  console.log("after reveal", v.view.phase);

  if (v.view.phase === "night") {
    send(a.ws, { type: "chat", channel: "castle", text: "hello castle" });
    // try conclave from whoever is traitor
    const me = started.view.you;
    send(a.ws, { type: "advance_phase" });
    v = await a.waitUntil(
      (m) => m.view?.phase === "discussion" || m.view?.phase === "ended",
      5000,
    );
    console.log("after night", v.view.phase, "living", v.view.livingCount);
    void me;
  }

  a.ws.close();
  b.ws.close();
  console.log("smoke ok");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
