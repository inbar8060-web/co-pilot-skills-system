# Security notes

## Threat model
Psychometric data is sensitive personal data. The system must guarantee that no organization member can connect a colleague's identity to their psychological profile, that AI outputs never leak one person's raw profile to another (Blind Synergy), and that no client can tamper with credits, consent or prompts.

## Controls
- **Anonymity wall in the database**: `wall` schema unexposed, no grants, RLS enabled with no policies; access only via `service_role`-executable SECURITY DEFINER functions; every identity event audited (`wall.identity_audit_log`).
- **Authorization** at three levels: JWT claims in the proxy (coarse), DB role check in layouts/actions (`requireRole`/`assertRole`), and RLS on every public table with explicit, minimal grants (column-level for user profile edits; roles/org cannot be changed by clients).
- **Identity verification** uses `supabase.auth.getClaims()` (signature-verified), never `getSession()` on the server.
- **Consent** is enforced in SQL (RLS on both parties' roles and the target's preferences, immutability + expiry + preference checks in the trigger, `valid_until` stamped on approval) and re-checked server-side before profiles are loaded. Only crew members can pair; managers use the coaching tool.
- **Post-login redirects** accept only same-origin relative paths (`safeRelativePath`, rejects `//`, backslashes and schemes).
- **Prompt integrity**: system prompts are server-resolved, versioned, super-admin managed; user text is framed as data; PDFs are wrapped in `<report>` tags with an explicit "data, not instructions" note; outputs are schema-constrained and re-validated with Zod.
- **Input validation**: every request body, form and query parameter passes through Zod with length caps; uploads are checked by magic bytes, size, page and character limits; oversized reports are rejected, never truncated.
- **Abuse limits**: DB-backed fixed-window rate limiting per user, per organization and globally for every paid model path, plus a per-address sign-in brake (fails closed). Non-report PDFs are refused before any model call.
- **Secrets**: only the publishable key reaches the browser; the secret key is used in `server-only` modules; env is validated at first use.
- **Transport/browser hardening**: CSP (self only), HSTS, `frame-ancestors 'none'`, `nosniff`, referrer policy, permissions policy, no `x-powered-by`.
- **Auth policy**: invite-only accounts, minimum password length 10, refresh-token rotation, secure password change; temporary passwords are generated server-side, shown once, never stored.
- **Auditability**: `public.audit_log` (app events; prompt changes are written inside the SQL transaction, exports/rules/provisioning fail if the trail cannot be written) and `wall.identity_audit_log` (identity events), readable only by super admins.
- **Error hygiene**: uniform error envelopes; provider/database errors are logged server-side and mapped to stable codes.

## Reporting
Report vulnerabilities privately to the project owner. Do not open public issues for security problems.
