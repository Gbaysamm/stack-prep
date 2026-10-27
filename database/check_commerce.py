#!/usr/bin/env python3
"""Check the UTME Commerce write-ups before they are loaded.

    uv run --frozen python database/check_commerce.py            # every year
    uv run --frozen python database/check_commerce.py --lessons 2010

The rules are Chemistry's (database/check_chemistry.py, docs/questions/utme/commerce/README.md);
only the folder differs.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_chemistry

check_chemistry.CHEM = check_chemistry.ROOT / "docs" / "questions" / "utme" / "commerce"

if __name__ == "__main__":
    check_chemistry.main()
