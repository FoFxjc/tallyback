"""Execution-Fit view of a run (analysis only).

    python3 fit_summary.py <run-dir> [<transcript.jsonl> ...]

Prints the Fit Decisions (with supersession), where in the tool-call sequence they were
recorded relative to the first implementation edit and to the harness phase marker, and the
Claim / Verdict / Settlement / AttemptEnd sequence from the collected ledger.
"""

import json
import re
import sys
from pathlib import Path

run = Path(sys.argv[1])
transcripts = [Path(p) for p in sys.argv[2:]] or [run / "transcript.jsonl"]
state_path = run / "tallyback" / "ledger" / "state.json"
s = json.loads(state_path.read_text()) if state_path.exists() else None

events = []  # (index, label)
n = 0
for tp in transcripts:
    for line in tp.read_text().splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get("type") == "harness":
            events.append((n, f"== HARNESS {e.get('event')} =="))
        if e.get("type") != "assistant":
            continue
        for c in e["message"].get("content", []):
            if c.get("type") != "tool_use":
                continue
            n += 1
            i = c["input"]
            cmd = i.get("command", "")
            if c["name"] in ("Edit", "Write") and re.search(r"(batcher/chunk|cfgmigrate/migrate|tinycache/cache)\.py$", i.get("file_path", "")):
                events.append((n, f"edit {i['file_path'].split('/repo/')[-1]}"))
            elif c["name"] in ("Edit", "Write") and "/tests/" in i.get("file_path", ""):
                events.append((n, f"edit {i['file_path'].split('/repo/')[-1]}"))
            elif c["name"] == "Bash":
                m = re.findall(r"tallyback\s+(dispatch|decision|claim|verdict|settle|end|evidence|declare)\b", cmd)
                for sub in m:
                    events.append((n, f"tallyback {sub}"))
                if re.search(r"pytest", cmd):
                    events.append((n, "pytest"))
print("## Sequence (tool-call index)")
last = None
for idx, label in events:
    if label != last:
        print(f"  {idx:3d} {label}")
    last = label

if s is None:
    print("no ledger")
    sys.exit(0)
print("\n## Fit Decisions")
for d in s.get("decisions", []):
    if d.get("role") == "execution_choice":
        print(f"- {d['decision_id']} on {d['subject']['kind']} {d['subject']['id'][-6:]} by {d['decided_by']}"
              f"{' supersedes ' + d['supersedes'] if d.get('supersedes') else ''}")
        print(f"  choice: {d['choice']}\n  rationale: {d['rationale']}")
print("\n## Attempts / ends")
for a in s["attempts"]:
    print(f"- {a['attempt_id'][-6:]} executor={a['executor']} dispatched={a['dispatched_at']}")
for e in s["attempt_ends"]:
    print(f"- end {e['attempt_id'][-6:]} {e['outcome']}: {e.get('reason','')}")
print("\n## Claims")
for c in s["claims"]:
    print(f"- {c['attempt_id'][-6:]}: {c['statement'][:220]}")
print("\n## Verdicts")
for v in s["verdicts"]:
    print(f"- {v['conclusion']}/{v['finality']}/{v['confidence']['level']} on claim {v['subject']['id'][-6:]}; "
          f"uncertainty={v.get('uncertainty')}; limitations={v.get('limitations')}")
print("\n## Settlements")
for x in s["settlements"]:
    print(f"- {x['decision']} attempt {x['attempt_id'][-6:]} verdict={x['basis'].get('verdict_id')} "
          f"ate={x['basis'].get('attempt_end_id')} exc={x.get('verification_exception')}"
          f"{' supersedes ' + x['supersedes'] if x.get('supersedes') else ''}: {x['rationale'][:200]}")
