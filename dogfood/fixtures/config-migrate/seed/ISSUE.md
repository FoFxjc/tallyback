# Migrating a v1 config loses user settings

A user upgraded this v1 config:

```yaml
version: 1
timeout: 30
plugins:
  - foo
custom:
  owner: peter
```

and expected:

```yaml
version: 2
request_timeout: 30
plugins:
  - foo
custom:
  owner: peter
```

but the `custom` section was gone after migration.

## Acceptance criteria

1. Rename `timeout` to `request_timeout`.
2. Set `version` to 2.
3. Preserve all unrelated user-defined keys recursively.
4. Do not mutate the input object.
5. Add regression coverage for preservation of unknown keys.
