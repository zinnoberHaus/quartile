import type { ScatterPainter } from './scatter-types';

const VERTEX = `
attribute vec2 a_position;
attribute float a_radius;
attribute vec4 a_color;
attribute float a_opacity;
uniform vec2 u_resolution;
uniform mediump float u_dpr;
varying mediump vec4 v_color;
varying mediump float v_opacity;
varying mediump float v_diameter;
void main() {
  vec2 clip = a_position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_diameter = (a_radius * 2.0 + 1.0) * u_dpr;
  gl_PointSize = v_diameter;
  v_color = a_color;
  v_opacity = a_opacity;
}`;

const FRAGMENT = `
precision mediump float;
uniform vec4 u_surface;
uniform mediump float u_dpr;
varying mediump vec4 v_color;
varying mediump float v_opacity;
varying mediump float v_diameter;
void main() {
  float distance = length((gl_PointCoord - vec2(0.5)) * v_diameter);
  float radius = v_diameter * 0.5;
  if (distance > radius) discard;
  float edge = 1.0 - smoothstep(radius - 1.0, radius, distance);
  float ring = smoothstep(radius - u_dpr - 0.5, radius - u_dpr + 0.5, distance);
  vec4 fill = vec4(v_color.rgb, v_color.a * 0.72);
  vec4 color = mix(fill, u_surface, ring);
  gl_FragColor = vec4(color.rgb, color.a * v_opacity * edge);
}`;

function shader(gl: WebGLRenderingContext, kind: number, source: string) {
  const value = gl.createShader(kind);
  if (!value) throw new Error('webgl-shader-unavailable');
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    gl.deleteShader(value);
    throw new Error('webgl-shader-compilation');
  }
  return value;
}

export function createWebGLScatter(canvas: HTMLCanvasElement): ScatterPainter | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const release = () => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    buffer = null;
    program = null;
    vertex = null;
    fragment = null;
  };
  try {
    vertex = shader(gl, gl.VERTEX_SHADER, VERTEX);
    fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    buffer = gl.createBuffer();
    if (!program || !buffer) throw new Error('webgl-resource-unavailable');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('webgl-program-link');
    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const pixelRatio = gl.getUniformLocation(program, 'u_dpr');
    const surface = gl.getUniformLocation(program, 'u_surface');
    const attributes = [
      [gl.getAttribLocation(program, 'a_position'), 2, 0],
      [gl.getAttribLocation(program, 'a_radius'), 1, 2],
      [gl.getAttribLocation(program, 'a_color'), 4, 3],
      [gl.getAttribLocation(program, 'a_opacity'), 1, 7],
    ];
    const maxSize = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1];
    return {
      draw(marks, width, height, dpr, palette) {
        if (gl.isContextLost()) throw new Error('webgl-context-lost');
        const vertices = new Float32Array(marks.length * 8);
        marks.forEach((mark, index) => {
          if ((mark.r * 2 + 1) * dpr > maxSize) throw new Error('webgl-point-size-limit');
          const rgba = palette.colors.get(mark.color)?.rgba ?? palette.surface.rgba;
          const offset = index * 8;
          vertices[offset] = mark.x;
          vertices[offset + 1] = mark.y;
          vertices[offset + 2] = mark.r;
          vertices[offset + 3] = rgba[0];
          vertices[offset + 4] = rgba[1];
          vertices[offset + 5] = rgba[2];
          vertices[offset + 6] = rgba[3];
          vertices[offset + 7] = mark.muted ? 0.18 : 1;
        });
        const pixelWidth = Math.max(1, Math.round(width * dpr));
        const pixelHeight = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        // biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram is a context method, not a React hook.
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        for (const [location, count, offset] of attributes) {
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, count, gl.FLOAT, false, 32, offset * 4);
        }
        gl.uniform2f(resolution, width, height);
        gl.uniform1f(pixelRatio, dpr);
        gl.uniform4f(surface, ...palette.surface.rgba);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.POINTS, 0, marks.length);
      },
      dispose() {
        release();
        if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
      },
    };
  } catch (error) {
    release();
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    throw error;
  }
}
