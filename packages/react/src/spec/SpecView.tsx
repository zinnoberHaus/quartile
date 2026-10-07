import { type ComponentType, type CSSProperties, type ReactNode, useMemo } from 'react';
import * as Charts from '../charts';
import { applyPredicates } from '../data/predicates';
import { dataset, resolveData } from '../data/schema';
import type { DataInput, FieldOverride, Row } from '../data/types';
import * as DataDisplay from '../data-display';
import { aggregateRows } from '../data-display/shared';
import { IconAlertCircle } from '../icons';
import { cx } from '../lib/cx';
import { Selection, useSelection } from '../selection/Selection';
import type { ComponentSpec, DashboardSpec, SpecComponentName } from './schema';
import { isDashboardSpec, type SpecError, validateSpec } from './validate';

export interface SpecViewProps {
  /** A component spec or a Dashboard, typically JSON from a model. Validated before rendering. */
  spec: unknown;
  /** Datasets the spec can reference by name. */
  data: Record<string, DataInput>;
  className?: string;
  style?: CSSProperties;
}

type Aggregate = 'sum' | 'count' | 'mean';
type AnyComponent = ComponentType<Record<string, unknown>>;

interface Encoded {
  field: string;
  aggregate?: Aggregate;
  override?: Exclude<FieldOverride, string>;
}

/**
 * How each component reads its encodings. `dims` are fields that identify a row (kept when
 * rows are pre-aggregated); `measures` may carry an aggregate. `native` components aggregate
 * themselves through an `aggregate` prop, so their rows are passed through untouched.
 */
const SHAPES: Record<
  SpecComponentName,
  { dims: string[]; measures: string[]; native?: boolean; frame: 'card' | 'bare'; span: number }
> = {
  LineChart: { dims: ['x', 'color'], measures: ['y', 'compare'], frame: 'card', span: 6 },
  AreaChart: { dims: ['x', 'color'], measures: ['y'], frame: 'card', span: 6 },
  BarChart: { dims: ['x', 'group', 'color'], measures: ['y'], frame: 'card', span: 6 },
  BarList: {
    dims: ['category', 'delta'],
    measures: ['value'],
    native: true,
    frame: 'card',
    span: 4,
  },
  DonutChart: { dims: ['category'], measures: ['value'], native: true, frame: 'card', span: 4 },
  Funnel: { dims: ['step', 'value'], measures: [], frame: 'card', span: 4 },
  Sparkline: { dims: ['x', 'y', 'compare'], measures: [], frame: 'card', span: 3 },
  Histogram: { dims: ['x', 'value'], measures: [], frame: 'card', span: 6 },
  ScatterPlot: { dims: ['x', 'y', 'size', 'color', 'label'], measures: [], frame: 'card', span: 6 },
  Heatmap: { dims: ['x', 'y'], measures: ['value'], native: true, frame: 'card', span: 6 },
  CalendarHeatmap: { dims: ['date'], measures: ['value'], native: true, frame: 'card', span: 12 },
  BoxPlot: { dims: ['category', 'value'], measures: [], frame: 'card', span: 6 },
  Sankey: { dims: ['from', 'to', 'value'], measures: [], frame: 'card', span: 12 },
  KPI: {
    dims: ['compareValue', 'trendBy'],
    measures: ['value'],
    native: true,
    frame: 'bare',
    span: 3,
  },
  DataTable: { dims: ['groupBy', 'select'], measures: [], frame: 'bare', span: 12 },
  FilterBar: { dims: [], measures: [], frame: 'bare', span: 12 },
};

const META_KEYS = new Set(['component', 'data', 'title', 'description', 'span']);

function isComponent(v: unknown): v is AnyComponent {
  return (
    typeof v === 'function' || (typeof v === 'object' && v !== null && '$$typeof' in (v as object))
  );
}

/** Looks a component up by its exported name, so new exports become available automatically. */
function lookup(name: string): AnyComponent | null {
  const registry = { ...Charts, ...DataDisplay } as Record<string, unknown>;
  const c = registry[name];
  return isComponent(c) ? c : null;
}

function encoded(v: unknown): Encoded | null {
  if (typeof v === 'string') return { field: v };
  if (v && typeof v === 'object' && !Array.isArray(v) && 'field' in v) {
    const { field, aggregate, type, label, format } = v as Record<string, unknown>;
    const override: Exclude<FieldOverride, string> = {};
    if (type) override.type = type as never;
    if (label) override.label = label as string;
    if (format) override.format = format as never;
    return {
      field: String(field),
      aggregate: aggregate as Aggregate | undefined,
      override: Object.keys(override).length ? override : undefined,
    };
  }
  return null;
}

/** Turns a validated spec into props plus the rows it should receive. */
function useSpecProps(spec: ComponentSpec, input: DataInput | undefined) {
  const shape = SHAPES[spec.component];
  const sel = useSelection();
  const predicates = sel.predicates;
  return useMemo(() => {
    const props: Record<string, unknown> = {};
    const overrides: Record<string, Exclude<FieldOverride, string>> = {};
    const dims = new Set<string>();
    const measures: Encoded[] = [];
    for (const [key, raw] of Object.entries(spec)) {
      if (META_KEYS.has(key)) continue;
      const isDim = shape.dims.includes(key);
      const isMeasure = shape.measures.includes(key);
      if (!isDim && !isMeasure) {
        props[key] = raw;
        continue;
      }
      if (Array.isArray(raw)) {
        props[key] = raw;
        for (const f of raw) isDim ? dims.add(String(f)) : measures.push({ field: String(f) });
        continue;
      }
      const e = encoded(raw);
      if (!e) {
        props[key] = raw;
        continue;
      }
      props[key] = e.field;
      if (e.override) overrides[e.field] = { ...overrides[e.field], ...e.override };
      if (isDim) dims.add(e.field);
      else {
        measures.push(e);
        if (shape.native && e.aggregate) props.aggregate = e.aggregate;
      }
    }

    let rows: DataInput | undefined = input;
    const preAggregate = !shape.native && measures.some((m) => m.aggregate);
    if (input && preAggregate) {
      const { rows: raw, schema } = resolveData(input);
      // Predicates on fields that survive aggregation are left to the component (so it never
      // filters itself); the rest are applied here, before the rows collapse.
      const outside = predicates.filter((p) => !dims.has(p.field));
      const filtered = applyPredicates(raw, outside);
      const how = measures.find((m) => m.aggregate)?.aggregate ?? 'sum';
      const groups = new Map<string, Row[]>();
      const dimList = [...dims];
      for (const r of filtered) {
        const k = JSON.stringify(dimList.map((d) => r[d] ?? null));
        const g = groups.get(k);
        if (g) g.push(r);
        else groups.set(k, [r]);
      }
      const out: Row[] = [];
      for (const g of groups.values()) {
        const row: Row = {};
        for (const d of dimList) row[d] = g[0][d];
        for (const m of measures) row[m.field] = aggregateRows(g, m.field, m.aggregate ?? how);
        out.push(row);
      }
      const fields: Record<string, Exclude<FieldOverride, string>> = {};
      for (const name of [...dimList, ...measures.map((m) => m.field)]) {
        if (schema[name]) {
          const { name: _n, ...def } = schema[name];
          fields[name] = def;
        }
      }
      for (const m of measures) {
        if (m.aggregate === 'count') fields[m.field] = { ...fields[m.field], format: 'integer' };
      }
      for (const [f, o] of Object.entries(overrides)) fields[f] = { ...fields[f], ...o };
      rows = dataset(out, fields);
    } else if (input && Object.keys(overrides).length) {
      const { rows: raw, schema } = resolveData(input);
      const fields: Record<string, Exclude<FieldOverride, string>> = {};
      for (const [name, def] of Object.entries(schema)) {
        const { name: _n, ...rest } = def;
        fields[name] = rest;
      }
      for (const [f, o] of Object.entries(overrides)) fields[f] = { ...fields[f], ...o };
      rows = dataset(raw, fields);
    }
    if (rows !== undefined) props.data = rows;
    if (spec.component === 'DataTable') {
      if (spec.title !== undefined) props.title = spec.title;
      if (spec.description !== undefined && props.caption === undefined)
        props.caption = spec.description;
    } else if (shape.frame === 'card' && spec.title) {
      props['aria-label'] = spec.title;
    }
    return props;
  }, [spec, shape, input, predicates]);
}

function ErrorCard({
  title,
  errors,
  component,
}: {
  title: string;
  errors: SpecError[];
  component?: string;
}) {
  return (
    <div className="q-spec-error" role="alert">
      <div className="q-spec-error-head">
        <IconAlertCircle className="q-spec-error-icon" />
        <span className="q-spec-error-title">{title}</span>
        {component && <span className="q-spec-error-component">{component}</span>}
      </div>
      {errors.length > 0 && (
        <ul className="q-spec-error-list">
          {errors.map((e, i) => (
            <li key={i}>
              <code className="q-spec-error-path">{e.path || '/'}</code>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpecItem({
  spec,
  data,
  errors,
}: {
  spec: ComponentSpec;
  data: Record<string, DataInput>;
  errors: SpecError[];
}) {
  const name = typeof spec?.component === 'string' ? spec.component : undefined;
  if (errors.length > 0) {
    return <ErrorCard title="This spec is not valid" errors={errors} component={name} />;
  }
  const Comp = lookup(spec.component);
  if (!Comp) {
    return (
      <ErrorCard
        title={`“${spec.component}” is in the schema but not in this build`}
        errors={[]}
        component={spec.component}
      />
    );
  }
  if (spec.data !== undefined && !(spec.data in data)) {
    const available = Object.keys(data);
    return (
      <ErrorCard
        title={`Dataset “${spec.data}” was not provided`}
        errors={[
          {
            path: '/data',
            message: available.length
              ? `Available datasets: ${available.join(', ')}.`
              : 'SpecView received no datasets.',
          },
        ]}
        component={spec.component}
      />
    );
  }
  return <SpecComponent spec={spec} Comp={Comp} input={spec.data ? data[spec.data] : undefined} />;
}

function SpecComponent({
  spec,
  Comp,
  input,
}: {
  spec: ComponentSpec;
  Comp: AnyComponent;
  input: DataInput | undefined;
}) {
  const props = useSpecProps(spec, input);
  const shape = SHAPES[spec.component];
  const node = <Comp {...props} />;
  if (shape.frame === 'bare') return node;
  return (
    <div className="q-spec-card">
      {(spec.title || spec.description) && (
        <div className="q-spec-card-head">
          {spec.title && <div className="q-spec-card-title">{spec.title}</div>}
          {spec.description && <div className="q-spec-card-desc">{spec.description}</div>}
        </div>
      )}
      {node}
    </div>
  );
}

function errorsUnder(errors: SpecError[], prefix: string): SpecError[] {
  return errors
    .filter((e) => e.path === prefix || e.path.startsWith(`${prefix}/`))
    .map((e) => ({ ...e, path: e.path.slice(prefix.length) }));
}

/**
 * Renders a JSON spec (one component or a Dashboard) with the real components. The spec is
 * validated first; invalid items, unknown components and missing datasets render an inline
 * error card in their place instead of throwing.
 */
export function SpecView({ spec, data, className, style }: SpecViewProps) {
  const result = useMemo(() => validateSpec(spec), [spec]);
  if (!isDashboardSpec(spec)) {
    return (
      <div className={cx('q-spec', className)} style={style}>
        <SpecItem spec={spec as ComponentSpec} data={data} errors={result.errors} />
      </div>
    );
  }
  const dash = spec as DashboardSpec;
  const layout = Array.isArray(dash.layout) ? dash.layout : [];
  const topErrors = result.errors.filter((e) => !/^\/layout\/\d+(\/|$)/.test(e.path));
  let body: ReactNode;
  if (topErrors.length > 0 || layout.length === 0) {
    body = <ErrorCard title="This dashboard spec is not valid" errors={topErrors} />;
  } else {
    body = (
      <div className="q-spec-grid">
        {layout.map((item, i) => {
          const comp = (item as ComponentSpec)?.component;
          const span =
            typeof item?.span === 'number'
              ? item.span
              : (SHAPES[comp as SpecComponentName]?.span ?? 12);
          return (
            <div key={i} className="q-spec-cell" style={{ '--q-span': span } as CSSProperties}>
              <SpecItem
                spec={item as ComponentSpec}
                data={data}
                errors={errorsUnder(result.errors, `/layout/${i}`)}
              />
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={cx('q-spec', 'q-spec-dashboard', className)} style={style}>
      {(dash.title || dash.description) && (
        <div className="q-spec-head">
          {dash.title && <h2 className="q-spec-title">{dash.title}</h2>}
          {dash.description && <p className="q-spec-desc">{dash.description}</p>}
        </div>
      )}
      <Selection id={typeof dash.selection === 'string' ? dash.selection : undefined}>
        {body}
      </Selection>
    </div>
  );
}
