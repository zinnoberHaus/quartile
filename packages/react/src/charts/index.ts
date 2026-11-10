// Chart core (for custom charts)

export { summarizeSeries, useChartKeyboard } from './core/a11y';
export type { ChartBaseProps, ChartStateProps, ChartStatus, ChartTable } from './core/ChartFrame';
export { ChartDataTable, ChartFrame, ChartState, statusOf } from './core/ChartFrame';
export type { ChartColor } from './core/colors';
export { CHART_COLOR_NAMES, chartColor, isChartColor } from './core/colors';
export type { LegendItem, TooltipRow } from './core/guides';
export { AxisBottom, AxisLeft, ChartTooltip, GridRows, Legend } from './core/guides';
export type {
  ChartMargin,
  ChartPresentationProps,
  GridSetting,
  LegendSetting,
  LegendSide,
  ReferenceLine,
  ReferenceSetting,
} from './core/options';
export type { Curve } from './core/scales';
export {
  bandScale,
  continuousX,
  curveFactory,
  monoTextWidth,
  seqColor,
  seriesColor,
  spacedIndices,
  tickFormatter,
  timeScale,
  valueScale,
} from './core/scales';
export * from './distributions-flows.exports';
export type { LineChartProps } from './LineChart';
export { LineChart } from './LineChart';
// Each barrel is owned by one workstream.
export * from './trends-parts.exports';
