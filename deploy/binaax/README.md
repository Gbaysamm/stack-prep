# Deploying to the Binaax box (the review instance)

**https://stackprep.binaax.app** — basic auth, user `review`. This is the instance
people outside the team are shown. See [ADR-0018](../../docs/adr/0018-a-review-instance-on-the-binaax-box.md).

The box is `deploy@138.199.220.0` (`aep-server`). It also serves `binaax.app` itself
from a system Caddy, so everything here is additive and nothing touches that.

```
/opt/score-pilot/
  app/          the git checkout (read-only deploy key)
  web/          the built client; Caddy serves this directly
  certs/        fullchain.pem + privkey.pem, owned deploy:caddy, dir 2750
  acme/         ACME http-01 webroot
  .acme.sh/     acme.sh, with its own cron for renewal
  .env.local    POSTGRES_PASSWORD, ANTHROPIC_API_KEY, APP_ENV=local
  compose.yml   copied from the checkout on each release
  .deployed     the commit CI last released, and when
```

## Deploying

A push to `integration` that passes every check runs `release.sh` over SSH. It
checks out the commit, builds the API image **on the box** (nothing publishes to
GHCR), applies migrations, brings up the compose stack, builds the client into
`web/`, and asserts both that the API is healthy and that a student could actually
start — the latter because this deployment once served a perfect page whose Start
button failed.

## APP_ENV must be `local`

There is no login yet (ADR-0013 is Proposed), so `/v1/dev/students` is the only way
a student record is created, and that router refuses unless `APP_ENV` is `local` or
`ci`. A review instance therefore runs as `local`. That is safe **only** because
Caddy requires basic auth in front of it — anyone with the password can create and
delete sandbox students.

## TLS is acme.sh's, not Caddy's

Caddy lists `stackprep.binaax.app` under automatic TLS management and then never
obtains a certificate: no attempt, no error, with debug logging on and after a full
restart, while on-demand issuance for sandbox subdomains keeps working. That was
never root-caused. So the certificate is issued by acme.sh through the
`http://stackprep.binaax.app` challenge block, installed into `certs/`, and named
explicitly with `tls` in the site block.

acme.sh's cron renews it and runs `chmod 640` on the key before reloading Caddy.
**That chmod is load-bearing:** acme.sh writes the key `600` and Caddy runs as a
different user, so without it the site would break silently at the first renewal.

Caddy's config is `/etc/caddy/Caddyfile`, root-owned, and shared with `binaax.app`
and the sandbox subdomains. A deploy never writes it. Back it up before editing.

## Changing the password

```
HASH="$(caddy hash-password)"          # prompts twice, never echoes
```

then replace the hash on the `review` line in the Caddyfile and reload.

## When it goes wrong

- **Logs:** `cd /opt/score-pilot && IMAGE=score-pilot-api:local docker compose --env-file .env.local -f compose.yml logs --tail 50 api`
- Compose cannot interpolate the file without `--env-file .env.local` **and** `IMAGE` set.
- **What is deployed:** `cat /opt/score-pilot/.deployed`
- **Certificate:** `/opt/score-pilot/.acme.sh/acme.sh --home /opt/score-pilot/.acme.sh --list`
