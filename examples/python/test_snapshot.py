from datetime import datetime, timezone
from decimal import Decimal
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from quartile_snapshot import snapshot, write_snapshot


class PandasLike:
    def __init__(self, rows): self.rows = rows
    def __len__(self): return len(self.rows)
    def to_dict(self, *, orient):
        assert orient == "records"
        return self.rows


class PolarsLike:
    def __init__(self, rows): self.rows = rows
    def __len__(self): return len(self.rows)
    def to_dicts(self): return self.rows


class SnapshotTests(unittest.TestCase):
    def test_dataframe_protocols_and_scalar_semantics(self):
        rows = [{"id": "001", "at": datetime(2026, 9, 1, tzinfo=timezone.utc), "value": Decimal("1.25"), "missing": float("nan"), "infinite": float("inf"), "passed": False}]
        expected = {"id": "001", "at": "2026-09-01T00:00:00+00:00", "value": 1.25, "missing": None, "infinite": None, "passed": False}
        for frame in [rows, PandasLike(rows), PolarsLike(rows)]:
            self.assertEqual(snapshot(frame)["rows"], [expected])

    def test_file_round_trip_and_no_silent_truncation(self):
        with tempfile.TemporaryDirectory() as folder:
            path = write_snapshot([{"x": 1}], Path(folder) / "sample.json", fields={"x": {"type": "quantitative"}})
            self.assertEqual(json.loads(path.read_text())["fields"]["x"]["type"], "quantitative")
        with self.assertRaises(ValueError): snapshot([{"x": 1}] * 3, max_rows=2)

    def test_refuses_ambiguous_or_unsafe_shapes(self):
        for rows in [[], [{"__proto__": 1}], [{"x": 2**60}], [{"x": float(2**60)}], [{"x": Decimal("9007199254740993")}]]:
            with self.assertRaises(ValueError): snapshot(rows)
        with self.assertRaises(TypeError): snapshot([{"nested": {"x": 1}}])
        with self.assertRaises(ValueError): snapshot([{"x": 1}], fields={"missing": {}})

    def test_pretty_output_byte_limit_is_checked_before_writing(self):
        rows = [{"label": "温度"}, {"label": "圧力"}]
        document = snapshot(rows)
        compact_bytes = len(json.dumps(document, ensure_ascii=False).encode("utf-8"))
        pretty_bytes = len(json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8"))
        self.assertGreater(pretty_bytes, compact_bytes)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "existing.json"
            path.write_text("original", encoding="utf-8")
            with patch("quartile_snapshot.MAX_BYTES", compact_bytes):
                self.assertEqual(snapshot(rows), document)
                with self.assertRaisesRegex(ValueError, "5 MB"):
                    write_snapshot(rows, path)
                self.assertEqual(path.read_text(), "original")
            with patch("quartile_snapshot.MAX_BYTES", pretty_bytes):
                write_snapshot(rows, path)
                self.assertEqual(path.stat().st_size, pretty_bytes)


if __name__ == "__main__": unittest.main()
