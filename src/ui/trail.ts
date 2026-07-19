import { frequencyToNote } from '../music/pitch-math';

export interface TrailPoint {
  time: number;
  midi: number | null;
  cents: number | null;
  breakBefore: boolean;
}

interface PlotPoint {
  x: number;
  y: number;
}

export interface TrailPlot {
  segments: PlotPoint[][];
  marker: PlotPoint | null;
}

export function makeTrailPoint(time: number, frequencyHz: number | null, breakBefore = false): TrailPoint {
  const note = frequencyHz === null ? null : frequencyToNote(frequencyHz);
  return {
    time,
    midi: note?.midi ?? null,
    cents: note?.cents ?? null,
    breakBefore,
  };
}

export function projectTrail(points: TrailPoint[], now: number, width: number, height: number): TrailPlot {
  const segments: PlotPoint[][] = [];
  let segment: PlotPoint[] = [];
  let previous: TrailPoint | null = null;
  let marker: PlotPoint | null = null;

  for (const point of points) {
    if (point.midi === null || point.cents === null) {
      segment = [];
      previous = null;
      continue;
    }
    const x = width - (now - point.time) / 4000 * width;
    const y = height - (Math.max(-50, Math.min(50, point.cents)) + 50) / 100 * height;
    const shouldBreak = point.breakBefore
      || previous === null
      || previous.midi !== point.midi
      || point.time - previous.time > 250
      || (previous.cents !== null && Math.abs(point.cents - previous.cents) > 35);
    if (shouldBreak) {
      segment = [];
      segments.push(segment);
    }
    const plotted = { x, y };
    segment.push(plotted);
    marker = plotted;
    previous = point;
  }

  return { segments, marker };
}

export class PitchTrail {
  private readonly points: TrailPoint[] = [];
  private animationFrame = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const resize = new ResizeObserver(() => this.scheduleDraw());
    resize.observe(canvas);
  }

  push(time: number, frequencyHz: number | null, discontinuity = false): void {
    this.points.push(makeTrailPoint(time, frequencyHz, discontinuity));
    while (this.points[0] && time - this.points[0].time > 4000) this.points.shift();
    this.scheduleDraw();
  }

  clear(): void {
    this.points.length = 0;
    this.scheduleDraw();
  }

  private scheduleDraw(): void {
    if (this.animationFrame) return;
    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    if (this.canvas.width !== width * ratio || this.canvas.height !== height * ratio) {
      this.canvas.width = width * ratio;
      this.canvas.height = height * ratio;
    }
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = '#a7a497';
    context.lineWidth = 1;
    for (let row = 1; row < 4; row += 1) {
      const y = row * height / 4;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    if (this.points.length < 2) return;
    const now = this.points[this.points.length - 1]?.time ?? 0;
    const plot = projectTrail(this.points, now, width, height);
    context.strokeStyle = '#3477ad';
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.beginPath();
    for (const segment of plot.segments) {
      const [first, ...rest] = segment;
      if (!first || rest.length === 0) continue;
      context.moveTo(first.x, first.y);
      for (const point of rest) context.lineTo(point.x, point.y);
    }
    context.stroke();
    if (plot.marker && plot.marker.x >= 0) {
      context.fillStyle = '#f45128';
      context.beginPath();
      context.arc(
        Math.max(5, Math.min(width - 5, plot.marker.x)),
        Math.max(5, Math.min(height - 5, plot.marker.y)),
        5,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
}
