# ADR-0017 · An unprivileged deployment on the Stack Junior server

- **Status:** Accepted
- **Date:** 2026-09-24
- **Supersedes in practice:** [ADR-0016](0016-hetzner-vps-for-the-dev-deployment.md),
  whose target — the Binaax box — was abandoned before the deploy ever ran. The
  Docker-based `deploy/` directory it describes is kept, unused, because it is the
  right shape for a deployment that has root.

## Context

ADR-0016 chose a shared Hetzner VPS for the dev deployment, and assumed the deploy
account would be in the `docker` group: `deploy/release.sh` pulls a GHCR image and
runs `docker compose` in `/opt/score-pilot`. That box is no longer in use.

The available machine is the Stack Junior server. The account on it has no root and
is not in the `docker` group, so nothing ADR-0016 describes can run. Requesting
those permissions was possible but would have meant waiting on somebody else, and
the point of the deployment is to stop content review depending on a developer's
laptop — trading one dependency for another is no gain.

The machine is also not ours alone. `stackprep.xyz` resolves to it and is served
from nginx on the same box, so a careless deployment could degrade something in
production.

## Decision

Deploy **unprivileged**, entirely inside `~/score-pilot`, and treat that folder as
the whole blast radius.

- Its **own PostgreSQL 18 cluster** on port 55439, tuned small on purpose
  (128 MB shared buffers, 20 connections, 2 worker processes), rather than sharing
  the machine's cluster — which would need a role only root can create.
- **uvicorn on 127.0.0.1:8010** and the built web client on **127.0.0.1:5173**,
  both loopback only. The sole route in is an SSH tunnel, which is access control
  we already have rather than access control we would have to build.
- Everything at **nice 19**. A deploy must not be what slows the other tenants down.
- Every cache — uv, Python toolchain, npm — redirected inside the folder by
  `env.sh`, and nothing appended to any shell profile.
- `teardown.sh` stops all three services and deletes the folder.

CI deploys on a push to `integration` (or on demand) by piping
`deploy/stackjunior/release.sh` over SSH. The server pulls the code itself with a
read-only deploy key, so no write credential ever reaches it.

## Consequences

- **Nothing survives a reboot.** A user systemd unit would need lingering enabled,
  which is a root change. The login banner already says a restart is pending, so
  this will bite; restarting is two commands.
- **No TLS and no hostname.** A subdomain needs a DNS record and a vhost on
  ports 80/443, both of which need somebody else. Until then, access is by tunnel.
- **The `vite preview` server is not a production web server.** It is adequate for
  a handful of reviewers and starts no file watchers, which a dev server would.
- **Backups are manual.** The cluster is a folder; `pg_dump` into it is the only
  safety net, and there is no schedule.
- **Rollback is `git reset` plus a redeploy.** Migrations are forward-only, so a
  rollback across a migration is not a rollback.
- **The data directory sits inside the git working tree** at `app/.local/postgres`.
  `git reset --hard` leaves untracked files alone, but `git clean -xdf` would
  delete the database. The release script therefore never cleans, and this is
  called out here because the next person will not guess it.
