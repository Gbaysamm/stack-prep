# ADR-0018 · A review instance on the Binaax box

- **Status:** Accepted
- **Date:** 2026-09-24
- **Relates to:** [ADR-0017](0017-an-unprivileged-deployment-on-the-stack-junior-server.md),
  which stays. The two instances are for different people.

## Context

ADR-0017's deployment works but binds loopback only, so the sole way in is an SSH
tunnel. A tunnel is usable by the person who opened it and nobody else, which meant
the deployment still could not be handed to a reviewer, a subject expert or anyone
being shown the product — the dependency ADR-0016 set out to remove.

A public hostname needs DNS and a TLS-terminating web server. `stackprep.xyz` is on
Namecheap and `stackjunior.com` on Cloudflare; we have neither account, and
`*.stackjunior.com` is a catch-all pointing at the marketing site. `binaax.app`,
however, has a wildcard A record aimed at a box we already have `sudo` and `docker`
on, and that box already runs Caddy.

## Decision

Run a **second** instance on the Binaax box at `https://stackprep.binaax.app`, behind
HTTP basic auth, deployed by CI from the same commit and trigger as the first.

- Docker Compose, which is what `deploy/compose.yml` was written for.
- The API image is **built on the box**. Nothing publishes to GHCR: the `image` CI job
  proves the Dockerfile builds and discards the result. Building on the far end costs
  a couple of minutes and avoids putting registry credentials there.
- `APP_ENV=local`, because until ADR-0013 lands there is no login and the dev router
  is the only way a student record exists. Basic auth is what makes that acceptable.
- The deploy never touches `/etc/caddy/Caddyfile`, which also serves `binaax.app`.

## Consequences

- **The password is the whole access control.** Anyone holding it can create and
  delete sandbox students. Fine for review; this is not a production posture.
- **Two instances now drift-check each other.** Both deploy from `integration`, so a
  change that breaks one usually breaks the other visibly.
- **The certificate is acme.sh's, not Caddy's**, because Caddy silently declined to
  issue for this hostname and the cause was never found. It renews on acme.sh's cron,
  which also fixes the key's permissions before reloading Caddy. That is a workaround
  sitting on someone else's Caddy install, and it is the most likely thing to rot.
- **A rebuild means a brief gap.** The client is copied into the served directory in
  place, so mid-copy the page and its assets can disagree.
- **We are guests.** `binaax.app` and its sandbox previews run on the same machine and
  share its Let's Encrypt quota.
