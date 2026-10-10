import type { Predicate, Primitive } from '../data/predicates';
import type { FieldDef, Schema } from '../data/types';
import type { QueryMeasure, QueryOrder, QueryPlan } from '../query/types';
import { ORDINAL } from './schema';

export interface CompiledQuery {
  sql: string;
  params: (string | number | boolean)[];
  countSql?: string;
  countParams?: (string | number | boolean)[];
  totalRows?: number;
  schema: Schema;
  offset: number;
  finiteFields?: readonly string[];
}

const MAX_ROWS = 10_000;
const MAX_BINS = 1_000;

export function quoteIdentifier(value: string): string {
  if (!value || value.includes('\0')) throw new Error('Invalid SQL identifier.');
  return `"${value.replaceAll('"', '""')}"`;
}

function bounded(value: number, name: string, maximum = MAX_ROWS, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function field(schema: Schema, name: string): FieldDef {
  if (typeof name !== 'string' || !Object.hasOwn(schema, name))
    throw new Error(`Unknown query field: ${String(name)}.`);
  return schema[name];
}

function column(schema: Schema, name: string, temporal = true) {
  const definition = field(schema, name);
  const quoted = quoteIdentifier(name);
  return temporal && definition.type === 'temporal' ? `epoch_ms(${quoted})` : quoted;
}

function comparable(value: Primitive, definition: FieldDef): string | number | boolean | null {
  // Arrow dates use UTC epoch time. The synchronous row path's date-only local-time
  // conversion would shift DateDay predicates away from their stored UTC midnight.
  const result =
    definition.type === 'temporal'
      ? value instanceof Date
        ? value.getTime()
        : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)
          ? Date.parse(value)
          : value
      : value;
  if (result == null) return null;
  const expected =
    definition.type === 'quantitative' || definition.type === 'temporal'
      ? 'number'
      : definition.type === 'boolean'
        ? 'boolean'
        : 'string';
  if (
    result instanceof Date ||
    typeof result !== expected ||
    (typeof result === 'number' && !Number.isFinite(result))
  )
    throw new Error(
      `Predicate value for ${definition.name} must match its ${definition.type} type.`,
    );
  return result;
}

function where(schema: Schema, predicates: readonly Predicate[]) {
  const params: (string | number | boolean)[] = [];
  const bind = (value: string | number | boolean) => {
    params.push(value);
    return '?';
  };
  if (!Array.isArray(predicates) || predicates.length > 100)
    throw new Error('A query accepts at most 100 predicates.');
  const conditions = predicates.map((predicate) => {
    const definition = field(schema, predicate.field);
    const col = column(schema, predicate.field);
    const scalar = (value: Primitive) => comparable(value, definition);
    if (predicate.op === 'eq') {
      const value = scalar(predicate.value);
      return value == null ? `${col} IS NULL` : `${col} = ${bind(value)}`;
    }
    if (predicate.op === 'in') {
      if (!Array.isArray(predicate.value) || predicate.value.length > 1_000)
        throw new Error('An inclusion predicate accepts at most 1000 values.');
      const values: (string | number | boolean | null)[] = predicate.value.map(scalar);
      const present = values.filter((value) => value != null);
      const clauses = present.length ? [`${col} IN (${present.map(bind).join(', ')})`] : [];
      if (values.includes(null)) clauses.push(`${col} IS NULL`);
      return clauses.length ? `(${clauses.join(' OR ')})` : 'FALSE';
    }
    if (predicate.op === 'between') {
      if (!Array.isArray(predicate.value) || predicate.value.length !== 2)
        throw new Error('A range predicate requires two bounds.');
      if (definition.type === 'nominal' || definition.type === 'boolean')
        throw new Error('Ranges require a quantitative or temporal field.');
      const [low, high] = predicate.value.map(scalar);
      const clauses = [`${col} IS NOT NULL`];
      if (low != null) clauses.push(`${col} >= ${bind(low)}`);
      if (high != null) clauses.push(`${col} <= ${bind(high)}`);
      return `(${clauses.join(' AND ')})`;
    }
    throw new Error('Unsupported predicate operator.');
  });
  return { sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', params };
}

function order(orders: readonly QueryOrder[] | undefined, schema: Schema, fallback: string[]) {
  if (
    orders !== undefined &&
    (!Array.isArray(orders) || orders.length > Object.keys(schema).length)
  )
    throw new Error('Invalid query ordering.');
  const seen = new Set<string>();
  const clauses = (orders ?? []).map(({ field: name, direction }) => {
    field(schema, name);
    if (direction !== 'asc' && direction !== 'desc') throw new Error('Invalid sort direction.');
    if (seen.has(name)) throw new Error(`Repeated sort field: ${name}.`);
    seen.add(name);
    return `${quoteIdentifier(name)} ${direction.toUpperCase()} NULLS LAST`;
  });
  clauses.push(
    ...fallback
      .filter((name) => !seen.has(name))
      .map((name) => `${quoteIdentifier(name)} ASC NULLS LAST`),
  );
  return clauses.length ? ` ORDER BY ${clauses.join(', ')}` : '';
}

function measureSQL(measure: QueryMeasure, schema: Schema) {
  const { field: name, aggregate } = measure;
  const definition = name === undefined ? undefined : field(schema, name);
  if (aggregate === 'count') {
    if (!definition) return 'count(*)';
    const col = column(schema, definition.name, false);
    return definition.type === 'nominal' ? `count(nullif(${col}, ''))` : `count(${col})`;
  }
  if (!['sum', 'mean', 'min', 'max'].includes(aggregate)) throw new Error('Unsupported aggregate.');
  if (definition?.type !== 'quantitative')
    throw new Error(`${aggregate} requires a quantitative field.`);
  const col = column(schema, definition.name, false);
  const value = `CASE WHEN isfinite(${col}) THEN CAST(${col} AS DOUBLE) ELSE NULL END`;
  return aggregate === 'sum'
    ? `coalesce(sum(${value}), 0)`
    : `${aggregate === 'mean' ? 'avg' : aggregate}(${value})`;
}

/** Compile an allowlisted view plan. Relation is an adapter-owned name, never part of the plan. */
export function compileQuery(plan: QueryPlan, schema: Schema, relation: string): CompiledQuery {
  const table = quoteIdentifier(relation);
  const filter = where(schema, plan.predicates);
  const output: Schema = Object.create(null);
  if (plan.kind === 'rows') {
    const names = plan.fields ?? Object.keys(schema);
    if (!Array.isArray(names) || !names.length || new Set(names).size !== names.length)
      throw new Error('A row query requires distinct fields.');
    const columns = names.map((name) => {
      output[name] = field(schema, name);
      return `${column(schema, name)} AS ${quoteIdentifier(name)}`;
    });
    const offset = bounded(plan.window.offset, 'offset', Number.MAX_SAFE_INTEGER, 0);
    const limit = bounded(plan.window.limit, 'limit');
    // Sort fields may be unprojected; ordinal breaks every remaining tie by input order.
    const sorting = order(plan.orderBy, schema, [ORDINAL]);
    return {
      sql: `SELECT ${columns.join(', ')} FROM ${table}${filter.sql}${sorting} LIMIT ? OFFSET ?`,
      params: [...filter.params, limit, offset],
      countSql: `SELECT count(*) AS total FROM ${table}${filter.sql}`,
      countParams: filter.params,
      schema: output,
      offset,
    };
  }
  if (plan.kind === 'aggregate') {
    if (!Array.isArray(plan.groupBy) || !Array.isArray(plan.measures) || !plan.measures.length)
      throw new Error('An aggregate query requires group fields and at least one measure.');
    if (plan.measures.length > 100 || new Set(plan.groupBy).size !== plan.groupBy.length)
      throw new Error('Invalid aggregate dimensions or measure count.');
    const names = new Set<string>();
    const columns = plan.groupBy.map((name) => {
      output[name] = field(schema, name);
      names.add(name.toLowerCase());
      return `${column(schema, name)} AS ${quoteIdentifier(name)}`;
    });
    for (const measure of plan.measures) {
      if (typeof measure.as !== 'string' || !measure.as || names.has(measure.as.toLowerCase()))
        throw new Error(`Duplicate or invalid measure alias: ${String(measure.as)}.`);
      names.add(measure.as.toLowerCase());
      const expression = measureSQL(measure, schema);
      const original = measure.field === undefined ? undefined : schema[measure.field];
      output[measure.as] = {
        ...(measure.aggregate !== 'count' ? original : undefined),
        name: measure.as,
        type: 'quantitative',
        label: original?.label ?? measure.as,
        format: measure.aggregate === 'count' ? 'integer' : (original?.format ?? 'number'),
      };
      columns.push(`${expression} AS ${quoteIdentifier(measure.as)}`);
    }
    const grouped = plan.groupBy.length
      ? ` GROUP BY ${plan.groupBy.map(quoteIdentifier).join(', ')}`
      : '';
    const query = `SELECT ${columns.join(', ')} FROM ${table}${filter.sql}${grouped}`;
    const limit = bounded(plan.limit, 'limit');
    return {
      sql: `${query}${order(plan.orderBy, output, plan.groupBy)} LIMIT ?`,
      params: [...filter.params, limit],
      countSql: `SELECT count(*) AS total FROM (${query}) AS groups`,
      countParams: filter.params,
      schema: output,
      offset: 0,
      finiteFields: plan.measures.map((measure) => measure.as),
    };
  }
  if (plan.kind === 'histogram') {
    const sourceField = field(schema, plan.field);
    if (sourceField.type !== 'quantitative')
      throw new Error('A histogram requires a quantitative field.');
    const { edges } = plan;
    if (
      !Array.isArray(edges) ||
      edges.length < 2 ||
      edges.length > MAX_BINS + 1 ||
      edges.some((edge, i) => !Number.isFinite(edge) || (i > 0 && edge <= edges[i - 1]))
    )
      throw new Error(
        `Histogram edges must be increasing and finite, with at most ${MAX_BINS} bins.`,
      );
    const params = [...filter.params];
    const values = edges.slice(0, -1).map((x0, i) => {
      params.push(x0, edges[i + 1], i === edges.length - 2);
      return '(?, ?, ?)';
    });
    for (const name of ['x0', 'x1', 'count'])
      output[name] = {
        ...(name !== 'count' ? sourceField : undefined),
        name,
        type: 'quantitative',
        label: name,
        format: name === 'count' ? 'integer' : sourceField.format,
      };
    const col = column(schema, plan.field, false);
    return {
      sql: `WITH filtered AS (SELECT ${col} AS value FROM ${table}${filter.sql}), bins(x0, x1, last) AS (VALUES ${values.join(', ')}) SELECT x0, x1, count(value) AS count FROM bins LEFT JOIN filtered ON isfinite(value) AND value >= x0 AND (value < x1 OR (last AND value <= x1)) GROUP BY x0, x1 ORDER BY x0`,
      params,
      totalRows: edges.length - 1,
      schema: output,
      offset: 0,
    };
  }
  throw new Error('Unsupported query kind.');
}
