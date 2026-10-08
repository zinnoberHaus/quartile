import { Section } from '../Section';
import { ChartsDistributions } from './ChartsDistributions';
import { ChartsTrends } from './ChartsTrends';

export function ChartsSection() {
  return (
    <Section
      id="charts"
      eyebrow="11 · Visualization"
      title="Chart gallery"
      lead="One grammar of marks, scales and guides. Hairline gridlines, mono axes, direct labels where they fit, legends that double as filters. Click the legend below."
    >
      <div className="g-chart-grid">
        <ChartsTrends />
        <ChartsDistributions />
      </div>
    </Section>
  );
}
