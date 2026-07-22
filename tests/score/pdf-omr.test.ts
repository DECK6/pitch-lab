import { describe, expect, it } from 'vitest';
import { detectStaffNotes } from '../../src/score/pdf-image-analysis';

function syntheticStaff(): { width: number; height: number; data: Uint8ClampedArray } {
  const width = 420;
  const height = 180;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const dark = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = (y * width + x) * 4;
    data[offset] = 20; data[offset + 1] = 20; data[offset + 2] = 20; data[offset + 3] = 255;
  };
  [60, 70, 80, 90, 100].forEach((y) => {
    for (let x = 20; x <= 400; x += 1) dark(x, y);
  });
  [20, 210, 400].forEach((x) => {
    for (let y = 60; y <= 100; y += 1) dark(x, y);
  });
  const ellipse = (cx: number, cy: number) => {
    for (let y = cy - 4; y <= cy + 4; y += 1) {
      for (let x = cx - 6; x <= cx + 6; x += 1) {
        if (((x - cx) / 6) ** 2 + ((y - cy) / 4) ** 2 <= 1) dark(x, y);
      }
    }
  };
  ellipse(80, 100);
  ellipse(150, 95);
  ellipse(270, 90);
  ellipse(340, 85);
  return { width, height, data };
}

describe('local PDF staff recognition', () => {
  it('finds a printed staff, ignores barlines, and maps vertical note positions', () => {
    const result = detectStaffNotes(syntheticStaff());
    expect(result.staves).toHaveLength(1);
    const staff = result.staves[0];
    expect(staff?.spacing).toBeCloseTo(10, 0);
    expect(staff?.barlines.length).toBeGreaterThanOrEqual(3);
    expect(staff?.notes).toHaveLength(4);
    expect(staff?.notes.map((note) => note.diatonicStep)).toEqual([0, 1, 2, 3]);
    expect(staff?.notes.map((note) => note.x)).toEqual([79, 148, 268, 340]);
  });

  it('returns a recoverable empty result when no staff exists', () => {
    const data = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    expect(detectStaffNotes({ width: 100, height: 100, data }).staves).toEqual([]);
  });
});
