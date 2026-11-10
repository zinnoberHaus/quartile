// Chart core (for custom charts)

export { summarizeSeries, useChartKeyboard } from './core/a11y';
export type { RangeBrushOptions } from './core/brush';
export { useRangeBrush } from './core/brush';
export type { ChartBaseProps, ChartStateProps, ChartStatus, ChartTable } from './core/ChartFrame';
export { ChartDataTable, ChartFrame, ChartState, statusOf } from './core/ChartFrame';
export type { ChartColor } from './core/colors';
export { CHART_COLOR_NAMES, chartColor, isChartColor } from './core/colors';
export type { LegendItem, ReferenceMark, TooltipRow } from './core/guides';
export {
  AxisBottom,
  AxisLeft,
  ChartNote,
  ChartTooltip,
  EndLabels,
  GridColumns,
  GridRows,
  Legend,
  LegendLayout,
  ReferenceRules,
} from './core/guides';
export type {
  ChartMargin,
  ChartPresentationProps,
  GridSetting,
  LegendSetting,
  LegendSide,
  ReferenceLine,
  ReferenceSetting,
  Sides,
  ValueAxis,
  ValueAxisOptions,
  ValueScaleType,
} from './core/options';
export {
  describeLimits,
  describeReferences,
  gridLines,
  legendPlacement,
  marginSides,
  referenceLines,
  sideLegendWidth,
  spreadLabels,
  tickCount,
  valueAxis,
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
export type { Bucket } from './core/trends-aggregate';
export { aggregateBy, keyOf, orderKeys, predicateHas } from './core/trends-aggregate';
export { isKeyboardFocus } from './core/trends-focus';
export { seriesFormatters } from './core/trends-format';
export { toPrimitive, useToggleSelect } from './core/trends-select';
export type { XSeries } from './core/trends-series';
export { pivotSeries, seriesTotals, stackSeries } from './core/trends-series';
export * from './distributions-flows.exports';
export type { LineChartProps } from './LineChart';
export { LineChart } from './LineChart';
// Each barrel is owned by one workstream.
export * from './trends-parts.exports';
