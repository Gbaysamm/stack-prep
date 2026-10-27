#!/usr/bin/env python3
"""Check the UTME Principles of Accounts write-ups before they are loaded.

    uv run --frozen python database/check_accounts.py            # every year
    uv run --frozen python database/check_accounts.py --lessons 2010

The rules are Chemistry's (database/check_chemistry.py, docs/questions/utme/accounts/README.md);
only the folder differs.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_chemistry

check_chemistry.CHEM = check_chemistry.ROOT / "docs" / "questions" / "utme" / "accounts"

if __name__ == "__main__":
    check_chemistry.main()
