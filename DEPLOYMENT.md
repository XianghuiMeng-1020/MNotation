# MNotation Deployment

## Production

1. Set Worker secrets:
   - `AUTH_COOKIE_SECRET`
   - `QWEN_API_KEY` (optional)
   - Optional V3: `CUSTOM_LLM_BASE_URL`, `CUSTOM_LLM_API_KEY`, `CUSTOM_LLM_MODEL` (Ollama/vLLM OpenAI-compatible)
2. Web build optional: `VITE_SENTRY_DSN` for frontend error reporting (`@sentry/react`).
3. Apply D1 migrations (includes `0014_v3_features.sql`: span annotations, audit, webhooks, LLM confidence, etc.):
   - `npm run d1:migrate:remote`
4. Deploy API:
   - `npx wrangler deploy`
5. Deploy web:
   - `npm run build:web`
   - `npx wrangler pages deploy apps/web/dist --project-name=mnotation --branch=main`

## Staging

1. Create staging D1 and replace `database_id` in `wrangler.toml` under `env.staging`.
2. Ensure staging uses separate secrets:
   - `npx wrangler secret put AUTH_COOKIE_SECRET --env staging`
3. Apply staging migrations:
   - `npx wrangler d1 migrations apply mnotation_db_staging --env staging --remote`
4. Deploy staging API:
   - `npx wrangler deploy --env staging`
5. Run E2E against staging explicitly:
   - `API_BASE=https://<staging-worker-url> node scripts/e2e_full_test.mjs`

## Release Checks

- Confirm `apps/web/public/_headers` `connect-src` contains the correct API origin.
- Confirm CORS `ALLOWED_ORIGINS` includes the deployed frontend origin.
- Confirm D1 migrations are up to date before deployment.
# MNotation Deployment Runbook

## 1) Create Cloudflare Resources

```bash
wrangler d1 create mnotation_db
wrangler r2 bucket create mnotation-uploads
```

Update `database_id` in `wrangler.toml`.

## 2) Apply Migrations

```bash
wrangler d1 migrations apply mnotation_db --remote
```

## 3) Set Worker Secrets

```bash
wrangler secret put QWEN_API_KEY
wrangler secret put QWEN_BASE_URL
wrangler secret put OPENAI_API_KEY
wrangler secret put CF_ACCESS_TEAM_DOMAIN
wrangler secret put CF_ACCESS_AUD
```

## 4) Deploy API Worker

```bash
wrangler deploy
```

## 5) Deploy Frontend (Pages)

```bash
cd apps/web
npm run build
wrangler pages deploy dist --project-name mnotation
```

## 6) Configure Cloudflare Access

Create an Access application for the frontend domain and include allowed emails/groups.

The backend reads identity from `Cf-Access-Jwt-Assertion`.
