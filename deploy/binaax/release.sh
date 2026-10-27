#!/usr/bin/env bash
# Runs on the Binaax box (aep-server), piped in over SSH by the deploy workflow.
#
# Expects SHA and BRANCH in the environment.
#
# WHY A THIRD RELEASE SCRIPT. ../release.sh pulls a published image from GHCR;
# nothing publishes one, because the `image` CI job proves the Dockerfile builds
# and then throws the result away. ../stackjunior/release.sh runs bare processes
# because that account has no Docker. This box has Docker and sudo, so it gets
# the compose stack the deployment was designed around -- and builds the image
# itself, which costs a couple of minutes and saves needing registry credentials
# on the far end.
#
# What is deliberately NOT here:
#   * The host's Caddy. It already routes stackprep.binaax.app to 127.0.0.1:8010
#     and serves /opt/score-pilot/web, and a deploy has no business rewriting a
#     config that also serves binaax.app.
#   * The TLS certificate. acme.sh owns it, on its own cron. See the README.

set -euo pipefail

ROOT=/opt/score-pilot
APP="$ROOT/app"
export IMAGE=score-pilot-api:local

# Node is installed through nvm, which is set up by an interactive shell profile
# and is therefore absent when CI runs a command over SSH -- `npm: command not
# found`, after a login shell has shown it working perfectly. Add nvm's bin
# directory straight to PATH rather than sourcing nvm.sh, which trips over `set -u`.
# Newest version wins, so a node upgrade on the box does not need a change here.
NODE_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
if ! command -v npm > /dev/null; then
  echo "npm is not on PATH. Looked in $HOME/.nvm/versions/node/*/bin." >&2
  exit 1
fi

cd "$APP"

echo "==> Checking out $SHA"
git fetch --quiet origin "$BRANCH"
git reset --hard --quiet "$SHA"

if [ ! -f "$ROOT/.env.local" ]; then
  echo "No $ROOT/.env.local - see deploy/binaax/README.md, one-time setup." >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ROOT/.env.local" -f "$ROOT/compose.yml" "$@"
}

echo "==> Building the API image"
docker build -f apps/api/Dockerfile -t "$IMAGE" . > /dev/null

echo "==> Refreshing the compose file"
cp deploy/compose.yml "$ROOT/compose.yml"

echo "==> Starting database and cache"
compose up -d postgres redis

echo "==> Applying migrations"
# --no-deps: postgres is already up and healthy; this must not restart it.
# -T and </dev/null both matter: this script is piped into `bash -s` over SSH, so
# the script itself is stdin. `docker compose run` without -T takes stdin over and
# swallows the remaining lines, after which bash reaches EOF and exits 0 -- a deploy
# that silently does a third of its work and reports success.
compose run --rm --no-deps -T api python -m app.cli migrate < /dev/null

echo "==> Loading re-transcribed content"
# Run in the API image, which has the database address in its environment, with the
# checkout mounted read-only for the transcriptions it reads. Approved in the name below --
# a person's decision, recorded on every row -- only when there is something to load, and
# only after a backup. A failure is reported, not fatal: the load is one transaction, so a
# failed one has changed nothing, and the release still goes out.
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
load_content() {
  local script=$1
  shift
  compose run --rm --no-deps -T -v "$APP:/repo:ro" -w /repo -e PYTHONDONTWRITEBYTECODE=1 \
    api python "database/$script" "$@" < /dev/null
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
  if ! compose exec -T postgres pg_dump -U scorepilot scorepilot < /dev/null | gzip > "$backup"; then
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

echo "==> Starting API and worker"
compose up -d

# Lesson audio is not made here. It is made one question at a time, when a student gets that
# question wrong, and kept. Voicing the whole bank at release sent thousands of lines to the
# speech service at once, and the students' own lines were refused behind them. Stop any such
# run an earlier release left going.
docker ps --no-trunc --format '{{.ID}} {{.Command}}' | grep 'app.cli voice-lessons' \
  | cut -d' ' -f1 | xargs -r docker stop > /dev/null || true

echo "==> Building the web client"
npm ci --no-audit --no-fund > /dev/null
npm run build --workspace @score-pilot/web > /dev/null
# Built into place rather than swapped: Caddy serves this directory directly, so
# there is a moment mid-copy when the page and its assets disagree. Acceptable on
# a review instance; it would not be on anything with real traffic.
rm -rf "$ROOT/web"
mkdir -p "$ROOT/web"
cp -r apps/web/dist/. "$ROOT/web/"
chmod -R a+rX "$ROOT/web"

echo "==> Waiting for the API"
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 5 http://127.0.0.1:8010/health > /dev/null; then
    echo "    healthy after ${attempt} attempt(s)"
    break
  fi
  if [ "$attempt" = 20 ]; then
    echo "The API never became healthy. Recent logs:" >&2
    compose logs --tail 40 api >&2
    exit 1
  fi
  sleep 3
done

echo "==> Checking a student can actually start"
# The page rendering proves nothing: this deployment once served a perfect form
# whose Start button failed, because /v1/dev/students is gated on APP_ENV and the
# box was staging. Assert the endpoint the student journey depends on.
if ! curl -fsS --max-time 8 http://127.0.0.1:8010/v1/dev/subjects > /dev/null; then
  echo "/v1/dev/subjects refused. APP_ENV must be local or ci for the demo to work;" >&2
  echo "check APP_ENV in $ROOT/.env.local." >&2
  exit 1
fi
echo "    student endpoints answering"

echo "==> Checking the client is served"
if ! curl -fsS --max-time 8 http://127.0.0.1:8010/health > /dev/null || ! grep -q '/assets/' "$ROOT/web/index.html"; then
  echo "The built client is not in place." >&2
  exit 1
fi
echo "    built bundle in place"

{ echo "$SHA"; date -Is; } > "$ROOT/.deployed"
docker image prune -f > /dev/null
echo "==> Done"
