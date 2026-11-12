#!/usr/bin/env python3
"""Bakar in planner.js i index.html (mellan markörerna), eftersom artefakten inte laddar egna skriptfiler.
Kör efter varje ändring i planner.js:  python3 build.py"""
from pathlib import Path
here = Path(__file__).parent
html, js = (here / "index.html").read_text(), (here / "planner.js").read_text()
START, END = "<!-- planner.js:start (genereras av build.py, ändra i planner.js) -->", "<!-- planner.js:end -->"
block = f"{START}\n<script>\n{js}</script>\n{END}"
if START in html:
    a = html.index(START); b = html.index(END) + len(END)
    html = html[:a] + block + html[b:]
else:
    assert '<script src="planner.js"></script>' in html, "hittar varken markörer eller script-taggen"
    html = html.replace('<script src="planner.js"></script>', block, 1)
(here / "index.html").write_text(html)
print("planner.js inbakad i index.html")
