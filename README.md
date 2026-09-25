# AI Traitors

Multiplayer web game inspired by *The Traitors*. Humans join a room; AI fills empty seats. Roles (Faithful / Traitor) are assigned at random.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

- Next.js: http://localhost:3000  
- PartyKit: http://localhost:1999  

Optional: set `OPENAI_API_KEY` so AI players use GPT instead of heuristics.

1. Copy env template:
   ```bash
   cp .env.example .env
   ```
2. Put your key in `.env` (PartyKit loads this file):
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   ```
3. Restart `npm run dev` so PartyKit picks up the key.

Without a key, AI still plays via built-in heuristics.

## Play

1. Open the site → **Create room** (or join with a code).
2. Share the room URL with other humans.
3. Host starts — AI fills remaining cast seats.
4. Use **Castle** chat (everyone) and **Conclave** (Traitors only).

## P0 features

- Lobby + random roles  
- Round Table discussion & banishment  
- Night murder / recruitment  
- Shields  
- Finale End Game / Banish Again  
- Castle + Conclave chat  
