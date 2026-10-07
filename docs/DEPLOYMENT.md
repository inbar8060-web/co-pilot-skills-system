# Deployment (Supabase + Vercel or Netlify)

## 0. Rehearse locally

`npm run local:up` runs the production build (`next build` + `next start`) against the local Supabase stack at http://localhost:4000. It is the closest local equivalent of this deployment, so smoke-test there before pushing (see README, "Run it like production, locally"). The one intended difference is transport. The local build is plain http, so `next.config.ts` leaves out `upgrade-insecure-requests` and HSTS whenever `NEXT_PUBLIC_SUPABASE_URL` is a loopback http URL. On Vercel the URL is `https://<ref>.supabase.co` and both are sent.

## 1. Supabase project

1. Create a project (Postgres 17). Keep **asymmetric JWT signing keys** (default) so `getClaims()` verifies locally.
2. Link and push migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   Reference data (readiness tiers, credit rules, weekly insights, the four system prompts) ships inside the migration, so a freshly pushed project is functional. Do **not** run `supabase/seed.sql` in production (demo org, users and profiles only). Create the first super admin with the SQL editor:
   ```sql
   -- after the person signs up / is invited via the Auth dashboard:
   update public.users set role = 'super_admin' where email = 'you@company.com';
   ```
3. Auth settings: disable public sign-ups (accounts are provisioned by admins), set Site URL to your Vercel domain, add `https://<domain>/**` to redirect URLs, minimum password length 10, enable secure password change.
4. Confirm `wall` is **not** listed under Data API → exposed schemas (only `public`, `graphql_public`).
5. Run `npx supabase db advisors --linked` and keep security findings at zero.
6. Optional: enable `pg_cron` (Database → Extensions) so `expire-consents` (hourly) and `cleanup-rate-limits` (daily) run; the app also expires stale requests on read and refuses to approve them regardless.

## 2. Vercel project

Install the CLI (`npm i -g vercel`) or use the dashboard. Framework preset: Next.js. Node 24. Fluid Compute (default).

Environment variables (Production + Preview):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`) — **server only** |
| `AI_MODE` | `live` |
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `ANTHROPIC_MODEL` | `claude-opus-5` |
| `ANTHROPIC_EFFORT` | `medium` (raise to `high` if quality matters more than latency/cost) |

Then `vercel deploy --prod` (or connect the Git repo; CI runs lint/typecheck/tests/build and the DB job).

Route handlers declare `maxDuration` (120 s generation, 300 s batch upload). Paid model calls are capped per user, per organization and globally (`MODEL_BUDGETS` in `src/lib/rate-limit.ts`). The health check is `GET /api/health` (checks DB reachability, no secrets).

## 3. Operational checklist

- [ ] `npm run check` and `npm run test:rls` pass locally against a reset DB.
- [ ] Security headers verified on the deployed domain (CSP, HSTS, frame-ancestors none).
- [ ] Supabase advisors: no security errors.
- [ ] Secret key never appears in `NEXT_PUBLIC_*` or client bundles (`grep -r sb_secret .next/static` should be empty).
- [ ] Anthropic usage limits/alerts configured; rate limits in `src/lib/routines.ts` tuned to plan.
- [ ] Backups: Supabase PITR enabled for the project.

## 4. Schema changes

Edit/add files in `supabase/migrations`, apply locally with `npm run db:reset`, regenerate types with `npm run db:types`, run `npm run db:advisors` and `npm run test:rls`, then `npx supabase db push`.

## 5. Netlify (client demo host)

Netlify runs this app through its OpenNext adapter (`@netlify/plugin-nextjs`, installed automatically; never pin it in `netlify.toml`). `src/proxy.ts` runs as an Edge Function, and pages, server actions and route handlers run in one Node function. This was verified with adapter 5.16.1 and Next 16.3.8: a full `netlify build` plus `netlify serve` against the local stack, signing in through the real login form, every page for all three roles, the API guards and a PDF upload (`scripts/smoke-deploy.mjs`).

**Platform limits that shape the setup**
- Requests are cut off after **60 s** (not configurable), and `maxDuration` is ignored. Use `AI_MODE=mock` for demos. Live Claude calls (20-90 s) need a background-job design before they can run on Netlify.
- Request bodies are capped at **~4.5 MB**. Set `NEXT_PUBLIC_MAX_PDF_MB=4`. The uploaders send one PDF per request and check sizes in the browser.
- New Netlify projects are **private by default** (visitors need a Netlify login). Make the project public before sharing the link.

**One-time setup**
1. Hosted Supabase: create a free project in **us-east-2 (Ohio)**, close to Netlify's default function region, on **Postgres 17**, with the **Data API enabled**. Then:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push --dry-run
   npx supabase db push --include-seed   # first push only: migrations + demo data
   npx supabase db advisors --linked      # expect no security findings
   ```
   In Dashboard > Authentication: turn **off** "Allow new users to sign up", set Site URL to `https://<site>.netlify.app`, and add the redirect URL `https://<site>.netlify.app/**`.
2. Demo passwords: put the hosted URL and secret key in `.env.demo` (gitignored), then run `node --env-file=.env.demo scripts/rotate-demo-passwords.mjs`. It prints a fresh shared password once. The committed `Copilot-Dev-2026!` must never work on a public URL.
3. Netlify: `npx netlify-cli@27 login`, then `npx netlify-cli@27 sites:create` (or `link`), and set these for all contexts:
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (public; do not mark it secret, or secret scanning fails the build) |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` (secret) |
   | `AI_MODE` | `mock` |
   | `NEXT_PUBLIC_MAX_PDF_MB` | `4` |
4. Project configuration > General > Visitor access: set the project to **public**, and turn off the "Powered by Netlify" badge.

**Deploy**
```bash
npm run deploy:netlify            # draft URL, built with production env vars
npm run deploy:netlify -- --prod  # promote to the main URL
DEMO_PASSWORD='<password>' node --env-file=.env.demo scripts/smoke-deploy.mjs https://<site>.netlify.app
```
The build refuses to run if `NEXT_PUBLIC_SUPABASE_URL` is missing or points at the local stack (guard in `next.config.ts`), because `next build` would otherwise fall back to `.env.local`.

**Free-tier caveats.** Supabase Free pauses after about a week without activity (resume from the dashboard). Netlify credit-based Free spends 15 credits per production deploy out of 300 a month, so iterate with draft deploys, which are free. Accounts created on hosted Auth must use real-looking email domains (hosted GoTrue rejects example/test domains).
