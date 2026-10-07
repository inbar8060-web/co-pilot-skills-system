#!/usr/bin/env bash
# Temporary public HTTPS link to the local production server (npm run local:up), so someone on
# another network (e.g. a client on a phone) can try the app. Uses a Cloudflare quick tunnel:
# no account, random https://<words>.trycloudflare.com URL, only the app port is exposed
# (Supabase, Studio and Postgres stay private).
#
#   npm run share                start (auto-stops after 24 h; -- --hours N, 1-720, 0 = never)
#   npm run share:status         URL, health, expiry (password: -- --show-password)
#   npm run share:stop           stop the tunnel and restore the README demo password
#
# While sharing, the demo accounts get a fresh random password (stored in .local/share.env,
# mode 600) instead of the README one. Pass -- --keep-password to skip that.
#
# Crash safety: share.env records each step BEFORE it happens (ROTATED=1 before the password
# changes), start cleans up on Ctrl-C/errors, and both start and stop reconcile a session that
# died half-way (SIGKILL, reboot), so the password is always restorable and no timer is orphaned.
set -euo pipefail
cd "$(dirname "$0")/.."

STATE_DIR=".local"
CLOUDFLARED="$STATE_DIR/bin/cloudflared"
TUNNEL_PID_FILE="$STATE_DIR/tunnel.pid"
TUNNEL_LOG="$STATE_DIR/tunnel.log"
SHARE_ENV="$STATE_DIR/share.env"     # SHARE_URL, SHARE_PASSWORD, SHARE_EXPIRES, ROTATED, TIMER_PID
PW_TMP="$STATE_DIR/share.pw"
AUTOSTOP_LOG="$STATE_DIR/share-autostop.log"
LOCK_FILE="$STATE_DIR/share.lock"
SERVER_PID_FILE="$STATE_DIR/server.pid"
MAX_HOURS=720

say() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Same kernel-lock pattern as local-server.sh: released automatically if this shell dies. Waits
# up to 15 s, because short-lived children of a just-killed run (curl, dig) can hold it briefly.
acquire_lock() {
  mkdir -p "$STATE_DIR"
  exec 9>>"$LOCK_FILE"
  perl -MFcntl=:flock -e 'open(my $fh, ">&=", 9) or exit 2;
    for (1 .. 60) { exit 0 if flock($fh, LOCK_EX | LOCK_NB); select(undef, undef, undef, 0.25) } exit 1' ||
    die "another share command is already running."
}

SHARE_URL=""; SHARE_PASSWORD=""; SHARE_EXPIRES=""; ROTATED=0; TIMER_PID=""
load_share_env() {
  SHARE_URL=""; SHARE_PASSWORD=""; SHARE_EXPIRES=""; ROTATED=0; TIMER_PID=""
  [[ -f $SHARE_ENV ]] || return 0
  local k v
  while IFS='=' read -r k v || [[ -n $k ]]; do
    v="${v%$'\r'}"
    case "$k" in
      SHARE_URL) SHARE_URL=$v ;; SHARE_PASSWORD) SHARE_PASSWORD=$v ;; SHARE_EXPIRES) SHARE_EXPIRES=$v ;;
      ROTATED) [[ $v == 1 ]] && ROTATED=1 ;; TIMER_PID) TIMER_PID=$v ;;
    esac
  done <"$SHARE_ENV"
  return 0
}

write_share_env() {
  local tmp="$SHARE_ENV.tmp"
  ( umask 077
    { echo "SHARE_URL=$SHARE_URL"
      [[ -n $SHARE_PASSWORD ]] && echo "SHARE_PASSWORD=$SHARE_PASSWORD"
      echo "SHARE_EXPIRES=$SHARE_EXPIRES"
      echo "ROTATED=$ROTATED"
      echo "TIMER_PID=$TIMER_PID"
    } >"$tmp" )
  mv -f "$tmp" "$SHARE_ENV" # atomic: a crash never leaves a half-written record
}

# The tracked PID counts only if it is still a cloudflared process (no signalling recycled PIDs).
# Cloudflare deletes a quick tunnel that stays disconnected for a while (lid closed on battery,
# network lost). cloudflared then retries forever with "Tunnel not found" and the URL is gone for
# good, so a live process is not enough to call the share running.
tunnel_expired() {
  [[ -f $TUNNEL_LOG ]] || return 1
  local last_ok last_gone
  last_ok="$(grep -n 'Registered tunnel connection' "$TUNNEL_LOG" | tail -1 | cut -d: -f1 || true)"
  last_gone="$(grep -n 'Tunnel not found' "$TUNNEL_LOG" | tail -1 | cut -d: -f1 || true)"
  [[ -n $last_gone ]] && (( last_gone > ${last_ok:-0} ))
}

tunnel_pid() {
  local pid; pid="$(cat "$TUNNEL_PID_FILE" 2>/dev/null || true)"
  [[ $pid =~ ^[0-9]+$ ]] && ps -p "$pid" -o comm= 2>/dev/null | grep -q cloudflared && echo "$pid" || true
}

app_port() {
  local port=""
  [[ -f $SERVER_PID_FILE ]] && read -r _ port _ <"$SERVER_PID_FILE" || true
  [[ $port =~ ^[0-9]+$ ]] && echo "$port" || echo 4000
}

app_healthy() { curl -fsS --max-time 3 "http://127.0.0.1:$(app_port)/api/health" 2>/dev/null | grep -q '"status":"ok"'; }

# Check the public URL without any caching resolver: querying a brand-new quick-tunnel hostname
# before it exists makes resolvers (this Mac's, or 1.1.1.1 for everyone using it) cache
# "not found" for a while. Cloudflare's authoritative nameserver for the zone never does.
AUTH_NS=""
public_curl() {
  local host ip; host="${SHARE_URL#https://}"; host="${host%%/*}"
  [[ -n $AUTH_NS ]] || AUTH_NS="$(dig +short +time=2 +tries=1 NS trycloudflare.com @1.1.1.1 2>/dev/null | head -1 || true)"
  ip="$(dig +short +time=2 +tries=1 "$host" A ${AUTH_NS:+"@$AUTH_NS"} 2>/dev/null | grep -E '^[0-9.]+$' | head -1 || true)"
  [[ -n $ip ]] || return 1
  curl -fsS --max-time 5 --resolve "$host:443:$ip" "$@"
}

detach() { # run "$@" in its own session, surviving this shell; prints its PID
  nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec: $!"' -- "$@" </dev/null >/dev/null 2>&1 9>&- &
  echo $!
}

stop_tunnel() {
  local pid; pid="$(tunnel_pid)"
  if [[ -n $pid ]]; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi
  fi
  rm -f "$TUNNEL_PID_FILE"
}

# Kill the recorded auto-stop timer, unless it is the process running this very stop.
kill_timer() {
  [[ $TIMER_PID =~ ^[0-9]+$ && $TIMER_PID != "$$" ]] || return 0
  if ps -p "$TIMER_PID" -o command= 2>/dev/null | grep -q "share-tunnel.sh stop"; then
    pkill -P "$TIMER_PID" 2>/dev/null || true # its pending `sleep`
    kill "$TIMER_PID" 2>/dev/null || true
  fi
}

# Returns non-zero when the README password could not be put back.
restore_password() {
  [[ $ROTATED == 1 || -f $PW_TMP ]] || return 0
  if node --env-file=.env.local scripts/rotate-demo-passwords.mjs --allow-local --restore-readme >/dev/null; then
    rm -f "$PW_TMP"
    say "Demo accounts are back on the README password."
    return 0
  fi
  warn "could not restore the README demo password (is Supabase running?). It is still recorded in $SHARE_ENV; run npm run share:stop again."
  return 1
}

# Tear down whatever a session left behind. Keeps share.env (ROTATED=1 only) if the restore fails.
teardown() {
  stop_tunnel
  kill_timer
  TIMER_PID=""
  if restore_password; then
    rm -f "$SHARE_ENV"
  else
    SHARE_URL=""; SHARE_EXPIRES=""; ROTATED=1; write_share_env
    return 1
  fi
}

START_DONE=false
on_start_exit() {
  $START_DONE && return 0
  warn "start did not finish; closing the tunnel and restoring the demo password."
  load_share_env
  teardown || true
}

start() {
  local hours=24 keep_password=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --hours)
        [[ ${2:-} =~ ^[0-9]+$ ]] || die "--hours needs a whole number (0 = never, max $MAX_HOURS)"
        hours=$((10#$2)) # base 10: "08" is 8, not an octal error
        (( hours <= MAX_HOURS )) || die "--hours must be at most $MAX_HOURS (30 days), or 0 for never"
        shift 2 ;;
      --keep-password) keep_password=true; shift ;;
      *) die "unknown flag: $1" ;;
    esac
  done
  acquire_lock
  [[ -x $CLOUDFLARED ]] || die "cloudflared is not installed at $CLOUDFLARED (see README, 'Share it temporarily')."
  load_share_env
  # SHARE_EXPIRES is written by start's last step, so only a session that got that far counts.
  if [[ -n "$(tunnel_pid)" && -n $SHARE_URL && -n $SHARE_EXPIRES ]] && ! tunnel_expired; then say "Already sharing at $SHARE_URL"; print_status false; exit 0; fi

  # A previous session died half-way (SIGKILL, reboot, crash): clean it up before starting over.
  if [[ -f $SHARE_ENV || -f $PW_TMP || -n "$(tunnel_pid)" ]]; then
    if tunnel_expired; then
      say "The previous link expired (Cloudflare removes it after the Mac was asleep or offline); replacing it..."
    else
      say "Cleaning up an unfinished earlier session..."
    fi
    teardown || die "the earlier session's demo password could not be restored; fix that first (npm run share:stop)."
  fi
  if [[ -f ~/.cloudflared/config.yml || -f ~/.cloudflared/config.yaml ]]; then
    warn "~/.cloudflared/config.yml exists; quick tunnels may refuse to start while it is present."
  fi

  if ! app_healthy; then
    say "The local server is not running; starting it first..."
    bash scripts/local-server.sh up --no-open
  fi
  app_healthy || die "the local server is not healthy (npm run local:status)."
  local port; port="$(app_port)"

  trap on_start_exit EXIT
  trap 'exit 130' INT TERM

  ROTATED=0; SHARE_PASSWORD=""; SHARE_URL=""; SHARE_EXPIRES=""; TIMER_PID=""
  if ! $keep_password; then
    ROTATED=1; write_share_env # record the intent first, so any interruption can still restore
    say "Giving the demo accounts a fresh password for this session..."
    node --env-file=.env.local scripts/rotate-demo-passwords.mjs --allow-local --out "$PW_TMP" >/dev/null
    SHARE_PASSWORD="$(sed -n 's/^SHARE_PASSWORD=//p' "$PW_TMP")"
    write_share_env
    rm -f "$PW_TMP"
  else
    write_share_env
  fi

  say "Opening the tunnel..."
  : >"$TUNNEL_LOG"
  # 127.0.0.1, not localhost: the server binds IPv4 loopback only. cloudflared keeps the public
  # Host header, so server-action origin checks and the proxy's CSRF check see the real host.
  local pid; pid="$(detach "$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$port" --logfile "$TUNNEL_LOG" --loglevel info)"
  echo "$pid" >"$TUNNEL_PID_FILE"

  for _ in $(seq 1 45); do
    SHARE_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
    [[ -n $SHARE_URL ]] && break
    kill -0 "$pid" 2>/dev/null || { tail -20 "$TUNNEL_LOG" >&2; die "cloudflared exited (log: $TUNNEL_LOG)."; }
    sleep 1
  done
  [[ -n $SHARE_URL ]] || die "no tunnel URL after 45s (log: $TUNNEL_LOG)."
  write_share_env

  # A new quick-tunnel hostname can take a few seconds to resolve and route.
  local ok=false
  for _ in $(seq 1 30); do
    public_curl "$SHARE_URL/api/health" 2>/dev/null | grep -q '"status":"ok"' && { ok=true; break; }
    sleep 2
  done
  $ok || warn "the URL is not answering yet; it usually starts working within a minute."

  # Keep the Mac from idle-sleeping while the tunnel lives (exits on its own with the tunnel).
  detach caffeinate -i -w "$pid" >/dev/null

  SHARE_EXPIRES="never (run npm run share:stop)"
  if (( hours > 0 )); then
    SHARE_EXPIRES="$(date -v+"${hours}"H '+%a %d %b %H:%M')"
    # `exec` keeps the PID, so the stop it runs recognises itself and never kills its own timer.
    TIMER_PID="$(detach /bin/sh -c "sleep $((hours * 3600)) && exec bash scripts/share-tunnel.sh stop >>'$AUTOSTOP_LOG' 2>&1")"
  fi
  write_share_env
  START_DONE=true
  print_status false
}

stop() {
  acquire_lock
  load_share_env
  local was_sharing=false
  [[ -n "$(tunnel_pid)" || -f $SHARE_ENV || -f $PW_TMP ]] && was_sharing=true
  if teardown; then
    $was_sharing && say "Sharing stopped. The link no longer works." || say "Nothing was being shared."
  else
    say "The link is closed, but the demo password was not restored yet (see the warning above)."
    exit 1
  fi
}

print_status() {
  local show_password=${1:-false}
  load_share_env
  if [[ -z "$(tunnel_pid)" ]]; then
    say "Not sharing. Start with: npm run share"
    if [[ -f $SHARE_ENV && $ROTATED == 1 ]]; then
      warn "an earlier session left the demo accounts on a rotated password; run npm run share:stop to restore it."
    fi
    return 0
  fi
  local health
  if tunnel_expired; then
    health="EXPIRED: Cloudflare removed this link (the Mac was asleep or offline). Run npm run share for a new one."
  else
    health="$(public_curl "$SHARE_URL/api/health" 2>/dev/null || echo 'not answering yet')"
  fi
  local pw="see $SHARE_ENV (or npm run share:status -- --show-password)"
  [[ $ROTATED == 1 ]] || pw="the README demo password (--keep-password)"
  if $show_password && [[ -n $SHARE_PASSWORD ]]; then pw="$SHARE_PASSWORD"; fi
  cat <<EOF

  Public link      ${SHARE_URL:-<starting>}
  Health           $health
  Expires          ${SHARE_EXPIRES:-<starting>}
  Password         $pw

  Demo accounts    super@copilot.local          (super admin)
                   admin@skyline.local          (organization admin)
                   dana.captain@skyline.local   (crew, report linked)
                   yoav.fo@skyline.local        (crew, report linked)
                   noa.pilot@skyline.local      (crew, no report yet)

  Keep this Mac awake, online and plugged in while the client tests (closing the lid sleeps it).
  Stop sharing: npm run share:stop

EOF
}

cmd="${1:-start}"; shift || true
case "$cmd" in
  start) start "$@" ;;
  stop) stop ;;
  status) if [[ ${1:-} == --show-password ]]; then print_status true; else print_status false; fi ;;
  *) die "usage: $0 {start [--hours N] [--keep-password]|status [--show-password]|stop}" ;;
esac
