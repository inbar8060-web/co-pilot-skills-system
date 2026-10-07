#!/usr/bin/env bash
# Production-mode local deployment: the local Supabase stack (Docker) standing in for hosted
# Supabase, plus `next build` + `next start` standing in for Vercel. The web server is detached
# from the terminal, so it keeps running after the shell (or editor) that started it closes.
#
#   npm run local:up        build, start and open http://localhost:4000
#   npm run local:status    web server + Supabase URLs
#   npm run local:logs      follow the web server log
#   npm run local:restart   rebuild and restart the web server
#   npm run local:down      stop the web server (add -- --all to stop Supabase too)
#
# Env: LOCAL_PORT (default 4000, or the port the tracked server already uses).
# Flags for up/restart: --no-build, --no-open.
set -euo pipefail
cd "$(dirname "$0")/.."

REQUESTED_PORT="${LOCAL_PORT:-}"
DEFAULT_PORT=4000
BIND="127.0.0.1" # loopback only: the web server is never reachable from the local network
STATE_DIR=".local"
PID_FILE="$STATE_DIR/server.pid" # "<pid> <port>"
LOG_FILE="$STATE_DIR/server.log"
LOCK_FILE="$STATE_DIR/cli.lock"  # flock()ed for the duration of up/restart/down
SUPABASE=(npx --no-install supabase)
# Everything this app never uses stays off; Studio stays on so the stack mirrors the hosted dashboard.
SUPABASE_EXCLUDE="imgproxy,edge-runtime,logflare,vector,supavisor"
SUPABASE_PORTS="55321-55324" # API, Postgres, Studio, Mailpit (supabase/config.toml)
PROJECT_ID="$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' supabase/config.toml)"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- tracked web server -----------------------------------------------------------------------

STATE_PID=""
STATE_PORT=""
read_state() {
  STATE_PID=""; STATE_PORT=""
  [[ -f $PID_FILE ]] && read -r STATE_PID STATE_PORT _ <"$PID_FILE" || true
  [[ $STATE_PID =~ ^[0-9]+$ ]] || STATE_PID=""
  [[ $STATE_PORT =~ ^[0-9]+$ ]] || STATE_PORT=""
  # Files written before the port was recorded hold only the PID; those servers used the default.
  [[ -n $STATE_PID && -z $STATE_PORT ]] && STATE_PORT=$DEFAULT_PORT
  return 0
}

# True when PID $1 is the process listening on TCP port $2.
listens_on() { lsof -a -p "$1" -nP -iTCP:"$2" -sTCP:LISTEN -t >/dev/null 2>&1; }
listener_of() { lsof -t -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true; }

# The tracked server counts as running only if its PID is alive AND is the listener on its
# recorded port, so a stale file or a recycled PID never makes us signal an unrelated process.
server_running() {
  read_state
  [[ -n $STATE_PID && -n $STATE_PORT ]] && kill -0 "$STATE_PID" 2>/dev/null && listens_on "$STATE_PID" "$STATE_PORT"
}

# Port to act on: explicit LOCAL_PORT, else the tracked server's port, else the default.
resolve_port() {
  if server_running; then PORT="${REQUESTED_PORT:-$STATE_PORT}"; else PORT="${REQUESTED_PORT:-$DEFAULT_PORT}"; fi
  URL="http://localhost:$PORT"
}

# Kernel lock on fd 9: the OS releases it when this shell exits for any reason (crash, SIGKILL,
# reboot), so there is never a stale lock to break. perl's flock takes it on the inherited open
# file description, which stays locked while this shell keeps fd 9 open. Children that outlive
# the command (the web server) must close fd 9, or they would hold the lock forever.
acquire_lock() {
  mkdir -p "$STATE_DIR"
  [[ -L $STATE_DIR/lock ]] && rm -f "$STATE_DIR/lock" # symlink lock from an earlier version
  exec 9>>"$LOCK_FILE"
  perl -MFcntl=:flock -e 'open(my $fh, ">&=", 9) or exit 2; flock($fh, LOCK_EX | LOCK_NB) or exit 1' ||
    die "another local-server command is already running (lock: $LOCK_FILE)."
}

assert_port_free() {
  local pid; pid="$(listener_of "$PORT")"
  [[ -z $pid ]] && return
  die "port $PORT is in use by pid $pid ($(ps -p "$pid" -o comm= 2>/dev/null || echo unknown)). Stop it or use LOCAL_PORT=<port>."
}

# --- Docker / Supabase ------------------------------------------------------------------------

container_running() { docker ps --format '{{.Names}}' | grep -qx "supabase_${1}_${PROJECT_ID}"; }

ensure_docker() {
  docker info >/dev/null 2>&1 && return
  [[ $(uname) == Darwin ]] || die "Docker is not running. Start it and retry."
  say "Starting Docker Desktop..."
  open -a Docker
  for _ in $(seq 1 90); do docker info >/dev/null 2>&1 && return; sleep 2; done
  die "Docker did not become ready within 3 minutes."
}

# Docker publishes container ports on every interface unless its daemon is told otherwise, and
# the Supabase CLI has no per-project bind address. Warn instead of silently exposing Postgres.
exposed_supabase_ports() {
  lsof -nP -iTCP:"$SUPABASE_PORTS" -sTCP:LISTEN 2>/dev/null |
    awk 'NR > 1 && $9 ~ /^(\*|0\.0\.0\.0|\[::\]):/ { sub(/.*:/, "", $9); print $9 }' | sort -u | tr '\n' ' ' || true
}

warn_if_exposed() {
  local ports; ports="$(exposed_supabase_ports)"
  [[ -z ${ports// /} ]] && return
  warn "Docker publishes the Supabase ports (${ports% }) on all network interfaces, so other devices on your network can reach Postgres (password 'postgres') and Studio. To keep them on this Mac: Docker Desktop > Settings > Docker Engine, add \"ip\": \"127.0.0.1\", Apply & restart (this applies to all containers), then run npm run local:up again."
}

ensure_supabase() {
  ensure_docker
  if container_running db && ! container_running studio; then
    # `supabase start` is a no-op on a running stack, so a restart is the only way to add
    # Studio. `stop` keeps the data volumes (only --no-backup deletes them).
    say "Restarting the local Supabase stack to add Studio (data is kept)..."
    "${SUPABASE[@]}" stop >/dev/null
  fi
  if ! container_running db; then
    say "Starting the local Supabase stack..."
    "${SUPABASE[@]}" start -x "$SUPABASE_EXCLUDE" >/dev/null
  fi
  warn_if_exposed
}

# --- build / start / stop ---------------------------------------------------------------------

build() {
  say "Building the production bundle..."
  npx --no-install next build
}

start_server() {
  [[ -f .next/BUILD_ID ]] || die "no production build found. Run without --no-build."
  assert_port_free

  say "Starting the web server on $URL..."
  printf '\n--- %s start on port %s ---\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$PORT" >>"$LOG_FILE"
  # New session (setsid) + nohup: the server outlives this shell and its process group.
  nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec: $!"' -- \
    node node_modules/next/dist/bin/next start --port "$PORT" --hostname "$BIND" \
    >>"$LOG_FILE" 2>&1 </dev/null 9>&- &
  local pid=$!
  echo "$pid $PORT" >"$PID_FILE"

  for _ in $(seq 1 60); do
    if ! kill -0 "$pid" 2>/dev/null; then
      tail -20 "$LOG_FILE" >&2
      read_state; [[ $STATE_PID == "$pid" ]] && rm -f "$PID_FILE"
      die "web server exited during startup (log: $LOG_FILE)."
    fi
    if listens_on "$pid" "$PORT" && curl -fsS --max-time 3 "http://$BIND:$PORT/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
      say "Web server is healthy."
      return
    fi
    sleep 1
  done
  tail -20 "$LOG_FILE" >&2
  die "web server did not report healthy within 60s (pid $pid, log: $LOG_FILE)."
}

stop_server() {
  if ! server_running; then
    if [[ -f $PID_FILE ]]; then
      rm -f "$PID_FILE"
      say "Removed a stale PID file; the tracked web server is not running."
    else
      say "Web server is not running."
    fi
    return
  fi
  local pid=$STATE_PID
  say "Stopping the web server (pid $pid, port $STATE_PORT)..."
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi
  rm -f "$PID_FILE"
}

print_status() {
  local app studio=""
  if server_running; then
    app="$(curl -fsS --max-time 3 "http://$BIND:$STATE_PORT/api/health" 2>/dev/null || echo 'running, health check failed')"
    app="http://localhost:$STATE_PORT   [$app]"
  else
    local other; other="$(listener_of "$PORT")"
    app="http://localhost:$PORT   [not running${other:+; port held by untracked pid $other}]"
  fi
  container_running studio 2>/dev/null || studio="[not running]"
  cat <<EOF

  App (production build)   $app
  Supabase API             http://127.0.0.1:55321
  Supabase Studio          http://127.0.0.1:55323   $studio
  Email inbox (Mailpit)    http://127.0.0.1:55324
  Postgres                 postgresql://postgres:postgres@127.0.0.1:55322/postgres

  Demo accounts: see "Demo accounts" in README.md
  Logs: npm run local:logs     Stop: npm run local:down

EOF
}

open_browser() { $no_open || [[ $(uname) != Darwin ]] || open "$URL"; }

# --- main -------------------------------------------------------------------------------------

cmd="${1:-up}"; shift || true
no_build=false; no_open=false; all=false
for arg in "$@"; do
  case "$arg" in
    --no-build) no_build=true ;;
    --no-open) no_open=true ;;
    --all) all=true ;;
    *) die "unknown flag: $arg" ;;
  esac
done

case "$cmd" in
  up)
    acquire_lock
    resolve_port
    ensure_supabase
    if server_running; then
      [[ $STATE_PORT == "$PORT" ]] || die "the web server is already running on port $STATE_PORT. Run 'npm run local:down' first to move it to $PORT."
      say "Web server already running (pid $STATE_PID). Use 'npm run local:restart' to rebuild."
    else
      [[ -f $PID_FILE ]] && rm -f "$PID_FILE"
      assert_port_free # before building: `next build` wipes .next, which a foreign server may be using
      $no_build || build
      start_server
    fi
    print_status
    open_browser
    ;;
  restart)
    acquire_lock
    resolve_port
    # Moving to another port: make sure it is free before stopping the working server.
    if ! server_running || [[ $STATE_PORT != "$PORT" ]]; then assert_port_free; fi
    ensure_supabase
    # `next build` wipes .next first, so the old server must not keep serving from it.
    stop_server
    assert_port_free
    $no_build || build
    start_server
    print_status
    open_browser
    ;;
  down)
    acquire_lock
    stop_server
    if $all; then say "Stopping the local Supabase stack (data is kept)..."; "${SUPABASE[@]}" stop >/dev/null; fi
    ;;
  status)
    resolve_port
    print_status
    warn_if_exposed
    ;;
  logs)
    mkdir -p "$STATE_DIR"; touch "$LOG_FILE"
    exec tail -n 100 -f "$LOG_FILE"
    ;;
  *) die "usage: $0 {up|restart|down|status|logs} [--no-build] [--no-open] [--all]" ;;
esac
