import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuartileBlock } from '../markdown/QuartileBlock';
import { QuartileProvider } from '../provider/QuartileProvider';
import { formatAsOf, provenanceText } from './provenance';
import { SpecView } from './SpecView';

const rows = 'region,amount\nEMEA,120\nAPAC,80\n';
const orders = [
  { region: 'EMEA', amount: 120 },
  { region: 'APAC', amount: 80 },
];

describe('formatAsOf', () => {
  it('writes ISO dates the way the page writes dates and keeps other text', () => {
    expect(formatAsOf('2026-11-01', { locale: 'en-US' })).toBe('Nov 1, 2026');
    expect(formatAsOf('2026-11-01', { locale: 'de-DE' })).toBe('1. Nov. 2026');
    expect(formatAsOf('2026-11-10T09:30:00Z', { locale: 'en-US', timeZone: 'UTC' })).toMatch(
      /Nov 10, 2026.*9:30/,
    );
    expect(formatAsOf('Q3 2026')).toBe('Q3 2026');
    expect(formatAsOf('2026-02-30')).toBe('2026-02-30');
    expect(formatAsOf(undefined)).toBe('');
    expect(
      provenanceText(
        { source: 'World Bank', sourceUrl: 'https://x.example/', asOf: '2026-11-01' },
        { locale: 'en-US' },
      ),
    ).toBe('Source: World Bank · As of Nov 1, 2026');
  });
});

describe('the source line', () => {
  it('sits under the chart with a checked link and describes the figure', () => {
    const { container } = render(
      <QuartileBlock
        source={`bar sum(amount) by region\ntitle: Revenue\nsource: World Bank, WDI\nsource.url: https://data.worldbank.org/indicator\nasof: 2026-11-01\n---\n${rows}`}
      />,
    );
    const note = container.querySelector('.q-spec-card > .q-spec-source')!;
    expect(note.textContent).toBe('Source: World Bank, WDI · As of Nov 1, 2026');
    const link = screen.getByRole('link', { name: 'World Bank, WDI' });
    expect(link.getAttribute('href')).toBe('https://data.worldbank.org/indicator');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.hasAttribute('target')).toBe(false);
    // The figure's accessible description is the visible line, not a hidden copy of it.
    const figure = screen.getByRole('figure', { name: 'Revenue' });
    expect(figure.getAttribute('aria-describedby')).toBe(note.id);
    expect(note.id).not.toBe('');
    // The chart is the last thing before the line: the card's own layout is unchanged.
    expect(note.previousElementSibling).toBe(figure);
  });

  it('is absent, with nothing else changed, when a block states no source', () => {
    const { container } = render(
      <QuartileBlock source={`bar sum(amount) by region\ntitle: Revenue\n---\n${rows}`} />,
    );
    expect(container.querySelector('.q-spec-source')).toBeNull();
    expect(screen.getByRole('figure').hasAttribute('aria-describedby')).toBe(false);
    expect(container.querySelector('.q-spec-card')?.children).toHaveLength(2);
  });

  it('shows text without a link, and names a link without text by its host', () => {
    const text = render(
      <QuartileBlock source={`kpi sum(amount) as "Revenue"\nsource: Finance team\n---\n${rows}`} />,
    );
    // A KPI has no card: the line follows it inside one wrapper.
    const noted = text.container.querySelector('.q-spec-noted')!;
    expect(noted.firstElementChild?.classList.contains('q-kpi')).toBe(true);
    expect(noted.lastElementChild?.textContent).toBe('Source: Finance team');
    expect(screen.queryByRole('link')).toBeNull();
    text.unmount();

    render(
      <QuartileBlock
        source={`kpi sum(amount)\nsource.url: https://www.census.gov/data/tables.html\n---\n${rows}`}
      />,
    );
    expect(screen.getByRole('link', { name: 'census.gov' }).getAttribute('href')).toBe(
      'https://www.census.gov/data/tables.html',
    );
  });

  it('renders markup in the text as text', () => {
    const { container } = render(
      <QuartileBlock
        source={`kpi sum(amount)\nsource: <img src=x onerror=alert(1)> <b>bold</b>\nasof: <script>alert(1)</script>\n---\n${rows}`}
      />,
    );
    const note = container.querySelector('.q-spec-source')!;
    expect(note.querySelector('img, b, script')).toBeNull();
    expect(note.textContent).toBe(
      'Source: <img src=x onerror=alert(1)> <b>bold</b> · As of <script>alert(1)</script>',
    );
  });

  it('never links to anything but http and https, even when a spec skips the compiler', () => {
    for (const sourceUrl of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      ' jAvAsCrIpT:alert(1)',
      '//evil.example/x',
    ]) {
      const { container, unmount } = render(
        <SpecView
          data={{ orders }}
          spec={{
            component: 'BarChart',
            data: 'orders',
            x: 'region',
            y: 'amount',
            source: 'Finance',
            sourceUrl,
          }}
        />,
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('.q-spec-source')?.textContent).toBe('Source: Finance');
      expect(container.innerHTML).not.toContain('alert(1)');
      unmount();
    }
  });

  it('follows the page locale, and a dashboard shows its own line under the grid', () => {
    const { container } = render(
      <QuartileProvider locale="de-DE">
        <QuartileBlock
          source={`dashboard Sales\nsource: Internal CRM\nasof: 2026-11-01\nkpi sum(amount) as "Revenue"\nbarlist sum(amount) by region\nsource: Regional finance\n---\n${rows}`}
        />
      </QuartileProvider>,
    );
    const lines = [...container.querySelectorAll('.q-spec-source')].map((n) => n.textContent);
    expect(lines).toEqual([
      'Source: Regional finance',
      'Source: Internal CRM · As of 1. Nov. 2026',
    ]);
    expect(container.querySelector('.q-spec-dashboard > .q-spec-source')).not.toBeNull();
  });

  it('accepts the settings in a JSON spec', () => {
    render(
      <SpecView
        data={{ orders }}
        spec={{
          component: 'DonutChart',
          data: 'orders',
          category: 'region',
          value: 'amount',
          title: 'Share',
          source: 'Eurostat',
          sourceUrl: 'https://ec.europa.eu/eurostat',
          asOf: 'October 2026',
        }}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: 'Eurostat' })).toBeTruthy();
    expect(screen.getByText(/As of October 2026/)).toBeTruthy();
  });
});
