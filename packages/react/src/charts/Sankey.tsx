import { sum } from 'd3-array';
import {
  sankey as d3sankey,
  type SankeyLink,
  type SankeyNode,
  sankeyLinkHorizontal,
} from 'd3-sankey';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { makeFormatter } from '../data/format';
import type { Predicate, Primitive } from '../data/predicates';
import { fieldOf, resolveData, toComparable } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import {
  type ChartBaseProps,
  ChartFrame,
  ChartState,
  type ChartTable,
  statusOf,
} from './core/ChartFrame';
import { clamp, orderedKeys } from './core/dist-stats';
import { ChartTooltip, type TooltipRow } from './core/guides';
import { seriesColor } from './core/scales';

export interface SankeyProps<R extends Row = Row> extends ChartBaseProps {
  /** Rows of flows (aggregated per pair), or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Field naming where a flow starts. */
  from: keyof R & string;
  /** Field naming where a flow ends. A name used in both fields links the stages. */
  to: keyof R & string;
  /** Flow size. Counts rows when omitted. */
  value?: keyof R & string;
  /** Formats flow sizes. Defaults to the field's schema format. */
  format?: Formatter;
  /** Node bar width in px. */
  nodeWidth?: number;
  /** Vertical gap between nodes in px. */
  nodePadding?: number;
  /** Click (or Enter) on a node toggles it in the selection on `from` or `to`. Shift adds. */
  select?: boolean;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  onSelect?: (predicate: Predicate | null) => void;
}

interface NodeExtra {
  name: string;
  raw: unknown;
  color: string;
}
interface LinkExtra {
  key: string;
  color: string;
}
type SNode = SankeyNode<NodeExtra, LinkExtra>;
type SLink = SankeyLink<NodeExtra, LinkExtra>;

type Item = { kind: 'node'; i: number } | { kind: 'link'; i: number };

const LINK_PATH = sankeyLinkHorizontal<NodeExtra, LinkExtra>();

export function Sankey<R extends Row = Row>(props: SankeyProps<R>) {
  const {
    data,
    from,
    to,
    value,
    format,
    nodeWidth = 14,
    nodePadding = 10,
    select = false,
    id,
    selection,
    onSelect,
    height = 220,
    ...frame
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const valueField = value ? fieldOf(schema, value, allRows) : null;
  const fromField = fieldOf(schema, from, allRows);
  const toField = fieldOf(schema, to, allRows);
  const fmt = useMemo(
    () =>
      makeFormatter(format ?? valueField?.format ?? 'integer', {
        currency: valueField?.currency,
        locale,
      }),
    [format, valueField, locale],
  );
  const fmtShort = useMemo(
    () =>
      makeFormatter(format ?? valueField?.format ?? 'integer', {
        currency: valueField?.currency,
        locale,
        short: true,
      }),
    [format, valueField, locale],
  );
  const fmtPct = useMemo(
    () =>
      makeFormatter(
        { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 },
        { locale },
      ),
    [locale],
  );

  // Node identity and color come from every row, so filtering never recolors a node.
  const nodeInfo = useMemo(() => {
    const names = orderedKeys([...allRows.map((r) => r[from]), ...allRows.map((r) => r[to])]);
    const targets = new Set(allRows.map((r) => String(r[to])));
    let root = 0;
    return names.map((raw) => {
      const name = String(raw);
      const isRoot = !targets.has(name);
      return { name, raw, color: isRoot ? seriesColor(root++) : 'var(--q-text)' };
    });
  }, [allRows, from, to]);

  const flows = useMemo(() => {
    const byPair = new Map<string, { from: string; to: string; value: number }>();
    for (const r of rows) {
      if (r[from] == null || r[to] == null) continue;
      const a = String(r[from]);
      const b = String(r[to]);
      const v = value ? Number(r[value]) : 1;
      if (!Number.isFinite(v) || v <= 0) continue;
      const k = `${a}\u0000${b}`;
      const cur = byPair.get(k);
      if (cur) cur.value += v;
      else byPair.set(k, { from: a, to: b, value: v });
    }
    return [...byPair.values()];
  }, [rows, from, to, value]);

  // Own selection on either field.
  const [localSel, setLocalSel] = useState<{ field: string; values: Primitive[] } | null>(null);
  const ownOn = (field: string): Primitive[] => {
    if (!sel) return localSel?.field === field ? localSel.values : [];
    const p = sel.get(field);
    if (!p || p.source !== source) return [];
    return p.op === 'in' ? p.value : p.op === 'eq' ? [p.value] : [];
  };
  const selFrom = new Set(ownOn(from).map((v) => String(v)));
  const selTo = new Set(ownOn(to).map((v) => String(v)));
  const anySel = selFrom.size > 0 || selTo.size > 0;
  const linkOn = (l: SLink) =>
    !anySel ||
    ((selFrom.size === 0 || selFrom.has((l.source as SNode).name)) &&
      (selTo.size === 0 || selTo.has((l.target as SNode).name)));
  const nodeOn = (n: SNode) =>
    !anySel || selFrom.has(n.name) || selTo.has(n.name) || (n.sourceLinks ?? []).some(linkOn);

  const total = sum(flows, (f) => f.value);
  const summary = useMemo(() => {
    if (flows.length === 0) return '';
    const top = [...flows].sort((a, b) => b.value - a.value).slice(0, 3);
    return `Flows from ${fromField.label} to ${toField.label}: total ${fmt(total)} across ${flows.length} paths. Largest: ${top
      .map((f) => `${f.from} → ${f.to} (${fmt(f.value)})`)
      .join(', ')}.`;
  }, [flows, fromField, toField, fmt, total]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: [fromField.label, toField.label, valueField ? valueField.label : 'Count'],
      rows: flows.map((f) => [f.from, f.to, fmt(f.value)]),
      numeric: [2],
    }),
    [flows, fromField, toField, valueField, fmt],
  );

  const [hover, setHover] = useState<Item | null>(null);
  const layoutRef = useRef<{ nodes: SNode[]; links: SLink[] } | null>(null);
  const itemAt = (k: number): Item | null => {
    const l = layoutRef.current;
    if (!l) return null;
    return k < l.nodes.length ? { kind: 'node', i: k } : { kind: 'link', i: k - l.nodes.length };
  };

  const toggleNode = (n: SNode, multiple: boolean) => {
    if (!select) return;
    const field = (n.targetLinks ?? []).length === 0 ? from : to;
    const current = ownOn(field);
    const v = n.raw as Primitive;
    const key = toComparable(v);
    const has = current.some((c) => toComparable(c) === key);
    const next = has
      ? current.filter((c) => toComparable(c) !== key)
      : multiple
        ? [...current, v]
        : [v];
    setLocalSel(next.length ? { field, values: next } : null);
    sel?.toggle(field, v, { source, multiple });
    onSelect?.(next.length ? { field, op: 'in', value: next, source } : null);
  };

  const multi = useRef(false);
  const usedNodes = useMemo(() => {
    const used = new Set(flows.flatMap((f) => [f.from, f.to]));
    return nodeInfo.filter((n) => used.has(n.name));
  }, [flows, nodeInfo]);
  const { active, setActive, keyboardProps } = useChartKeyboard(
    usedNodes.length + flows.length,
    (k) => {
      const it = itemAt(k);
      const l = layoutRef.current;
      if (it?.kind === 'node' && l) toggleNode(l.nodes[it.i], multi.current);
    },
  );
  const onKeyDown = (e: KeyboardEvent) => {
    multi.current = e.shiftKey;
    keyboardProps.onKeyDown(e);
  };
  const focus: Item | null = hover ?? (active != null ? itemAt(active) : null);

  return (
    <ChartFrame
      kind="Sankey diagram"
      status={statusOf(frame, flows.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width }) => {
        let graph: { nodes: SNode[]; links: SLink[] };
        try {
          graph = d3sankey<NodeExtra, LinkExtra>()
            .nodeId((n) => n.name)
            .nodeWidth(nodeWidth)
            .nodePadding(nodePadding)
            .nodeSort(null)
            .extent([
              [0, 1],
              [width, height - 1],
            ])({
            nodes: usedNodes.map((n) => ({ ...n })),
            links: flows.map((f) => ({
              source: f.from,
              target: f.to,
              value: f.value,
              key: `${f.from}→${f.to}`,
              color: nodeInfo.find((n) => n.name === f.from)?.color ?? seriesColor(0),
            })),
          });
        } catch (err) {
          layoutRef.current = null;
          return (
            <ChartState
              status="error"
              error={err instanceof Error ? `Flows can’t be laid out: ${err.message}` : true}
            />
          );
        }
        // Links whose source is not a root inherit the muted series color.
        for (const l of graph.links) {
          const s = l.source as SNode;
          if ((s.targetLinks ?? []).length > 0) l.color = 'var(--q-series-muted)';
        }
        layoutRef.current = graph;
        const { nodes, links } = graph;
        const maxDepth = Math.max(0, ...nodes.map((n) => n.depth ?? 0));
        const focusNode = focus?.kind === 'node' ? nodes[focus.i] : null;
        const focusLink = focus?.kind === 'link' ? links[focus.i] : null;
        const linkLit = (l: SLink) =>
          focusLink
            ? l === focusLink
            : focusNode
              ? l.source === focusNode || l.target === focusNode
              : null;

        let tip: { x: number; top: number; title: string; rows: TooltipRow[] } | null = null;
        if (focusLink) {
          const s = focusLink.source as SNode;
          const t = focusLink.target as SNode;
          const v = focusLink.value;
          tip = {
            x: ((s.x1 ?? 0) + (t.x0 ?? 0)) / 2,
            top: clamp(((focusLink.y0 ?? 0) + (focusLink.y1 ?? 0)) / 2 - 30, 0, height - 90),
            title: `${s.name} → ${t.name}`,
            rows: [
              { label: valueField ? valueField.label : 'Count', value: fmt(v) },
              { label: `Share of ${s.name}`, value: fmtPct(v / (s.value || 1)), tone: 'muted' },
              { label: `Share of ${t.name}`, value: fmtPct(v / (t.value || 1)), tone: 'muted' },
            ],
          };
        } else if (focusNode) {
          const n = focusNode;
          const out = (n.sourceLinks ?? []).length ? (n.sourceLinks ?? []) : (n.targetLinks ?? []);
          const outgoing = (n.sourceLinks ?? []).length > 0;
          tip = {
            x: (n.depth ?? 0) === maxDepth ? (n.x0 ?? 0) : (n.x1 ?? 0),
            top: clamp((n.y0 ?? 0) - 6, 0, height - 60 - out.length * 18),
            title: n.name,
            rows: [
              { label: 'Total', value: fmt(n.value ?? 0) },
              ...out
                .slice()
                .sort((a, b) => b.value - a.value)
                .map((l) => {
                  const other = (outgoing ? l.target : l.source) as SNode;
                  return {
                    label: outgoing ? `→ ${other.name}` : `← ${other.name}`,
                    value: fmt(l.value),
                    color: outgoing ? l.color : (other as SNode).color,
                    tone: 'muted' as const,
                  };
                }),
            ],
          };
        }

        return (
          <div
            className="q-sankey-plot"
            style={{ height }}
            role="application"
            aria-label={`${frame['aria-label'] ?? 'Sankey diagram'}. Use arrow keys to move between nodes and flows${select ? ', Enter to select a node' : ''}.`}
            {...keyboardProps}
            onKeyDown={onKeyDown}
            onFocus={() => setActive((a) => a ?? 0)}
            onPointerLeave={() => setHover(null)}
          >
            <svg width={width} height={height} aria-hidden="true">
              <g fill="none">
                {links.map((l, i) => {
                  const lit = linkLit(l);
                  const on = linkOn(l);
                  return (
                    <path
                      key={l.key}
                      className="q-sankey-link"
                      d={LINK_PATH(l) ?? ''}
                      style={{ stroke: l.color }}
                      strokeWidth={Math.max(1, l.width ?? 1)}
                      data-state={lit === true ? 'lit' : lit === false || !on ? 'dim' : undefined}
                      onPointerEnter={() => setHover({ kind: 'link', i })}
                      onClick={() => {
                        const s = l.source as SNode;
                        if (select) toggleNode(s, false);
                      }}
                    />
                  );
                })}
              </g>
              {nodes.map((n, i) => (
                <rect
                  key={n.name}
                  className="q-sankey-node"
                  x={n.x0}
                  y={n.y0}
                  width={Math.max(1, (n.x1 ?? 0) - (n.x0 ?? 0))}
                  height={Math.max(1, (n.y1 ?? 0) - (n.y0 ?? 0))}
                  style={{ fill: n.color, cursor: select ? 'pointer' : undefined }}
                  data-state={!nodeOn(n) ? 'dim' : undefined}
                  onPointerEnter={() => setHover({ kind: 'node', i })}
                  onClick={(e) => toggleNode(n, e.shiftKey || e.metaKey)}
                />
              ))}
              <g className="q-sankey-labels">
                {nodes.map((n) => {
                  const h = (n.y1 ?? 0) - (n.y0 ?? 0);
                  if (h < 6) return null;
                  const right = (n.depth ?? 0) === maxDepth && maxDepth > 0;
                  return (
                    <text
                      key={n.name}
                      x={right ? (n.x0 ?? 0) - 6 : (n.x1 ?? 0) + 6}
                      y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2}
                      dy="0.34em"
                      textAnchor={right ? 'end' : 'start'}
                      data-state={!nodeOn(n) ? 'dim' : undefined}
                    >
                      {n.name} <tspan className="q-sankey-value">{fmtShort(n.value ?? 0)}</tspan>
                    </text>
                  );
                })}
              </g>
              {focusNode && (
                <rect
                  className="q-dist-cell-active"
                  x={(focusNode.x0 ?? 0) - 2}
                  y={(focusNode.y0 ?? 0) - 2}
                  width={(focusNode.x1 ?? 0) - (focusNode.x0 ?? 0) + 4}
                  height={(focusNode.y1 ?? 0) - (focusNode.y0 ?? 0) + 4}
                  rx={2}
                />
              )}
            </svg>
            {tip && (
              <ChartTooltip
                x={tip.x}
                width={width}
                top={tip.top}
                title={tip.title}
                rows={tip.rows}
              />
            )}
            <div className="q-visually-hidden" aria-live="polite">
              {active != null && tip
                ? `${tip.title}: ${tip.rows.map((r) => `${r.label} ${r.value}`).join(', ')}`
                : ''}
            </div>
          </div>
        );
      }}
    </ChartFrame>
  );
}
