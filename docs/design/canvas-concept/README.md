# Canvas concept: design map

Source: `Crew app — canvas concept1.html` (six interactive boards) and its PDF export, received 2026-10-07. The full extracted spec (tokens, every widget, label, state, interaction and guide step) and the mapping of each board onto this codebase are in [`spec/`](spec/): `spec-<board>.json`, `map-<board>.json` and `critique.json` (33 owner decisions, cross-board conflicts, phasing). This page is the readable summary.

## Status (2026-10-07)

**Built: crew canvas v1** (phases 1 and 2, plus hide, add, resize and reset from phase 4), behind the per-organization flag `organizations.canvas_enabled`.

| Decision | Taken for v1 | Change it by |
|---|---|---|
| Scope | Crew first. Admin consoles keep their layout but use the new colours | Phase 7–8 |
| Customisation | Curated layout + hide, add back, resize (S/M/L/XL), reset. No drag, pin, arrange or lock yet | Phase 4 |
| Brand | S³ as the mark (bars, login, consoles, favicon); the name stays "Cognitive Copilot" | One component: `BrandMark` in `src/components/icons.tsx` |
| Tier names | Bronze–Platinum from `readiness_tiers` (no "Ready → Proficient") | Data in `/super/rules` |
| Main-bar buttons | Navigate to full pages (History, Sharing, Report, Rewards); Start routine opens the briefing form | — |
| Colours | Red = the single primary action; amber = pending (Sharing badge, "to review"); red outline = destructive | Tokens in `globals.css` |
| Coaching chip, partner rank | Removed: crew routines only; partner rows show team, not rank | — |
| Consent revoke / report replace | Not offered (tools hidden) until the security work in phase 6 | Phase 6 |

Code: `src/lib/canvas/` (registry, layout validation and packing), `src/app/app/canvas/` (loader, widgets, frame, canvas), `src/components/canvas-shell.tsx`, migration `20261007000000_crew_canvas.sql`. Next: keyboard Move and drag, then the live guide.

**Built: full views** (phase 3). Every crew page now uses one template, `src/components/full-view.tsx`: the left bar sits where the canvas's does and lists the page's sections, the header has a KPI strip, and content is in widget-style panes on the same 12/6/1-column grid. A section is a view (`?view=key`; the first is the default and has no parameter), filters and pagination are links, and phones get section tabs. Routes and sections (default first): `/app/routines/new` Briefing, Partners · `/app/routines` (history) Sessions, Reflections · `/app/routines/[id]` Cards, Context, Reflect · `/app/consents` To review, Partners, My requests, Request · `/app/report` Overview, Privacy, Upload (only without a report) · `/app/rewards` Catalog, Redeemed, Earn, Log · `/app/insights` (new) This week, Past, All tips · `/app/settings` Profile, Sharing, Notify, Canvas (pilot organizations only). Widget tools, the main bar (Start routine → `/app/routines/new`, History → `/app/routines`) and the account menu link straight to these views; old in-page anchors (`#reflection`, `#request`, `#partners`, `#requests`) are forwarded to the matching view. Deferred: revoking a consent and cancelling a sent request (new statuses and a `consent_guard` change, phase 6); replacing a report; the credit ledger lives at `/app/rewards?view=activity`, not a separate route; coaching sessions are left out of History and the session count (still reachable by link); on tablets a span-4 pane beside a span-8 one takes half the width and leaves a gap (template change); resetting the canvas also clears the insight snooze. The no-report state of `/app/report` has only been checked in code.

## 1. The concept in one paragraph

Every role's home becomes a **canvas**: summary **widgets** on a 12-column grid (row unit 72 px, 20 px gutters, dotted background) that the user can select, move, resize (S/M/L/XL), hide and add back. Two bars replace today's navigation. A floating **main bar** at the bottom holds the destinations and global tools. A **contextual left bar** shows dashboard tools when nothing is selected (Add, Arrange, Reset, Lock) and the selected widget's own actions when one is selected: its primary action first, then Pin, Resize, Hide and Esc. A 12-step **live guide** teaches the system. Widgets are summaries; each one's left-bar actions lead to the full data on a destination page.

## 2. Design language (delta from the September 2026 system)

| Token | Concept | Today | Note |
|---|---|---|---|
| Ink and accent | `#0E153E` navy | `oklch(0.22 0.02 250)` / `--acc` blue | Navy carries text, outlines, selected state and progress |
| Brand / primary CTA | `#BD2025` red | `--acc` blue | One red primary action per view; must stay distinct from `--bad` |
| Surfaces | `oklch(0.975 0.006 275)` canvas, `oklch(0.998 0.002 275)` cards | hue 240/250, same lightness | Mostly a hue shift to 275 |
| Lines | `oklch(0.9 0.012 275)`, strong `oklch(0.84 0.018 275)` | same lightness, hue 240 | |
| Soft tint | `oklch(0.93 0.03 275)` (chips, pills, Insight card) | `--accsoft` | |
| Muted text | `oklch(0.5 0.035 275)` | `oklch(0.5 0.02 250)` | |
| OK | `oklch(0.52 0.12 155)` | identical | |
| Pending | red text on `oklch(0.95 0.03 25)` | amber `--warn` | Recommend keeping amber for pending (the guide itself says "orange dot") |
| Radius | 12 px on everything | 10–16 px | |
| Type | Manrope 500–800, 15 px base | same | Toolbars scale with one unit: `clamp(10px, 0.9vw, 13px)` |
| Canvas background | 24 px dot grid | flat | Decorative only |
| Brand mark | "S³" logo (navy S, red 3) | dot + "Cognitive Copilot" | Owner decision |
| Dark theme | not designed | full dark theme exists | Must be derived |

## 3. Layout system

- **Desktop (1180 px and up):** shell = left bar column, canvas, mirror gutter; 12 columns, `grid-auto-rows: minmax(72px, auto)`, gap 20. The default crew layout has three bands, each 3 rows tall: Start 7 + Credits 5 / Recent 4 + Insight 4 + Partners 4 / Report 3 + Rewards 5 + a free 4×3 slot ("4 × 3 free · drop a widget here").
- **Sizes:** S is always 2 rows, M and L are 3 rows and XL is 4 rows. Recent routines: S 3×2 (2 titles + "+6 more"), M 4×3 (3 rows + "History · 8 sessions →"), L 5×3 (4 rows with scenario and date, filter chips), XL 8×4 (table: Routine, Scenario, Partner, Mode, Date, "5 of 8 sessions", "Full history →"). Start: S 4×2 (a single picker plus the red play button), M 7×3. Credits: S 3×2, M 5×3. **Text never scales; the amount shown does.**
- **Phone (under 720 px):** a single column, a header row (logo and avatar), a 5-slot floating bar (Start, History, Sharing, Rewards, More), and a bottom sheet for the selected widget's tools (for example Confirm, Past, Snooze, Pin, Hide). No resize or drag on phones.
- **Tablet (720–1180 px):** not designed. Recommend collapsing Add, Layout, Search, Theme and Guide into a More menu.

## 4. Crew canvas: widget → full view

| Widget (default) | Shows | Left-bar actions | Full data lives on | What the full page adds | Status today |
|---|---|---|---|---|---|
| Start a routine (M 7×3) | Routine chips, partner line, **Continue to briefing** | Continue, Partner, Context, Last used | `/app/routines/new` (the briefing form moves here) | Explicit partner picker (Solo, each partner with "approved · n days", "no consent for this routine", "no report yet", "request pending"), aircraft, phase and scenario, "Last used" prefill | Data available. The **Coaching** chip must go (crew cannot coach) |
| Credits & tier (M 5×3) | Balance, earned / next threshold, bar, streak | Redeem, Rules, Log | `/app/rewards` + ledger (`?view=activity`) | Balance versus lifetime earned, the whole tier ladder, every credit earned and spent | Streak goes stale after inactivity; needs an effective streak |
| Recent routines (S–XL) | 2–5 sessions with a mode pill | Open last, Copy cards, Reflect, Filter | `/app/routines` (becomes the full history) → `/app/routines/[id]` | Filters (All / Solo / Synergy / routine), table, pagination, reflection status, credits per session | Available; needs a title map and relative dates |
| Insight · Week n (4×3) | Tip of the week, **Confirm read · +10** | Confirm, Past, Snooze | New `/app/insights` | Every past week with read / not read, snooze state, the rule | Archive page and snooze storage missing |
| Consented partners (4×3) | Partners, validity, pending | Request, Review, Revoke | `/app/consents` restructured | **To review** (approve/decline inline), **Sharing with me**, **My requests** (+ Cancel), **I share with** (+ Revoke) | Revoke and Cancel do not exist; per-routine validity needed |
| My report (3×3) | Verified, framework, how it was linked | Upload, Privacy, Preview | `/app/report` (Privacy view) | Profile summary, link method ("uploaded by you" / "matched automatically" / "linked by an administrator"), privacy explainer | Replace is impossible today |
| Rewards catalog (5×3) | 2–3 reward cards, Redeem | Catalog, Redeemed, Rules | `/app/rewards` (Catalog, Redeemed, Earn views) | Every reward, redemption timeline, earning rules | Available |
| *Latest briefing* (recommended, L/XL) | Card titles of the newest session, **Copy all cards →** | Open, Copy, Reflect | `/app/routines/[id]` | — | New; closes the main loop the concept leaves out |
| Free slot | "w × h free · drop a widget here" | — | Widget library drawer (Add) | — | Needs layout persistence |

The **main bar** always navigates: Start routine → `/app/routines/new`, History → `/app/routines`, Sharing → `/app/consents`, Report → `/app/report`, Rewards → `/app/rewards`, account → menu with Settings, Appearance, switch links and Sign out.

## 5. Org admin canvas (Dashboard, Users, Ingestion, Coaching, Rewards)

| Widget | Full view | Notes |
|---|---|---|
| Crew members / Reports loaded / Avg. credits / Reflections (KPIs) | `/admin/users`, `/admin/users?report=missing`, new `/admin/engagement/credits`, `/admin/engagement/reflections` | Trend pages need new aggregate RPCs (weeks parameter, zero-filled weeks). Never per person |
| Weekly activity (8×4 table) | `/admin/engagement/activity?weeks=8\|16\|26` | Concept counts Coaching in Total; current code excludes it. Recommend keeping it out of Total |
| Readiness tiers, Sharing requests, Training-needs signal | `/admin/rules` (read-only), `/admin/engagement/sharing`, `/admin/engagement/activity` | Aggregates only; suppress slices with n < 5 |
| Anonymity wall (info) | New `/admin/privacy` | Explains what the admin sees on each page |
| Users & crews table, Teams, Missing reports, Invite | `/admin/users` (paginated, report filter), `/admin/users/teams`, `/admin/users/invitations` | No team entity, invitation flow or email exists; the board's Role/Category values do not match the schema |
| Profiles in the wall, Batch upload, How mapping works | `/admin/ingest` | Concept stages files before upload; current flow uploads on drop |
| Coaching guidance, How it works, Sessions this month | `/admin/coaching/[id]`, `/admin/coaching/history` | "Tone you are aiming for" field does not exist yet |
| Redemption requests, Catalog, Add a reward | `/admin/rewards/requests`, `/admin/rewards/catalog` | No reward editing today; "Draft" state does not exist |

## 6. Super admin canvas (Overview, Mapping, Analytics, Prompts, Rules, Organizations)

| Widget | Full view | Notes |
|---|---|---|
| Organizations / Users / Reports linked / Unlinked / Routine sessions | `/super/organizations/[id]` (new), `/super/users` (new), `/super/mapping`, new `/super/usage` | Counting unlinked profiles should not fetch identity hints |
| Recent audit events | New `/super/audit` (paging, filters, metadata) | The concept's action names differ from the real ones |
| System health | New `/api/super/health` + drawer | Database, Auth and Last deploy have no source today; never call the model in a health check |
| Unlinked profiles, Active mappings, Identity audit log | `/super/mapping` (full lists, paging, `/super/mapping/log`) | Wall data never leaves this console; no exports of mappings |
| Dimension averages, By organization / category / type code | `/super/analytics` | Keep "By gender" (dropped by the concept) as an optional widget |
| Prompt versions, Playground, New version | `/super/prompts/[family]` (history, diff, rollback) | |
| Actions & credits, Readiness tiers | `/super/rules` | Keep the real 6 rules and seed values; "Add rule/tier" cannot work |
| Organizations table, New organization, New admin | `/super/organizations` | The concept's admin form omits Full name |

## 7. Conflicts with product rules (must be resolved before building)

1. **Coaching as a crew routine.** The crew canvas offers "Coaching"; coaching is an org-admin tool. Remove it from the crew canvas.
2. **Tier names.** "Ready → Proficient" on crew boards versus Bronze to Platinum elsewhere and in the database. Readiness wording reads like an operational proficiency rating in aviation.
3. **Partner rows show rank** ("Captain", "First officer"). `crew_directory()` deliberately hides operational category. Show team, or get privacy sign-off.
4. **Consent lifecycle.** "Revoke", "Cancel" and "a number of days" do not exist. These are security-relevant changes to `private.consent_guard` and RLS.
5. **Report "add or replace"** and "linked by your admin". Crew cannot replace a report, and only the super admin links reports.
6. **Insight "chosen for crews like yours".** It is a fixed six-tip weekly rotation.
7. **Org admin "Remind" on sharing requests** would be consent pressure. "Invite by email" needs SMTP.
8. **One red for everything.** The concept uses red for CTAs, pending and alerts. Recommend: red = the single primary action, amber = pending, red outline = destructive.
9. **Admin main bars.** The text tabs overlap in the boards ("Dashboar Users & c…"), a defect in the concept's toolbar CSS.
10. **No dark theme** and no tablet layout were designed; both must be derived.

## 8. New platform capabilities

| Capability | Proposal |
|---|---|
| Layout persistence | `public.user_canvas_layouts(user_id, surface, page, layout jsonb, layout_version)`: desktop placements, phone order, sizes, hidden, pinned, snoozed. Owner-only RLS, explicit grants, Zod-validated against a widget registry |
| Guide progress | `public.user_guide_progress(user_id, guide, step, completed_at, dismissed_at)`; new users only, never reopened after Skip |
| Credit ledger | `my_credit_summary()` + `/app/rewards/activity` over `gamification_logs` |
| Insight archive and snooze | `/app/insights`; snooze in the layout row |
| Consent revoke / cancel | New statuses, rewritten guard, RLS cases in `scripts/rls-check.mjs`, separate security review |
| Admin aggregates | Windowed RPCs with k ≥ 5 suppression; CSV with critical audit |
| Search | v1: navigation palette (pages, widgets, commands) plus own sessions; never people or wall data |
| Accessibility | Keyboard "Move" mode before pointer drag (WCAG 2.5.7), roving-tabindex toolbars, Escape order: dialog → guide → selection |

## 9. Recommended phasing

0. **Decide** (this page's open questions) and fix copy that is wrong today.
1. **Foundations:** hue-275 tokens with dark values, brand red, icon set, `WidgetFrame` primitive, data fixes (effective streak, scenario context, coaching out of crew history).
2. **Crew canvas v1:** fixed curated layout behind a per-org flag; main bar + left bar; seven widgets at M with every state; phone pattern. No drag yet.
3. **Full views:** detail-page template, then `/app/routines/new`, history, Sharing restructure, Report + Privacy, Rewards anchors + ledger, Insights archive, Settings.
4. **Personalisation:** layout table, Hide / Add / Reset / Lock, S–XL sizes, keyboard Move, then pointer drag, then Pin and Arrange.
5. **Live guide.**
6. **Consent and report changes** (security review).
7. **Org admin canvas**, then 8. **super admin canvas**, then 9. polish (search, RTL if chosen, visual regression).
