import { useEffect, useRef, useState } from 'react';
import { useQuartile } from '../../provider/QuartileProvider';
import { createCanvasScatter } from './scatter-canvas';
import type {
  Rgba,
  ScatterMark,
  ScatterPainter,
  ScatterPalette,
  ScatterRenderer,
  ScatterRendererState,
} from './scatter-types';
import { createWebGLScatter } from './scatter-webgl';

interface MarksProps {
  marks: readonly ScatterMark[];
  width: number;
  height: number;
  renderer: ScatterRenderer;
  onRendererChange?: (state: ScatterRendererState) => void;
}

/** Resolves inherited CSS variables using the browser's CSS parser, including custom palettes. */
function paletteFor(canvas: HTMLCanvasElement, marks: readonly ScatterMark[]): ScatterPalette {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  canvas.parentElement?.append(probe);
  let colorContext: CanvasRenderingContext2D | null | undefined;
  const resolve = (value: string) => {
    probe.style.color = value;
    const css = getComputedStyle(probe).color;
    const rgb = css.match(/^rgba?\(([^)]+)\)$/);
    let rgba: Rgba;
    if (rgb) {
      const parts = rgb[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      rgba = [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1];
    } else {
      // Computed modern CSS colors (e.g. oklch) need conversion to the WebGL sRGB buffer.
      if (colorContext === undefined) {
        const swatch = document.createElement('canvas');
        swatch.width = 1;
        swatch.height = 1;
        colorContext = swatch.getContext('2d', { willReadFrequently: true });
      }
      if (!colorContext) throw new Error('color-conversion-unavailable');
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = css;
      colorContext.fillRect(0, 0, 1, 1);
      const pixel = colorContext.getImageData(0, 0, 1, 1).data;
      rgba = [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255, pixel[3] / 255];
    }
    return { css, rgba };
  };
  try {
    return {
      colors: new Map(
        [...new Set(marks.map((mark) => mark.color))].map((color) => [color, resolve(color)]),
      ),
      surface: resolve('var(--q-surface)'),
    };
  } finally {
    probe.remove();
  }
}

export function SvgScatterMarks({
  marks,
  onRendererChange,
}: Pick<MarksProps, 'marks' | 'onRendererChange'>) {
  const callback = useRef(onRendererChange);
  callback.current = onRendererChange;
  useEffect(() => {
    callback.current?.({ requested: 'svg', active: 'svg' });
  }, []);
  return marks.map((mark, index) => (
    <circle
      key={index}
      className="q-scatter-point"
      cx={mark.x}
      cy={mark.y}
      r={mark.r}
      style={{ fill: mark.color, stroke: 'var(--q-surface)' }}
      data-muted={mark.muted || undefined}
    />
  ));
}

function AcceleratedScatter({ marks, width, height, renderer, onRendererChange }: MarksProps) {
  const [mode, setMode] = useState(renderer);
  const [reason, setReason] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const redraw = useRef<() => void>(() => {});
  const latest = useRef({ marks, width, height, onRendererChange, reason });
  latest.current = { marks, width, height, onRendererChange, reason };
  const reported = useRef<string | undefined>(undefined);
  const { theme, density } = useQuartile();

  useEffect(() => {
    const report = () => {
      const key = `${mode}:${latest.current.reason ?? ''}`;
      if (reported.current === key) return;
      reported.current = key;
      latest.current.onRendererChange?.({
        requested: renderer,
        active: mode,
        reason: latest.current.reason,
      });
    };
    if (mode === 'svg') {
      report();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    let painter: ScatterPainter | null = null;
    let alive = true;
    let failed = false;
    const fallback = (cause: string) => {
      if (!alive || failed) return;
      failed = true;
      setReason(cause);
      setMode(mode === 'webgl' ? 'canvas' : 'svg');
    };
    const draw = () => {
      if (!alive || failed || !painter) return;
      const current = latest.current;
      try {
        const dpr = Math.max(0.1, window.devicePixelRatio || 1);
        painter.draw(
          current.marks,
          current.width,
          current.height,
          dpr,
          paletteFor(canvas, current.marks),
        );
      } catch (error) {
        fallback(error instanceof Error ? error.message : `${mode}-drawing-failed`);
        return;
      }
      report();
    };
    const lost = (event: Event) => {
      event.preventDefault();
      fallback(`${mode}-context-lost`);
    };
    canvas.addEventListener(mode === 'webgl' ? 'webglcontextlost' : 'contextlost', lost);
    try {
      painter = mode === 'webgl' ? createWebGLScatter(canvas) : createCanvasScatter(canvas);
      if (!painter) fallback(`${mode}-unavailable`);
    } catch (error) {
      fallback(error instanceof Error ? error.message : `${mode}-initialization-failed`);
    }
    redraw.current = draw;
    draw();
    const observer = new MutationObserver(draw);
    for (let node: HTMLElement | null = canvas.parentElement; node; node = node.parentElement) {
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-density'],
      });
    }
    let media: MediaQueryList | undefined;
    const pixelRatioChanged = () => {
      media?.removeEventListener('change', pixelRatioChanged);
      media = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      media?.addEventListener('change', pixelRatioChanged);
      draw();
    };
    pixelRatioChanged();
    window.addEventListener('resize', draw);
    return () => {
      alive = false;
      redraw.current = () => {};
      observer.disconnect();
      media?.removeEventListener('change', pixelRatioChanged);
      window.removeEventListener('resize', draw);
      canvas.removeEventListener(mode === 'webgl' ? 'webglcontextlost' : 'contextlost', lost);
      painter?.dispose();
    };
  }, [mode, renderer]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw reads the latest geometry and inherited provider tokens through refs.
  useEffect(() => {
    redraw.current();
  }, [marks, width, height, theme, density]);

  return mode === 'svg' ? (
    <svg
      className="q-scatter-marks"
      width={width}
      height={height}
      aria-hidden="true"
      data-renderer="svg"
      data-fallback-reason={reason}
    >
      <SvgScatterMarks marks={marks} />
    </svg>
  ) : (
    <canvas
      key={mode}
      ref={canvasRef}
      className="q-scatter-marks"
      aria-hidden="true"
      style={{ width, height }}
      data-renderer={mode}
      data-fallback-reason={reason}
    />
  );
}

export function ScatterMarks(props: MarksProps) {
  return <AcceleratedScatter key={props.renderer} {...props} />;
}
