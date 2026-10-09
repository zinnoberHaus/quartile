import { scaleLinear } from 'd3-scale';
import { type ReactNode, useMemo } from 'react';
import type { FieldDef, Formatter } from '../../data/types';
import { monoTextWidth, tickFormatter } from '../core/scales';
import { createScatterIndex } from './scatter-picking';
import type { ScatterMark } from './scatter-types';

interface GeometryPoint {
  x: number;
  y: number;
  r: number;
  color: string;
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
  titlesOn: boolean;
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
  }) => ReactNode;
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
  titlesOn,
}: GeometryProps) {
  const geometry = useMemo(() => {
    const plotHeight = Math.max(1, height);
    const top = 8;
    const bottom = Math.max(top + 1, plotHeight - 20 - (titlesOn ? 18 : 0));
    const maxR = points.reduce((value, point) => Math.max(value, point.r), 4.5);
    const ys = scaleLinear().domain(domains.y).nice(4);
    const fmtYTick = tickFormatter({ ...yField, format: format ?? yField.format }, locale);
    const yTickVals = ys.ticks(4);
    const left =
      Math.ceil(Math.max(16, ...yTickVals.map((value) => monoTextWidth(fmtYTick(value))))) + 12;
    const right = Math.max(left + 1, width - 4);
    ys.range([bottom - maxR * 0.6, top + maxR * 0.6]);
    const xs = scaleLinear()
      .domain(domains.x)
      .nice(5)
      .range([left + maxR * 0.6, right - maxR * 0.6]);
    const fmtXTick = tickFormatter({ ...xField, format: xFormat ?? xField.format }, locale);
    const count = Math.max(2, Math.min(6, Math.floor((right - left) / 80)));
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
      xTicks: xs.ticks(count).map((value) => ({ x: xs(value), label: fmtXTick(value) })),
      yTicks: yTickVals.map((value) => ({ y: ys(value), label: fmtYTick(value) })),
    };
  }, [points, domains, width, height, xField, yField, format, xFormat, locale, titlesOn]);
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
