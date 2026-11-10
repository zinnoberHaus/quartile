import { scaleLinear } from 'd3-scale';
import { type ReactNode, useMemo } from 'react';
import type { FieldDef, Formatter } from '../../data/types';
import type { Sides } from '../core/options';
import { monoTextWidth, tickFormatter } from '../core/scales';
import { createScatterIndex } from './scatter-picking';
import type { ScatterMark } from './scatter-types';

interface GeometryPoint {
  x: number;
  y: number;
  r: number;
  color: string;
}

/** Author settings for the plot area. Every part is optional; the defaults are the usual plot. */
export interface ScatterLayout {
  /** Explicit margins; sides left out are computed from the axis labels. */
  pad?: Partial<Sides>;
  /** Approximate tick counts. */
  xTicks?: number;
  yTicks?: number;
  /** Whether each axis shows its labels, and so needs room for them. */
  xAxis?: boolean;
  yAxis?: boolean;
  /** Axis bounds that replace the niced extent of the data. */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

interface GeometryProps {
  points: readonly GeometryPoint[];
  selected: readonly boolean[];
  domains: { x: [number, number]; y: [number, number] };
  width: number;
  height: number;
  xField: FieldDef;
  yField: FieldDef;
  format?: Formatter;
  xFormat?: Formatter;
  locale: string;
  timeZone?: string;
  titlesOn: boolean;
  layout?: ScatterLayout;
  children: (layout: {
    plotHeight: number;
    top: number;
    bottom: number;
    left: number;
    right: number;
    px: number[];
    py: number[];
    xTicks: { x: number; label: string }[];
    yTicks: { y: number; label: string }[];
    marks: ScatterMark[];
    nearest: (x: number, y: number) => number;
    /** Pixel position of a y value, for rules drawn over the plot. */
    yAt: (value: number) => number;
  }) => ReactNode;
}

const NO_LAYOUT: ScatterLayout = {};
const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Replaces the ends of a niced domain with the author's bounds, when they leave an extent. */
function bound(domain: number[], lower: number | undefined, upper: number | undefined): number[] {
  const next = [finite(lower) ? lower : domain[0], finite(upper) ? upper : domain[1]];
  return next[0] < next[1] ? next : domain;
}

/** Hover/focus changes do not rebuild geometry, sorting, vertex arrays or the picking index. */
export function ScatterGeometry({
  children,
  points,
  selected,
  domains,
  width,
  height,
  xField,
  yField,
  format,
  xFormat,
  locale,
  timeZone,
  titlesOn,
  layout = NO_LAYOUT,
}: GeometryProps) {
  const geometry = useMemo(() => {
    const pad = layout.pad ?? {};
    const plotHeight = Math.max(1, height);
    const top = pad.top ?? 8;
    const below = pad.bottom ?? (layout.xAxis === false ? 6 : 20) + (titlesOn ? 18 : 0);
    const bottom = Math.max(top + 1, plotHeight - below);
    const maxR = points.reduce((value, point) => Math.max(value, point.r), 4.5);
    const yCount = layout.yTicks ?? 4;
    const ys = scaleLinear()
      .domain(domains.y)
      .nice(yCount || 1);
    ys.domain(bound(ys.domain(), layout.yMin, layout.yMax));
    const fmtYTick = tickFormatter(yField, locale, timeZone, format);
    const yTickVals = yCount === 0 ? [] : ys.ticks(yCount);
    const left =
      pad.left ??
      (layout.yAxis === false
        ? 4
        : Math.ceil(Math.max(16, ...yTickVals.map((value) => monoTextWidth(fmtYTick(value))))) +
          12);
    const right = Math.max(left + 1, width - (pad.right ?? 4));
    ys.range([bottom - maxR * 0.6, top + maxR * 0.6]);
    const count = layout.xTicks ?? Math.max(2, Math.min(6, Math.floor((right - left) / 80)));
    const xs = scaleLinear()
      .domain(domains.x)
      .nice(layout.xTicks || 5);
    xs.domain(bound(xs.domain(), layout.xMin, layout.xMax)).range([
      left + maxR * 0.6,
      right - maxR * 0.6,
    ]);
    const fmtXTick = tickFormatter(xField, locale, timeZone, xFormat);
    const px = points.map((point) => xs(point.x));
    const py = points.map((point) => ys(point.y));
    const nearest = createScatterIndex(
      points.map((point, index) => ({ x: px[index], y: py[index], r: point.r })),
    );
    const order = points.map((_, index) => index).sort((a, b) => points[b].r - points[a].r);
    return {
      plotHeight,
      top,
      bottom,
      left,
      right,
      px,
      py,
      nearest,
      order,
      yAt: (value: number) => ys(value),
      xTicks:
        count === 0
          ? []
          : xs.ticks(count).map((value) => ({ x: xs(value), label: fmtXTick(value) })),
      yTicks: yTickVals.map((value) => ({ y: ys(value), label: fmtYTick(value) })),
    };
  }, [
    points,
    domains,
    width,
    height,
    xField,
    yField,
    format,
    xFormat,
    locale,
    timeZone,
    titlesOn,
    layout,
  ]);
  const marks = useMemo(
    () =>
      geometry.order.map((index) => ({
        x: geometry.px[index],
        y: geometry.py[index],
        r: points[index].r,
        color: points[index].color,
        muted: !selected[index],
      })),
    [geometry, points, selected],
  );
  return children({ ...geometry, marks });
}
