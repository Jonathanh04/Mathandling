#!/usr/bin/env python3
"""Engångsskript: fyller history.json med tidigare data.json-versioner ur git-historiken i Mathandling-repot."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import fetch_tilbud as f

REPO = Path.home() / "Code" / "mathandling"
commits = subprocess.run(["git", "-C", str(REPO), "log", "--reverse", "--format=%h", "--", "data.json"],
                         capture_output=True, text=True, check=True).stdout.split()
hist = f.load_history()
for c in commits:
    raw = subprocess.run(["git", "-C", str(REPO), "show", f"{c}:data.json"], capture_output=True, text=True, check=True).stdout
    offers = json.loads(raw)["offers"]
    f.add_to_history(hist, offers)
    print(c, len(offers), "erbjudanden")
f.HISTORY.write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":")))
print(len(hist["items"]), "varor i historiken")
