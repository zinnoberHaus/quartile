import { makeFieldFormatter, type Schema, type SerializableFormatter } from '@quartile/react';
import { useEffect, useState } from 'react';
import { parseFormatting, type StudioFieldFormatting, type StudioFormatting } from './formatting';

const presets = [
  'number',
  'integer',
  'compact',
  'scientific',
  'engineering',
  'currency',
  'percent',
  'bytes',
  'bytes-binary',
  'duration',
  'date',
  'date-short',
  'datetime',
  'time',
  'month',
  'weekday',
  'text',
] as const;
const numberPresets = new Set([
  'number',
  'integer',
  'compact',
  'scientific',
  'engineering',
  'currency',
  'percent',
]);
type Surface = 'format' | 'axisFormat' | 'tooltipFormat';
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Invalid formatting.';

function FieldEditor({
  field,
  schema,
  formatting,
  onChange,
}: {
  field: string;
  schema: Schema;
  formatting?: StudioFormatting;
  onChange: (value: StudioFormatting) => void;
}) {
  const current = formatting?.fields?.[field] ?? {};
  const [surface, setSurface] = useState<Surface>('format');
  const [preset, setPreset] = useState('inherit');
  const [precision, setPrecision] = useState('');
  const [currency, setCurrency] = useState('');
  const [unit, setUnit] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [description, setDescription] = useState('');
  const [json, setJSON] = useState('');
  const [message, setMessage] = useState('');
  const signature = JSON.stringify(current);
  useEffect(() => {
    const current = JSON.parse(signature) as StudioFieldFormatting;
    const selected = current[surface];
    setPreset(
      selected === undefined ? 'inherit' : typeof selected === 'string' ? selected : 'custom',
    );
    setPrecision('');
    setCurrency(current.currency ?? '');
    setUnit(current.unit ?? '');
    setTimeZone(current.timeZone ?? '');
    setDescription(current.description ?? '');
    setJSON(JSON.stringify(current, null, 2));
  }, [signature, surface]);
  function commit(next: unknown) {
    const parsed = parseFormatting({
      ...formatting,
      fields: { ...formatting?.fields, [field]: next },
    });
    onChange(parsed);
    setMessage('Field formatting applied. Data and selections are unchanged.');
  }
  function apply() {
    try {
      const next = { ...current };
      for (const [key, value] of Object.entries({ currency, unit, timeZone, description })) {
        if (value.trim()) Object.assign(next, { [key]: value.trim() });
        else delete next[key as 'currency' | 'unit' | 'timeZone' | 'description'];
      }
      if (preset === 'inherit') delete next[surface];
      else if (preset !== 'custom') {
        let format: SerializableFormatter = preset as (typeof presets)[number];
        if (precision !== '') {
          const digits = Number(precision);
          if (!Number.isInteger(digits) || digits < 0 || digits > 20)
            throw new Error('Decimal places must be an integer from 0 to 20.');
          if (numberPresets.has(preset)) {
            format = {
              type: 'number',
              minimumFractionDigits: digits,
              maximumFractionDigits: digits,
              ...(preset === 'currency'
                ? { style: 'currency' as const }
                : preset === 'percent'
                  ? { style: 'percent' as const }
                  : {}),
              ...(['scientific', 'engineering', 'compact'].includes(preset)
                ? { notation: preset as 'scientific' | 'engineering' | 'compact' }
                : {}),
            };
          } else if (preset === 'bytes' || preset === 'bytes-binary')
            format = {
              type: 'bytes',
              base: preset === 'bytes-binary' ? 1024 : 1000,
              maximumFractionDigits: digits,
            };
          else if (preset === 'duration')
            format = { type: 'duration', maximumFractionDigits: digits };
        }
        next[surface] = format;
      }
      commit(next);
    } catch (error) {
      setMessage(`Not applied: ${errorText(error)}`);
    }
  }
  const sample =
    schema[field]?.type === 'temporal'
      ? '2026-10-09T21:34:56Z'
      : schema[field]?.type === 'quantitative'
        ? 1234.56789
        : 'Sample';
  let preview = '';
  try {
    preview = makeFieldFormatter(
      { ...schema[field], ...current },
      {
        locale: formatting?.locale,
        timeZone: formatting?.timeZone,
        surface:
          surface === 'axisFormat' ? 'axis' : surface === 'tooltipFormat' ? 'tooltip' : 'value',
      },
    )(sample);
  } catch {
    /* Imported settings are validated before application. */
  }
  return (
    <div className="st-format-field">
      <p className="st-help">
        Display metadata for <strong>{schema[field]?.label ?? field}</strong>. It applies to every
        view using this field. Raw data stays unchanged.
      </p>
      <label className="st-field">
        Display surface
        <select
          aria-label="Display surface"
          value={surface}
          onChange={(event) => setSurface(event.target.value as Surface)}
        >
          <option value="format">Values and table cells</option>
          <option value="axisFormat">Axis labels only</option>
          <option value="tooltipFormat">Tooltip values only</option>
        </select>
      </label>
      <label className="st-field">
        Format preset
        <select
          aria-label="Format preset"
          value={preset}
          onChange={(event) => setPreset(event.target.value)}
        >
          <option value="inherit">Use source / base format</option>
          <option value="custom" disabled>
            Custom descriptor (edit JSON)
          </option>
          {presets.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="st-field">
        Decimal places
        <input
          aria-label="Decimal places"
          type="number"
          min={0}
          max={20}
          step={1}
          value={precision}
          disabled={
            !numberPresets.has(preset) && !['bytes', 'bytes-binary', 'duration'].includes(preset)
          }
          onChange={(event) => setPrecision(event.target.value)}
          placeholder="Preset default"
        />
      </label>
      <div className="st-format-pair">
        <label className="st-field">
          Currency
          <input
            aria-label="Field currency"
            maxLength={3}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            placeholder="EUR"
          />
        </label>
        <label className="st-field">
          Unit badge
          <input
            aria-label="Field unit badge"
            value={unit}
            maxLength={80}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="°C"
          />
        </label>
      </div>
      <label className="st-field">
        Field time zone
        <input
          aria-label="Field time zone"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          placeholder="Use display time zone"
        />
      </label>
      <label className="st-field">
        Field description
        <textarea
          aria-label="Field description"
          value={description}
          maxLength={1000}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Definition, unit or caveat"
        />
      </label>
      <button type="button" onClick={apply}>
        Apply field formatting
      </button>
      <p className="st-format-preview">
        Applied example: <output>{preview}</output>
        <small>
          Sample value, not a source record. Percent expects a ratio; duration presets expect
          milliseconds. Unit badges label KPIs; add a JSON suffix to label each value.
        </small>
      </p>
      <details className="st-format-advanced">
        <summary>Advanced field JSON</summary>
        <p className="st-help">
          Edit format, axisFormat, tooltipFormat, description, currency, unit or timeZone.
          Validation keeps the current display until Apply succeeds.
        </p>
        <label className="st-field">
          Field formatting JSON
          <textarea
            aria-label="Field formatting JSON"
            rows={10}
            spellCheck={false}
            value={json}
            onChange={(event) => setJSON(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            try {
              commit(JSON.parse(json));
            } catch (error) {
              setMessage(`Not applied: ${errorText(error)}`);
            }
          }}
        >
          Apply field JSON
        </button>
      </details>
      {message && (
        <p className="st-help" role={message.startsWith('Not applied') ? 'alert' : 'status'}>
          {message}
        </p>
      )}
    </div>
  );
}

export function FormattingInspector({
  schema,
  formatting,
  onChange,
}: {
  schema: Schema;
  formatting?: StudioFormatting;
  onChange: (value: StudioFormatting | undefined) => void;
}) {
  const [field, setField] = useState('');
  const [locale, setLocale] = useState(formatting?.locale ?? '');
  const [zone, setZone] = useState(formatting?.timeZone ?? '');
  const [error, setError] = useState('');
  useEffect(() => {
    setLocale(formatting?.locale ?? '');
    setZone(formatting?.timeZone ?? '');
  }, [formatting?.locale, formatting?.timeZone]);
  const selected = Object.hasOwn(schema, field) ? field : Object.keys(schema)[0];
  return (
    <details className="st-formatting" data-testid="data-formatting">
      <summary>04 / Data formatting</summary>
      <p className="st-help">
        Choose locale, units, exact values, axis labels and tooltip detail. Settings travel with
        your project and React starter.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const next = parseFormatting({
              ...(locale.trim() ? { locale: locale.trim() } : {}),
              ...(zone.trim() ? { timeZone: zone.trim() } : {}),
              ...(formatting?.fields ? { fields: formatting.fields } : {}),
            });
            onChange(next);
            setError('');
          } catch (error) {
            setError(errorText(error));
          }
        }}
      >
        <label className="st-field">
          Display locale
          <input
            aria-label="Display locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            placeholder="en-US"
          />
        </label>
        <label className="st-field">
          Display time zone
          <input
            aria-label="Display time zone"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            placeholder="Browser local time"
          />
        </label>
        <button type="submit">Apply display settings</button>
        {error && (
          <p className="st-inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <label className="st-field">
        Formatting field
        <select
          aria-label="Formatting field"
          value={selected ?? ''}
          onChange={(event) => setField(event.target.value)}
        >
          {Object.values(schema).map((field) => (
            <option value={field.name} key={field.name}>
              {field.label}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <FieldEditor
          key={selected}
          field={selected}
          schema={schema}
          formatting={formatting}
          onChange={onChange}
        />
      )}
      <button
        type="button"
        className="st-format-reset"
        disabled={!formatting}
        onClick={() => {
          onChange(undefined);
          setError('');
        }}
      >
        Reset all formatting
      </button>
    </details>
  );
}
