#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const apiOrigin = process.env.VITE_API_BASE ?? "https://mnotation-api.xmeng19.workers.dev";
const target = resolve(process.cwd(), "public/_headers");

const content = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' ${apiOrigin}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
`;

writeFileSync(target, content, "utf8");
console.log(`[headers] generated with API origin: ${apiOrigin}`);
