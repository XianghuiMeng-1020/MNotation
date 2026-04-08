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
