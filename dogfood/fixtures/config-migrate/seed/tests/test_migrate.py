import pytest

from cfgmigrate import CURRENT_VERSION, UnsupportedVersionError, migrate


def v1(**extra):
    doc = {"version": 1, "timeout": 30, "plugins": ["foo"]}
    doc.update(extra)
    return doc


def test_sets_current_version():
    assert migrate(v1())["version"] == CURRENT_VERSION == 2


def test_renames_timeout_to_request_timeout():
    out = migrate(v1())
    assert out["request_timeout"] == 30
    assert "timeout" not in out


def test_keeps_plugins():
    assert migrate(v1())["plugins"] == ["foo"]


def test_missing_plugins_defaults_to_empty_list():
    doc = v1()
    del doc["plugins"]
    assert migrate(doc)["plugins"] == []


def test_current_version_is_returned_as_is():
    doc = {"version": 2, "request_timeout": 5, "plugins": []}
    assert migrate(doc) == doc


@pytest.mark.parametrize("version", [None, "1", True, 0, 3])
def test_rejects_unsupported_versions(version):
    with pytest.raises(UnsupportedVersionError):
        migrate({"version": version, "timeout": 1})
