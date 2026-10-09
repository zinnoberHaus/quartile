/** Projected coordinates and radii are always CSS pixels, independent of backing-store scale. */
export interface ScatterMark {
  x: number;
  y: number;
  r: number;
  color: string;
  muted: boolean;
}

export type ScatterRenderer = 'svg' | 'canvas' | 'webgl';

export interface ScatterRendererState {
  requested: ScatterRenderer;
  active: ScatterRenderer;
  reason?: string;
}
export type Rgba = readonly [number, number, number, number];

export interface ScatterPalette {
  colors: ReadonlyMap<string, { css: string; rgba: Rgba }>;
  surface: { css: string; rgba: Rgba };
}

export interface ScatterPainter {
  draw(
    marks: readonly ScatterMark[],
    width: number,
    height: number,
    dpr: number,
    palette: ScatterPalette,
  ): void;
  dispose(): void;
}
