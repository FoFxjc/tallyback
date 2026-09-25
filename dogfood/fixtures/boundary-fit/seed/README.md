# durations

Parses human-written durations such as `"1h30m"` or `"45s"` into seconds, for the job
scheduler's `timeout:` setting.

```python
from durations import parse_duration

parse_duration("1h30m")  # 5400
```

Run the tests with `python3 -m pytest`.
