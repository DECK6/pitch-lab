export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DetectedNote {
  x: number;
  y: number;
  diatonicStep: number;
  confidence: number;
}

export interface DetectedStaff {
  lines: number[];
  spacing: number;
  xStart: number;
  xEnd: number;
  barlines: number[];
  notes: DetectedNote[];
}

export interface StaffDetectionResult {
  staves: DetectedStaff[];
}

interface Candidate {
  x: number;
  y: number;
  score: number;
}

export function detectStaffNotes(image: RasterImage): StaffDetectionResult {
  if (image.width < 40 || image.height < 40 || image.data.length < image.width * image.height * 4) return { staves: [] };
  const mask = new Uint8Array(image.width * image.height);
  const rowCounts = new Uint32Array(image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = (y * image.width + x) * 4;
      const alpha = image.data[pixel + 3] ?? 255;
      const luminance = ((image.data[pixel] ?? 255) * 299 + (image.data[pixel + 1] ?? 255) * 587 + (image.data[pixel + 2] ?? 255) * 114) / 1000;
      if (alpha > 80 && luminance < 150) {
        mask[y * image.width + x] = 1;
        rowCounts[y] = (rowCounts[y] ?? 0) + 1;
      }
    }
  }
  const lineRows = groupedCenters([...rowCounts].map((count, y) => count >= image.width * 0.22 ? y : -1).filter((y) => y >= 0));
  const staffLines = groupFiveLines(lineRows);
  const withoutLines = mask.slice();
  staffLines.flat().forEach((lineY) => {
    for (let y = Math.max(0, lineY - 1); y <= Math.min(image.height - 1, lineY + 1); y += 1) {
      withoutLines.fill(0, y * image.width, (y + 1) * image.width);
    }
  });
  const integral = integralImage(withoutLines, image.width, image.height);
  const staves = staffLines.map((lines) => {
    const spacing = median(lines.slice(1).map((line, index) => line - (lines[index] ?? line))) ?? 10;
    const extents = lines.map((lineY) => rowExtent(mask, image.width, lineY)).filter((extent): extent is [number, number] => extent !== null);
    const xStart = Math.max(0, Math.min(...extents.map((extent) => extent[0])));
    const xEnd = Math.min(image.width - 1, Math.max(...extents.map((extent) => extent[1])));
    const barlines = detectBarlines(mask, image.width, lines, xStart, xEnd, spacing);
    const notes = detectNotes(integral, image.width, image.height, lines, xStart, xEnd, spacing, barlines);
    return { lines, spacing, xStart, xEnd, barlines, notes };
  });
  return { staves };
}

function groupFiveLines(rows: number[]): number[][] {
  const groups: number[][] = [];
  for (let index = 0; index <= rows.length - 5;) {
    const candidate = rows.slice(index, index + 5);
    const gaps = candidate.slice(1).map((row, gapIndex) => row - (candidate[gapIndex] ?? row));
    const spacing = median(gaps) ?? 0;
    const regular = spacing >= 4 && spacing <= 40 && gaps.every((gap) => Math.abs(gap - spacing) <= Math.max(2, spacing * 0.35));
    if (regular) {
      groups.push(candidate);
      index += 5;
    } else {
      index += 1;
    }
  }
  return groups;
}

function detectBarlines(mask: Uint8Array, width: number, lines: number[], xStart: number, xEnd: number, spacing: number): number[] {
  const top = Math.max(0, Math.round(lines[0] ?? 0));
  const bottom = Math.round(lines[4] ?? top);
  const candidates: number[] = [];
  for (let x = xStart; x <= xEnd; x += 1) {
    let dark = 0;
    for (let y = top; y <= bottom; y += 1) dark += mask[y * width + x] ?? 0;
    if (dark >= (bottom - top + 1) * 0.72) candidates.push(x);
  }
  const centers = groupedCenters(candidates);
  const withEdges = [xStart, ...centers, xEnd].sort((a, b) => a - b);
  return withEdges.filter((x, index) => index === 0 || x - (withEdges[index - 1] ?? x) >= Math.max(2, spacing * 0.6));
}

function detectNotes(
  integral: Uint32Array,
  width: number,
  height: number,
  lines: number[],
  xStart: number,
  xEnd: number,
  spacing: number,
  barlines: number[],
): DetectedNote[] {
  const halfWidth = Math.max(3, Math.round(spacing * 0.75));
  const halfHeight = Math.max(2, Math.round(spacing * 0.55));
  const top = Math.max(halfHeight, Math.round((lines[0] ?? 0) - spacing * 2.4));
  const bottom = Math.min(height - halfHeight - 1, Math.round((lines[4] ?? 0) + spacing * 2.4));
  const candidates: Candidate[] = [];
  const stepX = Math.max(1, Math.round(spacing / 4));
  const stepY = Math.max(1, Math.round(spacing / 5));
  const windowArea = (halfWidth * 2 + 1) * (halfHeight * 2 + 1);
  for (let y = top; y <= bottom; y += stepY) {
    for (let x = xStart + halfWidth; x <= xEnd - halfWidth; x += stepX) {
      if (barlines.some((barline) => Math.abs(barline - x) < spacing * 0.65)) continue;
      const score = rectSum(integral, width, x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight);
      if (score >= windowArea * 0.16) candidates.push({ x, y, score });
    }
  }
  const selected: Candidate[] = [];
  candidates.sort((a, b) => b.score - a.score).forEach((candidate) => {
    if (selected.some((item) => Math.abs(item.x - candidate.x) < spacing * 1.05 && Math.abs(item.y - candidate.y) < spacing * 0.78)) return;
    selected.push(candidate);
  });
  const merged: Candidate[] = [];
  selected.sort((a, b) => a.x - b.x || a.y - b.y).forEach((candidate) => {
    const match = merged.find((item) => Math.abs(item.x - candidate.x) < spacing * 0.8 && Math.abs(item.y - candidate.y) <= spacing * 1.2);
    if (!match) {
      merged.push({ ...candidate });
      return;
    }
    const total = match.score + candidate.score;
    match.x = (match.x * match.score + candidate.x * candidate.score) / total;
    match.y = (match.y * match.score + candidate.y * candidate.score) / total;
    match.score = total;
  });
  const maxScore = Math.max(1, ...merged.map((candidate) => candidate.score));
  const bottomLine = lines[4] ?? 0;
  return merged
    .map((candidate) => ({
      x: Math.round(candidate.x),
      y: Math.round(candidate.y),
      diatonicStep: Math.round((bottomLine - candidate.y) / (spacing / 2)),
      confidence: Math.max(0, Math.min(1, candidate.score / maxScore)),
    }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

function integralImage(mask: Uint8Array, width: number, height: number): Uint32Array {
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += mask[(y - 1) * width + x - 1] ?? 0;
      integral[y * stride + x] = (integral[(y - 1) * stride + x] ?? 0) + row;
    }
  }
  return integral;
}

function rectSum(integral: Uint32Array, width: number, left: number, top: number, right: number, bottom: number): number {
  const stride = width + 1;
  const x1 = Math.max(0, left);
  const y1 = Math.max(0, top);
  const x2 = Math.min(width, right + 1);
  const y2 = Math.max(y1, bottom + 1);
  return (integral[y2 * stride + x2] ?? 0) - (integral[y1 * stride + x2] ?? 0)
    - (integral[y2 * stride + x1] ?? 0) + (integral[y1 * stride + x1] ?? 0);
}

function rowExtent(mask: Uint8Array, width: number, y: number): [number, number] | null {
  let start = -1;
  let end = -1;
  for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    if (start < 0) start = x;
    end = x;
  }
  return start >= 0 ? [start, end] : null;
}

function groupedCenters(values: number[]): number[] {
  const groups: number[][] = [];
  values.sort((a, b) => a - b).forEach((value) => {
    const current = groups[groups.length - 1];
    if (!current || value - (current[current.length - 1] ?? value) > 1) groups.push([value]);
    else current.push(value);
  });
  return groups.map((group) => Math.round(group.reduce((sum, value) => sum + value, 0) / group.length));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}
