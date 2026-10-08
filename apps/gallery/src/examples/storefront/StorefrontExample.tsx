'use client';
// Kestrel Goods · Storefront analytics: a whole app built from @quartile/react components.
// Self-contained: imports only react, @quartile/react and the data modules.
import {
  applyPredicates,
  type CommandGroup,
  CommandMenu,
  createToastStore,
  cx,
  FilterBar,
  type FilterOption,
  IconButton,
  IconChevronRight,
  IconMore,
  KPIGroup,
  type KPIProps,
  QuartileProvider,
  Selection,
  type ThemeSetting,
  Toaster,
  useElementSize,
  useHotkey,
  useSelection,
  useSelectionStore,
} from '@quartile/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFacts,
  CATEGORIES,
  CHANNELS,
  clampRange,
  type DateRange,
  dayKey,
  PERIODS,
  PRODUCT_INFO,
  periodOfRange,
  REGIONS,
  rangeForPeriod,
  windowOf,
} from '../../data/storefront';
import { SfHeader, SfSidebar, SOURCE_URL } from './chrome';
import {
  CHART_STYLES,
  type ChartStyle,
  copyText,
  download,
  type Fact,
  FIELD_OWNER,
  factsDataset,
  fmt,
  readUrlState,
  SOURCE,
  summaryJSON,
  sumOf,
  toCSV,
  writeUrlState,
} from './model';
import {
  ChannelCard,
  FunnelCard,
  fmtDay,
  HoursCard,
  ProductsCard,
  RegionCard,
  type ToggleColumn,
  TrendCard,
} from './panels';
import './storefront.css';

export interface StorefrontExampleProps {
  /**
   * Fits a fixed-height frame (e.g. a landing-page hero): fills its parent's height, scrolls
   * inside, never reads or writes the page URL and does not bind ⌘K globally.
   */
  embedded?: boolean;
  /** Initial theme. The sidebar toggle overrides it. */
  theme?: ThemeSetting;
}

export function StorefrontExample({ embedded = false, theme = 'system' }: StorefrontExampleProps) {
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(theme);
  useEffect(() => setThemeSetting(theme), [theme]);
  return (
    <QuartileProvider theme={themeSetting} className={cx('sf-app', embedded && 'sf-embedded')}>
      <Selection>
        <Dashboard embedded={embedded} onTheme={setThemeSetting} />
      </Selection>
    </QuartileProvider>
  );
}

const STOCK_ALERTS = [...PRODUCT_INFO.values()].filter((p) => p.status !== 'In stock');

const summary = (rows: Fact[]) =>
  `${fmt.int(sumOf(rows, 'orders'))} orders · ${fmt.money(sumOf(rows, 'revenue'))}`;

function Dashboard({
  embedded,
  onTheme,
}: {
  embedded: boolean;
  onTheme: (t: ThemeSetting) => void;
}) {
  const store = useSelectionStore();
  const sel = useSelection();
  const [range, setRangeState] = useState<DateRange>(() => rangeForPeriod('30D'));
  const [compare, setCompare] = useState(true);
  const [chart, setChart] = useState<ChartStyle>('Area');
  const [hidden, setHidden] = useState<ReadonlySet<ToggleColumn>>(() => new Set());
  const [drawer, setDrawer] = useState(false);
  const [command, setCommand] = useState(false);
  const toasts = useMemo(() => createToastStore(), []);
  const layoutRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(layoutRef);
  const narrow = width > 0 && width < 900;
  const compact = width > 0 && width < 560;
  useEffect(() => {
    if (!narrow) setDrawer(false);
  }, [narrow]);

  const win = useMemo(() => windowOf(range), [range]);
  const period = periodOfRange(win);
  const facts = useMemo(() => factsDataset(buildFacts(win)), [win]);

  const setRange = useCallback(
    (r: DateRange) => {
      setRangeState(clampRange(r));
      store?.clear('date');
    },
    [store],
  );

  // Chips, the URL and clicks all publish a field under the view that owns it, so the region
  // list dims instead of collapsing when Region is picked from the filter bar.
  useEffect(
    () =>
      store?.onEvent((e) => {
        if (e.type !== 'set' || !e.field || !e.predicate) return;
        const owner = FIELD_OWNER[e.field];
        if (owner && e.source !== owner) {
          const { op, value, label } = e.predicate;
          store.set(e.field, value as never, { op, source: owner, label });
        }
      }),
    [store],
  );

  // URL state, standalone only: read once after mount, then mirror every change.
  const urlReady = useRef(false);
  useEffect(() => {
    if (embedded || !store) return;
    const s = readUrlState(window.location.search);
    if (s.range) setRangeState(clampRange(s.range));
    if (s.compare === false) setCompare(false);
    if (s.chart) setChart(s.chart);
    for (const f of s.filters)
      store.set(f.field, f.values, { op: 'in', source: FIELD_OWNER[f.field] ?? SOURCE.url });
    urlReady.current = true;
  }, [embedded, store]);
  useEffect(() => {
    if (embedded || !urlReady.current) return;
    const next = writeUrlState(period, win, compare, chart, sel.predicates);
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
      window.history.replaceState(window.history.state, '', next);
  }, [embedded, period, win, compare, chart, sel.predicates]);

  // Drawer: Escape closes it; it closes when the layout grows past the breakpoint.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  useHotkey('mod+k', () => setCommand((o) => !o), { enabled: !embedded });

  // Standalone page: name the tab after the example, restore the gallery's title on leave.
  useEffect(() => {
    if (embedded) return;
    const before = document.title;
    document.title = 'Storefront analytics · Quartile example';
    return () => {
      document.title = before;
    };
  }, [embedded]);

  const toast = toasts.show;
  const placeholder = (page: string) => {
    setDrawer(false);
    toast({
      id: 'sf-placeholder',
      title: `${page} is not part of this example`,
      description: 'Only the Overview page is built. The other sidebar items are placeholders.',
    });
  };
  const alerts = () => {
    setDrawer(false);
    toast({
      id: 'sf-alerts',
      tone: 'warning',
      title: `${STOCK_ALERTS.length} stock alerts`,
      description: STOCK_ALERTS.map((p) => `${p.name} · ${p.status.toLowerCase()}`).join(' · '),
    });
  };
  const share = () => {
    const url = window.location.href;
    toast({
      id: 'sf-share',
      title: 'Link to this view',
      description: <span className="sf-toast-url">{url}</span>,
      duration: 10000,
      action: {
        label: 'Copy link',
        onClick: () =>
          copyText(url).then(
            () => toast({ id: 'sf-share', tone: 'success', title: 'Link copied' }),
            () => toast({ id: 'sf-share', tone: 'error', title: 'Could not copy the link' }),
          ),
      },
    });
  };
  const fileStem = `kestrel-storefront-${dayKey(win.start)}-to-${dayKey(win.end)}`;
  const downloadCSV = () => {
    const rows = sel.filter(facts.rows);
    download(`${fileStem}.csv`, toCSV(rows));
    toast({
      id: 'sf-export',
      tone: 'success',
      title: `Downloaded ${fmt.int(rows.length)} rows`,
      description: `${fileStem}.csv · the filtered rows behind this view`,
    });
  };
  const copyJSON = () => {
    const json = summaryJSON(sel.filter(facts.rows), win, sel.predicates);
    copyText(json).then(
      () =>
        toast({
          id: 'sf-export',
          tone: 'success',
          title: 'Copied JSON summary',
          description: `${fmt.int(json.length)} characters: totals, regions, channels, products`,
        }),
      () => toast({ id: 'sf-export', tone: 'error', title: 'Could not copy to the clipboard' }),
    );
  };

  // Filter bar: options carry the revenue each value would show under the other filters.
  const filterFields = useMemo(() => {
    const options = (
      field: 'region' | 'channel' | 'product' | 'category',
      values: readonly string[],
    ) => {
      const others = applyPredicates(
        facts.rows,
        sel.predicates.filter((p) => p.field !== field),
      );
      const rev = new Map<string, number>();
      for (const r of others) rev.set(r[field], (rev.get(r[field]) ?? 0) + r.revenue);
      return values.map<FilterOption>((v) => ({ value: v, meta: fmt.money(rev.get(v) ?? 0) }));
    };
    return [
      { field: 'region', label: 'Region', options: options('region', REGIONS) },
      { field: 'channel', label: 'Channel', options: options('channel', CHANNELS) },
      {
        field: 'product',
        label: 'Product',
        pinned: false,
        options: options('product', [...PRODUCT_INFO.keys()]),
      },
      {
        field: 'category',
        label: 'Category',
        pinned: false,
        options: options('category', CATEGORIES),
      },
    ];
  }, [facts, sel.predicates]);

  const filtersText = useMemo(() => {
    const pick = (field: string) => {
      const p = sel.predicates.find((q) => q.field === field);
      if (!p || p.op === 'between') return null;
      const v = p.op === 'in' ? p.value : [p.value];
      return v.length === 1
        ? String(v[0])
        : `${v.length} ${field === 'region' ? 'regions' : 'channels'}`;
    };
    return `${pick('region') ?? 'All regions'} · ${pick('channel') ?? 'All channels'}`;
  }, [sel.predicates]);

  // A brushed date range compares each selected day with its counterpart in the previous period.
  const brushed = sel.predicates.some((p) => p.field === 'date');
  const comparison = compare
    ? brushed
      ? 'vs. same days, previous period'
      : period === '12M'
        ? 'vs. previous 52 weeks'
        : `vs. previous ${win.days} days`
    : `${fmtDay(win.start)} – ${fmtDay(win.end, true)}`;
  const kpis = useMemo<KPIProps<Fact>[]>(() => {
    const ratio = (num: keyof Fact, den: keyof Fact) => (rows: Fact[]) => {
      const d = sumOf(rows, den);
      return d ? sumOf(rows, num) / d : Number.NaN;
    };
    return [
      {
        label: 'Net revenue',
        value: 'revenue',
        format: 'currency',
        unit: 'USD',
        compareValue: compare ? 'revenue_prev' : undefined,
        trendBy: 'date',
        comparison,
      },
      {
        label: 'Orders',
        value: 'orders',
        format: 'integer',
        unit: 'COUNT',
        compareValue: compare ? 'orders_prev' : undefined,
        trendBy: 'date',
        comparison,
      },
      {
        label: 'Avg. order value',
        aggregate: ratio('revenue', 'orders'),
        format: 'currency',
        unit: 'USD',
        compareValue: compare ? ratio('revenue_prev', 'orders_prev') : undefined,
        trendBy: 'date',
        comparison,
      },
      {
        label: 'Conversion rate',
        aggregate: ratio('orders', 'sessions'),
        format: 'percent',
        unit: 'RATE',
        compareValue: compare ? ratio('orders_prev', 'sessions_prev') : undefined,
        trendBy: 'date',
        comparison,
      },
    ];
  }, [compare, comparison]);

  const commands = useMemo<CommandGroup[]>(
    () => [
      {
        label: 'Period',
        items: PERIODS.map((p) => ({
          label: `Show ${p === '12M' ? 'last 52 weeks' : `last ${p.slice(0, -1)} days`}`,
          keywords: [p, 'period', 'range'],
          onSelect: () => setRange(rangeForPeriod(p)),
        })),
      },
      {
        label: 'Filter',
        items: [
          ...REGIONS.map((r) => ({
            label: `Region: ${r}`,
            keywords: ['filter'],
            onSelect: () => store?.set('region', [r], { op: 'in', source: SOURCE.region }),
          })),
          ...CHANNELS.map((c) => ({
            label: `Channel: ${c}`,
            keywords: ['filter'],
            onSelect: () => store?.set('channel', [c], { op: 'in', source: SOURCE.channel }),
          })),
          { label: 'Clear all filters', keywords: ['reset'], onSelect: () => store?.clear() },
        ],
      },
      {
        label: 'View',
        items: [
          ...CHART_STYLES.map((c) => ({
            label: `Chart style: ${c}`,
            keywords: ['chart', 'net revenue'],
            onSelect: () => {
              store?.clear('date');
              setChart(c);
            },
          })),
          {
            label: compare ? 'Turn comparison off' : 'Compare with previous period',
            keywords: ['compare', 'previous'],
            onSelect: () => setCompare((c) => !c),
          },
          { label: 'Light theme', keywords: ['theme'], onSelect: () => onTheme('light') },
          { label: 'Dark theme', keywords: ['theme'], onSelect: () => onTheme('dark') },
        ],
      },
      {
        label: 'Actions',
        items: [
          { label: 'Download CSV', keywords: ['export'], onSelect: downloadCSV },
          { label: 'Copy as JSON', keywords: ['export'], onSelect: copyJSON },
          { label: 'Copy link to this view', keywords: ['share'], onSelect: share },
          {
            label: 'View this example’s source',
            keywords: ['github', 'code'],
            onSelect: () => window.open(SOURCE_URL, '_blank', 'noopener,noreferrer'),
          },
        ],
      },
    ],
    // The action closures read the latest state when they run.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
    [store, compare, setRange, onTheme, downloadCSV, copyJSON, share],
  );

  return (
    <div
      ref={layoutRef}
      className="sf-layout"
      data-narrow={narrow || undefined}
      data-compact={compact || undefined}
    >
      <SfSidebar
        open={drawer}
        onSearch={() => {
          setDrawer(false);
          setCommand(true);
        }}
        onPlaceholder={placeholder}
        onAlerts={alerts}
        alertCount={STOCK_ALERTS.length}
        onTheme={onTheme}
        rowsInView={facts.rows.length}
        grain={win.grain}
      />
      {drawer && (
        <button
          type="button"
          className="sf-scrim"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <div className="sf-scroll">
        <div className="sf-topbar">
          <IconButton
            label="Open navigation"
            variant="ghost"
            icon={<IconMore />}
            onClick={() => setDrawer(true)}
          />
          <span className="sf-topbar-logo" aria-hidden="true">
            K
          </span>
          <span className="sf-topbar-title">
            Kestrel Goods <IconChevronRight size={12} aria-hidden="true" /> Overview
          </span>
        </div>
        <main className="sf-main">
          <SfHeader
            period={period}
            range={win}
            onRange={setRange}
            compare={compare}
            onCompare={setCompare}
            onShare={share}
            onDownload={downloadCSV}
            onCopyJSON={copyJSON}
          />
          <FilterBar id={SOURCE.filters} data={facts} fields={filterFields} summary={summary} />
          <KPIGroup data={facts} items={kpis} className="sf-kpis" />
          <div className="sf-row sf-row-trend">
            <TrendCard
              facts={facts}
              win={win}
              chart={chart}
              onChart={setChart}
              compare={compare}
              filtersText={filtersText}
            />
            <RegionCard facts={facts} compare={compare} />
          </div>
          <div className="sf-row sf-row-mix">
            <ChannelCard facts={facts} />
            <HoursCard facts={facts} />
            <FunnelCard facts={facts} />
          </div>
          <ProductsCard
            facts={facts}
            compare={compare}
            hidden={hidden}
            onToggleColumn={(c) =>
              setHidden((h) => {
                const n = new Set(h);
                if (n.has(c)) n.delete(c);
                else n.add(c);
                return n;
              })
            }
          />
          <footer className="sf-footer">
            <span>Built with Quartile · @quartile/react 0.1 preview</span>
            <span>
              Sample data, {fmtDay(win.start)} – {fmtDay(win.end, true)}
            </span>
          </footer>
        </main>
      </div>
      <CommandMenu
        open={command}
        onOpenChange={setCommand}
        groups={commands}
        placeholder="Search actions, periods and filters…"
        title="Command menu"
      />
      <Toaster store={toasts} />
    </div>
  );
}
