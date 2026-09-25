"""Summarise a collected run's ledger as a readable accountability trail (analysis only).

    python3 ledger_summary.py <run-dir>   ->  writes <run-dir>/ledger-summary.md
"""

import json
import sys
from pathlib import Path

run = Path(sys.argv[1])
state_path = run / "tallyback" / "ledger" / "state.json"
out = [f"# Ledger summary — {run.name}\n"]
if not state_path.exists():
    out.append("**No ledger was created.**\n")
    (run / "ledger-summary.md").write_text("\n".join(out))
    sys.exit(0)
s = json.loads(state_path.read_text())
out.append(f"revision {s['revision']}; " + ", ".join(
    f"{k}={len(v)}" for k, v in s.items() if isinstance(v, list) and v) + "\n")

crit = {}
for d in s["declarations"]:
    out.append(f"## Declaration {d['declaration_id']}{' (supersedes ' + d['supersedes'] + ')' if d.get('supersedes') else ''}")
    out.append(f"- objective: {d['objective']}")
    for c in d["criteria"]:
        crit[c["criterion_id"]] = c["code"]
        out.append(f"  - criterion `{c['code']}` required={c.get('required')}: {c['statement']}")
    out.append("")
for a in s["attempts"]:
    out.append(f"## Attempt {a['attempt_id']} executor={a['executor']} branch={a.get('branch')} dispatched={a['dispatched_at']}")
for e in s["attempt_ends"]:
    out.append(f"- AttemptEnd {e['attempt_id']}: {e['outcome']} — {e.get('reason') or ''}")
out.append("")
for c in s["claims"]:
    out.append(f"## Claim {c['claim_id']} (attempt {c['attempt_id']})\n> {c['statement']}\n- evidence_ids: {c.get('evidence_ids')}\n")
for e in s["evidence"]:
    out.append(f"## Evidence {e['evidence_id']} kind={e['kind']}\n```json\n{json.dumps({k: v for k, v in e.items() if k not in ('evidence_id',)}, indent=1)[:1500]}\n```\n")
for r in s.get("reconciliations", []):
    out.append(f"## Reconciliation {r['reconciliation_id']}\n```json\n{json.dumps(r, indent=1)[:1200]}\n```\n")
for ci in s["check_invocations"]:
    out.append(f"## CheckInvocation {ci['check_invocation_id']} subject={ci['subject']}")
for cr in s["check_results"]:
    out.append(f"## CheckResult {cr['check_result_id']} outcome={cr['outcome']} verdict={cr.get('verdict_id')} diagnostics={cr.get('diagnostics')}")
out.append("")
for v in s["verdicts"]:
    out.append(f"## Verdict {v['verdict_id']} conclusion={v['conclusion']} finality={v['finality']} confidence={v['confidence']['level']}")
    out.append(f"- evaluated: {[crit.get(x, x) for x in v['scope']['evaluated_criteria']]}; unevaluated: {[crit.get(x, x) for x in v['scope']['unevaluated_criteria']]}")
    for f in v["findings"]:
        out.append(f"  - `{crit.get(f['criterion_id'], f['criterion_id'])}`: {f['assessment']} — {f.get('summary')} (basis {f.get('basis_refs')})")
    out.append(f"- basis: {v['basis']}\n- rationale: {v['rationale']}\n- uncertainty: {v.get('uncertainty')}\n- limitations: {v.get('limitations')}\n")
for b in s["blockers"]:
    out.append(f"## Blocker {b['blocker_id']}: {b.get('description')}")
for st in s["settlements"]:
    out.append(f"## Settlement {st['settlement_id']} decision={st['decision']}{' supersedes ' + st['supersedes'] if st.get('supersedes') else ''}")
    out.append(f"- basis: {st['basis']}\n- verification_exception: {st.get('verification_exception')}\n- rationale: {st.get('rationale')}\n")
for d in s.get("decisions", []):
    out.append(f"## Decision {json.dumps(d)[:600]}")
(run / "ledger-summary.md").write_text("\n".join(out) + "\n")
