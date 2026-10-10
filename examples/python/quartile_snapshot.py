"""Export pandas/Polars frames as bounded Quartile explorer snapshots.

This is an example handoff utility, not a published Python package or notebook runtime.
Only the standard library is required by this module. The caller supplies its dataframe.
"""

from datetime import date, datetime
from decimal import Decimal
import json
import math
from numbers import Integral, Real
from pathlib import Path

MAX_ROWS = 10_000
MAX_FIELDS = 64
MAX_BYTES = 5_000_000
RESERVED = {"__proto__", "constructor", "prototype", "_quartile_row"}


def _scalar(value):
    if value is None:
        return None
    value_type = type(value)
    if value_type.__module__.startswith("pandas.") and value_type.__name__ in {"NAType", "NaTType"}:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Integral):
        number = int(value)
        if abs(number) > 2**53 - 1:
            raise ValueError("Integers outside JavaScript's safe range must be exported as strings")
        return number
    if isinstance(value, (Real, Decimal)):
        number = float(value)
        if math.isfinite(number) and number.is_integer() and abs(number) > 2**53 - 1:
            raise ValueError("Integers outside JavaScript's safe range must be exported as strings")
        return number if math.isfinite(number) else None
    if isinstance(value, str):
        return value
    # numpy scalar values, including bool_ and datetime64, expose item().
    if callable(getattr(value, "item", None)):
        converted = value.item()
        if converted is not value:
            return _scalar(converted)
    raise TypeError(f"Unsupported cell type {value_type.__name__}; flatten nested data first")


def snapshot(frame, *, label="Dataset", fields=None, max_rows=MAX_ROWS):
    """Return a JSON-safe snapshot. Refuse truncation and preserve explicit field metadata.

    `frame` can be a pandas DataFrame, a Polars DataFrame, or a list of row dictionaries.
    Convert business identifiers to strings before exporting large integer IDs.
    """
    if not isinstance(max_rows, int) or isinstance(max_rows, bool) or not 1 <= max_rows <= MAX_ROWS:
        raise ValueError(f"max_rows must be between 1 and {MAX_ROWS}")
    if len(frame) > max_rows:
        raise ValueError(f"Select at most {max_rows} rows explicitly; snapshots never silently truncate")
    if callable(getattr(frame, "to_dicts", None)):
        source = frame.to_dicts()
    elif callable(getattr(frame, "to_dict", None)):
        source = frame.to_dict(orient="records")
    elif isinstance(frame, list):
        source = frame
    else:
        raise TypeError("Supply a pandas/Polars dataframe or a list of row dictionaries")
    if not source:
        raise ValueError("Export at least one row")
    names = set()
    rows = []
    for row in source:
        if not isinstance(row, dict):
            raise TypeError("Each row must be a dictionary")
        converted = {}
        for key, value in row.items():
            if not isinstance(key, str) or not key.strip() or len(key) > 120 or key in RESERVED:
                raise ValueError(f"Unsupported field name: {key!r}")
            names.add(key)
            converted[key] = _scalar(value)
        rows.append(converted)
    if not 1 <= len(names) <= MAX_FIELDS:
        raise ValueError(f"Export between 1 and {MAX_FIELDS} fields")
    if fields is not None and (not isinstance(fields, dict) or set(fields) - names):
        raise ValueError("Field metadata must refer only to exported columns")
    result = {"label": str(label)[:120], "rows": rows, "fields": fields or {}}
    # Reject non-JSON metadata and non-finite metadata rather than writing an invalid artifact.
    encoded = json.dumps(result, ensure_ascii=False, allow_nan=False)
    if len(encoded.encode("utf-8")) > MAX_BYTES:
        raise ValueError("Snapshot exceeds the explorer's 5 MB file limit")
    return result


def write_snapshot(frame, path, **options):
    """Write UTF-8 JSON that can be imported by /examples/explore."""
    result = snapshot(frame, **options)
    encoded = json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2).encode("utf-8")
    if len(encoded) > MAX_BYTES:
        raise ValueError("Snapshot exceeds the explorer's 5 MB file limit")
    Path(path).write_bytes(encoded)
    return Path(path)
