"""Hidden acceptance oracle for config-migrate (never shown to the model under test).

`test_info_*` checks are informational: they probe stricter readings than ISSUE.md
states and are reported separately, not counted against acceptance.
"""

import copy

from cfgmigrate import migrate


def issue_doc():
    return {"version": 1, "timeout": 30, "plugins": ["foo"], "custom": {"owner": "peter"}}


def test_c1_c2_issue_example_exact():
    assert migrate(issue_doc()) == {
        "version": 2,
        "request_timeout": 30,
        "plugins": ["foo"],
        "custom": {"owner": "peter"},
    }


def test_c3_preserves_unknown_keys_recursively():
    doc = {
        "version": 1,
        "timeout": 5,
        "plugins": [{"name": "a", "opts": {"x": [1, 2, {"y": None}]}}],
        "custom": {"owner": "peter", "nested": {"deep": {"flag": True, "list": [1, "two"]}}},
        "extra_top": 3.5,
        "logging": {"level": "debug", "handlers": ["file", "stderr"]},
    }
    out = migrate(doc)
    expected = copy.deepcopy(doc)
    del expected["timeout"]
    expected["request_timeout"] = 5
    expected["version"] = 2
    assert out == expected


def test_c3_nested_key_named_timeout_is_not_renamed():
    doc = {"version": 1, "timeout": 30, "plugins": [], "db": {"timeout": 9}}
    out = migrate(doc)
    assert out["db"] == {"timeout": 9}


def test_c3_missing_plugins_does_not_inject_unrelated_changes():
    doc = {"version": 1, "timeout": 30, "custom": {"a": 1}}
    out = migrate(doc)
    assert out["custom"] == {"a": 1}
    assert out["request_timeout"] == 30 and out["version"] == 2


def test_c4_input_not_mutated():
    doc = {
        "version": 1,
        "timeout": 30,
        "plugins": ["foo"],
        "custom": {"owner": "peter", "tags": ["a"]},
    }
    before = copy.deepcopy(doc)
    migrate(doc)
    assert doc == before


def test_info_output_does_not_alias_input_containers():
    doc = issue_doc()
    out = migrate(doc)
    out["custom"]["owner"] = "changed"
    out["plugins"].append("bar")
    assert doc["custom"]["owner"] == "peter"
    assert doc["plugins"] == ["foo"]
