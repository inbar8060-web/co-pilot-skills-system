#!/usr/bin/env bash
# Deploy to Netlify with the CLI (build runs on this machine with the site's production env vars).
#
#   npm run deploy:netlify            draft deploy (unique URL, nothing public changes)
#   npm run deploy:netlify -- --prod  production deploy (the site's main URL)
#
# One-time setup (see docs/DEPLOYMENT.md, "Netlify"): `npx netlify-cli@27 login`, then link or
# create the site, then set the env vars. This script never prints variable values.
set -euo pipefail
cd "$(dirname "$0")/.."

NETLIFY=(npx --yes netlify-cli@27.10.2)
REQUIRED=(NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY AI_MODE)
prod=false
for arg in "$@"; do
  case "$arg" in
    --prod) prod=true ;;
    *) echo "usage: $0 [--prod]" >&2; exit 1 ;;
  esac
done

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

say "Checking Netlify login and site link..."
status="$("${NETLIFY[@]}" status 2>&1 || true)"
grep -qi "not logged in" <<<"$status" && die "not logged in. Run: npx netlify-cli@27 login"
[[ -f .netlify/state.json ]] && grep -q '"siteId"' .netlify/state.json || die "this folder is not linked to a Netlify site. Run: npx netlify-cli@27 link  (or sites:create)"

say "Checking production environment variables (names only)..."
env_json="$("${NETLIFY[@]}" env:list --context production --json 2>/dev/null)" || die "could not read the site's environment variables."
missing="$(REQUIRED="${REQUIRED[*]}" node -e '
  let raw = ""; process.stdin.on("data", (d) => (raw += d)).on("end", () => {
    const vars = JSON.parse(raw || "{}");
    const missing = process.env.REQUIRED.split(" ").filter((k) => !vars[k]);
    const url = vars.NEXT_PUBLIC_SUPABASE_URL || "";
    if (url && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) missing.push("NEXT_PUBLIC_SUPABASE_URL(must be https://<ref>.supabase.co)");
    if (vars.AI_MODE && !["mock", "live"].includes(vars.AI_MODE)) missing.push("AI_MODE(mock|live)");
    if (vars.AI_MODE === "live" && !vars.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY(required for AI_MODE=live)");
    process.stdout.write(missing.join(" "));
  });' <<<"$env_json")"
[[ -z $missing ]] || die "missing or invalid on the Netlify site: $missing"

say "Lint, typecheck, unit tests..."
npm run -s lint
npm run -s typecheck
npm run -s test

if $prod; then
  say "Building and deploying to PRODUCTION..."
  "${NETLIFY[@]}" deploy --build --prod --context production
else
  say "Building a DRAFT deploy (production env vars, unique URL)..."
  "${NETLIFY[@]}" deploy --build --context production
fi

cat <<'EOF'

Next: smoke-test the URL printed above (demo password from scripts/rotate-demo-passwords.mjs):
  DEMO_PASSWORD='<password>' node --env-file=.env.demo scripts/smoke-deploy.mjs <deploy-url>
EOF
