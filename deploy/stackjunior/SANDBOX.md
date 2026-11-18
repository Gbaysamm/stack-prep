# The sandbox copy on the Stack Junior server

A second copy of Stack Prep for the admins to try their own changes on (founder, 18 Nov 2026).
It runs the `sandbox` branch, from its own folder, database and ports, on the same server and
account as the integration copy, and touches nothing of that copy.

|  | Integration copy | Sandbox copy |
|---|---|---|
| Branch | `integration` | `sandbox` |
| Folder | `~/score-pilot` | `~/score-pilot-sandbox` |
| Database port | 55439 | 55441 |
| API port | 8010 | 8011 |
| Web port | 5173 | 5174 |

The same `deploy/stackjunior/release.sh` deploys both; CI passes the sandbox's folder and ports.

## One-time setup (run on the server, as the deploy account)

Do these in order. Each block can be pasted as it is.

**1. The folder and its tools file.** The sandbox uses the integration copy's tools (uv,
Python, Node, PostgreSQL and their caches), so its `env.sh` only loads that one. The release
script keeps the sandbox's own folder after loading it.

```sh
mkdir -p ~/score-pilot-sandbox/logs ~/score-pilot-sandbox/backups
cat > ~/score-pilot-sandbox/env.sh <<'EOF2'
# The sandbox copy uses the integration copy's tools (uv, Python, PostgreSQL, Node, caches).
source "$HOME/score-pilot/env.sh"
EOF2
source ~/score-pilot-sandbox/env.sh && which uv pg_ctl node
```

**2. The code.** Cloned with the same read-only deploy key as the integration copy:

```sh
cd ~/score-pilot-sandbox
git clone --config core.sshCommand="$(git -C ~/score-pilot/app config core.sshCommand)" \
  "$(git -C ~/score-pilot/app remote get-url origin)" app
```

**3. Its own database cluster on port 55441,** tuned like the integration one:

```sh
source ~/score-pilot-sandbox/env.sh
initdb -D ~/score-pilot-sandbox/app/.local/postgres --auth=trust --encoding=UTF8 --locale=en_US.UTF-8 > ~/score-pilot-sandbox/logs/initdb.log
mkdir -p ~/score-pilot-sandbox/app/.local/run
cat >> ~/score-pilot-sandbox/app/.local/postgres/postgresql.conf <<'EOF2'
listen_addresses = '127.0.0.1'
unix_socket_directories = '/home/a.malik/score-pilot-sandbox/app/.local/run'
port = 55441
shared_buffers = 128MB
effective_cache_size = 256MB
maintenance_work_mem = 32MB
work_mem = 4MB
max_connections = 20
max_worker_processes = 2
max_parallel_workers = 2
max_parallel_workers_per_gather = 1
EOF2
pg_ctl -D ~/score-pilot-sandbox/app/.local/postgres -l ~/score-pilot-sandbox/logs/postgres.log start
createdb -h 127.0.0.1 -p 55441 scorepilot
```

**4. A copy of the current database.** Taken from the integration copy, which keeps running:

```sh
pg_dump -h 127.0.0.1 -p 55439 scorepilot | psql -q -h 127.0.0.1 -p 55441 scorepilot
psql -h 127.0.0.1 -p 55441 scorepilot -c "select count(*) from stackprep.students"
```

The count should match the integration copy's.

**5. Its settings file.** A copy of the integration copy's, pointed at the new database, with
mail and push switched off: the copied database holds real students, and the sandbox must
never email or notify them.

```sh
cp ~/score-pilot/app/.env ~/score-pilot-sandbox/app/.env
sed -i 's/55439/55441/' ~/score-pilot-sandbox/app/.env
sed -i '/^SMTP_/d; /^MAIL_FROM/d; /^VAPID_/d' ~/score-pilot-sandbox/app/.env
grep -E '^(DATABASE_URL|SMTP|VAPID|MAIL_FROM)' ~/score-pilot-sandbox/app/.env
```

The last line should print only the `DATABASE_URL`, ending in `:55441/scorepilot`.

**6. Tell us it is done.** (Done 18 Nov 2026.) Then the `sandbox` branch is created and pushed; CI checks it and
deploys it here on its own. Every later push to `sandbox` deploys again.

## Reaching it

Like the integration copy, it listens on the server only. Open a tunnel with your own local
ports:

```sh
ssh -L 5181:127.0.0.1:5174 -L 8081:127.0.0.1:8011 a.malik@<the server's address>
```

Then `http://localhost:5181`. A web address such as `sandbox-stackprep.stackjunior.com` needs
someone with admin rights on the server to add it to the web server, pointing at port 5174.

## After a reboot

Start its database, then re-run the deploy (the **Run workflow** button does not cover the
sandbox; push to `sandbox` again, or start the services by hand as `release.sh` does):

```sh
source ~/score-pilot-sandbox/env.sh
pg_ctl -D ~/score-pilot-sandbox/app/.local/postgres -l ~/score-pilot-sandbox/logs/postgres.log start
```

## Removing it

```sh
source ~/score-pilot-sandbox/env.sh
pg_ctl -D ~/score-pilot-sandbox/app/.local/postgres stop
pkill -f "port 8011" ; pkill -f "port 5174"
rm -rf ~/score-pilot-sandbox
```

Nothing of the integration copy is touched.
