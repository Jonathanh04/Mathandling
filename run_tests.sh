#!/bin/bash
# Kör planner-testerna med macOS inbyggda JavaScriptCore (jsc). Kräver inte Node.
cd "$(dirname "$0")"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
"$JSC" planner.js planner.test.js -e '
PlannerTests.runTests(globalThis.Planner).then(r => {
  for (const x of r.results) if (!x.ok) print(`✗ [${x.group}] ${x.name}: ${x.error}`);
  print(`${r.passed} godkända, ${r.failed} misslyckade av ${r.results.length}`);
});'
# Kontrollera att kopian av planner.js i index.html är aktuell
python3 - <<'PY'
from pathlib import Path
h = Path("index.html").read_text(); j = Path("planner.js").read_text()
S = "<!-- planner.js:start (genereras av build.py, ändra i planner.js) -->"
ok = S in h and h.split(S, 1)[1].split("<!-- planner.js:end -->")[0].strip() == f"<script>\n{j}</script>".strip()
print("index.html har aktuell planner.js" if ok else "✗ index.html har INTE aktuell planner.js – kör python3 build.py")
PY
