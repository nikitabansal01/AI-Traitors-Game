# AI Traitors

Multiplayer web game inspired by *The Traitors*. Humans join a room; AI fills empty seats. Roles (Faithful / Traitor) are assigned at random.

## Run locally

```bash
cp .env.example .env.local
cp .env.example .dev.vars
npm install
npm run dev
```

- Next.js: http://localhost:3000  
- Realtime (Cloudflare Workers / PartyServer): http://localhost:1999  

Optional: set `OPENAI_API_KEY` in `.dev.vars` so AI players use GPT instead of heuristics.

## Deploy realtime (multiplayer)

UI stays on Vercel. Rooms run on Cloudflare Workers (`*.workers.dev`).

```bash
npx wrangler login          # or claim a preview account from `wrangler deploy --temporary`
npx wrangler secret put OPENAI_API_KEY
npm run deploy:party
```

Then in Vercel → Project → Settings → Environment Variables:

- `NEXT_PUBLIC_PARTYKIT_HOST` = your worker host, e.g. `ai-traitors.your-subdomain.workers.dev` (no `https://`)

Redeploy the Next app after changing that env.

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
