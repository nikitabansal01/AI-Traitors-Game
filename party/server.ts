/**
 * Legacy PartyKit entry — realtime now lives on Cloudflare Workers.
 * See `worker/index.ts` and `wrangler.jsonc`.
 */
export { TraitorsRoom as default } from "../worker/index";
