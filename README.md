# Cognitive Copilot & Personal CRM

Just-in-time CRM/TEM copilot for aviation and other high-risk crews. Normalised psychometric profiles (MBTI Step I/II, Symbiotics ADAPT) drive practical briefings, debriefs and coaching guidance, behind a strict **anonymity wall** and with a CRM Credits gamification layer.

Stack: **Next.js 16 (App Router) · Tailwind 4 · Supabase (Postgres, Auth) · Claude (Anthropic SDK, structured outputs) · Vercel**.

## Quick start (local)

Prerequisites: Node 22.12+ (24 recommended), Docker Desktop running.

```bash
npm install
npm run db:start        # local Supabase on ports 553xx (Postgres 55322, API 55321)
npm run db:reset        # applies supabase/migrations + supabase/seed.sql
cp .env.example .env.local   # then paste the keys printed by `npx supabase status`
npm run dev             # http://localhost:3000
```

`.env.local` in this repo is already filled with the local demo keys printed by `supabase start` (they only work against the local stack).

### Run it like production, locally

`npm run local:up` is a local stand-in for the Vercel + Supabase deployment. It starts the local Supabase stack with Studio, runs `next build`, and serves the production build with `next start` at **http://localhost:4000**. The server is detached, so it keeps running after the terminal or editor closes. The web server is bound to 127.0.0.1 and is not reachable from the network. The command opens your default browser when the server is healthy.

> **Network exposure.** Docker Desktop publishes the Supabase ports (55321-55324: API, Postgres with the default `postgres` password, Studio, Mailpit) on every network interface by default. The Supabase CLI has no per-project bind address. `local:up` and `local:status` warn when this is the case. To keep them on this Mac, go to Docker Desktop > Settings > Docker Engine, add `"ip": "127.0.0.1"`, then Apply & restart. This is a global Docker setting and applies to all your containers.

| Command | What it does |
|---|---|
| `npm run local:up` | Start Docker if needed, then Supabase with Studio, build, serve and open the browser (`-- --no-build`, `-- --no-open`) |
| `npm run local:restart` | Stop, rebuild and restart the web server after code changes |
| `npm run local:status` | Health and URLs: app, Supabase API :55321, Studio :55323, Mailpit :55324, Postgres :55322 |
| `npm run local:logs` | Follow the server log (`.local/server.log`) |
| `npm run local:down` | Stop the web server (`-- --all` also stops Supabase; data volumes are kept) |

`LOCAL_PORT=4100 npm run local:up` picks another port. The build points at the local Supabase over plain http, so `upgrade-insecure-requests` and HSTS are left out (see `next.config.ts`). A Vercel build against `https://<ref>.supabase.co` keeps them. The Supabase containers restart with Docker, but the web server does not survive a reboot, so run `npm run local:up` again after one.

### Share it temporarily (client demo from this Mac)

`npm run share` opens a temporary public HTTPS link to the local production server through a Cloudflare quick tunnel. It needs no account and gives a random `https://<words>.trycloudflare.com` URL. Only the app is exposed; Supabase, Studio and Postgres stay private. Your client can open the link on a phone from any network.

| Command | What it does |
|---|---|
| `npm run share` | Start the local server if needed, give the demo accounts a fresh session password, open the tunnel and keep the Mac awake. It stops automatically after 24 h (`-- --hours N`, `0` = never; `-- --keep-password` skips the rotation) |
| `npm run share:status` | Link, health, expiry. `-- --show-password` prints the session password |
| `npm run share:stop` | Close the link and put the demo accounts back on the README password |

The tunnel binary is Cloudflare's signed `cloudflared`, kept in `.local/bin/` (gitignored). Download `cloudflared-darwin-arm64.tgz` from github.com/cloudflare/cloudflared/releases and check `codesign -dv` shows "Developer ID Application: Cloudflare Inc. (68WVV388M8)". The Mac must stay on, online and awake. Closing the lid on battery puts it to sleep even while sharing, and if it stays offline for long Cloudflare deletes the tunnel for good. `share:status` then shows "EXPIRED", and `npm run share` replaces it with a new link. Every restart gives a new URL; keep the lid open and plugged in while the client tests. While a share is running, local test scripts need the session password: `DEMO_PASSWORD=... npm run test:rls`. Ctrl-C or a crash during `share` cleans up after itself, and the next `share` or `share:stop` finishes the cleanup if needed.

### Demo accounts (password for all: `Copilot-Dev-2026!`)

Local stack only. On a hosted demo (Netlify), the seeded accounts get a fresh password from `scripts/rotate-demo-passwords.mjs` (see docs/DEPLOYMENT.md, "Netlify").

| Role | Email | Notes |
|---|---|---|
| Super admin | super@copilot.local | Identity mapping wall, research analytics, prompts, rules |
| Org admin | admin@skyline.local | Skyline Airways: users, ingestion, coaching, rewards |
| Crew (captain) | dana.captain@skyline.local | Report linked (ISTJ) |
| Crew (first officer) | yoav.fo@skyline.local | Report linked (ENFP) |
| Crew (pilot) | noa.pilot@skyline.local | No report linked; an unlinked profile with her candidate email exists for the Auto-match demo |

### AI modes

`AI_MODE=mock` (default in `.env.example`) runs the entire product without an API key using deterministic fixtures. Set `AI_MODE=live` and `ANTHROPIC_API_KEY` to call Claude (`ANTHROPIC_MODEL`, default `claude-opus-5`; `ANTHROPIC_EFFORT`, default `medium`).

## Design system

The UI follows the September 2026 redesign, updated with the October 2026 canvas concept (design map: [docs/design/canvas-concept/README.md](docs/design/canvas-concept/README.md)).

- **Crew canvas (pilot).** For organizations with the canvas turned on (super admin: Organizations → Crew canvas; the seeded Skyline Airways has it on), the crew home is a canvas of summary widgets with a contextual left toolbar and a bottom main bar. Crew can select a widget, use its tools, resize it (S/M/L/XL), hide it, add it back and reset the layout; layouts are saved per user. "Classic overview" in the account menu switches back. Drag-and-drop, pin, arrange, lock and the live guide come later.
- **Tokens** live in `src/app/globals.css` as OKLCH variables (`--bg`, `--card`, `--ink`, `--muted`, `--line`, `--acc`, `--brand`, `--ok`, `--warn`, `--bad`, plus soft variants) with a full dark theme under `[data-theme="dark"]`. Navy ink and accent; brand red is reserved for the single primary action per view; amber means pending; red outline means destructive. The theme is stored in a `theme` cookie and rendered server-side, so there is no flash and no inline script (CSP-safe). Type is Manrope via `next/font`.
- **Components** are in `src/components/ui.tsx` (page hero with dotted status line, stat tiles, cards, list rows, pills, chips, segmented control, radio cards, switch, tables) and `src/components/overlays.tsx` (modal, drawer, snackbar, theme). Chips, segmented controls, radio cards and switches are native inputs styled with `has-[:checked]`, so they post with plain forms.
- **Shells** are in `src/components/shell.tsx`: the crew app uses a top nav from 720 px and a five-tab bar plus "More" sheet on phones; both admin consoles use a 248 px sidebar from 1180 px, a 76 px icon rail from 720 px, and a drawer on phones.
- Breakpoints are redefined to match the design: `md` = 720 px, `xl` = 1180 px.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run share` / `share:status` / `share:stop` | Temporary public link to the local server via a Cloudflare quick tunnel (`scripts/share-tunnel.sh`) |
| `npm run deploy:netlify` (`-- --prod`) | Checked Netlify deploy: draft by default (`scripts/deploy-netlify.sh`, docs/DEPLOYMENT.md "Netlify") |
| `npm run smoke -- <url>` | End-to-end smoke test of a running build (`node --env-file=<env> scripts/smoke-deploy.mjs <url>`) |
| `npm run local:up` / `local:restart` / `local:status` / `local:logs` / `local:down` | Production build + local Supabase, detached on http://localhost:4000 (`scripts/local-server.sh`) |
| `npm run check` | lint + typecheck + unit tests + build |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:rls` | Integration checks of RLS + anonymity wall against the local DB (`scripts/rls-check.mjs`) |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase lifecycle |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the local schema |
| `npm run db:advisors` | Supabase security/performance linter |

## Project layout

```
supabase/migrations/   schema, RLS, wall functions, credit engine, reference data (single source of truth)
supabase/seed.sql      local demo data (never run in production)
src/proxy.ts           session refresh + coarse role gating (Next 16 proxy)
src/lib/               env validation, Supabase clients, auth guards, AI layer, orchestration
src/app/app            crew member app
src/app/admin          organization admin
src/app/super          super admin & research console
src/app/api            route handlers (generate insight, report upload, health, CSV export)
docs/                  ARCHITECTURE.md, DEPLOYMENT.md
SECURITY.md            threat model and controls
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
