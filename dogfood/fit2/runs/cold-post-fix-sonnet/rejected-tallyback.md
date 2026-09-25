# Failed or rejected Tallyback invocations

## call 20
```
tallyback view 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); t=d['tasks'][0]; print(t['status']); print(t['next_action']); print(t['next_command'])"
```
```
Exit code 1
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "/usr/lib/python3.11/json/__init__.py", line 293, in load
    return loads(fp.read(),
           ^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.11/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.11/json/decoder.py", line 340, in decode
    raise JSONDecodeError("Extra data", s, end)
json.decoder.JSONDecodeError: Extra data: line 146 column 1 (char 6451)
```
