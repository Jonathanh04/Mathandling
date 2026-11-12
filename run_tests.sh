#!/bin/bash
# Kör planner-testerna med macOS inbyggda JavaScriptCore (jsc). Kräver inte Node.
cd "$(dirname "$0")"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
"$JSC" planner.js planner.test.js -e '
PlannerTests.runTests(globalThis.Planner).then(r => {
  for (const x of r.results) if (!x.ok) print(`✗ [${x.group}] ${x.name}: ${x.error}`);
  print(`${r.passed} godkända, ${r.failed} misslyckade av ${r.results.length}`);
});'
