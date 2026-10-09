import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataset } from '../../data/schema';
import { QuartileProvider } from '../../provider/QuartileProvider';
import { Selection, useSelection } from '../../selection/Selection';
import { ChartDataTable } from '../core/ChartFrame';
import { ScatterPlot } from '../ScatterPlot';
import { createCanvasScatter } from './scatter-canvas';
import type { ScatterPalette } from './scatter-types';
import { createWebGLScatter } from './scatter-webgl';

const rows = [
  { name: 'negative', group: 'a', x: -4, y: -2, size: 1 },
  { name: 'zero', group: 'b', x: 0, y: 0, size: 4 },
  { name: 'positive', group: 'a', x: 7, y: 9, size: 9 },
  { name: 'null', group: 'b', x: null, y: 2, size: 1 },
  { name: 'infinite', group: 'b', x: Number.POSITIVE_INFINITY, y: 2, size: 1 },
];

function canvasContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
  };
}

function webglContext() {
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ALIASED_POINT_SIZE_RANGE: 5,
    ARRAY_BUFFER: 6,
    DYNAMIC_DRAW: 7,
    COLOR_BUFFER_BIT: 8,
    FLOAT: 9,
    BLEND: 10,
    SRC_ALPHA: 11,
    ONE_MINUS_SRC_ALPHA: 12,
    ONE: 13,
    POINTS: 14,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    deleteBuffer: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    getAttribLocation: vi.fn(() => 0),
    getParameter: vi.fn(() => new Float32Array([1, 1024])),
    isContextLost: vi.fn(() => false),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    uniform4f: vi.fn(),
    enable: vi.fn(),
    blendFuncSeparate: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
  };
}

const palette: ScatterPalette = {
  colors: new Map([['blue', { css: '#2f45e8', rgba: [47 / 255, 69 / 255, 232 / 255, 1] }]]),
  surface: { css: '#ffffff', rgba: [1, 1, 1, 1] },
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 240,
    width: 400,
    height: 240,
    toJSON() {},
  } as DOMRect);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element) =>
      ({
        getPropertyValue: () => '',
        color:
          element.closest('[data-theme]')?.getAttribute('data-theme') === 'dark'
            ? 'rgb(190, 200, 250)'
            : 'rgb(47, 69, 232)',
      }) as unknown as CSSStyleDeclaration,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('scatter accelerated painters', () => {
  it('draws Canvas circles at CSS coordinates with a DPR-sized backing store', () => {
    const ctx = canvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const canvas = document.createElement('canvas');
    const painter = createCanvasScatter(canvas)!;
    painter.draw([{ x: 10, y: 20, r: 4, color: 'blue', muted: false }], 200, 100, 2, palette);
    expect([canvas.width, canvas.height]).toEqual([400, 200]);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.arc).toHaveBeenCalledWith(10, 20, 4, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.stroke).toHaveBeenCalledOnce();
    painter.dispose();
    expect(canvas.width).toBe(0);
  });

  it('uploads actual WebGL vertices, draws points and releases GPU resources', () => {
    const gl = webglContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      gl as unknown as WebGLRenderingContext,
    );
    const canvas = document.createElement('canvas');
    const painter = createWebGLScatter(canvas)!;
    painter.draw([{ x: 10, y: 20, r: 4, color: 'blue', muted: true }], 200, 100, 2, palette);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.POINTS, 0, 1);
    const uploaded = gl.bufferData.mock.calls[0][1] as Float32Array;
    expect([...uploaded.slice(0, 3)]).toEqual([10, 20, 4]);
    expect(uploaded[7]).toBeCloseTo(0.18);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 400, 200);
    painter.dispose();
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('cleans up on shader failure instead of retaining an unusable context', () => {
    const gl = webglContext();
    gl.getShaderParameter.mockReturnValue(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      gl as unknown as WebGLRenderingContext,
    );
    expect(() => createWebGLScatter(document.createElement('canvas'))).toThrow(
      'webgl-shader-compilation',
    );
    expect(gl.deleteShader).toHaveBeenCalledOnce();
  });
});

describe('ScatterPlot renderer parity', () => {
  it('keeps SVG as default and ignores null/nonfinite positions without poisoning axes', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const { container } = render(<ScatterPlot data={rows} x="x" y="y" size="size" />);
    expect(container.querySelectorAll('.q-scatter-point')).toHaveLength(3);
    expect(container.innerHTML).not.toMatch(/cx="(?:NaN|Infinity)"/);
    expect(getContext).not.toHaveBeenCalled();
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('preserves keyboard selection and excludes its own predicates on Canvas', () => {
    const ctx = canvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    function Selected() {
      const selection = useSelection();
      return <output>{selection.predicates.map((p) => `${p.field}:${p.value}`).join(';')}</output>;
    }
    const { container } = render(
      <Selection>
        <ScatterPlot data={rows} renderer="canvas" x="x" y="y" color="group" select />
        <Selected />
      </Selection>,
    );
    expect(container.querySelector('canvas[data-renderer="canvas"]')).not.toBeNull();
    const plot = screen.getByRole('application');
    act(() => plot.focus());
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(container.querySelector('output')?.textContent).toBe('group:a');
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(3);
    fireEvent.keyDown(plot, { key: 'End' });
    expect(container.querySelector('.q-chart-tooltip')?.textContent).toContain('9');
  });

  it('preserves nominal ISO strings and null identities in typed query selection', () => {
    const first = '2026-10-09T00:00:00Z';
    const second = '2026-10-08T20:00:00-04:00';
    const data = dataset(
      [
        { key: first, x: 0, y: 1 },
        { key: second, x: 1, y: 2 },
        { key: null, x: 2, y: 3 },
      ],
      { key: { type: 'nominal' } },
    );
    const report = vi.fn();
    const { container } = render(
      <Selection>
        <ScatterPlot data={data} x="x" y="y" select="key" typedSelection onSelect={report} />
      </Selection>,
    );
    const plot = screen.getByRole('application');
    act(() => plot.focus());
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(report.mock.lastCall?.[0].value).toEqual([first]);
    expect(container.querySelectorAll('.q-scatter-point:not([data-muted])')).toHaveLength(1);
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    fireEvent.keyDown(plot, { key: 'Enter', shiftKey: true });
    expect(report.mock.lastCall?.[0].value).toEqual([first, second]);
    expect(container.querySelectorAll('.q-scatter-point:not([data-muted])')).toHaveLength(2);
    fireEvent.keyDown(plot, { key: 'End' });
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(report.mock.lastCall?.[0].value).toEqual([null]);
    expect(container.querySelectorAll('.q-scatter-point:not([data-muted])')).toHaveLength(1);
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(report.mock.lastCall?.[0]).toBeNull();
    expect(container.querySelectorAll('.q-scatter-point:not([data-muted])')).toHaveLength(3);
  });

  it('falls back from a lost WebGL context to a fresh Canvas surface', () => {
    const gl = webglContext();
    const ctx = canvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (kind) => (kind === 'webgl' ? gl : ctx) as unknown as RenderingContext,
    );
    const report = vi.fn();
    const { container, unmount } = render(
      <ScatterPlot data={rows} renderer="webgl" onRendererChange={report} x="x" y="y" />,
    );
    expect(report).toHaveBeenLastCalledWith({
      requested: 'webgl',
      active: 'webgl',
      reason: undefined,
    });
    const first = container.querySelector('canvas')!;
    expect(first.dataset.renderer).toBe('webgl');
    act(() => first.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    const next = container.querySelector('canvas')!;
    expect(next).not.toBe(first);
    expect(next.dataset.renderer).toBe('canvas');
    expect(next.dataset.fallbackReason).toBe('webgl-context-lost');
    expect(report).toHaveBeenLastCalledWith({
      requested: 'webgl',
      active: 'canvas',
      reason: 'webgl-context-lost',
    });
    expect(report).toHaveBeenCalledTimes(2);
    unmount();
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(next.width).toBe(0);
  });

  it('falls back to SVG when both accelerated contexts are unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(<ScatterPlot data={rows} renderer="webgl" x="x" y="y" />);
    expect(container.querySelector('[data-renderer="svg"]')).not.toBeNull();
    expect(container.querySelectorAll('.q-scatter-point')).toHaveLength(3);
    expect(screen.getByRole('application')).toBeTruthy();
  });

  it('redraws token colors when the provider theme changes', () => {
    const ctx = canvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const { rerender } = render(
      <QuartileProvider theme="light">
        <ScatterPlot data={rows} renderer="canvas" x="x" y="y" />
      </QuartileProvider>,
    );
    expect(ctx.fillStyle).toBe('rgb(47, 69, 232)');
    rerender(
      <QuartileProvider theme="dark">
        <ScatterPlot data={rows} renderer="canvas" x="x" y="y" />
      </QuartileProvider>,
    );
    expect(ctx.fillStyle).toBe('rgb(190, 200, 250)');
  });

  it('does not mount raster contexts in loading, error or empty states, or on the server', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const { rerender } = render(<ScatterPlot data={rows} renderer="webgl" x="x" y="y" loading />);
    rerender(<ScatterPlot data={rows} renderer="webgl" x="x" y="y" error="failed" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(<ScatterPlot data={[]} renderer="webgl" x="x" y="y" />);
    expect(screen.getByText('No data to show')).toBeTruthy();
    expect(renderToString(<ScatterPlot data={rows} renderer="webgl" x="x" y="y" />)).toContain(
      'role="figure"',
    );
    expect(getContext).not.toHaveBeenCalled();
  });
});

describe('bounded exact chart tables', () => {
  it('formats only the current page and reaches the exact final row', () => {
    const getRow = vi.fn((index: number) => [`row-${index}`, index]);
    render(
      <ChartDataTable
        table={{ columns: ['Row', 'Value'], rows: [], rowCount: 102, getRow, pageSize: 50 }}
        visible
      />,
    );
    expect(getRow).toHaveBeenCalledTimes(50);
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Next rows' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next rows' }));
    expect(screen.getByText('row-101')).toBeTruthy();
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Next rows' }).hasAttribute('disabled')).toBe(true);
  });

  it('exposes lazy exact data without a full hidden table in large chart mode', () => {
    const data = Array.from({ length: 1000 }, (_, index) => ({ x: index, y: index * 2 }));
    const { container } = render(<ScatterPlot data={data} x="x" y="y" />);
    expect(container.querySelector('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View data table (1000 rows)' }));
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(50);
    expect(screen.queryByRole('application')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View chart' }));
    expect(screen.getByRole('application')).toBeTruthy();
    expect(container.querySelector('table')).toBeNull();
  });
});
