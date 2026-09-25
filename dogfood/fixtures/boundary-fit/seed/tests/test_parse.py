import pytest

from durations import InvalidDuration, parse_duration


def test_hours():
    assert parse_duration("2h") == 7200


def test_seconds():
    assert parse_duration("45s") == 45


def test_hours_and_seconds():
    assert parse_duration("1h5s") == 3605


@pytest.mark.parametrize("text", ["", "h", "1x", "1h 30m", "-5s", "1.5h", "30m1h", "1h1h"])
def test_rejects_invalid(text):
    with pytest.raises(InvalidDuration):
        parse_duration(text)
