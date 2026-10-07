import {
  AreaChart,
  Badge,
  Button,
  Delta,
  KPI,
  LineChart,
  QuartileProvider,
  SegmentedControl,
  TextField,
} from '@quartile/react';
import { useState } from 'react';
import { daily, monthlyByChannel } from '../../data/kestrel';
import { Section } from '../Section';
import '../foundations.css';

const organic = monthlyByChannel.filter((r) => r.channel === 'Organic search');
const revenueTrend = daily.map((d) => d.revenue);
const total = daily.reduce((s, d) => s + d.revenue, 0);
const previous = daily.reduce((s, d) => s + d.previous, 0);

export function DarkThemeSection() {
  const [kind, setKind] = useState('Area');
  return (
    <Section
      id="dark-theme"
      eyebrow="15 · Patterns"
      title="Dark theme"
      lead="Same tokens, remapped. Signal and data colors lift in lightness so series keep their contrast on near-black surfaces; tooltips and toasts stay dark in both themes."
    >
      <QuartileProvider theme="dark" className="f-dark-stage">
        <KPI
          label="Net revenue"
          unit="USD"
          value={total}
          format="currency"
          delta={total / previous - 1}
          trend={revenueTrend}
          comparison="vs. previous 30 days"
        />
        <div className="f-dark-card">
          <div className="f-dark-card-head">
            <span>Organic revenue</span>
            <SegmentedControl
              size="sm"
              options={['Area', 'Line']}
              value={kind}
              onChange={setKind}
              aria-label="Chart type"
            />
          </div>
          {kind === 'Area' ? (
            <AreaChart
              data={organic}
              x="month"
              y="revenue"
              xFormat="month"
              height={190}
              legend={false}
            />
          ) : (
            <LineChart
              data={organic}
              x="month"
              y="revenue"
              xFormat="month"
              height={190}
              legend={false}
            />
          )}
        </div>
        <div className="f-dark-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="g-row">
            <Button variant="primary">Run query</Button>
            <Button variant="signal">Apply</Button>
            <Button>Export</Button>
          </div>
          <TextField aria-label="Report name" defaultValue="Weekly revenue" />
          <div className="g-row">
            <Badge tone="live" dot>
              Live
            </Badge>
            <Delta value={-0.031} />
            <Badge tone="signal">Europe</Badge>
          </div>
        </div>
      </QuartileProvider>
    </Section>
  );
}
