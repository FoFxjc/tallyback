"""Compact, ordered view of a run's tool calls (analysis only).

    python3 trace.py <run-dir> [result-chars]
"""

import json
import sys
from pathlib import Path

run = Path(sys.argv[1])
width = int(sys.argv[2]) if len(sys.argv) > 2 else 220
calls, order, texts = {}, [], []
for line in (run / "transcript.jsonl").read_text().splitlines():
    try:
        e = json.loads(line)
    except json.JSONDecodeError:
        continue
    if e.get("type") == "assistant":
        for c in e["message"].get("content", []):
            if c.get("type") == "tool_use":
                calls[c["id"]] = [c, None, False]
                order.append(("call", c["id"]))
            elif c.get("type") == "text" and c.get("text", "").strip():
                order.append(("text", c["text"].strip()))
    elif e.get("type") == "user" and isinstance(e["message"].get("content"), list):
        for c in e["message"]["content"]:
            if c.get("type") == "tool_result" and c.get("tool_use_id") in calls:
                body = c.get("content")
                if isinstance(body, list):
                    body = " ".join(x.get("text", "") for x in body if isinstance(x, dict))
                calls[c["tool_use_id"]][1] = body or ""
                calls[c["tool_use_id"]][2] = bool(c.get("is_error"))
n = 0
for kind, v in order:
    if kind == "text":
        print(f"   [say] {v[:width * 2]}".replace("\n", " "))
        continue
    n += 1
    c, res, err = calls[v]
    i = c["input"]
    s = i.get("command") or i.get("file_path") or i.get("pattern") or i.get("skill") or json.dumps(i)
    if c["name"] in ("Edit", "Write"):
        s = f"{s}  <<{(i.get('new_string') or i.get('content') or '')[:width]}>>"
    print(f"{n:3d} {c['name']}{'!' if err else ''}: {s[:600]}".replace("\n", " ⏎ "))
    print(f"      -> {(res or '')[:width]}".replace("\n", " ⏎ "))
