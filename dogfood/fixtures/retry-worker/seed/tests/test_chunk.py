import pytest

from batcher import chunk


def b(n: int, tag: str = "x") -> bytes:
    return (tag * n).encode()


def test_empty_input():
    assert chunk([], max_items=3, max_bytes=10) == []


def test_respects_max_items():
    items = [b(1, t) for t in "abcde"]
    assert chunk(items, max_items=2, max_bytes=100) == [items[0:2], items[2:4], items[4:5]]


def test_respects_max_bytes():
    items = [b(4, "a"), b(4, "b"), b(4, "c")]
    assert chunk(items, max_items=10, max_bytes=10) == [items[0:2], items[2:3]]


def test_exact_byte_boundary_fits_in_one_batch():
    items = [b(5, "a"), b(5, "b")]
    assert chunk(items, max_items=10, max_bytes=10) == [items]


def test_preserves_order():
    items = [b(3, t) for t in "abcdefg"]
    flat = [x for batch in chunk(items, max_items=2, max_bytes=7) for x in batch]
    assert flat == items


def test_oversized_item_is_emitted_alone():
    small, big, tail = b(2, "s"), b(50, "B"), b(2, "t")
    assert chunk([small, big, tail], max_items=10, max_bytes=10) == [[small], [big], [tail]]


def test_oversized_first_item():
    big, small = b(50, "B"), b(2, "s")
    assert chunk([big, small], max_items=10, max_bytes=10) == [[big], [small]]


@pytest.mark.parametrize("max_items,max_bytes", [(0, 10), (1, 0)])
def test_rejects_invalid_limits(max_items, max_bytes):
    with pytest.raises(ValueError):
        chunk([b(1)], max_items=max_items, max_bytes=max_bytes)
