export type Row = Record<string, unknown>;

/** How a field behaves on a scale. */
export type FieldType = 'quantitative' | 'temporal' | 'nominal' | 'boolean';

export type FormatName =
  | 'text'
  | 'number'
  | 'integer'
  | 'compact'
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

/** A named format, Intl options, or a function. */
export type Formatter = FormatName | Intl.NumberFormatOptions | ((value: unknown) => string);

export interface FieldDef {
  name: string;
  type: FieldType;
  /** Human label for axes, legends and table headers. */
  label: string;
  format: Formatter;
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
