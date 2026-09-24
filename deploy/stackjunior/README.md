# Deploying to the Stack Junior server

The live dev deployment. See [ADR-0017](../../docs/adr/0017-an-unprivileged-deployment-on-the-stack-junior-server.md)
for why it is shaped this way. The sibling `deploy/` directory is the Docker route
for a host where we have root; it is not what runs today.

Everything lives in `~/score-pilot` on the server and nothing exists outside it.

```
~/score-pilot/
  app/                 the git checkout (read-only deploy key)
    .env               not in git; written once, by hand
    .local/postgres/   the PostgreSQL 18 data directory
  .tools/bin/          uv and anything else fetched for this deployment
  logs/                api.log, web.log
  env.sh               PATH and every cache, redirected inside this folder
  teardown.sh          stops everything and deletes the folder
  .deployed            the commit CI last released, and when
```

## One-time setup

Already done on the current box. Repeat it only on a fresh host.

1. Create `~/score-pilot`, write `env.sh` and `teardown.sh` **first**, so there is
   an undo before there is anything to undo.
2. Add a **read-only** deploy key to the repository and clone into `app`, pinning
   the key with `git config core.sshCommand`.
3. Install `uv` into `.tools/bin`; `initdb` a cluster into `app/.local/postgres`
   on port 55439 and tune it down.
4. Write `app/.env`:

   ```
   APP_ENV=local
   LOG_LEVEL=info
   DATABASE_URL=postgresql+asyncpg://<you>@127.0.0.1:55439/scorepilot
   DATABASE_SCHEMA=stackprep
   OPENAI_API_KEY=
   ```

5. Add the CI deploy key's **public** half to `~/.ssh/authorized_keys`, and set
   `SSH_HOST`, `SSH_USER` and `SSH_PRIVATE_KEY` as repository Actions secrets.

## Deploying

A push to `integration` that passes every check runs it. To deploy by hand, use
the workflow's **Run workflow** button.

## Reaching it

Both services bind loopback, so open a tunnel. Use local ports that do not collide
with your own dev servers:

```
ssh -L 5180:127.0.0.1:5173 -L 8080:127.0.0.1:8010 <you>@<host>
```

Then `http://localhost:5180/student`, with the API at `http://localhost:8080`.

## When it goes wrong

- **Logs:** `tail -50 ~/score-pilot/logs/api.log` (or `web.log`).
- **What is deployed:** `cat ~/score-pilot/.deployed`.
- **After a reboot** nothing is running; re-run the deploy, or start the two
  services by hand as `release.sh` does.
- **Roll back:** deploy an older commit with the **Run workflow** button from that
  ref. Migrations are forward-only, so this does not undo a schema change.
- **Never `git clean` in `app/`.** The database and `.env` are untracked files
  inside that tree.

## Removing it

```
bash ~/score-pilot/teardown.sh
```

Stops the web client, the API and PostgreSQL, then deletes the folder. Nothing
else on the machine was touched, so there is nothing else to undo — except the
line in `~/.ssh/authorized_keys`, which you remove by hand.
