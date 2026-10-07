# Architecture

## Roles and surfaces

| Role | Surface | Can see |
|---|---|---|
| `end_user` (crew) | `/app` | Own report summary, own routines, own credits, sharing requests they sent/received |
| `org_admin` | `/admin` (+ `/app`) | Members of their org with **Report loaded: Yes/No** only, anonymous profile codes, aggregate engagement, rewards, coaching guidance |
| `super_admin` | `/super` (+ `/admin`, `/app`) | Identity ↔ token mapping, de-identified research rows, prompts, rules, audit logs |

Role is stored in `public.users.role` (authoritative) and mirrored into `auth.users.raw_app_meta_data` by trigger so the JWT can gate routes cheaply in `src/proxy.ts`. Layouts and actions re-check the DB via `requireRole` / `assertRole`.

The session cookie has a fixed name, `sb-copilot-auth-token` (`src/lib/supabase/cookie.ts`). The default name is derived from the Supabase host, so every local stack on 127.0.0.1 would share `sb-127-auth-token`, and localhost cookies are not port-scoped. A session that verifies but has no `users` row (deleted account) is sent to `/auth/signout`, which clears the cookie. Redirecting to `/login` directly would bounce back to the app.

## The anonymity wall

* Schema `wall` holds `anonymous_profiles` (normalised persona + raw hints), `user_profile_mappings` and `identity_audit_log`.
* `wall` is **not** in PostgREST's exposed schemas and has no grants for `anon`/`authenticated`. Even the service role cannot select those tables through the Data API.
* The only doors are `public.admin_wall_*` SECURITY DEFINER functions whose `EXECUTE` is granted to `service_role` alone. They are called from server code (`src/lib/supabase/admin.ts`) after an application-level role check, and every link/unlink/ingest/auto-match is written to `wall.identity_audit_log`.
* End users read their own summary through `admin_wall_get_profile_for_user(auth user id)` on the server. Org admins get `admin_wall_list_profiles` (codes + linked flag only). Super admins get mappings and research rows (which never include user ids, names or emails).
* `users.has_active_report` is maintained by trigger on the mapping table — that is the only signal org admins receive.

## Consent (Blind Synergy)

`consent_requests` are created by the requester (RLS `WITH CHECK` pins `requester_user_id = auth.uid()`, same org, both parties crew members, and the target's sharing preferences allow the routine) and resolved only by the target. The `consent_guard` trigger makes every other column immutable, enforces `pending → approved|declined|expired`, refuses to approve a time-expired request, re-checks the target's preferences, and stamps `valid_until` (now + 30 days) on approval. `valid_until` is the single definition of the approval window: the routines page and the generation route both read it. Pending requests expire after 14 days (pg_cron job, plus `expire_stale_consents()` which any member can run for their org before sending a new request). The route handler re-validates consent, sharing level and allowed scenarios server-side before any profile is loaded.

## AI pipeline

`POST /api/generate-routine-insight` → `runCrewRoutine` (`src/lib/routines.ts`):

1. `getClaims()` identity → users row.
2. DB-backed rate limit (`admin_check_rate_limit`, fixed window, fails closed).
3. Load primary persona through the wall (409 if none).
4. Partner: same org, has report, sharing level ≠ private, scenario allowed, approved consent < 30 days.
5. Active system prompt for the family (`system_prompts`, versioned; never accepted from the client).
6. `client.messages.parse` with a Zod `output_config.format` (structured outputs) → validated again with Zod. Refusals map to 422, upstream failures to 502/503, never leaking provider errors.
7. Session saved, credits awarded through the DB engine, audit row written.

`AI_MODE=mock` swaps step 6 for deterministic fixtures so the product runs end-to-end without a key. Rate limits apply per user, per organization and globally (`enforceModelBudget`).

Report ingestion (`/api/reports/upload`) parses the PDF text layer (`unpdf`, 10 MB / 120 pages / 80k chars limits, magic-byte check), pre-screens for psychometric vocabulary before any model call, normalises it with the `normalize_report` prompt into the `Persona` schema, rejects low-confidence/non-report documents, stores it behind the wall, and (self-upload only) links it and awards the one-time 100 credits.

## Gamification

`public.admin_award_credits(user, action)` is the only path that grants credits: it locks the status row, reads `gamification_rules` (credits, cooldown kind/limit), counts prior awards in the window, updates totals, recomputes the tier from `readiness_tiers`, maintains the weekly streak and awards the streak bonus. Redemptions run through `public.redeem_reward` (balance + inventory under row locks; it snapshots the reward title and whether stock was taken), and cancellation refunds via trigger (restocking only what was taken). Changing tier thresholds recomputes every stored tier via a statement trigger.

System prompts are versioned; `admin_create_prompt_version` / `admin_activate_prompt` switch the active version atomically (advisory lock) and write their own audit rows. Privileged app-level operations (exports, rule changes, provisioning) use `audit(..., { critical: true })`, which aborts the operation if the trail cannot be written.

## Crew canvas (pilot)

Organizations with `organizations.canvas_enabled` (set by a super admin in `/super/organizations`, audited as `organization.canvas`) get the canvas home: `src/app/app/layout.tsx` swaps `CrewShell` for `CanvasShell` (bottom main bar, phone header and 5-slot bar), and `/app` renders `CrewCanvas` instead of the classic overview. Each user may switch back with "Classic overview" in the account menu (stored as `classic` in their layout).

- **Widgets** are declared in `src/lib/canvas/registry.ts` (sizes as column × row spans, defaults, role and organization gating). `src/lib/canvas/layout.ts` validates stored layouts with Zod, repairs them against the registry, and packs the visible widgets first-fit into the 12-column desktop and 6-column tablet grids, returning the free cells for the dashed slots. Phones show one column in reading order.
- **Layouts** are stored in `public.user_canvas_layouts (user_id, surface, page, layout, layout_version)`: owner-only RLS for select, insert, update and delete, a JSON-object check and an 8 KB cap. `saveCanvasLayout` (`src/app/app/canvas-actions.ts`) re-validates and repairs every write.
- **Data** for all widgets is read in one parallel round through the user's RLS client (`src/app/app/canvas/load.ts`); only display strings and the report's link metadata (never the persona) reach the browser.
- Widget tools only link to existing pages and actions; tools without a backend (revoke consent, insight archive, pin, arrange, lock) are not shown.

## Data access matrix (RLS)

Every public table has RLS enabled and explicit grants; `anon` has none. See the policy block at the end of `supabase/migrations/20260914000000_init.sql`. `scripts/rls-check.mjs` asserts the important negative cases (privilege escalation, cross-user reads, forging consent, direct session inserts, wall access with a JWT, canvas layouts read or written by anyone but their owner, the canvas flag changed by a member).
