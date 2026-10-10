import { Button } from '@quartile/react';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { IMPORT_LIMITS, type ImportedData, parseDatasetText } from './import-data';
import { loadDatasetURL, type SourceFormat } from './load-data';

export function DatasetSource({
  label,
  onLoad,
  onRestore,
}: {
  label: string;
  onLoad: (data: ImportedData) => void;
  onRestore: () => void;
}) {
  const [url, setURL] = useState('');
  const [format, setFormat] = useState<SourceFormat>('auto');
  const [busy, setBusy] = useState(false);
  const [provenance, setProvenance] = useState('');
  const [status, setStatus] = useState(
    '180 fictional measurements. Imported files stay in this browser.',
  );
  const pending = useRef<{ revision: number; controller?: AbortController }>({ revision: 0 });
  useEffect(
    () => () => {
      pending.current.revision++;
      pending.current.controller?.abort();
    },
    [],
  );

  function invalidate() {
    pending.current.controller?.abort();
    pending.current = { revision: pending.current.revision + 1 };
    return pending.current.revision;
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const revision = invalidate();
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    try {
      if (file.size > IMPORT_LIMITS.bytes) throw new Error('Import a file smaller than 5 MB.');
      const result = parseDatasetText(await file.text(), file.name);
      if (pending.current.revision !== revision) return;
      onLoad(result);
      setProvenance('');
      setStatus(
        `Loaded ${result.rows.length.toLocaleString()} rows from ${file.name}. No file was uploaded.`,
      );
    } catch (error) {
      if (pending.current.revision !== revision) return;
      setStatus(
        `Import failed: ${error instanceof Error ? error.message : String(error)} Current data is unchanged.`,
      );
    } finally {
      if (pending.current.revision === revision) setBusy(false);
    }
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    const revision = invalidate();
    const controller = new AbortController();
    pending.current.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setBusy(true);
    setStatus('Loading a data snapshot…');
    try {
      const result = await loadDatasetURL(url, format, controller.signal);
      if (pending.current.revision !== revision) return;
      onLoad(result);
      setProvenance(`Snapshot from ${result.source} · ${new Date().toLocaleString()}`);
      setStatus(
        `Loaded ${result.rows.length.toLocaleString()} rows at ${new Date().toLocaleTimeString()}. Load again to refresh; refreshed data replaces edits and resets filters.`,
      );
    } catch (error) {
      if (pending.current.revision !== revision) return;
      const message = controller.signal.aborted
        ? 'The source did not finish within 15 seconds.'
        : error instanceof TypeError
          ? 'The source could not be reached. Check the URL and its browser access (CORS) settings.'
          : error instanceof Error
            ? error.message
            : String(error);
      setStatus(`Load failed: ${message} Current data is unchanged.`);
    } finally {
      clearTimeout(timeout);
      if (pending.current.revision === revision) setBusy(false);
    }
  }

  return (
    <section className="sc-source" aria-label="Dataset source">
      <div className="sc-source-bar">
        <div>
          <strong>{label}</strong>
          {provenance && <span>{provenance}</span>}
          <span role="status" aria-live="polite">
            {status}
          </span>
        </div>
        <div className="sc-source-actions">
          <label className="sc-import">
            Import CSV or JSON
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={importFile}
            />
          </label>
          <Button
            onClick={() => {
              invalidate();
              setBusy(false);
              onRestore();
              setProvenance('');
              setStatus('Restored 180 fictional measurements.');
            }}
          >
            Restore sample
          </Button>
        </div>
      </div>
      <details className="sc-connect">
        <summary>Load from a data URL</summary>
        <p id="source-url-help">
          Use a public CSV or JSON URL, or an endpoint your application provides. The source must
          allow browser access. This request sends no cookies or authorization headers.
        </p>
        <form onSubmit={connect} className="sc-connect-form">
          <label className="sc-field sc-source-url">
            Data URL
            <input
              type="url"
              value={url}
              required
              placeholder="https://example.com/data.json"
              aria-describedby="source-url-help"
              onChange={(event) => setURL(event.target.value)}
            />
          </label>
          <label className="sc-field">
            Response format
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as SourceFormat)}
            >
              <option value="auto">Detect automatically</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            Load data
          </Button>
          {busy && (
            <Button
              type="button"
              onClick={() => {
                invalidate();
                setBusy(false);
                setStatus('Load cancelled. Current data is unchanged.');
              }}
            >
              Cancel load
            </Button>
          )}
        </form>
        <p>
          Up to 5 MB, 10,000 rows and 64 fields. JSON accepts a row array or a{' '}
          {'{ rows, fields, label }'} snapshot. Loading replaces the current dataset and resets
          filters; export edits first.
        </p>
      </details>
    </section>
  );
}
