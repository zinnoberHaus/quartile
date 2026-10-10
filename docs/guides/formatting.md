# Formatting values, axes and tooltips

Define a field's meaning once with `dataset()`, then choose how each surface presents it. Formatting changes labels; it does not change underlying rows, aggregates, sort order or filters. Raw CSV remains the default; formatted CSV is an explicit export choice. Native `Intl` supplies locale-aware numbers and dates. FormatJS, math.js and d3-format remain optional application integrations. [Try the formatting lab](https://quartile-design.vercel.app/examples/formatting).

## Start with field metadata

```tsx
import {
  dataset, QuartileProvider, LineChart, DataTable, KPI,
} from '@quartile/react';

const revenue = dataset([
  { id: 'a', time: '2026-10-01T12:00:00Z', amount: 125000.25 },
  { id: 'b', time: '2026-10-02T12:00:00Z', amount: 132450.75 },
], {
  time: { type: 'temporal', format: 'datetime', timeZone: 'UTC' },
  amount: {
    type: 'quantitative', label: 'Net revenue', currency: 'EUR',
    format: 'currency', axisFormat: 'currency-compact',
    tooltipFormat: {
      type: 'number', style: 'currency', currency: 'EUR',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    },
    description: 'Recognized revenue after refunds; excludes tax.',
  },
});

export function Revenue() {
  return <QuartileProvider locale="fr-FR" timeZone="UTC">
    <KPI data={revenue} value="amount" label="Net revenue" />
    <LineChart data={revenue} x="time" y="amount"
      tooltipNote="Each observation is one completed reporting day." />
    <DataTable data={revenue} rowKey="id"
      columns={[{ field: 'time' }, { field: 'amount' }]} />
  </QuartileProvider>;
}
```

The axis can abbreviate while the tooltip, exact table and KPI retain full currency values. A component's explicit formatter wins over the relevant `axisFormat` or `tooltipFormat`, which wins over the base field `format`. A descriptor's `locale` overrides the provider locale. For timestamps, descriptor `timeZone` wins over field `timeZone`, then provider `timeZone`; omitting all three uses the runtime's local zone.

`description` explains a field in supported chart tooltips and table headers. `DataTableColumn.description` overrides the field explanation; table header explanations work on focus as well as hover. `tooltipNote` supplies chart-level context and an accessible chart description. BarList and DonutChart expose this context through the chart description rather than a floating tooltip. Sparkline has no `tooltipNote` prop. These strings are plain text.

| Surface | Value policy | Context and boundary |
| --- | --- | --- |
| Chart axis | Component override, then `axisFormat`, then base format with automatic shortening where supported. | Explicit precision is preserved; narrow layouts may still require a shorter chosen format. |
| Chart tooltip | Component override, then `tooltipFormat`, then base format. | Supported tooltips include field explanations and a chart note. |
| Exact chart table | Base field format or explicit component format. | An abbreviated tooltip does not shorten the inspection table. |
| DataTable / DataExplorer | Column format, then field format. | Header descriptions support focus; formatting does not change sorting/filtering/edit input. |
| KPI | Explicit value format, then field format. | Currency is full by default; ratio-percent comparisons use percentage-point changes. |
| CSV | Raw by default; `csvFormat="formatted"` is opt-in on DataExplorer. | Formatted mode applies column/field value formatters, not custom cell JSX, sparkline/bar-share visuals or delta-pill rendering. |

## Named formats and explicit options

| Format | Meaning |
| --- | --- |
| `text` | Text representation; null and nonfinite numbers show an em dash. |
| `number` | Preserves integer Number digits; fractional Number inputs use up to 15 significant digits and retain tiny nonzero observations. |
| `integer` | Round the displayed value to an integer. |
| `compact` | Locale-aware compact notation. |
| `scientific`, `engineering` | Exponent notation; engineering exponents are multiples of three. Default maximum: six significant digits. |
| `currency`, `currency-compact` | Full currency using its minor-unit defaults, or explicitly compact currency. Field currency defaults to USD when absent. |
| `percent` | A ratio: `0.125` represents 12.5%. |
| `pt` | An already-computed percentage-point value; no multiplication by 100. |
| `bytes`, `bytes-binary` | Decimal base 1000 (kB/MB), or binary base 1024 (KiB/MiB). |
| `duration` | Numeric elapsed milliseconds, rendered as a clock duration. |
| `date`, `date-short`, `month`, `weekday` | Localized calendar labels with different detail. |
| `datetime`, `time` | Timestamp or time labels including seconds; datetime also includes the year. |

Automatic axis formatting may shorten named `number`, `integer`, `currency` and `percent` formats. Set an explicit axis descriptor to control precision; explicit options are not replaced by automatic shortening.

Bare `Intl.NumberFormatOptions` remain supported. Typed number descriptors also accept `locale`, `missing`, `prefix`, `suffix` and a finite display-only `scale`:

```ts
import { makeFormatter } from '@quartile/react';

const measurement = makeFormatter({
  type: 'number', notation: 'engineering', maximumSignificantDigits: 4,
  locale: 'de-DE', missing: 'Not measured', suffix: ' mol/L',
});
const money = makeFormatter({
  style: 'currency', currency: 'JPY', currencySign: 'accounting',
});
const temperature = makeFormatter({
  type: 'number', style: 'unit', unit: 'celsius', maximumFractionDigits: 1,
});
const wholePercent = makeFormatter({
  type: 'number', style: 'unit', unit: 'percent', maximumFractionDigits: 1,
}); // 72 means 72 percent; style: 'percent' would mean 7,200 percent.
```

Use fractional digits for fixed decimal places and significant digits for measurement precision. If you set both, `roundingPriority` determines precedence. Newer Intl options include `roundingMode`, `roundingIncrement` and `trailingZeroDisplay`; check your supported browsers when relying on them. Unit formatting labels the supplied measurement; it does not convert units. A field's `unit` badge also does not change the value. Choose a suffix or a unit badge deliberately to avoid duplicate labels.

`scale` multiplies only for display. It uses Number arithmetic, including when the original value is a string or bigint. Do not use it as an exact financial conversion or feed the displayed string back into calculations. Currency display does not perform foreign exchange conversion.

## Dates, durations and byte sizes

```ts
const timestamp = makeFormatter({
  type: 'date', dateStyle: 'medium', timeStyle: 'short',
  timeZone: 'America/New_York', locale: 'en-GB', missing: 'Unknown time',
});
const elapsed = makeFormatter({
  type: 'duration', unit: 'second', maximumFractionDigits: 2,
});
const memory = makeFormatter({
  type: 'bytes', base: 1024, maximumFractionDigits: 1,
});
```

A date-only string such as `2026-10-10` represents a calendar date and keeps that date across display zones. A timestamp such as `2026-10-10T00:30:00Z` represents an instant and may display on the previous day in another zone. Changing display zones does not change chart bucketing, ordering or selection semantics. Avoid ambiguous offset-free timestamps at the ingestion boundary. For consistent server/client output, pass the same explicit locale and time zone to both.

`dateStyle`/`timeStyle` cannot be combined with individual components such as `year` or `hour`. Use one approach. Duration formatting accepts elapsed numeric values, does not use calendar time zones, and does not wrap hours after 24. Byte and duration descriptors accept integer `maximumFractionDigits` from 0 through 20. They use Number arithmetic; they are not arbitrary-precision unit converters.

## Missing values, precision and parts

Numeric/date formatters show an em dash for missing or invalid observations. Set descriptor `missing` to change it. Zero remains zero. Invalid configuration is different from missing data: `makeFormatter` can throw for an invalid locale, unit, time zone or incompatible digit settings. Validate user-authored configurations before rendering; `SpecView` does this for its JSON subset.

Modern Intl implementations can display bigint and decimal strings without converting them to a Number first. Quartile's built-in numeric-string path requires the string to represent a finite JavaScript Number, then passes the original string to Intl to preserve its digits; values beyond that finite range, such as `"1e400"`, show missing text. This still preserves precise strings beyond the safe-integer boundary, such as `"9007199254740993.125"`. Bigint supports exact integer display through native Intl. Named `number` uses at most 20 fractional places for string/bigint inputs; choose explicit options when a different precision is required. Already-rounded Number inputs cannot recover lost digits. Aggregation, chart coordinates, byte/duration formatting and display scaling still use Number arithmetic. JSON cannot encode bigint directly; use strings for exact identifiers/decimal handoffs. For other arbitrary-precision ranges, use an application-owned math.js callback and keep conversion explicit. This is display support, not an arbitrary-precision data engine.

For custom compositions, reuse the public helpers:

```ts
import {
  makeFieldFormatter, makeRangeFormatter, formatField, formatParts, formatDelta,
} from '@quartile/react';

const field = revenue.schema.amount;
const tooltipValue = makeFieldFormatter(field, { locale: 'fr-FR', surface: 'tooltip' });
const cellValue = formatField(field, 125000.25, { locale: 'fr-FR' });
const range = makeRangeFormatter({ type: 'date', dateStyle: 'medium', timeZone: 'UTC' });
const parts = formatParts('currency', 125000.25, { locale: 'fr-FR', currency: 'EUR' });
const delta = formatDelta(0.125, 'percent', 1, { locale: 'fr-FR' });
```

`formatParts` returns `{ type, value }` entries for numeric/date presentation; callbacks, missing values and some custom output use literal parts. Preserve literal spaces and bidirectional marks when composing them. Number/date ranges use native locale-aware formatting where available. String/bigint endpoints use individually formatted labels and a separator to avoid native range implementations losing exact input precision; callbacks also use a separator fallback. Distinct values that round to the same label remain two endpoint labels. Range formatting does not infer measurement uncertainty. Do not compare locale output against hardcoded ASCII punctuation across environments.

`KPI.deltaDigits` and `DataTableColumn.deltaDigits` set 0–20 fractional places for displayed change pills. They control change precision separately from the value formatter. Formatted CSV still applies scalar field/column value formats, not delta-pill presentation.

## Optional adapters

React formatter callbacks receive an unknown value and return a string. Your callback owns missing-value handling. JSON specs cannot contain callbacks.

For an application already using React Intl, reuse its cached imperative formatter rather than mounting a `FormattedNumber` for every tick or cell:

```tsx
import { useIntl } from 'react-intl'; // Optional application dependency.
import { DataTable } from '@quartile/react';

export function TranslatedTable({ rows }: { rows: { id: string; amount: number }[] }) {
  const intl = useIntl(); // Inside your application's IntlProvider.
  return <DataTable data={rows} rowKey="id" columns={[{
    field: 'amount',
    format: value => typeof value === 'number' && Number.isFinite(value)
      ? intl.formatNumber(value, { style: 'currency', currency: 'EUR' })
      : '—',
  }]} />;
}
```

For scientific notation already standardized by a math.js application:

```ts
import { format as mathFormat } from 'mathjs'; // Optional application dependency.
import type { Formatter } from '@quartile/react';

const engineering: Formatter = value =>
  typeof value === 'number' && Number.isFinite(value)
    ? mathFormat(value, { notation: 'engineering', precision: 5 })
    : '—';
```

math.js `precision` means significant digits for engineering/auto/exponential notation, but fractional places for fixed notation. BigNumber computation and dimensional unit conversion belong upstream; convert to an appropriate scalar or exact text boundary before charting. Similarly, an existing d3-format function can be wrapped in a typed callback for SI notation or a fixed shared prefix. Quartile installs none of these adapter libraries. See the [primary-source research](../research/formatting-2026-10-10.md) for the evidence and tradeoffs.

## JSON dashboard formats

Named formats, bare number options and all four descriptors work in [generated dashboards](generated-dashboards.md). Field encodings accept `format`, `axisFormat`, `tooltipFormat`, `description`, `timeZone`, `currency` and `unit`. Column definitions accept a value `format` and `description`.

```json
{
  "component": "LineChart", "data": "readings",
  "x": { "field": "time", "type": "temporal", "timeZone": "UTC", "format": "datetime" },
  "y": {
    "field": "concentration", "type": "quantitative",
    "format": { "type": "number", "notation": "scientific", "maximumSignificantDigits": 5 },
    "axisFormat": { "type": "number", "notation": "engineering", "maximumSignificantDigits": 3 },
    "description": "Measured concentration in mol/L."
  },
  "tooltipNote": "Missing observations are not zero measurements."
}
```

`validateSpec` rejects unknown keys, invalid types/ranges and Intl constructor conflicts with JSON Pointer error paths. Use `validateFormat(value)` for a standalone format editor; it returns the same `{ valid, errors }` shape with paths relative to the format object. The built schema describes structural constraints; applications using only an external JSON Schema validator should also call the runtime validator for Intl checks. Newer Intl capabilities still depend on the runtime or application-installed polyfills.

## Updating an existing preview integration

Named `currency` now keeps the full value and respects the currency's default minor units. Use `currency-compact` to retain deliberate abbreviation, or explicit minimum/maximum fraction digits to retain an existing report's rounding. Named `number` now retains more significant digits instead of always limiting values to two decimals; use `{ maximumFractionDigits: 2 }` when that is your metric's policy. Month/date-time labels now use native locale ordering and date-time labels include year/seconds. Review visual snapshots and compact layouts. [Decision 0006](../decisions/0006-value-formatting.md) records the compatibility tradeoffs.
