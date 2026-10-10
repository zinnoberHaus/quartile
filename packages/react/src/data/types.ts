export type Row = Record<string, unknown>;

/** How a field behaves on a scale. */
export type FieldType = 'quantitative' | 'temporal' | 'nominal' | 'boolean';

export type FormatName =
  | 'text'
  | 'number'
  | 'integer'
  | 'compact'
  | 'scientific'
  | 'engineering'
  | 'bytes'
  | 'bytes-binary'
  | 'duration'
  | 'currency'
  | 'currency-compact'
  | 'percent'
  | 'pt'
  | 'date'
  | 'date-short'
  | 'month'
  | 'weekday'
  | 'datetime'
  | 'time';

export interface FormatSettings {
  /** Overrides the provider locale for this format. */
  locale?: string;
  /** Display text for missing or invalid observations. Defaults to an em dash. */
  missing?: string;
}

export interface NumberFormat extends Intl.NumberFormatOptions, FormatSettings {
  type: 'number';
  /** Display-only multiplier. Percent style already multiplies ratios by 100. */
  scale?: number;
  prefix?: string;
  suffix?: string;
}

export interface DateFormat extends Intl.DateTimeFormatOptions, FormatSettings {
  type: 'date';
}

export interface BytesFormat extends FormatSettings {
  type: 'bytes';
  /** Decimal kB/MB (1000) or binary KiB/MiB (1024). */
  base?: 1000 | 1024;
  maximumFractionDigits?: number;
}

export interface DurationFormat extends FormatSettings {
  type: 'duration';
  /** Unit of the input observation. A duration is elapsed time, never a timestamp. */
  unit?: 'millisecond' | 'second';
  maximumFractionDigits?: number;
}

/** Serializable formats work equally in React and validated JSON dashboard specs. */
export type SerializableFormatter =
  | FormatName
  | Intl.NumberFormatOptions
  | NumberFormat
  | DateFormat
  | BytesFormat
  | DurationFormat;

/** A named format, Intl number options, a typed format descriptor, or a callback. */
export type Formatter = SerializableFormatter | ((value: unknown) => string);

export interface FieldDef {
  name: string;
  type: FieldType;
  /** Human label for axes, legends and table headers. */
  label: string;
  format: Formatter;
  /** Optional axis-only format; exact values retain `format`. */
  axisFormat?: Formatter;
  /** Optional tooltip-only format; table cells retain `format`. */
  tooltipFormat?: Formatter;
  /** Plain-language definition or caveat, shown in supported tooltips and table headers. */
  description?: string;
  /** IANA time zone for instant-valued dates; date-only strings stay calendar dates. */
  timeZone?: string;
  /** ISO 4217 code used by currency formats. */
  currency?: string;
  /** Short unit badge shown on KPIs and cards, e.g. "USD" or "COUNT". */
  unit?: string;
}

export type Schema = Record<string, FieldDef>;

export interface Dataset<R extends Row = Row> {
  readonly kind: 'dataset';
  rows: R[];
  schema: Schema;
}

/** Anything a data component accepts: plain rows, or rows with a schema attached. */
export type DataInput<R extends Row = Row> = readonly R[] | Dataset<R>;

export type FieldOverride = Partial<Omit<FieldDef, 'name'>> | FormatName;
