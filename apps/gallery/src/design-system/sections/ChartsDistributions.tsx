// Owner: charts-distributions. Scatter, calendar heatmap, histogram, box plot, Sankey, heatmap.
import { BoxPlot, CalendarHeatmap, Heatmap, Histogram, Sankey, ScatterPlot } from '@quartile/react';
import type { ReactNode } from 'react';
import {
  campaignData,
  channelFlows,
  HOURS,
  ordersByHour,
  pad2,
  regionAmounts,
  sessions,
  WEEKDAYS,
  yearDaily,
} from '../../data/charts-distributions';
import { REGIONS } from '../../data/kestrel';
import { Demo } from '../Section';

/** Grid item with a CSS order matching the design's card sequence; the card stretches to the row. */
function Slot({ order, wide, children }: { order: number; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'g-wide' : undefined} style={{ order, display: 'grid', minWidth: 0 }}>
      {children}
    </div>
  );
}

export function ChartsDistributions() {
  return (
    <>
      <Slot order={5}>
        <Demo title="Scatter · bubble" aside={'<ScatterPlot size="revenue" color="channel" />'}>
          <ScatterPlot
            data={campaignData}
            x="sessions"
            y="conversion_rate"
            size="revenue"
            color="channel"
            label="campaign"
            select
            height={230}
          />
        </Demo>
      </Slot>
      <Slot order={6}>
        <Demo title="Calendar heatmap" aside={'<CalendarHeatmap date="date" value="orders" />'}>
          <CalendarHeatmap data={yearDaily} date="date" value="orders" weeks={26} />
        </Demo>
      </Slot>
      <Slot order={7}>
        <Demo title="Histogram" aside="<Histogram bins={32} median />">
          <Histogram data={sessions} x="minutes" bins={32} median brush height={170} />
        </Demo>
      </Slot>
      <Slot order={8}>
        <Demo title="Box plot" aside={'<BoxPlot category="region" value="amount" />'}>
          <BoxPlot data={regionAmounts} category="region" value="amount" order={REGIONS} select />
        </Demo>
      </Slot>
      <Slot order={10}>
        <Demo title="Sankey" aside={'<Sankey from="channel" to="outcome" />'}>
          <Sankey data={channelFlows} from="channel" to="outcome" value="sessions" height={210} />
        </Demo>
      </Slot>
      <Slot order={12}>
        <Demo title="Orders by hour" aside={'<Heatmap x="hour" y="weekday" />'}>
          <Heatmap
            data={ordersByHour}
            x="hour"
            y="weekday"
            xOrder={HOURS}
            yOrder={WEEKDAYS}
            xLabels={pad2}
            xFormat={(h) => `${pad2(h)}:00`}
            countLabel="Orders"
          />
        </Demo>
      </Slot>
    </>
  );
}
