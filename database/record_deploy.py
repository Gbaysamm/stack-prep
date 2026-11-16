"""Record a deployment on the project tracker (migration 050), run by each release script.

    CHANGES_B64=<base64 of the commit subjects, one a line> \\
        python database/record_deploy.py --sha <sha> --target <name>

The release works out the changes (the commit subjects since the previous deployment to this
server) and passes them base64-encoded, so quotes and punctuation in a subject travel safely.
A failure here is reported by the release, never fatal: the deployment itself already happened.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os

import asyncpg


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    args = parser.parse_args()
    raw = os.environ.get("CHANGES_B64", "")
    text = base64.b64decode(raw).decode("utf-8", "replace") if raw else ""
    changes = [line.strip() for line in text.splitlines() if line.strip()][:80]
    conn = await asyncpg.connect(dsn=args.database_url.replace("+asyncpg", "", 1) or None)
    try:
        await conn.execute("SET search_path = stackprep, public")
        await conn.execute(
            "INSERT INTO deployments (sha, target, changes) VALUES ($1, $2, $3::jsonb)",
            args.sha,
            args.target,
            json.dumps(changes),
        )
        # Committed work goes out with this deployment: those tasks are now deployed.
        moved = await conn.fetch(
            "UPDATE tracker_items SET status = 'deployed', updated_at = now(),"
            " updated_by = 'Deployment' WHERE status = 'committed' RETURNING id"
        )
        for row in moved:
            await conn.execute(
                "INSERT INTO tracker_activity (item_id, by_name, what) VALUES ($1, $2, $3)",
                row["id"],
                "Deployment",
                f"Deployed to {args.target} ({args.sha[:7]})",
            )
        print(
            f"Recorded deployment {args.sha[:9]} to {args.target}, {len(changes)} change(s);"
            f" {len(moved)} task(s) moved to Deployed."
        )
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
