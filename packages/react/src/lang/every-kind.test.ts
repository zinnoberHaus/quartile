// Every kind the language documents must compile from a short block and render on the server.
import { describe, expect, it } from 'vitest';
import { renderBlockToHTML } from '../server';
import { compileBlock } from './compile';
import { KINDS } from './kinds';

const sales = `---
month,region,channel,revenue,orders
2026-07,EMEA,Online,182000,1210
2026-07,EMEA,Retail,96000,640
2026-07,APAC,Online,121000,905
2026-08,EMEA,Online,196000,1302
2026-08,APAC,Online,133000,960
2026-08,APAC,Retail,71000,520
2026-09,EMEA,Online,174000,1150
2026-09,APAC,Retail,64000,470
`;
const days = `---
date,commits
2026-09-01,3
2026-09-02,7
2026-09-03,0
2026-09-04,5
`;

/** One short, idiomatic block per kind. */
const SAMPLES: Record<string, string> = {
  line: `line sum(revenue) by month and region\n${sales}`,
  area: `area sum(revenue) by month\n${sales}`,
  bar: `bar sum(revenue) by region and channel\n${sales}`,
  barlist: `barlist sum(revenue) by region\n${sales}`,
  donut: `donut sum(orders) by channel\n${sales}`,
  funnel: 'funnel users by step\n---\nstep,users\nVisited,1000\nSigned up,240\nPaid,61\n',
  sparkline: `sparkline sum(revenue) by month\n${sales}`,
  histogram: `histogram orders\n${sales}`,
  scatter: `scatter revenue vs orders\n${sales}`,
  heatmap: `heatmap sum(revenue) by month and region\n${sales}`,
  calendar: `calendar commits by date\n${days}`,
  sankey:
    'sankey users by source and target\n---\nsource,target,users\nAds,Signup,120\nSearch,Signup,300\nSignup,Paid,90\n',
  box: `box revenue by region\n${sales}`,
  kpi: `kpi sum(revenue) as "Revenue"\n${sales}`,
  table: `table region, sum(revenue), count by region\n${sales}`,
  explorer: `explorer region, channel, revenue\nsort: -revenue\n${sales}`,
  filters: `filters region, channel\n${sales}`,
  data: `data sales\n${sales}`,
  dashboard: `dashboard Sales\nfilters region\nkpi sum(revenue) as "Revenue"\nline sum(revenue) by month\nbarlist sum(revenue) by channel\ntable region, channel, revenue\n${sales}`,
};

describe('every documented kind', () => {
  it('has a sample here', () => {
    // KINDS lists the view kinds; `data` and `dashboard` are the two block-level kinds.
    expect(Object.keys(SAMPLES).sort()).toEqual(
      [...Object.keys(KINDS), 'dashboard', 'data'].sort(),
    );
  });

  for (const [kind, source] of Object.entries(SAMPLES)) {
    it(`${kind} compiles without errors and renders static HTML`, () => {
      const compiled = compileBlock(source);
      expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const html = renderBlockToHTML(source, { timeZone: 'UTC' });
      expect(html).not.toMatch(/q-block-error/);
      // Charts draw SVG; KPIs, lists, tables, filters and data summaries are HTML.
      expect(html.length).toBeGreaterThan(200);
      if (compiled.type !== 'data') expect(compiled.spec).toBeDefined();
    });
  }
});
