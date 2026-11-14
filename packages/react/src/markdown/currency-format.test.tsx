// A block that asks for `currency` shows the full amount wherever a value is read; only axes
// shorten it. Plain numbers, a `format:` line and a field setting must agree with rows that were
// written as "$84,000".
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarList } from '../charts/BarList';
import { dataset, resolveData } from '../data/schema';
import { compileBlock } from '../lang/compile';
import { QuartileBlock } from './QuartileBlock';
import { QuartileDocument } from './QuartileDocument';

const whole = 'plan,change\nEnterprise,84000\nTeam,69000\nStarter,4000\n';
const cents = 'plan,change\nEnterprise,84000.5\nTeam,69000.25\nStarter,4000\n';

/** What a reader sees, and what the hidden summary and table say, of a rendered block. */
function shown(source: string) {
  const { container, unmount } = render(<QuartileBlock source={source} />);
  const hidden = [...container.querySelectorAll('.q-visually-hidden')]
    .map((n) => n.textContent)
    .join(' | ');
  const copy = container.cloneNode(true) as HTMLElement;
  for (const n of copy.querySelectorAll('.q-visually-hidden')) n.remove();
  const visible = copy.textContent ?? '';
  unmount();
  return { visible, hidden };
}

describe('a block that asks for currency over plain numbers', () => {
  it('prints whole amounts in full in a list, and the summary agrees', () => {
    for (const setting of ['format: currency USD', 'change.format: currency USD']) {
      const { visible, hidden } = shown(`barlist sum(change) by plan\n${setting}\n---\n${whole}`);
      expect(visible, setting).toBe('Enterprise$84,000Team$69,000Starter$4,000');
      expect(hidden, setting).toContain('Highest Enterprise at $84,000; lowest Starter at $4,000.');
      expect(hidden, setting).toContain('Enterprise$84,000Team$69,000Starter$4,000');
      expect(`${visible}${hidden}`, setting).not.toMatch(/\.0K|\.00/);
    }
    const large = shown(
      'barlist sum(change) by plan\nformat: currency USD\n---\nplan,change\nTeam,1109000\nEnterprise,845000\n',
    );
    expect(large.visible).toBe('Team$1,109,000Enterprise$845,000');
  });

  it('prints cents when the amounts have them', () => {
    for (const setting of ['format: currency USD', 'change.format: currency USD']) {
      const { visible, hidden } = shown(`barlist sum(change) by plan\n${setting}\n---\n${cents}`);
      expect(visible, setting).toBe('Enterprise$84,000.50Team$69,000.25Starter$4,000.00');
      expect(hidden, setting).toContain(
        'Highest Enterprise at $84,000.50; lowest Starter at $4,000.00.',
      );
    }
  });

  it('shows the same amount in a KPI, with the currency as its unit', () => {
    const kpi = shown(`kpi sum(change) as "Change"\nformat: currency USD\n---\n${whole}`);
    expect(kpi.visible).toBe('ChangeUSD$157,000');
    expect(shown(`kpi sum(change) as "Change"\nformat: currency USD\n---\n${cents}`).visible).toBe(
      'ChangeUSD$157,000.75',
    );
    expect(shown(`kpi sum(change) as "Change"\nformat: currency EUR\n---\n${whole}`).visible).toBe(
      'ChangeEUR€157,000',
    );
  });

  it('shows the same amount in a table', () => {
    expect(shown(`table plan, change\nchange.format: currency USD\n---\n${whole}`).visible).toBe(
      'PlanChangeEnterprise$84,000Team$69,000Starter$4,000',
    );
    expect(shown(`table plan, change\nchange.format: currency USD\n---\n${cents}`).visible).toBe(
      'PlanChangeEnterprise$84,000.50Team$69,000.25Starter$4,000.00',
    );
  });

  it('shows the same amount in a donut’s centre and a funnel’s steps', () => {
    const donut = shown(`donut sum(change) by plan\nformat: currency USD\n---\n${whole}`);
    expect(donut.visible).toContain('$157,000');
    expect(donut.hidden).toContain('total $157,000:');
    expect(`${donut.visible}${donut.hidden}`).not.toMatch(/\.0K|\.00/);
    const funnel = shown(`funnel sum(change) by plan\nformat: currency USD\n---\n${whole}`);
    expect(funnel.visible).toContain('Enterprise$84,000 · 100%');
    expect(funnel.hidden).toContain('from Enterprise ($84,000) to Starter ($4,000)');
  });

  it('leaves axis ticks compact and trimmed', () => {
    const ticks = '$0$20K$40K$60K$80K$100K';
    for (const data of [whole, cents]) {
      const bar = shown(`bar sum(change) by plan\nformat: currency USD\n---\n${data}`);
      expect(bar.visible, data).toBe(`${ticks}EnterpriseTeamStarter`);
      const line = shown(`line sum(change) by plan\nformat: currency USD\n---\n${data}`);
      expect(line.visible, data).toBe(`${ticks}EnterpriseTeamStarter`);
    }
    expect(shown(`bar sum(change) by plan\nformat: currency USD\n---\n${whole}`).hidden).toContain(
      'Highest Enterprise at $84,000; lowest Starter at $4,000.',
    );
    expect(shown(`bar sum(change) by plan\nformat: currency USD\n---\n${cents}`).hidden).toContain(
      'Highest Enterprise at $84,000.50; lowest Starter at $4,000.00.',
    );
  });

  it('holds for a field setting on a dashboard or a data block', () => {
    const dashboard = (data: string) =>
      shown(`dashboard\nchange.format: currency USD\n\nbarlist sum(change) by plan\n---\n${data}`);
    expect(dashboard(whole).visible).toBe(
      'Change by planEnterprise$84,000Team$69,000Starter$4,000',
    );
    expect(dashboard(cents).visible).toBe(
      'Change by planEnterprise$84,000.50Team$69,000.25Starter$4,000.00',
    );

    const { container } = render(
      <QuartileDocument dataDisplay="hidden">
        <QuartileBlock source={`data plans\nchange.format: currency USD\n---\n${cents}`} />
        <QuartileBlock source={'barlist sum(change) by plan\ndata: plans\n'} />
        <QuartileBlock source={'kpi sum(change) as "Change"\ndata: plans\n'} />
      </QuartileDocument>,
    );
    expect(screen.getAllByText('$84,000.50').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('$84.0K');
    expect(container.querySelector('.q-kpi')?.textContent).toBe('ChangeUSD$157,000.75');
  });

  it('holds for rows that were written with cents', () => {
    const written =
      'plan,change\nEnterprise,"$84,000.50"\nTeam,"$69,000.25"\nStarter,"$4,000.00"\n';
    const list = shown(`barlist sum(change) by plan\n---\n${written}`);
    expect(list.visible).toBe('Enterprise$84,000.50Team$69,000.25Starter$4,000.00');
    expect(list.hidden).toContain('Highest Enterprise at $84,000.50; lowest Starter at $4,000.00.');
  });

  it('records the display on the field: full amounts, compact ticks', () => {
    const field = (data: string, setting: string) => {
      const compiled = compileBlock(`barlist sum(change) by plan\n${setting}\n---\n${data}`);
      const name = (compiled.spec as { data: string }).data;
      return resolveData(compiled.data[name]).schema.change;
    };
    for (const setting of ['format: currency USD', 'change.format: currency USD']) {
      expect(field(whole, setting), setting).toMatchObject({
        format: {
          type: 'number',
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        },
        axisFormat: 'currency-compact',
        currency: 'USD',
        unit: 'USD',
      });
      expect(field(cents, setting), setting).toMatchObject({
        format: { type: 'number', style: 'currency', currency: 'USD' },
        axisFormat: 'currency-compact',
        currency: 'USD',
        unit: 'USD',
      });
    }
    // A unit the block states is kept.
    expect(
      resolveData(
        Object.values(
          compileBlock(
            `table plan, change\nchange.format: currency USD\nchange.unit: ARR\n---\n${whole}`,
          ).data,
        ).at(-1),
      ).schema.change.unit,
    ).toBe('ARR');
  });

  it('keeps a compact format the block asks for by name', () => {
    const list = shown(`barlist sum(change) by plan\nformat: $ compact\n---\n${whole}`);
    expect(list.visible).toBe('Enterprise$84.0KTeam$69.0KStarter$4.0K');
  });
});

describe('application data given as `currency`', () => {
  const rows = [
    { plan: 'Enterprise', change: 84000 },
    { plan: 'Starter', change: 4000 },
  ];

  it('keeps the compact column of a list rendered from React props', () => {
    const { container } = render(
      <BarList data={dataset(rows, { change: 'currency' })} category="plan" value="change" />,
    );
    expect(container.textContent).toContain('$84.0K');
  });

  it('keeps it for a block over a host dataset, until the block asks for a format', () => {
    const host = { plans: dataset(rows, { change: 'currency' }) };
    const plain = render(
      <QuartileDocument data={host}>
        <QuartileBlock source={'barlist sum(change) by plan\ndata: plans\n'} />
      </QuartileDocument>,
    );
    expect(plain.container.textContent).toContain('$84.0K');
    plain.unmount();
    const asked = render(
      <QuartileDocument data={host}>
        <QuartileBlock
          source={'barlist sum(change) by plan\ndata: plans\nformat: currency USD\n'}
        />
      </QuartileDocument>,
    );
    expect(asked.container.textContent).toContain('Enterprise$84,000Starter$4,000');
  });
});

describe('the unit tag of a KPI', () => {
  const orders =
    'id,region,channel,total\n1001,EMEA,Web,129\n1002,EMEA,Store,80\n1003,APAC,Web,210\n1004,Americas,Web,95\n1005,Americas,Store,160\n';
  const kpi = (container: HTMLElement) => ({
    tag: container.querySelector('.q-kpi-unit')?.textContent ?? null,
    text: container.querySelector('.q-kpi')?.textContent,
  });
  const alone = (source: string) => {
    const { container, unmount } = render(<QuartileBlock source={source} />);
    const out = kpi(container);
    unmount();
    return out;
  };

  it('follows a currency declared on the dataset that a block reads', async () => {
    // The `data orders` block of the data sources guide, and a KPI over it.
    const inline = render(
      <QuartileDocument dataDisplay="hidden">
        <QuartileBlock
          source={`data orders\ntotal.format: currency USD\ntotal.description: Order value after discounts.\n---\n${orders}`}
        />
        <QuartileBlock source={'kpi sum(total) as "Revenue"\ndata: orders\n'} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(kpi(inline.container).tag).toBe('USD'));
    // The label, the field's description, the tag, then the amount.
    expect(kpi(inline.container).text).toBe('RevenueOrder value after discounts.USD$674');
    inline.unmount();

    // The same block over rows that were loaded.
    const loadSource = async () => ({ orders: [{ total: 129 }, { total: 80.5 }] });
    const loaded = render(
      <QuartileDocument dataDisplay="hidden" loadSource={loadSource}>
        <QuartileBlock
          source={'data orders\nsrc: /api/orders.json\npath: orders\ntotal.format: currency EUR\n'}
        />
        <QuartileBlock source={'kpi sum(total) as "Revenue"\ndata: orders\n'} />
      </QuartileDocument>,
    );
    await waitFor(() =>
      expect(kpi(loaded.container)).toEqual({ tag: 'EUR', text: 'RevenueEUR€209.50' }),
    );
  });

  it('follows a currency declared on the dashboard', () => {
    expect(
      alone(`dashboard\ntotal.format: currency USD\n\nkpi sum(total) as "Revenue"\n---\n${orders}`),
    ).toEqual({ tag: 'USD', text: 'RevenueUSD$674' });
    // Over a dataset the host passes, whose `total` is a plain whole number.
    const { container } = render(
      <QuartileDocument data={{ orders: [{ total: 129 }, { total: 80 }] }}>
        <QuartileBlock
          source={
            'dashboard\ndata: orders\ntotal.format: currency GBP\n\nkpi sum(total) as "Revenue"\n'
          }
        />
      </QuartileDocument>,
    );
    expect(kpi(container)).toEqual({ tag: 'GBP', text: 'RevenueGBP£209' });
  });

  it('follows a currency declared on the view', () => {
    for (const setting of ['format: currency USD', 'total.format: currency USD']) {
      expect(alone(`kpi sum(total) as "Revenue"\n${setting}\n---\n${orders}`), setting).toEqual({
        tag: 'USD',
        text: 'RevenueUSD$674',
      });
    }
  });

  it('keeps a unit the block states, and says COUNT for a count of rows', () => {
    expect(
      alone(
        `kpi sum(total) as "Revenue"\ntotal.format: currency USD\ntotal.unit: ARR\n---\n${orders}`,
      ).tag,
    ).toBe('ARR');
    expect(alone(`kpi count as "Orders"\n---\n${orders}`)).toEqual({
      tag: 'COUNT',
      text: 'OrdersCOUNT5',
    });
  });

  it('follows other declared formats: a rate for percentages, nothing for a duration', () => {
    const share = 'plan,share,wait\nTeam,40,90000\nSolo,60,30000\n';
    // Whole numbers are tagged COUNT by the data model until a format says what they are.
    expect(alone(`kpi sum(wait) as "Wait"\n---\n${share}`).tag).toBe('COUNT');
    expect(alone(`kpi sum(wait) as "Wait"\nformat: duration\n---\n${share}`).tag).toBeNull();
    expect(alone(`kpi mean(share) as "Share"\nshare.format: percent\n---\n${share}`).tag).toBe(
      'RATE',
    );
    expect(alone(`kpi sum(wait) as "Wait"\nformat: compact\n---\n${share}`).tag).toBe('COUNT');
  });
});
