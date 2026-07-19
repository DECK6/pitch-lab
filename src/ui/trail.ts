import { frequencyToMidi } from '../music/pitch-math';

interface TrailPoint {
  time: number;
  midi: number;
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
    if (midi !== null) this.points.push({ time, midi });
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
    const midis = this.points.map(({ midi }) => midi);
    const center = midis.reduce((sum, midi) => sum + midi, 0) / midis.length;
    const min = center - 1;
    const max = center + 1;
    context.strokeStyle = '#3477ad';
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.beginPath();
    this.points.forEach((point, index) => {
      const x = width - (now - point.time) / 4000 * width;
      const y = height - ((point.midi - min) / (max - min)) * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    const last = this.points[this.points.length - 1];
    if (last) {
      const y = height - ((last.midi - min) / (max - min)) * height;
      context.fillStyle = '#f45128';
      context.beginPath();
      context.arc(width - 4, y, 5, 0, Math.PI * 2);
      context.fill();
    }
  }
}

