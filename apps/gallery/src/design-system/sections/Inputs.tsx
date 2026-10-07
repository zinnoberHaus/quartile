import {
  Calendar,
  Checkbox,
  Combobox,
  type DateRange,
  DateRangePicker,
  IconBarChart,
  IconColumns,
  IconSearch,
  IconTable,
  NumberField,
  RadioGroup,
  RangeSlider,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  TextField,
} from '@quartile/react';
import { type CSSProperties, type ReactNode, useState } from 'react';
import {
  AMOUNT_BIN,
  AMOUNT_MAX,
  AMOUNT_MIN,
  amountHistogram,
  countInRange,
  metricOptions,
  orderAmounts,
  productOptions,
  regionOptions,
} from '../../data/actions-inputs';
import { Section } from '../Section';

// Owner: actions-inputs.

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  padding: 20,
  background: 'var(--q-surface)',
  border: '1px solid var(--q-line)',
  borderRadius: 14,
  minWidth: 0,
};

const cardTitle: CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--q-text)' };
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16 };

function Card({
  title,
  style,
  children,
}: {
  title?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div style={{ ...card, ...style }}>
      {title && <span style={cardTitle}>{title}</span>}
      {children}
    </div>
  );
}

const usd = (v: number) => `$${v.toLocaleString('en-US')}`;
const total = orderAmounts.length;
// The Kestrel sample data ends on Oct 6, 2026; presets are relative to that day.
const TODAY = new Date(2026, 9, 6);

function StatusChecks() {
  const [checks, setChecks] = useState({ Paid: true, Refunded: false, Pending: true });
  return (
    <div style={{ ...row, rowGap: 10 }} role="group" aria-label="Order status">
      {(Object.keys(checks) as (keyof typeof checks)[]).map((k) => (
        <Checkbox
          key={k}
          label={k}
          checked={checks[k]}
          onChange={(on) => setChecks((c) => ({ ...c, [k]: on }))}
        />
      ))}
    </div>
  );
}

function AllChannels() {
  const [all, setAll] = useState<boolean | 'mixed'>('mixed');
  return (
    <Checkbox
      label="All channels"
      indeterminate={all === 'mixed'}
      checked={all === true}
      onChange={setAll}
    />
  );
}

function DateCard() {
  const [range, setRange] = useState<DateRange | null>({
    start: new Date(2026, 8, 7),
    end: new Date(2026, 9, 6),
  });
  const [month, setMonth] = useState(new Date(2026, 8, 1));
  const update = (r: DateRange) => {
    setRange(r);
    setMonth(new Date(r.start.getFullYear(), r.start.getMonth(), 1));
  };
  return (
    <Card title="DateRangePicker" style={{ flex: '1 1 340px', gap: 12 }}>
      <DateRangePicker aria-label="Date range" value={range} onChange={update} today={TODAY} />
      <Calendar
        aria-label="Selected range"
        value={range}
        onChange={update}
        month={month}
        onMonthChange={setMonth}
        today={TODAY}
        showHeader={false}
      />
    </Card>
  );
}

export function InputsSection() {
  const [target, setTarget] = useState<number | null>(-1500);
  const [smoothing, setSmoothing] = useState(7);
  const [amount, setAmount] = useState<[number, number]>([40, 180]);
  return (
    <Section
      id="inputs"
      eyebrow="07 · Components"
      title="Inputs & selection"
      lead="Controls that filter data show the data they filter: range sliders carry their distribution, selects carry their counts. The controls below are live."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={row}>
          <div
            style={{
              ...card,
              flex: '1 1 380px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            }}
          >
            <TextField label="Report name" placeholder="e.g. Weekly revenue" hint="Default" />
            <TextField
              label="Report name"
              defaultValue="Weekly revenue"
              hint="Focus"
              data-state="focus"
            />
            <NumberField
              label="Target"
              prefix="$"
              value={target}
              onChange={setTarget}
              error={target != null && target < 0 ? 'Target must be a positive number.' : undefined}
              hint="Must be positive"
            />
            <TextField
              label="Data source"
              defaultValue="warehouse.orders"
              suffix="locked"
              hint="Disabled"
              disabled
            />
            <NumberField
              label="Amount"
              prefix="$"
              suffix="USD"
              defaultValue={1500}
              fractionDigits={2}
              min={0}
              hint="Prefix · suffix"
            />
            <TextField
              label="Search"
              type="search"
              icon={<IconSearch />}
              placeholder="Metrics, charts…"
              shortcut="⌘K"
              hint="With shortcut"
            />
          </div>

          <Card style={{ flex: '1 1 300px', minHeight: 330, gap: 8 }}>
            <Select
              label="Metric"
              options={metricOptions}
              defaultValue="net"
              defaultOpen
              portal={false}
            />
          </Card>
        </div>

        <div style={row}>
          <Card title="Checkbox · Radio · Switch · Segmented" style={{ flex: '1 1 300px' }}>
            <StatusChecks />
            <RadioGroup
              aria-label="Aggregation"
              options={['Sum', 'Average', 'Median']}
              defaultValue="Average"
            />
            <Switch label="Compare to previous period" defaultChecked showState />
            <SegmentedControl
              aria-label="Granularity"
              options={['Day', 'Week', 'Month', 'Quarter']}
              defaultValue="Week"
            />
          </Card>

          <Card title="Slider · RangeSlider with distribution" style={{ flex: '1 1 300px' }}>
            <Slider
              label="Smoothing"
              min={1}
              max={17}
              value={smoothing}
              onChange={setSmoothing}
              format={(v) => (v === 1 ? 'Off' : `${v}-day`)}
            />
            <RangeSlider
              label="Order value"
              min={AMOUNT_MIN}
              max={AMOUNT_MAX}
              step={AMOUNT_BIN}
              value={amount}
              onChange={setAmount}
              format={usd}
              distribution={amountHistogram}
              thumbLabels={['Minimum order value', 'Maximum order value']}
              caption={(r) =>
                `${countInRange(r).toLocaleString('en-US')} of ${total.toLocaleString('en-US')} orders in range`
              }
            />
          </Card>

          <DateCard />
        </div>

        <div style={row}>
          <Card title="Combobox · multiple" style={{ flex: '1 1 340px', gap: 12 }}>
            <Combobox
              multiple
              aria-label="Regions"
              options={regionOptions}
              defaultValue={['North America', 'Europe']}
              placeholder="Filter regions…"
            />
            <span style={{ font: '400 11px var(--q-font-mono)', color: 'var(--q-text-3)' }}>
              Revenue per region, Sep 7 – Oct 6, 2026
            </span>
            <Combobox
              label="Product"
              options={productOptions}
              defaultValue="KST-1042"
              placeholder="Search products…"
              hint="Single selection · price on the right"
            />
          </Card>

          <Card title="Sizes · icons · states" style={{ flex: '1 1 340px', gap: 14 }}>
            <div style={{ ...row, alignItems: 'center', gap: 12 }}>
              <SegmentedControl
                aria-label="Period"
                size="sm"
                mono
                options={['7D', '30D', '90D', '12M']}
                defaultValue="30D"
              />
              <SegmentedControl
                aria-label="View"
                size="sm"
                options={[
                  { value: 'chart', label: 'Chart', icon: <IconBarChart /> },
                  { value: 'table', label: 'Table', icon: <IconTable /> },
                  { value: 'both', label: 'Both', icon: <IconColumns /> },
                ]}
                defaultValue="chart"
              />
            </div>
            <div style={{ ...row, alignItems: 'center', gap: 16 }}>
              <AllChannels />
              <Checkbox label="Archived" disabled />
              <Switch label="Compare" size="sm" />
              <Switch label="Locked" size="sm" defaultChecked disabled />
            </div>
            <Checkbox
              label="Email me when this report changes"
              description="Sent at most once a day."
              defaultChecked
            />
          </Card>
        </div>
      </div>
    </Section>
  );
}
