import type { ScatterPainter } from './scatter-types';

export function createCanvasScatter(canvas: HTMLCanvasElement): ScatterPainter | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return {
    draw(marks, width, height, dpr, palette) {
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.surface.css;
      for (const mark of marks) {
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, mark.r, 0, Math.PI * 2);
        ctx.fillStyle = palette.colors.get(mark.color)?.css ?? palette.surface.css;
        ctx.globalAlpha = (mark.muted ? 0.18 : 1) * 0.72;
        ctx.fill();
        ctx.globalAlpha = mark.muted ? 0.18 : 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    dispose() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
