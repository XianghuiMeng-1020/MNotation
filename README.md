# MNotation

MNotation is an independent collaborative qualitative coding platform.

## Monorepo Layout

- `apps/web`: React + Vite frontend
- `workers/api`: Cloudflare Worker API (Hono + D1 + Durable Objects)
- `db/migrations`: D1 schema migrations

## Quick Start

```bash
npm install
npm run dev:web
```

## Scripts

- `npm run dev:web` start frontend
- `npm run build:web` build frontend
- `npm run deploy:api` deploy worker
- `npm run deploy:web` deploy pages

## Deployment

1. Create D1 database and set `database_id` in `wrangler.toml`.
2. Create R2 bucket `mnotation-uploads`.
3. Configure Cloudflare Access and set secrets:
   - `CF_ACCESS_TEAM_DOMAIN`
   - `CF_ACCESS_AUD`
   - `QWEN_API_KEY`
   - `QWEN_BASE_URL`
4. Deploy API and frontend.
