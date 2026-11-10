import {
  Button,
  type CompiledBlock,
  createSourceLoader,
  type Diagnostic,
  predicateValueLabel,
  QuartileBlock,
  QuartileDocument,
  QuartilePre,
  QuartileProvider,
  quartileRenderer,
  type SelectionChange,
} from '@quartile/react';
import { KINDS, quartilePrompt } from '@quartile/react/lang';
import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Streamdown } from 'streamdown';
import { Link } from '../../router';
import { ExamplesBrand } from '../../shell/Brand';
import { links } from '../../shell/links';
import { ANSWER_MARKDOWN, ANSWER_QUESTION, LANGUAGE_EXAMPLES, REPORT_MARKDOWN } from './content';
import '../workbench/workbench.css';
import './markdown.css';

type Page = 'playground' | 'ai-answer' | 'markdown-report';

function Header({ page }: { page: Page }) {
  const current = (p: Page) => (page === p ? 'page' : undefined);
  return (
    <header className="w-header">
      <ExamplesBrand />
      <nav aria-label="Markdown and AI">
        <Link to="/examples/playground" aria-current={current('playground')}>
          Playground
        </Link>
        <Link to="/examples/ai-answer" aria-current={current('ai-answer')}>
          AI answer
        </Link>
        <Link to="/examples/markdown-report" aria-current={current('markdown-report')}>
          Markdown report
        </Link>
        <Link to="/examples/ai-dashboard">JSON dashboard</Link>
        <Link to="/examples/studio">App Studio</Link>
      </nav>
      <a href={links.github}>GitHub</a>
    </header>
  );
}

function useTheme() {
  const [dark, setDark] = useState(false);
  return {
    theme: dark ? ('dark' as const) : ('light' as const),
    toggle: (
      <Button aria-pressed={dark} onClick={() => setDark((d) => !d)}>
        Dark theme
      </Button>
    ),
  };
}

const f = '```';

/* ------------------------------------------------------------------------------------------ */
/* /examples/playground                                                                       */
/* ------------------------------------------------------------------------------------------ */

const KIND_DOCS: [string, string, string][] = [
  ['line', 'line revenue, cost by month', 'Trends over a date or ordered category'],
  [
    'area',
    'area sessions by day and channel',
    'Filled trends; `stacked: yes` for parts of a total',
  ],
  ['bar', 'bar sum(revenue) by region', 'Comparison across categories; `hbar` is horizontal'],
  ['barlist', 'barlist sum(revenue) by product', 'A ranked list with inline bars'],
  ['donut', 'donut share by browser', 'Parts of a whole; `pie` is an alias'],
  ['scatter', 'scatter price vs rating', 'Two measures per row (y vs x)'],
  ['histogram', 'histogram latency_ms', 'The distribution of one measure'],
  ['box', 'box latency_ms by service', 'Distributions compared per category'],
  ['heatmap', 'heatmap count by weekday and hour', 'A value across two categories'],
  ['calendar', 'calendar commits by date', 'One cell per day'],
  ['funnel', 'funnel users by step', 'Conversion through ordered steps'],
  ['sankey', 'sankey users by source and target', 'Flows between stages'],
  ['sparkline', 'sparkline price by day', 'A small trend without axes'],
  ['kpi', 'kpi sum(revenue) as "Revenue" vs last_year', 'A headline number with its change'],
  ['table', 'table sum(revenue), count by region', 'Exact rows, or grouped totals'],
  [
    'explorer',
    'explorer product, region, amount',
    'A table to work in: search, filters, sorting and CSV export',
  ],
  ['filters', 'filters region, channel', 'Chips that filter linked views'],
];

/** Settings beyond the basics, as a block writes them. Each example compiles without a warning. */
const SETTING_DOCS: { group: string; rows: [keys: string, example: string, meaning: string][] }[] =
  [
    {
      group: 'Presentation',
      rows: [
        [
          'margin',
          'margin: 16 24 32 48',
          'Space around the plot in px, in CSS order; margin.left: 72 sets one side.',
        ],
        [
          'colors',
          'colors: signal, #f26b3a',
          'Series colors in order: a palette name (signal, positive, negative, warning, muted), 1 to 8, or a hex color. A page can keep its own palette instead.',
        ],
        [
          'y.min, y.max',
          'y.min: 2%',
          'Bounds of the y axis. Bars and stacked areas keep their zero baseline.',
        ],
        ['x.ticks, y.ticks', 'y.ticks: 4', 'Approximate number of ticks on an axis.'],
        ['grid', 'grid: none', 'Gridlines: y, x, both or none.'],
        ['x.hide, y.hide', 'y.hide: yes', 'Hides the labels of an axis.'],
        ['legend', 'legend: bottom', 'Where the legend sits: top, bottom, left, right or none.'],
        ['labels', 'labels: yes', 'Series names and last values at the line ends; values on bars.'],
        [
          'reference, reference.label',
          'reference: 4%',
          'A labelled rule at a value. It is also read out in the chart’s summary.',
        ],
        ['y.scale', 'y.scale: log', 'A logarithmic y axis, for values above zero.'],
        ['stroke width', 'stroke width: 3', 'Line width in px.'],
        [
          'radius, padding',
          'radius: 6',
          'Corner radius of bars in px; padding is the gap between bars, from 0 to 0.9.',
        ],
        [
          'annotations',
          'annotations: [{"x": "2026-03-01", "label": "Launch"}]',
          'Labelled vertical markers on line and area charts.',
        ],
      ],
    },
    {
      group: 'Data',
      rows: [
        ['data', 'data: sales', 'Reads a dataset that a data block or the page defines by name.'],
        [
          'src',
          'src: sales.csv',
          'A URL for the page to load. Nothing is fetched unless the page allows that origin.',
        ],
        [
          'path',
          'path: data.results',
          'Where the rows are inside a JSON response, inline or loaded; $.data.results reads the same.',
        ],
        [
          'refresh',
          'refresh: 5m',
          'Reloads a src URL at an interval. The page sets the shortest one it accepts.',
        ],
      ],
    },
    {
      group: 'Provenance and interaction',
      rows: [
        [
          'source, source.url, asof',
          'source: Finance export',
          'A line under the chart: where the data came from, an optional http(s) link and its date.',
        ],
        [
          'actions',
          'actions: rows, download',
          'Buttons on a view: table, rows (the rows behind it) and download (those rows as CSV). On a dashboard, one toolbar for all its views.',
        ],
        [
          'select, link',
          'select: true',
          'Views over one named dataset select and filter each other without it; a chart with its own rows needs select: true. select: no and link: no opt a view out.',
        ],
      ],
    },
  ];

/** Loads `src:` URLs for the playground: this page's own origin and nothing else. */
const loadSameOrigin = createSourceLoader({ origins: ['same-origin'] });

function Notes({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (!diagnostics.length) {
    return <p className="md-notes-empty">No notes: every field and setting was read as written.</p>;
  }
  return (
    <ul className="md-notes">
      {diagnostics.map((d, i) => (
        <li key={i} data-severity={d.severity}>
          <span className="md-notes-kind">{d.severity}</span>
          {d.line ? <span className="md-notes-line">line {d.line}</span> : null}
          <span>
            {d.message}
            {d.hint ? <span className="md-notes-hint"> {d.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Replays `text` into state at a typical streaming pace. */
function useReplay(text: string) {
  const [shown, setShown] = useState(text);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  };
  const start = (speed = 1) => {
    stop();
    let i = 0;
    setShown('');
    setRunning(true);
    timer.current = setInterval(() => {
      // Chunks of a few characters, like tokens.
      i = Math.min(text.length, i + Math.round((3 + Math.random() * 6) * speed));
      setShown(text.slice(0, i));
      if (i >= text.length) stop();
    }, 28);
  };
  useEffect(() => {
    setShown(text);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [text]);
  return { shown, running, start, stop };
}

export function LanguagePage() {
  const { theme, toggle } = useTheme();
  const [exampleId, setExampleId] = useState(LANGUAGE_EXAMPLES[0].id);
  const example = LANGUAGE_EXAMPLES.find((e) => e.id === exampleId) ?? LANGUAGE_EXAMPLES[0];
  const [source, setSource] = useState(example.source);
  const replay = useReplay(source);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const choose = (id: string) => {
    const next = LANGUAGE_EXAMPLES.find((e) => e.id === id)!;
    setExampleId(id);
    setSource(next.source);
  };
  const kinds = Object.keys(KINDS).length;
  return (
    <QuartileProvider theme={theme} className="w-page md-page">
      <Header page="playground" />
      <main className="w-main">
        <div className="w-intro">
          <div>
            <span className="w-preview">Quartile preview · fictional sample data</span>
            <h1>Charts and dashboards in Markdown</h1>
            <p>
              Write a <code>{`${f}quartile`}</code> block: a sentence such as{' '}
              <code>bar sum(revenue) by region</code>, optional <code>key: value</code> lines, then
              CSV rows. Pages render it as an interactive, accessible chart in their own colors and
              fonts. Anywhere else it stays readable text, so the data is never lost.
            </p>
          </div>
          <a href={`${links.github}/blob/main/docs/language.md`}>Language reference</a>
        </div>

        <section className="md-section" aria-labelledby="try">
          <h2 id="try">Try it</h2>
          <div className="w-toolbar" role="group" aria-label="Examples">
            {LANGUAGE_EXAMPLES.map((e) => (
              <Button key={e.id} aria-pressed={e.id === exampleId} onClick={() => choose(e.id)}>
                {e.label}
              </Button>
            ))}
          </div>
          <div className="md-playground">
            <label className="md-editor">
              <span>
                Block text <span className="md-muted">{example.note}</span>
              </span>
              <textarea
                value={replay.running ? replay.shown : source}
                spellCheck={false}
                onChange={(e) => {
                  replay.stop();
                  setSource(e.target.value);
                }}
                aria-describedby="md-notes"
              />
            </label>
            <div className="md-preview">
              <div className="md-preview-bar">
                <Button onClick={() => replay.start(1)} disabled={replay.running}>
                  {replay.running ? 'Streaming…' : 'Replay as a stream'}
                </Button>
                {toggle}
              </div>
              {/* The document gives the block a loader for `src:`; without one nothing is fetched. */}
              <QuartileDocument provider={false} loadSource={loadSameOrigin}>
                <QuartileBlock
                  source={replay.running ? replay.shown : source}
                  streaming={replay.running}
                  onDiagnostics={(d: Diagnostic[], _c: CompiledBlock) => setDiagnostics(d)}
                />
              </QuartileDocument>
              <div id="md-notes">
                <h3 className="md-h3">Compiler notes</h3>
                <Notes diagnostics={diagnostics} />
              </div>
            </div>
          </div>
        </section>

        <section className="md-section" aria-labelledby="shape">
          <h2 id="shape">The shape of a block</h2>
          <div className="md-columns">
            <pre className="md-code">{`${f}quartile
line sum(mrr) by month and plan   ← kind, measures, "by" fields
title: MRR by plan                ← settings
format: currency USD
---                               ← rows follow
month,plan,mrr
2026-01,Team,176000
2026-01,Starter,98000
${f}`}</pre>
            <ul className="md-list">
              <li>
                <strong>First line.</strong> A kind, the measures, then <code>by</code> the x axis
                or category and an optional series split: <code>by month and plan</code>.
              </li>
              <li>
                <strong>Measures.</strong> <code>sum(x)</code>, <code>mean(x)</code>,{' '}
                <code>count</code>, or a plain column. Rows sharing a position are summed; rates are
                averaged, not added.
              </li>
              <li>
                <strong>Settings.</strong> Any component setting as <code>key: value</code>, plus
                shorthands: <code>format: currency EUR</code>, <code>stacked: yes</code>,{' '}
                <code>x.label: Month</code>, <code>revenue.description: …</code>.
              </li>
              <li>
                <strong>Data.</strong> CSV, TSV, a Markdown table or JSON after <code>---</code>.
                Values such as <code>$1,200</code>, <code>12%</code>, <code>1.2M</code>,{' '}
                <code>2026-03</code> and <code>2026-Q1</code> keep their meaning.
              </li>
              <li>
                <strong>Dashboards.</strong> Several kinds in one block share the rows and filter
                each other. A <code>data sales</code> block defines rows once for a whole page.
              </li>
            </ul>
          </div>
        </section>

        <section className="md-section" aria-labelledby="kinds">
          <h2 id="kinds">{kinds} kinds</h2>
          <div className="md-table-wrap">
            <table className="md-table">
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Example first line</th>
                  <th scope="col">Use for</th>
                </tr>
              </thead>
              <tbody>
                {KIND_DOCS.map(([kind, example, use]) => (
                  <tr key={kind}>
                    <th scope="row">
                      <code>{kind}</code>
                    </th>
                    <td>
                      <code>{example}</code>
                    </td>
                    <td>{use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="md-section" aria-labelledby="settings">
          <h2 id="settings">Settings beyond the basics</h2>
          <div className="md-table-wrap">
            <table className="md-table md-settings">
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">Example line</th>
                  <th scope="col">What it does</th>
                </tr>
              </thead>
              {SETTING_DOCS.map(({ group, rows }) => (
                <tbody key={group}>
                  <tr>
                    <th scope="colgroup" colSpan={3} className="md-settings-group">
                      {group}
                    </th>
                  </tr>
                  {rows.map(([keys, example, meaning]) => (
                    <tr key={keys}>
                      <th scope="row">
                        <code>{keys}</code>
                      </th>
                      <td>
                        <code>{example}</code>
                      </td>
                      <td>{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="md-muted">
            The presets above put several of these to work. An unknown setting is ignored with a
            warning that suggests the closest one; it appears under Compiler notes. In a project
            with Quartile installed, <code>npx --no-install quartile check report.md</code> reports
            the same errors and warnings for every block of a Markdown file.
          </p>
        </section>

        <section className="md-section" aria-labelledby="anywhere">
          <h2 id="anywhere">Render it anywhere</h2>
          <div className="md-cards">
            <article>
              <h3>React and Next.js</h3>
              <pre className="md-code">{`<QuartileDocument markdown={md}>
  <Markdown components={{ pre: QuartilePre }}>
    {md}
  </Markdown>
</QuartileDocument>`}</pre>
            </article>
            <article>
              <h3>Streamed AI answers</h3>
              <pre className="md-code">{`<Streamdown
  isAnimating={streaming}
  plugins={{ renderers: [quartileRenderer()] }}
>
  {answer}
</Streamdown>`}</pre>
            </article>
            <article>
              <h3>Any HTML page or docs site</h3>
              <pre className="md-code">{`<script src="quartile.global.js"
  data-theme="auto"
  data-sources="same-origin"></script>`}</pre>
            </article>
            <article>
              <h3>Static builds and SEO</h3>
              <pre className="md-code">{`unified()
  .use(remarkParse)
  .use(remarkQuartile)   // SVG + table HTML
  .use(remarkRehype, { allowDangerousHtml: true })`}</pre>
            </article>
          </div>
          <p className="md-muted">
            Static rendering writes real SVG and data tables into the page, so crawlers and readers
            without JavaScript see the chart. The script upgrades the same markup in place.
          </p>
        </section>
      </main>
    </QuartileProvider>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* /examples/ai-answer                                                                        */
/* ------------------------------------------------------------------------------------------ */

const renderers = [quartileRenderer()];

export function AIAnswerPage() {
  const { theme, toggle } = useTheme();
  const replay = useReplay(ANSWER_MARKDOWN);
  const [raw, setRaw] = useState(false);
  const prompt = useMemo(() => quartilePrompt(), []);
  // What the reader selected in the answer's charts, and the follow-up they chose to ask.
  const [picked, setPicked] = useState<SelectionChange | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  // Each replay is a new answer: its document starts without the previous selection.
  const [run, setRun] = useState(0);
  const stream = (speed: number) => {
    setPicked(null);
    setAsked(null);
    setRun((n) => n + 1);
    replay.start(speed);
  };
  const about = replay.running
    ? ''
    : (picked?.predicates ?? []).map((p) => `${p.field} ${predicateValueLabel(p)}`).join(' and ');
  return (
    <QuartileProvider theme={theme} className="w-page md-page">
      <Header page="ai-answer" />
      <main className="w-main">
        <div className="w-intro">
          <div>
            <span className="w-preview">Local replay · no model is called · fictional data</span>
            <h1>Charts inside a streamed answer</h1>
            <p>
              The answer below is ordinary Markdown with <code>{`${f}quartile`}</code> blocks, as a
              model writes it. Vercel's Streamdown renders the prose; Quartile renders each fence,
              drawing complete lines while the rest is still arriving. Replay it to watch the charts
              fill in. Then select a plan in the last chart: the page is told about the selection
              and offers a follow-up question about it.
            </p>
          </div>
          <a href={`${links.github}/blob/main/docs/guides/ai-responses.md`}>Integration guide</a>
        </div>
        <div className="w-toolbar">
          <Button variant="primary" onClick={() => stream(1)} disabled={replay.running}>
            {replay.running ? 'Streaming…' : 'Stream the answer'}
          </Button>
          <Button onClick={() => stream(3)} disabled={replay.running}>
            Stream faster
          </Button>
          <Button aria-pressed={raw} onClick={() => setRaw((r) => !r)}>
            Show Markdown
          </Button>
          {toggle}
        </div>
        <div className="md-chat" data-raw={raw || undefined}>
          <div className="md-turn md-turn-user">
            <span className="md-role">User</span>
            <p>{ANSWER_QUESTION}</p>
          </div>
          <div className="md-turn md-turn-assistant" aria-busy={replay.running || undefined}>
            <span className="md-role">Assistant</span>
            <QuartileDocument
              key={run}
              provider={false}
              streaming={replay.running}
              onSelectionChange={(change) => {
                setPicked(change);
                setAsked(null);
              }}
            >
              <Streamdown
                className="md-prose"
                isAnimating={replay.running}
                plugins={{ renderers }}
                controls={false}
              >
                {replay.shown}
              </Streamdown>
            </QuartileDocument>
            {/* Always present, so assistive technology announces a suggestion when it arrives. */}
            <div className="md-followup" aria-live="polite">
              {about ? (
                <>
                  <span className="md-role">Suggested from your selection</span>
                  <Button onClick={() => setAsked(`Tell me more about ${about}.`)}>
                    Ask about {about}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          {raw ? (
            <div className="md-raw">
              <span className="md-role">What the model wrote</span>
              <pre className="md-code">{replay.shown}</pre>
            </div>
          ) : null}
          {asked ? (
            <div className="md-turn md-turn-user md-turn-demo">
              <span className="md-role">User · local demo, nothing is sent</span>
              <p>{asked}</p>
              <p className="md-muted">
                An app would send this question to its model, with the selection as context. This
                page calls no model, so no answer follows.
              </p>
            </div>
          ) : null}
        </div>
        <details className="w-inspector">
          <summary>
            The system prompt that teaches the syntax ({prompt.length.toLocaleString('en-US')}{' '}
            characters)
          </summary>
          <p>
            Generated by <code>quartilePrompt()</code> from the language's own tables. Pass your
            datasets to it and the model references them by name instead of pasting rows.
          </p>
          <pre className="md-code">{prompt}</pre>
        </details>
      </main>
    </QuartileProvider>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* /examples/markdown-report                                                                  */
/* ------------------------------------------------------------------------------------------ */

const reportComponents = { pre: QuartilePre };

export function MarkdownReportPage() {
  const { theme, toggle } = useTheme();
  return (
    <QuartileProvider theme={theme} className="w-page md-page">
      <Header page="markdown-report" />
      <main className="w-main">
        <div className="w-intro">
          <div>
            <span className="w-preview">Quartile preview · fictional sample data</span>
            <h1>A dashboard written in Markdown</h1>
            <p>
              One Markdown file: prose, four Quartile blocks and a dataset defined once. Blocks that
              read the same dataset share a selection, so the whole document behaves like a
              dashboard. The first block states its source and offers the rows behind its numbers,
              on screen or as a CSV file. Rendered here with react-markdown; the same file renders
              statically with the remark or markdown-it plugin.
            </p>
          </div>
          <a href={`${links.github}/blob/main/apps/gallery/src/examples/markdown/content.ts`}>
            View source
          </a>
        </div>
        <div className="w-toolbar">{toggle}</div>
        <details className="w-inspector">
          <summary>Markdown source</summary>
          <pre className="md-code">{REPORT_MARKDOWN}</pre>
        </details>
        <article className="md-prose md-report">
          <QuartileDocument provider={false} markdown={REPORT_MARKDOWN}>
            <Markdown components={reportComponents}>{REPORT_MARKDOWN}</Markdown>
          </QuartileDocument>
        </article>
      </main>
    </QuartileProvider>
  );
}
