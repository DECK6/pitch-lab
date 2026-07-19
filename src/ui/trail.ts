import { frequencyToMidi } from '../music/pitch-math';

interface TrailPoint {
  time: number;
  midi: number | null;
}

export class PitchTrail {
  private readonly points: TrailPoint[] = [];
  private animationFrame = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const resize = new ResizeObserver(() => this.scheduleDraw());
    resize.observe(canvas);
  }

  push(time: number, frequencyHz: number | null, discontinuity = false): void {
    if (discontinuity) this.points.length = 0;
    const midi = frequencyHz === null ? null : frequencyToMidi(frequencyHz);
    this.points.push({ time, midi });
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
    const midis = this.points.flatMap(({ midi }) => midi === null ? [] : [midi]);
    if (midis.length < 2) return;
    const center = midis.reduce((sum, midi) => sum + midi, 0) / midis.length;
    const min = center - 1;
    const max = center + 1;
    context.strokeStyle = '#3477ad';
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.beginPath();
    let drawing = false;
    this.points.forEach((point) => {
      if (point.midi === null) {
        drawing = false;
        return;
      }
      const x = width - (now - point.time) / 4000 * width;
      const y = height - ((point.midi - min) / (max - min)) * height;
      if (!drawing) context.moveTo(x, y);
      else context.lineTo(x, y);
      drawing = true;
    });
    context.stroke();
    let last: TrailPoint | undefined;
    for (let index = this.points.length - 1; index >= 0; index -= 1) {
      if (this.points[index]?.midi !== null) {
        last = this.points[index];
        break;
      }
    }
    if (last?.midi !== null && last?.midi !== undefined) {
      const y = height - ((last.midi - min) / (max - min)) * height;
      const x = width - (now - last.time) / 4000 * width;
      if (x >= 0) {
        context.fillStyle = '#f45128';
        context.beginPath();
        context.arc(Math.min(width - 4, x), y, 5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
}
