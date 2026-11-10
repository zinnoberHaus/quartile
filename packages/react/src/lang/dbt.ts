/**
 * dbt integration helpers. They read dbt's own artifacts — `target/manifest.json` (schema v12)
 * and `dbt show --output json` — so charts reuse documented column labels, descriptions and
 * types, and so Quartile dashboards can be declared as dbt exposures. Nothing here runs dbt or
 * queries a warehouse.
 */
import { dataset, humanize } from '../data/schema';
import type { Dataset, FieldOverride, FieldType, Formatter, Row } from '../data/types';
import { readFormat } from './formats';

type FieldMeta = Exclude<FieldOverride, string>;

interface ManifestColumn {
  name?: string;
  description?: string;
  data_type?: string | null;
  meta?: Record<string, unknown>;
  config?: { meta?: Record<string, unknown> };
}

interface ManifestNode {
  unique_id?: string;
  name?: string;
  resource_type?: string;
  description?: string;
  columns?: Record<string, ManifestColumn>;
  meta?: Record<string, unknown>;
  config?: { meta?: Record<string, unknown> };
}

interface ManifestMetric {
  name?: string;
  label?: string;
  description?: string;
  type?: string;
  meta?: Record<string, unknown>;
  config?: { meta?: Record<string, unknown> };
}

export interface DbtManifest {
  metadata?: { dbt_schema_version?: string; dbt_version?: string };
  nodes?: Record<string, ManifestNode>;
  sources?: Record<string, ManifestNode>;
  metrics?: Record<string, ManifestMetric>;
}

/** Finds a model, seed, snapshot or source by unique id or by name. */
export function findDbtNode(manifest: DbtManifest, ref: string): ManifestNode | undefined {
  const all = { ...manifest.nodes, ...manifest.sources };
  if (all[ref]) return all[ref];
  const candidates = Object.values(all).filter(
    (n) => n.name === ref && n.resource_type !== 'test' && n.resource_type !== 'analysis',
  );
  return candidates.find((n) => n.resource_type === 'model') ?? candidates[0];
}

function quartileMeta(
  ...sources: (Record<string, unknown> | undefined)[]
): Record<string, unknown> {
  for (const s of sources) {
    const q = s?.quartile;
    if (q && typeof q === 'object') return q as Record<string, unknown>;
  }
  return {};
}

/** Warehouse column types → Quartile field types. Unknown types are left to inference. */
export function fieldTypeOf(dataType: string | null | undefined): FieldType | undefined {
  const t = (dataType ?? '').toLowerCase();
  if (!t) return undefined;
  if (/^(bool|boolean)/.test(t)) return 'boolean';
  if (/(timestamp|datetime|^date|^time)/.test(t)) return 'temporal';
  if (/(int|numeric|decimal|number|float|double|real|money|bignumeric)/.test(t))
    return 'quantitative';
  if (/(char|text|string|varchar|uuid|enum)/.test(t)) return 'nominal';
  return undefined;
}

function applyMeta(meta: FieldMeta, q: Record<string, unknown>) {
  if (typeof q.label === 'string') meta.label = q.label;
  if (typeof q.unit === 'string') meta.unit = q.unit;
  if (typeof q.currency === 'string') meta.currency = q.currency.toUpperCase();
  if (typeof q.format === 'string') {
    const reading = readFormat(q.format);
    if (reading.format) meta.format = reading.format as Formatter;
    if (reading.currency) meta.currency ??= reading.currency;
  } else if (q.format && typeof q.format === 'object') meta.format = q.format as Formatter;
}

/**
 * Field metadata for a model's columns: dbt descriptions become field descriptions (shown in
 * tooltips and table headers), `data_type` sets the field type, and `meta.quartile`
 * (`label`, `format`, `unit`, `currency`) sets display choices.
 *
 *   columns:
 *     - name: amount
 *       description: Order value after discounts, before tax.
 *       meta: { quartile: { label: Revenue, format: currency USD } }
 */
export function dbtFields(manifest: DbtManifest, ref: string): Record<string, FieldMeta> {
  const node = findDbtNode(manifest, ref);
  const out: Record<string, FieldMeta> = {};
  for (const [key, col] of Object.entries(node?.columns ?? {})) {
    const name = col.name ?? key;
    const meta: FieldMeta = {};
    if (col.description?.trim()) meta.description = col.description.trim();
    const type = fieldTypeOf(col.data_type);
    if (type) meta.type = type;
    applyMeta(meta, quartileMeta(col.config?.meta, col.meta));
    meta.label ??= humanize(name);
    out[name] = meta;
  }
  // Semantic Layer metrics named like a column describe it too.
  for (const metric of Object.values(manifest.metrics ?? {})) {
    if (!metric.name) continue;
    out[metric.name] ??= {};
    const meta = out[metric.name];
    if (metric.label) meta.label = metric.label;
    if (metric.description?.trim()) meta.description ??= metric.description.trim();
    applyMeta(meta, quartileMeta(metric.config?.meta, metric.meta));
  }
  return out;
}

/** Rows from `dbt show --output json` (`{ "node": …, "show": [...] }`) or a plain row array. */
export function rowsFromDbtShow(output: unknown): Row[] {
  const value = typeof output === 'string' ? JSON.parse(output) : output;
  if (Array.isArray(value)) return value as Row[];
  if (value && typeof value === 'object' && Array.isArray((value as { show?: unknown }).show)) {
    return (value as { show: Row[] }).show;
  }
  throw new Error('Expected the JSON printed by `dbt show --output json`.');
}

/** A dataset from `dbt show` rows, described by the model's documentation in the manifest. */
export function dbtDataset(
  output: unknown,
  options: { manifest?: DbtManifest; model?: string } = {},
): Dataset {
  const rows = rowsFromDbtShow(output);
  const fields =
    options.manifest && options.model ? dbtFields(options.manifest, options.model) : {};
  const columns = new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r)));
  return dataset(
    rows,
    Object.fromEntries(Object.entries(fields).filter(([name]) => columns.has(name))),
  );
}

export interface ExposureOptions {
  name: string;
  /** Models (or sources as `source('x','y')`) the dashboard reads. */
  dependsOn: string[];
  url?: string;
  label?: string;
  description?: string;
  owner?: { name?: string; email?: string };
  maturity?: 'low' | 'medium' | 'high';
}

const yamlString = (s: string) =>
  /^[\w .,/()-]*$/.test(s) && s.trim() === s ? s : JSON.stringify(s);

/** YAML for a dbt exposure, so the dashboard appears in dbt lineage and docs. */
export function dbtExposureYaml(options: ExposureOptions): string {
  const lines = ['exposures:', `  - name: ${options.name}`];
  if (options.label) lines.push(`    label: ${yamlString(options.label)}`);
  lines.push('    type: dashboard', `    maturity: ${options.maturity ?? 'medium'}`);
  if (options.url) lines.push(`    url: ${options.url}`);
  if (options.description) lines.push(`    description: ${yamlString(options.description)}`);
  lines.push('    depends_on:');
  for (const d of options.dependsOn) {
    lines.push(`      - ${d.startsWith('source(') || d.startsWith('ref(') ? d : `ref('${d}')`}`);
  }
  if (options.owner && (options.owner.name || options.owner.email)) {
    lines.push('    owner:');
    if (options.owner.name) lines.push(`      name: ${yamlString(options.owner.name)}`);
    if (options.owner.email) lines.push(`      email: ${options.owner.email}`);
  }
  return `${lines.join('\n')}\n`;
}
