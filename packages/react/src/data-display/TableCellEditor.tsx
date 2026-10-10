import { type ReactNode, useId, useRef, useState } from 'react';
import { Button } from '../components/button/Button';
import { Popover } from '../components/overlays/popover/Popover';
import type { FieldType, Row } from '../data/types';
import type { TableScalar } from './explorer-model';

export interface DataTableEditor {
  /** Defaults to the field's schema type. Dates edit a UTC calendar day as YYYY-MM-DD. */
  type?: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options?: readonly { value: TableScalar; label: string }[];
  nullable?: boolean;
  /** Return an error message to keep the editor open without publishing an edit. */
  validate?: (value: TableScalar, row: Row) => string | null | undefined;
}

export interface DataTableEdit {
  row: Row;
  /** Stable identity produced by the DataTable rowKey prop. */
  rowKey: string;
  field: string;
  columnKey: string;
  previousValue: unknown;
  value: TableScalar;
}

export function TableCellEditor({
  editor,
  fieldType,
  row,
  rowKey,
  field,
  columnKey,
  label,
  children,
  onEdit,
}: {
  editor: DataTableEditor;
  fieldType: FieldType;
  row: Row;
  rowKey: string;
  field: string;
  columnKey: string;
  label: string;
  children: ReactNode;
  onEdit: (edit: DataTableEdit) => void | Promise<void>;
}) {
  const inputId = useId();
  const request = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const original = useRef({ row, value: row[field] });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const type =
    editor.type ??
    (fieldType === 'quantitative'
      ? 'number'
      : fieldType === 'temporal'
        ? 'date'
        : fieldType === 'boolean'
          ? 'boolean'
          : 'text');
  const value = row[field];
  const changeOpen = (next: boolean) => {
    if (next && pending) return;
    if (next) {
      request.current++;
      original.current = { row, value };
      const date =
        value == null
          ? null
          : value instanceof Date
            ? value
            : typeof value === 'number'
              ? new Date(value)
              : new Date(String(value));
      setDraft(
        type === 'date'
          ? date && Number.isFinite(date.getTime())
            ? date.toISOString().slice(0, 10)
            : ''
          : type === 'select'
            ? String(editor.options?.findIndex((o) => Object.is(o.value, value)) ?? -1)
            : value == null
              ? ''
              : String(value),
      );
      setError(null);
    }
    opened.current = next;
    setOpen(next);
  };
  const save = async () => {
    if (pending) return;
    let next: TableScalar;
    if (type === 'select') {
      const option = editor.options?.[Number(draft)];
      if (!option) {
        setError('Choose a value.');
        return;
      }
      next = option.value;
    } else if (draft === '' && editor.nullable) next = null;
    else if (type === 'boolean') next = draft === 'true';
    else if (type === 'number') {
      if (draft.trim() === '' || !Number.isFinite(Number(draft))) {
        setError('Enter a finite number.');
        return;
      }
      next = Number(draft);
    } else if (type === 'date') {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(draft) ||
        !Number.isFinite(Date.parse(draft)) ||
        new Date(draft).toISOString().slice(0, 10) !== draft
      ) {
        setError('Enter a valid calendar date.');
        return;
      }
      next = draft;
    } else next = draft;
    const invalid = editor.validate?.(next, row);
    if (invalid) {
      setError(invalid);
      return;
    }
    const current = ++request.current;
    setPending(true);
    setError(null);
    try {
      await onEdit({
        row: original.current.row,
        rowKey,
        field,
        columnKey,
        previousValue: original.current.value,
        value: next,
      });
      if (request.current === current) {
        const returnFocus = opened.current;
        opened.current = false;
        setOpen(false);
        if (returnFocus) triggerRef.current?.focus();
      }
    } catch (e) {
      if (request.current === current)
        setError(e instanceof Error ? e.message : 'The change could not be saved.');
    } finally {
      if (request.current === current) setPending(false);
    }
  };
  return (
    <Popover
      open={open}
      onOpenChange={changeOpen}
      label={`Edit ${label}`}
      width={280}
      trigger={
        <button
          ref={triggerRef}
          aria-disabled={pending || undefined}
          type="button"
          className="q-dt-edit-trigger"
          aria-label={`Edit ${label}, row ${rowKey}`}
        >
          {children}
          <span className="q-dt-edit-mark" aria-hidden="true">
            ↗
          </span>
        </button>
      }
    >
      <form
        className="q-dt-editor"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void save();
        }}
      >
        <label htmlFor={inputId}>{label}</label>
        {type === 'select' || type === 'boolean' ? (
          <select
            id={inputId}
            className="q-dt-editor-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
          >
            {type === 'boolean' ? (
              <>
                {editor.nullable && <option value="">Empty</option>}
                <option value="false">False</option>
                <option value="true">True</option>
              </>
            ) : (
              <>
                <option value="-1" disabled>
                  Choose a value
                </option>
                {editor.options?.map((o, i) => (
                  <option key={i} value={i}>
                    {o.label}
                  </option>
                ))}
              </>
            )}
          </select>
        ) : (
          <input
            id={inputId}
            className="q-dt-editor-input"
            type={type}
            step={type === 'number' ? 'any' : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
          />
        )}
        {error && (
          <span id={`${inputId}-error`} className="q-dt-editor-error" role="alert">
            {error}
          </span>
        )}
        <div className="q-dt-editor-actions">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              changeOpen(false);
              triggerRef.current?.focus();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="primary" loading={pending}>
            Save change
          </Button>
        </div>
      </form>
    </Popover>
  );
}
