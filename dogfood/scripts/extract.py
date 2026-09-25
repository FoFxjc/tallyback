"""Turn a run's stream-json transcript into inspectable records.

    python3 extract.py <run-dir> <bench-dir>

Writes, next to transcript.jsonl:
  tool-calls.md            every tool call with its (truncated) result, in order
  tallyback-commands.jsonl every `tallyback …` shell invocation, its exit status and output
  rejected-tallyback.md    only the failed/rejected Tallyback invocations
  final-response.md        the model's final message
  metrics.json             counts, timing, usage, and boundary flags
"""

import json
import re
import sys
from pathlib import Path

run_dir = Path(sys.argv[1])
bench = sys.argv[2]
events = []
for line in (run_dir / "transcript.jsonl").read_text().splitlines():
    try:
        events.append(json.loads(line))
    except json.JSONDecodeError:
        pass

calls = {}  # tool_use_id -> dict
order = []
result_event = None
init_event = None
for e in events:
    t = e.get("type")
    if t == "system" and e.get("subtype") == "init":
        init_event = e
    elif t == "assistant":
        for c in e.get("message", {}).get("content", []):
            if c.get("type") == "tool_use":
                calls[c["id"]] = {"name": c["name"], "input": c["input"], "result": None, "is_error": False}
                order.append(c["id"])
    elif t == "user":
        content = e.get("message", {}).get("content")
        if isinstance(content, list):
            for c in content:
                if c.get("type") == "tool_result" and c.get("tool_use_id") in calls:
                    body = c.get("content")
                    if isinstance(body, list):
                        body = "\n".join(x.get("text", "") for x in body if isinstance(x, dict))
                    calls[c["tool_use_id"]]["result"] = body or ""
                    calls[c["tool_use_id"]]["is_error"] = bool(c.get("is_error"))
    elif t == "result":
        result_event = e

TB_RE = re.compile(r"(^|[;&|(\s])tallyback(\s|$)")


def summary(call):
    i = call["input"]
    return i.get("command") or i.get("file_path") or i.get("pattern") or i.get("skill") or json.dumps(i)[:300]


lines = ["# Tool calls\n"]
tb = []
for n, cid in enumerate(order, 1):
    c = calls[cid]
    s = summary(c)
    res = (c["result"] or "").strip()
    lines.append(f"## {n}. {c['name']}{' (ERROR)' if c['is_error'] else ''}\n")
    lines.append("```\n" + s + "\n```\n")
    lines.append("<details><summary>result</summary>\n\n```\n" + res[:4000] + ("\n…[truncated]" if len(res) > 4000 else "") + "\n```\n</details>\n")
    if c["name"] == "Bash" and TB_RE.search(c["input"].get("command", "")):
        tb.append({"n": n, "command": c["input"]["command"], "is_error": c["is_error"], "output": res})
(run_dir / "tool-calls.md").write_text("\n".join(lines))
with open(run_dir / "tallyback-commands.jsonl", "w") as f:
    for x in tb:
        f.write(json.dumps(x) + "\n")


def rejected(x):
    return x["is_error"] or '"ok": false' in x["output"]


rej = [x for x in tb if rejected(x)]
out = ["# Failed or rejected Tallyback invocations\n"]
for x in rej:
    out.append(f"## call {x['n']}\n```\n{x['command']}\n```\n```\n{x['output'][:2000]}\n```\n")
(run_dir / "rejected-tallyback.md").write_text("\n".join(out))
(run_dir / "final-response.md").write_text((result_event or {}).get("result") or "(no final result event)")

sub = {}
for x in tb:
    m = re.search(r"tallyback\s+([a-z-]+)", x["command"])
    k = m.group(1) if m else "?"
    sub[k] = sub.get(k, 0) + 1

all_text = json.dumps([calls[c]["input"] for c in order])
metrics = {
    "model_reported_by_cli": (init_event or {}).get("model"),
    "model_usage": (result_event or {}).get("modelUsage"),
    "num_turns": (result_event or {}).get("num_turns"),
    "duration_ms": (result_event or {}).get("duration_ms"),
    "total_cost_usd": (result_event or {}).get("total_cost_usd"),
    "result_is_error": (result_event or {}).get("is_error"),
    "tool_calls": len(order),
    "tool_calls_by_name": {k: sum(1 for c in order if calls[c]["name"] == k) for k in sorted({calls[c]["name"] for c in order})},
    "tallyback_invocations": len(tb),
    "tallyback_failed_or_rejected": len(rej),
    "tallyback_by_subcommand": dict(sorted(sub.items())),
    "used_skill_tool": any(calls[c]["name"] == "Skill" for c in order),
    "touched_tallyback_source": ("tallyback-pinned" in all_text) or ("/home/user/tallyback" in all_text),
    "inspected_tallyback_wrapper": bool(re.search(r"(which|type|cat|file)\s+[^\n]*tallyback", all_text)),
    "spawned_subagents": sum(1 for c in order if calls[c]["name"] in ("Agent", "Task")),
}
(run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
