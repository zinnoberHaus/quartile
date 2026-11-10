import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from 'react';
import * as Charts from '../charts';
import { FigureDescriptionContext } from '../charts/core/figure-context';
import { applyPredicates, type Predicate } from '../data/predicates';
import { dataset, resolveData } from '../data/schema';
import type { DataInput, FieldOverride, Row } from '../data/types';
import * as DataDisplay from '../data-display';
import { aggregateRows } from '../data-display/shared';
import { IconAlertCircle } from '../icons';
import { cx } from '../lib/cx';
import { useQuartile } from '../provider/QuartileProvider';
import { AppliedPredicatesContext } from '../selection/appliedPredicates';
import { Selection, useSelection, useSourceId } from '../selection/Selection';
import type { SelectionChange } from '../selection/store';
import { SelectionWatch } from '../selection/watch';
import { resolveActions, type ViewAction } from './actions';
import { formatAsOf, hostOf, httpUrl, type Provenance, provenanceText } from './provenance';
import type { ComponentSpec, DashboardSpec, SpecComponentName } from './schema';
import { RowsPanel, ViewToolbar } from './ViewActions';
import { isDashboardSpec, type SpecError, validateSpec } from './validate';

export interface SpecViewProps {
  /** A component spec or a Dashboard, typically JSON from a model. Validated before rendering. */
  spec: unknown;
  /** Datasets the spec can reference by name. */
  data: Record<string, DataInput>;
  /**
   * A Dashboard normally links its items through its own Selection. With `linked`, it joins the
   * nearest enclosing Selection instead, sharing filters with views outside the spec.
   */
  linked?: boolean;
  /**
   * Called after every change of the selection the spec's views use: a Dashboard's own
   * selection, or the nearest enclosing one (with `linked`, and for a single component).
   * `group` is that selection's id; name a Dashboard's with `selection` to keep it stable.
   */
  onSelectionChange?: (change: SelectionChange) => void;
  /**
   * Controls the views may show: `table`, `rows`, `download`. A list is the default for views
   * that do not set `actions` themselves; `false` shows none whatever a view asks. Without it,
   * a view shows only the actions its own spec lists.
   */
  actions?: readonly ViewAction[] | false;
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
  Funnel: { dims: ['step'], measures: ['value'], frame: 'card', span: 4 },
  Sparkline: { dims: ['x'], measures: ['y', 'compare'], frame: 'card', span: 3 },
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

const META_KEYS = new Set([
  'component',
  'data',
  'title',
  'description',
  'span',
  'source',
  'sourceUrl',
  'asOf',
  'actions',
]);

/** Components that publish to the selection under the `id` they are given. */
const PUBLISHERS = new Set<SpecComponentName>([
  'LineChart',
  'AreaChart',
  'BarChart',
  'BarList',
  'DonutChart',
  'Histogram',
  'ScatterPlot',
  'Heatmap',
  'CalendarHeatmap',
  'BoxPlot',
  'Sankey',
  'DataTable',
]);

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
    const { field, aggregate, ...metadata } = v as Record<string, unknown>;
    const override: Exclude<FieldOverride, string> = {};
    for (const key of [
      'type',
      'label',
      'format',
      'axisFormat',
      'tooltipFormat',
      'description',
      'timeZone',
      'currency',
      'unit',
    ] as const) {
      if (metadata[key] !== undefined) override[key] = metadata[key] as never;
    }
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
    const appliedPredicates = new Set<Predicate>();
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
        // Several measures: plain field names, or fields with an aggregate and display overrides.
        const fields: string[] = [];
        for (const item of raw) {
          const e = encoded(item);
          if (!e) continue;
          fields.push(e.field);
          if (e.override) overrides[e.field] = { ...overrides[e.field], ...e.override };
          if (isDim) dims.add(e.field);
          else measures.push(e);
        }
        props[key] = fields;
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
      for (const p of outside) appliedPredicates.add(p);
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
    return { props, appliedPredicates };
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

/**
 * "Source: … · As of …" under a view or a dashboard. The words are rendered as text; the link
 * is shown only for an http(s) address and is never requested by the library.
 */
function SourceNote({ spec, id }: { spec: Provenance; id?: string }) {
  const { locale, timeZone } = useQuartile();
  const source = typeof spec.source === 'string' ? spec.source.trim() : '';
  const href = httpUrl(spec.sourceUrl);
  const asOf = formatAsOf(spec.asOf, { locale, timeZone });
  const named = source !== '' || href !== null;
  if (!named && !asOf) return null;
  return (
    <p className="q-spec-source" id={id}>
      {named ? (
        <span>
          Source:{' '}
          {href ? (
            <a href={href} rel="noopener noreferrer">
              {source || hostOf(href)}
            </a>
          ) : (
            source
          )}
        </span>
      ) : null}
      {named && asOf ? ' · ' : null}
      {asOf ? <span>As of {asOf}</span> : null}
    </p>
  );
}

function SpecItem({
  spec,
  data,
  errors,
  actions,
}: {
  spec: ComponentSpec;
  data: Record<string, DataInput>;
  errors: SpecError[];
  actions?: readonly ViewAction[] | false;
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
  if (spec.data !== undefined && !Object.hasOwn(data, spec.data)) {
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
  return (
    <SpecComponent
      spec={spec}
      Comp={Comp}
      input={spec.data ? data[spec.data] : undefined}
      hostActions={actions}
    />
  );
}

function SpecComponent({
  spec,
  Comp,
  input,
  hostActions,
}: {
  spec: ComponentSpec;
  Comp: AnyComponent;
  input: DataInput | undefined;
  hostActions?: readonly ViewAction[] | false;
}) {
  const { props, appliedPredicates } = useSpecProps(spec, input);
  const shape = SHAPES[spec.component];
  const noteId = useId();
  const panelId = useId();
  const publisher = useSourceId();
  // Both start as the spec says, on the server and on the first client render alike.
  const [tableChoice, setTableChoice] = useState<boolean | null>(null);
  const [rowsOpen, setRowsOpen] = useState(false);
  const actions =
    input === undefined ? [] : resolveActions(spec.component, spec.actions, hostActions);
  const asTable = tableChoice ?? spec.view === 'table';
  const traced = actions.includes('rows') || actions.includes('download');
  const name =
    typeof spec.title === 'string' && spec.title
      ? spec.title
      : spec.component === 'KPI' && typeof spec.label === 'string'
        ? spec.label
        : undefined;
  const shown =
    actions.length === 0
      ? props
      : {
          ...props,
          ...(actions.includes('table') ? { view: asTable ? 'table' : 'chart' } : null),
          // The view's publisher id, so the rows behind it can leave out its own selection.
          ...(traced && PUBLISHERS.has(spec.component) ? { id: publisher } : null),
        };
  const note = provenanceText(spec) ? <SourceNote spec={spec} id={noteId} /> : null;
  const toolbar =
    actions.length > 0 && input !== undefined ? (
      <ViewToolbar
        name={name}
        actions={actions}
        table={asTable}
        onTable={() => setTableChoice(!asTable)}
        rows={rowsOpen}
        onRows={() => setRowsOpen((open) => !open)}
        panelId={panelId}
        input={input}
        publisher={publisher}
      />
    ) : null;
  const panel =
    rowsOpen && input !== undefined && actions.includes('rows') ? (
      <RowsPanel id={panelId} name={name} input={input} publisher={publisher} />
    ) : null;
  const node = (
    <AppliedPredicatesContext.Provider value={appliedPredicates}>
      <FigureDescriptionContext.Provider value={note ? noteId : undefined}>
        <Comp {...shown} />
      </FigureDescriptionContext.Provider>
    </AppliedPredicatesContext.Provider>
  );
  if (shape.frame === 'bare') {
    if (!note && !toolbar) return node;
    return (
      <div className="q-spec-noted">
        {node}
        {toolbar}
        {panel}
        {note}
      </div>
    );
  }
  const head =
    spec.title || spec.description ? (
      <div className="q-spec-card-head">
        {spec.title && <div className="q-spec-card-title">{spec.title}</div>}
        {spec.description && <div className="q-spec-card-desc">{spec.description}</div>}
      </div>
    ) : null;
  return (
    <div className="q-spec-card">
      {toolbar ? (
        <div className="q-spec-card-top">
          {head}
          {toolbar}
        </div>
      ) : (
        head
      )}
      {node}
      {panel}
      {note}
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
export function SpecView({
  spec,
  data,
  linked,
  onSelectionChange,
  actions,
  className,
  style,
}: SpecViewProps) {
  const result = useMemo(() => validateSpec(spec), [spec]);
  const watch = onSelectionChange ? <SelectionWatch onChange={onSelectionChange} /> : null;
  if (!isDashboardSpec(spec)) {
    return (
      <div className={cx('q-spec', className)} style={style}>
        {watch}
        <SpecItem
          spec={spec as ComponentSpec}
          data={data}
          errors={result.errors}
          actions={actions}
        />
      </div>
    );
  }
  const dash = spec as DashboardSpec;
  const title = typeof dash.title === 'string' ? dash.title : undefined;
  const description = typeof dash.description === 'string' ? dash.description : undefined;
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
                actions={actions}
              />
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={cx('q-spec', 'q-spec-dashboard', className)} style={style}>
      {(title || description) && (
        <div className="q-spec-head">
          {title && <h2 className="q-spec-title">{title}</h2>}
          {description && <p className="q-spec-desc">{description}</p>}
        </div>
      )}
      {linked ? (
        <>
          {watch}
          {body}
        </>
      ) : (
        <Selection id={typeof dash.selection === 'string' ? dash.selection : undefined}>
          {watch}
          {body}
        </Selection>
      )}
      <SourceNote spec={dash} />
    </div>
  );
}
