import {
  Button,
  DataExplorer,
  dataset,
  type Formatter,
  formatParts,
  KPI,
  LineChart,
  makeFormatter,
  type NumberFormat,
  QuartileProvider,
} from '@quartile/react';
import { useMemo, useState } from 'react';
import { Link } from '../../router';
import { Wordmark } from '../../shell/Logo';
import { links } from '../../shell/links';
import './formatting.css';

const observations = [
  {
    sample: 'A-101',
    observedAt: '2026-10-10T00:30:00Z',
    concentration: 0.00001234,
    temperature: 21.35,
    cost: 123456.78,
    recovery: 0.9134,
    bytes: 1048576,
    duration: 3661250,
  },
  {
    sample: 'A-102',
    observedAt: '2026-10-10T01:30:00Z',
    concentration: 0.00001985,
    temperature: 22.71,
    cost: 128530.45,
    recovery: 0.9548,
    bytes: 2097152,
    duration: 3978500,
  },
  {
    sample: 'A-103',
    observedAt: '2026-10-10T02:30:00Z',
    concentration: 0.00001628,
    temperature: 20.95,
    cost: 119824.39,
    recovery: 0.9241,
    bytes: 1572864,
    duration: 3599999,
  },
  {
    sample: 'A-104',
    observedAt: '2026-10-10T03:30:00Z',
    concentration: null,
    temperature: 22.12,
    cost: 131926.25,
    recovery: null,
    bytes: 4194304,
    duration: 90061000,
  },
  {
    sample: 'A-105',
    observedAt: '2026-10-10T04:30:00Z',
    concentration: 0.00002351,
    temperature: 23.08,
    cost: 142711.62,
    recovery: 0.9726,
    bytes: 3145728,
    duration: 4123578,
  },
  {
    sample: 'A-106',
    observedAt: '2026-10-10T05:30:00Z',
    concentration: 0.00001749,
    temperature: 21.63,
    cost: 126182.06,
    recovery: 0.9482,
    bytes: 8388608,
    duration: 3716240,
  },
];
const columns = [
  'sample',
  'observedAt',
  'concentration',
  'temperature',
  'cost',
  'recovery',
  'bytes',
  'duration',
].map((field) => ({ field }));
const examples: { label: string; value: unknown; format: Formatter }[] = [
  {
    label: 'Detailed currency',
    value: 123456.78,
    format: { type: 'number', style: 'currency', currency: 'EUR' },
  },
  { label: 'Scientific notation', value: 0.0000123456, format: 'scientific' },
  { label: 'Engineering notation', value: 0.0000123456, format: 'engineering' },
  {
    label: 'Accounting negatives',
    value: -1234.56,
    format: { type: 'number', style: 'currency', currency: 'USD', currencySign: 'accounting' },
  },
  {
    label: 'Compact magnitude',
    value: 123456789,
    format: { type: 'number', notation: 'compact', maximumSignificantDigits: 4 },
  },
  {
    label: 'A measured unit',
    value: 23.125,
    format: { type: 'number', style: 'unit', unit: 'celsius', maximumFractionDigits: 2 },
  },
  {
    label: 'Ratio → percent',
    value: 0.9134,
    format: { type: 'number', style: 'percent', maximumFractionDigits: 2 },
  },
  { label: 'Binary bytes', value: 1572864, format: 'bytes-binary' },
  {
    label: 'Elapsed time · milliseconds',
    value: 90061250,
    format: { type: 'duration', maximumFractionDigits: 2 },
  },
  {
    label: 'Exact decimal string',
    value: '9007199254740993.125',
    format: { type: 'number', maximumFractionDigits: 3 },
  },
  {
    label: 'Missing observation',
    value: null,
    format: { type: 'number', missing: 'Not observed' },
  },
];

export function FormattingWorkbench() {
  const [locale, setLocale] = useState('en-US');
  const [timeZone, setTimeZone] = useState('UTC');
  const [notation, setNotation] = useState<NumberFormat['notation']>('scientific');
  const [precision, setPrecision] = useState(5);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [csvFormat, setCSVFormat] = useState<'raw' | 'formatted'>('raw');
  const [copied, setCopied] = useState('');
  const fields = useMemo(
    () => ({
      sample: { label: 'Sample', type: 'nominal' as const },
      observedAt: {
        label: 'Observed at',
        type: 'temporal' as const,
        format: { type: 'date' as const, dateStyle: 'medium' as const, timeStyle: 'long' as const },
        axisFormat: {
          type: 'date' as const,
          hour: '2-digit' as const,
          minute: '2-digit' as const,
          hourCycle: 'h23' as const,
        },
        description: 'An instant captured in UTC; displayed in the selected time zone.',
      },
      concentration: {
        label: 'Concentration',
        format: {
          type: 'number' as const,
          notation,
          maximumSignificantDigits: precision,
          suffix: ' mol/L',
          missing: 'Not observed',
        },
        axisFormat: {
          type: 'number' as const,
          notation,
          maximumSignificantDigits: Math.min(precision, 3),
        },
        description:
          'Molar concentration. A missing observation leaves a gap; zero remains a measured value.',
      },
      temperature: {
        label: 'Temperature',
        format: {
          type: 'number' as const,
          style: 'unit' as const,
          unit: 'celsius',
          maximumFractionDigits: 2,
        },
      },
      cost: {
        label: 'Batch cost',
        currency: 'EUR',
        format: 'currency' as const,
        description: 'Full batch cost in EUR. Formatting does not convert currency.',
      },
      recovery: {
        label: 'Recovery',
        format: {
          type: 'number' as const,
          style: 'percent' as const,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
        description: 'A proportion stored from 0 to 1. Percent display multiplies by 100.',
      },
      bytes: { label: 'Payload', format: 'bytes-binary' as const },
      duration: {
        label: 'Elapsed time',
        format: { type: 'duration' as const, maximumFractionDigits: 2 },
        description: 'Input milliseconds. Hours can exceed 24; elapsed time has no time zone.',
      },
    }),
    [notation, precision],
  );
  const data = useMemo(() => dataset(observations, fields), [fields]);
  const source = `const data = dataset(rows, ${JSON.stringify(fields, null, 2)});\n\n<QuartileProvider locale="${locale}" timeZone="${timeZone}">\n  <LineChart data={data} x="observedAt" y="concentration" />\n  <DataExplorer data={data} rowKey="sample" columns={columns} csvFormat="${csvFormat}" />\n</QuartileProvider>`;
  const reset = () => {
    setLocale('en-US');
    setTimeZone('UTC');
    setNotation('scientific');
    setPrecision(5);
    setView('chart');
    setCSVFormat('raw');
    setCopied('');
  };
  return (
    <QuartileProvider locale={locale} timeZone={timeZone} className="fm-page">
      <header className="fm-header">
        <Link to="/">
          <Wordmark />
        </Link>
        <nav aria-label="Formatting workspace">
          <Link to="/examples/explore">Dataset explorer</Link>
          <Link to="/studio">App Studio</Link>
          <a href={`${links.github}/blob/main/docs/guides/formatting.md`}>Formatting guide</a>
        </nav>
      </header>
      <main className="fm-main">
        <div className="fm-intro">
          <h1>Make every number mean something.</h1>
          <p>
            One field definition, from a compact axis to a detailed tooltip and an exported table.
            Explore a synthetic laboratory dataset without changing the underlying measurements.
          </p>
        </div>
        <form
          className="fm-controls"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Display settings"
        >
          <label>
            Locale
            <select aria-label="Locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="en-US">English · United States</option>
              <option value="de-DE">Deutsch · Deutschland</option>
              <option value="fr-FR">Français · France</option>
              <option value="hi-IN">हिन्दी · भारत</option>
              <option value="ar-EG">العربية · مصر</option>
            </select>
          </label>
          <label>
            Time zone
            <select
              aria-label="Time zone"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">America / New York</option>
              <option value="Asia/Tokyo">Asia / Tokyo</option>
            </select>
          </label>
          <label>
            Concentration notation
            <select
              aria-label="Concentration notation"
              value={notation}
              onChange={(e) => setNotation(e.target.value as NumberFormat['notation'])}
            >
              <option value="scientific">Scientific</option>
              <option value="engineering">Engineering</option>
              <option value="standard">Decimal</option>
            </select>
          </label>
          <label>
            Significant digits
            <select
              aria-label="Significant digits"
              value={precision}
              onChange={(e) => setPrecision(Number(e.target.value))}
            >
              {[3, 4, 5, 6, 8].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={reset}>Reset display</Button>
        </form>
        <section className="fm-analysis" aria-label="Laboratory measurements">
          <div className="fm-chart">
            <div className="fm-section-heading">
              <div>
                <h2>Concentration over time</h2>
                <p>Hover or use arrow keys to inspect units and notes.</p>
              </div>
              <Button onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>
                {view === 'chart' ? 'View exact data' : 'View chart'}
              </Button>
            </div>
            <LineChart
              data={data}
              x="observedAt"
              y="concentration"
              height={300}
              points
              view={view}
              aria-label="Concentration measurements"
              tooltipNote="Synthetic laboratory observations. Display precision changes labels, not the stored values."
            />
          </div>
          <aside className="fm-metrics" aria-label="Measurement summaries">
            <KPI data={data} value="concentration" aggregate="mean" label="Mean concentration" />
            <KPI
              value={0.9482}
              compare={{ current: 0.9482, previous: 0.9134 }}
              format={{ type: 'number', style: 'percent', maximumFractionDigits: 2 }}
              label="Recovery comparison"
            />
            <KPI
              value={123456.78}
              format={{ type: 'number', style: 'currency', currency: 'EUR' }}
              label="Detailed batch cost"
            />
          </aside>
        </section>
        <section className="fm-records">
          <div className="fm-section-heading">
            <div>
              <h2>Inspect the measurements</h2>
              <p>
                Sort and filter raw values. Choose whether CSV exports contain raw values or display
                labels.
              </p>
            </div>
            <label>
              CSV values
              <select
                aria-label="CSV values"
                value={csvFormat}
                onChange={(e) => setCSVFormat(e.target.value as 'raw' | 'formatted')}
              >
                <option value="raw">Raw measurements</option>
                <option value="formatted">Formatted labels</option>
              </select>
            </label>
          </div>
          <DataExplorer
            data={data}
            rowKey="sample"
            columns={columns}
            csvFormat={csvFormat}
            exportFileName={`laboratory-${csvFormat}.csv`}
            defaultView={{ pageSize: 10 }}
          />
        </section>
        <section className="fm-reference" aria-labelledby="format-reference">
          <div>
            <h2 id="format-reference">A vocabulary for data</h2>
            <p>
              Native locale rules handle decimal separators, currency placement, grouping, signs,
              and unit names. SI/binary byte symbols and clock-style durations remain explicit.
            </p>
            <dl>
              {examples.map((example) => (
                <div key={example.label}>
                  <dt>{example.label}</dt>
                  <dd>
                    <bdi>{makeFormatter(example.format, { locale, timeZone })(example.value)}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="fm-footnote">
              Exact string and bigint display does not add arbitrary-precision chart arithmetic.
              FormatJS and math.js can be used through formatter callbacks.
            </p>
          </div>
          <div className="fm-code">
            <div className="fm-section-heading">
              <h2>Use it in React</h2>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(source);
                    setCopied('Copied field configuration');
                  } catch {
                    setCopied('Select the code below to copy it.');
                  }
                }}
              >
                Copy configuration
              </Button>
            </div>
            <p role="status">
              {copied ||
                'Imports: dataset, QuartileProvider, LineChart, DataExplorer from @quartile/react. Supply your rows and columns.'}
            </p>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded code panel must be keyboard scrollable. */}
            <pre role="region" tabIndex={0} aria-label="React formatting configuration">
              <code>{source}</code>
            </pre>
            <p>Structured parts for custom tooltips</p>
            <div className="fm-parts">
              {formatParts({ style: 'currency', currency: 'EUR' }, -1234.56, { locale }).map(
                (part, index) => (
                  <span key={`${part.type}-${index}`}>
                    <bdi>{part.value}</bdi>
                    <small>{part.type}</small>
                  </span>
                ),
              )}
            </div>
          </div>
        </section>
      </main>
    </QuartileProvider>
  );
}
