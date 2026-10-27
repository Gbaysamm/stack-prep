#!/usr/bin/env bash
# Runs on the Stack Junior server, piped in over SSH by the deploy workflow.
#
# Expects SHA and BRANCH in the environment.
#
# WHY THIS EXISTS ALONGSIDE ../release.sh. That one deploys a GHCR image with
# docker compose into /opt, which needs root or membership of the docker group.
# This account has neither, and asking for them was not worth the delay. So the
# whole deployment lives unprivileged under ~/score-pilot: its own PostgreSQL
# cluster on a high port, uvicorn and the web client on loopback, every cache
# inside the folder, and nothing on the machine outside it. ../teardown.sh on the
# server removes the lot.
#
# Consequences worth knowing rather than discovering:
#   * Nothing survives a reboot. There is no systemd unit, because a user unit
#     needs lingering enabled and that is a root change.
#   * Everything binds 127.0.0.1, so the only way in is an SSH tunnel.
#   * Services run at nice 19. This box has other tenants and a deploy must not
#     be what slows them down.

set -euo pipefail

ROOT="$HOME/score-pilot"
APP="$ROOT/app"
API_PORT=8010
WEB_PORT=5173

# PATH for uv, Node and PostgreSQL 18, plus every cache redirected inside $ROOT.
# shellcheck source=/dev/null
source "$ROOT/env.sh"

mkdir -p "$ROOT/logs"
cd "$APP"

echo "==> Checking out $SHA"
git fetch --quiet origin "$BRANCH"
git reset --hard --quiet "$SHA"
# Deliberately no `git clean`. The PostgreSQL data directory and .env are
# untracked files inside this working tree, and cleaning would delete the
# database. `reset --hard` leaves untracked files alone; `clean -xdf` would not.

if [ ! -f "$APP/.env" ]; then
  echo "No $APP/.env - see deploy/stackjunior/README.md, one-time setup." >&2
  exit 1
fi

echo "==> Python dependencies"
uv sync --frozen

echo "==> Applying migrations"
# From $APP, because pydantic-settings reads .env relative to the working
# directory and .env lives at the top of the checkout.
uv run --frozen python -m app.cli migrate

echo "==> Loading re-transcribed content"
# Approved in the name below, which is a person's decision recorded on every row it writes.
# Only when there is something to load, and only after a backup: once the bank matches the
# transcriptions this is one quick check. A failure here is reported, not fatal -- the load
# is one transaction, so a failed one has changed nothing, and the release still goes out.
#
# Mathematics first, then Use of English, then the sciences, Government and Economics. One
# backup covers all seven, taken only if any has work; each loads only if it has work, and one
# failing does not stop the others. English also repairs mojibake (a curly quote stored as three
# garbled characters) in any English text its files do not cover. Chemistry, Physics, Biology,
# Government and Economics also create their subject (CHEM, PHY, BIO, GOV, ECO) and its
# curriculum, approved in the same name, the first time each runs on a server without them.
CONTENT_REVIEWER="${CONTENT_REVIEWER:-Abdulmalik}"
CONTENT_LOADERS=("load_retranscribed_maths.py" "load_retranscribed_english.py --fix-encoding"
  "load_retranscribed_chemistry.py" "load_retranscribed_physics.py"
  "load_retranscribed_biology.py" "load_retranscribed_government.py"
  "load_retranscribed_economics.py")
DB_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/+asyncpg//')
load_content() {
  local script=$1
  shift
  DATABASE_URL="$DB_URL" uv run --frozen python "database/$script" "$@" < /dev/null
}
due=()
set +e
for loader in "${CONTENT_LOADERS[@]}"; do
  # shellcheck disable=SC2086  # the loader's flags are meant to split
  load_content $loader --pending > /dev/null
  pending=$?
  if [ "$pending" = 10 ]; then
    due+=("$loader")
  elif [ "$pending" != 0 ]; then
    echo "::warning::Could not check ${loader%% *} (exit $pending)."
  fi
done
set -e
if [ "${#due[@]}" -gt 0 ]; then
  mkdir -p "$ROOT/backups"
  backup="$ROOT/backups/before-content-$(date +%F-%H%M%S).sql.gz"
  if ! command -v pg_dump > /dev/null; then
    echo "::warning::Content not loaded: no pg_dump on PATH to take a backup first."
  elif ! pg_dump "$DB_URL" | gzip > "$backup"; then
    echo "::warning::Content not loaded: the backup failed."
  else
    for loader in "${due[@]}"; do
      # shellcheck disable=SC2086
      if ! load_content $loader --reviewer-name "$CONTENT_REVIEWER" --apply; then
        echo "::warning::${loader%% *} failed; nothing it would have loaded was changed."
      else
        echo "    ${loader%% *}: loaded, approved by $CONTENT_REVIEWER"
      fi
    done
    echo "    backup at $backup"
  fi
else
  echo "    already up to date"
fi

echo "==> Building the web client"
npm ci --no-audit --no-fund
npm run build --workspace @score-pilot/web

echo "==> Restarting the API"
# Stopped by pattern rather than by pid file: uv spawns uvicorn as a child, so
# the pid that gets recorded is the wrapper, not the process holding the port.
# pkill run unprivileged only ever reaches this account's own processes.
pkill -f "uvicorn app.main:app --host 127.0.0.1 --port $API_PORT" 2>/dev/null || true
for attempt in $(seq 1 15); do
  ss -ltn "sport = :$API_PORT" 2>/dev/null | grep -q ":$API_PORT" || break
  if [ "$attempt" = 15 ]; then
    echo "Port $API_PORT is still held after 15s; refusing to start a second API." >&2
    exit 1
  fi
  sleep 1
done
setsid nohup nice -n 19 uv run --frozen uvicorn app.main:app \
  --host 127.0.0.1 --port "$API_PORT" \
  > "$ROOT/logs/api.log" 2>&1 < /dev/null &

# Lesson audio is not made here. It is made one question at a time, when a student gets that
# question wrong, and kept. Voicing the whole bank at release sent thousands of lines to the
# speech service at once, and the students' own lines were refused behind them. Stop any such
# run an earlier release left going.
pkill -f "app.cli voice-lessons" 2>/dev/null || true

echo "==> Restarting the web client"
# `preview` rather than `dev`: it serves the built assets and starts no file
# watchers, which matters on a machine that is not ours alone. Vite's preview
# server inherits server.proxy, so /health and /v1 still reach the API.
pkill -f "vite preview" 2>/dev/null || true
pkill -f "vite --host 127.0.0.1 --port $WEB_PORT" 2>/dev/null || true
# Wait for the port, not for the process. --strictPort means preview refuses to
# start if the old server still holds 5173, and a dying process can go on
# answering for a second or two after the signal.
for attempt in $(seq 1 15); do
  ss -ltn "sport = :$WEB_PORT" 2>/dev/null | grep -q ":$WEB_PORT" || break
  if [ "$attempt" = 15 ]; then
    # Failing here matters more than it looks. The old server also serves
    # /assets/, so if it will not die the health check below would pass against
    # it and call a deploy that changed nothing a success.
    echo "Port $WEB_PORT is still held after 15s; the old server will not stop." >&2
    exit 1
  fi
  sleep 1
done
cd "$APP/apps/web"
API_PROXY="http://127.0.0.1:$API_PORT" setsid nohup nice -n 19 \
  npx vite preview --host 127.0.0.1 --port "$WEB_PORT" --strictPort \
  > "$ROOT/logs/web.log" 2>&1 < /dev/null &

echo "==> Waiting for the API"
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$API_PORT/health" > /dev/null; then
    echo "    healthy after ${attempt} attempt(s)"
    break
  fi
  if [ "$attempt" = 20 ]; then
    echo "The API never became healthy. Last 40 lines:" >&2
    tail -40 "$ROOT/logs/api.log" >&2
    exit 1
  fi
  sleep 3
done

echo "==> Waiting for the web client"
for attempt in $(seq 1 20); do
  # Checks for the built bundle, not merely for a reply. "Something answered on
  # 5173" was satisfied once by the previous server on its way out, which turned
  # a failed deploy green; only `preview` serves /assets/.
  if curl -fsS --max-time 5 "http://127.0.0.1:$WEB_PORT/" | grep -q "/assets/"; then
    echo "    serving after ${attempt} attempt(s)"
    break
  fi
  if [ "$attempt" = 20 ]; then
    echo "The web client never came up. Last 40 lines:" >&2
    tail -40 "$ROOT/logs/web.log" >&2
    exit 1
  fi
  sleep 3
done

# What is deployed, recorded where a rollback can find it without the CI log.
{ echo "$SHA"; date -Is; } > "$ROOT/.deployed"
echo "==> Done"
