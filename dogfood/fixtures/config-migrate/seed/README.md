# cfgmigrate

Upgrades parsed application config documents (plain dicts loaded from YAML) to the
current schema version.

```python
from cfgmigrate import migrate

migrate({"version": 1, "timeout": 30, "plugins": ["foo"]})
# {"version": 2, "request_timeout": 30, "plugins": ["foo"]}
```

Run the tests with `python3 -m pytest`.
