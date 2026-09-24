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
compose run --rm --no-deps api python -m app.cli migrate

echo "==> Starting API and worker"
compose up -d

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
