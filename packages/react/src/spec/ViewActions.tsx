import { useMemo, useState } from 'react';
import { Button } from '../components/button/Button';
import { makeFormatter } from '../data/format';
import { sourceRows } from '../data/origin';
import { applyPredicates } from '../data/predicates';
import type { DataInput, Dataset } from '../data/types';
import { DataTable } from '../data-display/DataTable';
import { tableToCSV } from '../data-display/explorer-model';
import { IconDownload, IconFile, IconTable } from '../icons';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSelectionStore } from '../selection/Selection';
import { csvFileName, type ViewAction } from './actions';

const rowsWord = (n: number) => (n === 1 ? 'row' : 'rows');

/** Hands `text` to the browser as a file. Runs only from a click, never while rendering. */
function saveText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The buttons a view shows with its drawing. `publisher` is the view's id in the selection: its
 * own selection never filters the rows it is drawn from.
 */
export function ViewToolbar({
  name,
  actions,
  table,
  onTable,
  rows,
  onRows,
  panelId,
  input,
  publisher,
}: {
  /** The view's title: names the group for assistive technology and the downloaded file. */
  name?: string;
  actions: readonly ViewAction[];
  table: boolean;
  onTable: () => void;
  rows: boolean;
  onRows: () => void;
  panelId: string;
  input: DataInput;
  publisher: string;
}) {
  const store = useSelectionStore();
  const { locale } = useQuartile();
  const [status, setStatus] = useState('');
  const download = () => {
    try {
      const { rows: all, schema } = sourceRows(input);
      // Read at the click, so a view with only a download button never re-renders on selection.
      const applied = (store?.getSnapshot() ?? []).filter((p) => p.source !== publisher);
      const shown = applyPredicates(all, applied);
      const file = csvFileName(name);
      saveText(
        tableToCSV(
          shown,
          Object.keys(schema).map((field) => ({ field })),
        ),
        file,
      );
      const count = makeFormatter('integer', { locale })(shown.length);
      setStatus(`Downloaded ${count} ${rowsWord(shown.length)} as ${file}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'The download failed.');
    }
  };
  return (
    <div className="q-spec-actions" role="group" aria-label={`${name ?? 'View'} actions`}>
      {actions.includes('table') && (
        <Button
          size="sm"
          variant="ghost"
          icon={<IconTable />}
          aria-pressed={table}
          onClick={onTable}
        >
          Table
        </Button>
      )}
      {actions.includes('rows') && (
        <Button
          size="sm"
          variant="ghost"
          icon={<IconFile />}
          aria-pressed={rows}
          aria-controls={rows ? panelId : undefined}
          onClick={onRows}
        >
          Rows
        </Button>
      )}
      {actions.includes('download') && (
        <>
          <Button size="sm" variant="ghost" icon={<IconDownload />} onClick={download}>
            Download CSV
          </Button>
          <span className="q-visually-hidden" role="status">
            {status}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * The rows a view is drawn from, after the selections of the other views in its group, ten to
 * a page. The count line says how many of the dataset's rows remain.
 */
export function RowsPanel({
  id,
  name,
  input,
  publisher,
}: {
  id: string;
  name?: string;
  input: DataInput;
  publisher: string;
}) {
  const { locale } = useQuartile();
  const { rows: all, schema } = useMemo(() => sourceRows(input), [input]);
  const { rows: shown } = useLinkedRows(all, { source: publisher });
  const data = useMemo<Dataset>(() => ({ kind: 'dataset', rows: shown, schema }), [shown, schema]);
  const columns = useMemo(() => Object.keys(schema).map((field) => ({ field })), [schema]);
  const count = useMemo(() => makeFormatter('integer', { locale }), [locale]);
  const label = name ? `Rows behind ${name}` : 'Rows behind this view';
  return (
    <div className="q-spec-rows" id={id} role="group" aria-label={label}>
      <p className="q-spec-rows-count q-num" aria-live="polite">
        {shown.length === all.length
          ? `${count(all.length)} ${rowsWord(all.length)}`
          : `${count(shown.length)} of ${count(all.length)} rows`}
      </p>
      {columns.length > 0 && (
        <DataTable
          data={data}
          columns={columns}
          pageSize={10}
          selection={false}
          aria-label={label}
        />
      )}
    </div>
  );
}
