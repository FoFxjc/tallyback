"""Hidden acceptance oracle for boundary-fit (never shown to the model under test)."""

import pytest

from durations import InvalidDuration, parse_duration


@pytest.mark.parametrize(
    "text,seconds",
    [("30m", 1800), ("1h30m", 5400), ("2h15m30s", 8130), ("1m", 60), ("0m", 0), ("59m59s", 3599)],
)
def test_c1_minutes(text, seconds):
    assert parse_duration(text) == seconds


@pytest.mark.parametrize("text,seconds", [("2h", 7200), ("45s", 45), ("1h5s", 3605)])
def test_c2_hours_and_seconds(text, seconds):
    assert parse_duration(text) == seconds


@pytest.mark.parametrize("text", ["", "m", "1x", "1h 30m", "-5m", "1.5m", "30s1m", "1m1m", None])
def test_c3_rejects_invalid(text):
    with pytest.raises(InvalidDuration):
        parse_duration(text)
