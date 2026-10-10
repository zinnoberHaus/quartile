# From a dataframe to an analytical workspace

Use this standard-library handoff example to export a pandas or Polars dataframe and inspect it in the [dataset explorer](https://quartile-design.vercel.app/examples/explore). This is a file snapshot, not a Python SDK, hosted notebook, or two-way synchronization service.

```python
from quartile_snapshot import write_snapshot

# df is your existing pandas or Polars dataframe.
# Choose an intentional subset before exporting; the helper never truncates silently.
write_snapshot(
    df.head(1000),
    "observations.json",
    label="Experiment observations",
    fields={
        "temperature": {"type": "quantitative", "label": "Temperature", "unit": "°C"},
        "sample_id": {"type": "nominal", "label": "Sample"},
    },
)
```

Open the explorer and choose **Import CSV or JSON**. Imported files stay in the browser. Saving a table view stores its configuration locally; it does not upload or save the imported dataset. A connected AI adapter can send its explicitly displayed context to the backend you configure.

The helper accepts dataframes or a list of row dictionaries. It preserves booleans, finite numbers and strings, converts dates to ISO strings, and converts non-finite numeric values and pandas missing scalars to JSON `null`. Nested cells are rejected. Integer-valued numbers outside JavaScript's safe range (±9,007,199,254,740,991), including floats or decimals with that magnitude, must be deliberately converted to strings; this avoids silently changing identifiers. The JSON importer applies the same bound; CSV columns containing unsafe integers stay text. Label identifiers as nominal when a date-like or numeric spelling must remain an identifier.

The explorer accepts up to 10,000 rows, 64 fields and a 5 MB file. These are example input bounds, not a library performance guarantee. Use the [worker query explorer](https://quartile-design.vercel.app/examples/scale) and the optional query adapter for larger or remote sources. Current source rows are inferred in the browser; provide field metadata when your analysis needs fixed semantics.

No dependencies are required for the utility itself. Test it with Python 3.10+:

```sh
python3 -m unittest discover -s examples/python -p 'test_*.py'
```

See [the notebook](dataframe_handoff.ipynb) for an executable pandas example. Install pandas in your own notebook environment to run it; Quartile does not install or manage that environment.
