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

export const TRAIL_SMOOTHING_MS = 160;
export const TRAIL_DEADBAND_CENTS = 1.5;
export const TRAIL_RANGE_SEMITONES = 24;

function pitchCents(point: TrailPoint): number | null {
  if (point.midi === null || point.cents === null) return null;
  return point.midi * 100 + point.cents;
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

export function smoothTrailPoints(points: TrailPoint[]): TrailPoint[] {
  let previousRaw: TrailPoint | null = null;
  let previousRawPitchCents: number | null = null;
  let previousSmoothedPitchCents: number | null = null;

  return points.map((point) => {
    const rawPitchCents = pitchCents(point);
    if (rawPitchCents === null) {
      previousRaw = null;
      previousRawPitchCents = null;
      previousSmoothedPitchCents = null;
      return point;
    }

    const gapMs = previousRaw === null ? 0 : point.time - previousRaw.time;
    const shouldReset = point.breakBefore
      || previousRaw === null
      || gapMs > 250
      || previousRawPitchCents === null
      || Math.abs(rawPitchCents - previousRawPitchCents) > 35;
    let smoothedPitchCents = rawPitchCents;

    if (!shouldReset && previousSmoothedPitchCents !== null) {
      const difference = rawPitchCents - previousSmoothedPitchCents;
      if (Math.abs(difference) <= TRAIL_DEADBAND_CENTS) {
        smoothedPitchCents = previousSmoothedPitchCents;
      } else {
        const alpha = 1 - Math.exp(-Math.max(0, gapMs) / TRAIL_SMOOTHING_MS);
        smoothedPitchCents = previousSmoothedPitchCents + difference * alpha;
      }
    }

    const midi = Math.round(smoothedPitchCents / 100);
    const smoothed = {
      ...point,
      midi,
      cents: smoothedPitchCents - midi * 100,
      breakBefore: shouldReset,
    };
    previousRaw = point;
    previousRawPitchCents = rawPitchCents;
    previousSmoothedPitchCents = smoothedPitchCents;
    return smoothed;
  });
}

export function projectTrail(
  points: TrailPoint[],
  now: number,
  width: number,
  height: number,
  rangeStartMidi?: number,
): TrailPlot {
  const segments: PlotPoint[][] = [];
  let segment: PlotPoint[] = [];
  let previous: TrailPoint | null = null;
  let marker: PlotPoint | null = null;
  const smoothedPoints = smoothTrailPoints(points);
  const firstPitchCents = smoothedPoints.map(pitchCents).find((value) => value !== null);
  const resolvedRangeStart = rangeStartMidi ?? (firstPitchCents === undefined || firstPitchCents === null
    ? 48
    : firstPitchCents / 100 - TRAIL_RANGE_SEMITONES / 2);
  const rangeEnd = resolvedRangeStart + TRAIL_RANGE_SEMITONES;

  for (const point of smoothedPoints) {
    const absolutePitchCents = pitchCents(point);
    if (absolutePitchCents === null) {
      segment = [];
      previous = null;
      continue;
    }
    const x = width - (now - point.time) / 4000 * width;
    const absoluteMidi = absolutePitchCents / 100;
    const clampedMidi = Math.max(resolvedRangeStart, Math.min(rangeEnd, absoluteMidi));
    const y = height - (clampedMidi - resolvedRangeStart) / TRAIL_RANGE_SEMITONES * height;
    const shouldBreak = point.breakBefore
      || previous === null
      || point.time - previous.time > 250;
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
  private rangeStartMidi: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const resize = new ResizeObserver(() => this.scheduleDraw());
    resize.observe(canvas);
  }

  push(time: number, frequencyHz: number | null, discontinuity = false): void {
    const point = makeTrailPoint(time, frequencyHz, discontinuity);
    const absolutePitchCents = pitchCents(point);
    if (absolutePitchCents !== null) {
      const absoluteMidi = absolutePitchCents / 100;
      if (this.rangeStartMidi === null
        || absoluteMidi < this.rangeStartMidi
        || absoluteMidi > this.rangeStartMidi + TRAIL_RANGE_SEMITONES) {
        this.rangeStartMidi = absoluteMidi - TRAIL_RANGE_SEMITONES / 2;
      }
    }
    this.points.push(point);
    while (this.points[0] && time - this.points[0].time > 4000) this.points.shift();
    this.scheduleDraw();
  }

  clear(): void {
    this.points.length = 0;
    this.rangeStartMidi = null;
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
    const plot = projectTrail(this.points, now, width, height, this.rangeStartMidi ?? undefined);
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
