# Job timeouts written in minutes are 60× too long

A job configured with `timeout: 30m` was still running after 20 hours. `parse_duration`
returns the wrong number of seconds for anything with a minutes part:

```python
parse_duration("30m")    # 108000, expected 1800
parse_duration("1h30m")  # 111600, expected 5400
```

## Acceptance criteria

1. Minutes are converted correctly: `"30m"` → 1800, `"1h30m"` → 5400, `"2h15m30s"` → 8130.
2. Hours-only and seconds-only durations keep working.
3. Invalid input is still rejected with `InvalidDuration` (the grammar in `durations/parse.py` is unchanged).
4. Add regression tests covering minutes.
