import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { ImportWarning, ScoreDocument, ScorePart, TargetNoteEvent } from './contracts';
import { detectStaffNotes, type DetectedStaff } from './pdf-image-analysis';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 8;
const MAX_RENDER_PIXELS = 4_000_000;

if (!GlobalWorkerOptions.workerPort) GlobalWorkerOptions.workerPort = new PdfWorker();

export interface PdfRecognitionOptions {
  stavesPerSystem?: 1 | 2 | 4;
  onProgress?: (completedPages: number, totalPages: number) => void;
}

interface PageDetection {
  staves: DetectedStaff[];
}

export async function recognizePdfScore(file: File, options: PdfRecognitionOptions = {}): Promise<ScoreDocument> {
  if (file.size === 0 || file.size > MAX_PDF_BYTES) throw new Error('PDF must be between 1 byte and 20 MB.');
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('Choose a printed PDF score.');
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()), stopAtErrors: true, useWorkerFetch: false });
  let pdf: PDFDocumentProxy | null = null;
  try {
    pdf = await loadingTask.promise;
    const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const detections: PageDetection[] = [];
    let previewDataUrl = '';
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1_400 / Math.max(1, baseViewport.width), Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, baseViewport.width * baseViewport.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser could not create a PDF recognition canvas.');
      await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
      if (pageNumber === 1) previewDataUrl = canvas.toDataURL('image/jpeg', 0.74);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      detections.push(detectStaffNotes(image));
      page.cleanup();
      options.onProgress?.(pageNumber, pageLimit);
    }
    const totalStaves = detections.reduce((total, page) => total + page.staves.length, 0);
    const totalNotes = detections.reduce((total, page) => total + page.staves.reduce((sum, staff) => sum + staff.notes.length, 0), 0);
    if (totalStaves === 0 || totalNotes === 0) throw new Error('No readable five-line staff and noteheads were found. Try a clean printed PDF or MusicXML.');
    const stavesPerSystem = options.stavesPerSystem ?? inferStavesPerSystem(detections);
    return buildPdfScore(file.name || 'score.pdf', detections, stavesPerSystem, previewDataUrl, pdf.numPages > pageLimit);
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

function buildPdfScore(fileName: string, pages: PageDetection[], stavesPerSystem: 1 | 2 | 4, previewDataUrl: string, truncated: boolean): ScoreDocument {
  const parts: ScorePart[] = Array.from({ length: stavesPerSystem }, (_, index) => ({
    id: `PDF-LINE-${index + 1}`,
    name: stavesPerSystem === 4 ? ['SOPRANO', 'ALTO', 'TENOR', 'BASS'][index] ?? `PDF LINE ${index + 1}` : `PDF LINE ${index + 1}`,
    voices: [{ id: `PDF-LINE-${index + 1}:s1:v1`, partId: `PDF-LINE-${index + 1}`, staff: 1, voice: '1', events: [] }],
  }));
  let globalBeat = 0;
  let globalMeasure = 1;

  pages.forEach((page) => {
    for (let offset = 0; offset < page.staves.length; offset += stavesPerSystem) {
      const system = page.staves.slice(offset, offset + stavesPerSystem);
      if (system.length === 0) continue;
      const measures = Math.max(1, ...system.map((staff) => Math.max(1, staff.barlines.length - 1)));
      system.forEach((staff, slot) => {
        const voice = parts[slot]?.voices[0];
        if (!voice) return;
        const boundaries = normalizedBoundaries(staff);
        const clef = clefForSlot(stavesPerSystem, slot);
        const events = staff.notes.map((note, noteIndex): TargetNoteEvent => {
          const segment = Math.max(0, boundaries.findIndex((right, index) => index > 0 && note.x <= right) - 1);
          const left = boundaries[segment] ?? staff.xStart;
          const right = boundaries[segment + 1] ?? staff.xEnd;
          const fraction = Math.max(0, Math.min(0.999, (note.x - left) / Math.max(1, right - left)));
          const onsetInMeasure = Math.max(0, Math.min(3.5, Math.round(fraction * 8) / 2));
          const writtenMidi = diatonicStaffMidi(clef, note.diatonicStep);
          return {
            id: `${voice.id}:m${globalMeasure + segment}:n${noteIndex + 1}`,
            measure: globalMeasure + segment,
            onsetBeat: globalBeat + segment * 4 + onsetInMeasure,
            durationBeats: 1,
            writtenMidi,
            soundingMidi: writtenMidi,
            confidence: note.confidence >= 0.78 ? 'medium' : 'low',
            sourceX: note.x,
            sourceY: note.y,
          };
        }).sort((a, b) => a.onsetBeat - b.onsetBeat || b.soundingMidi - a.soundingMidi);
        events.forEach((event, index) => {
          const next = events[index + 1];
          const measureEnd = globalBeat + (event.measure - globalMeasure + 1) * 4;
          event.durationBeats = Math.max(0.5, Math.min(4, (next?.onsetBeat ?? measureEnd) - event.onsetBeat));
        });
        voice.events.push(...events);
      });
      globalBeat += measures * 4;
      globalMeasure += measures;
    }
  });

  const warnings: ImportWarning[] = [{
    code: 'PDF_REVIEW_REQUIRED',
    severity: 'blocking',
    message: 'PDF noteheads and staff lanes are an estimate. Confirm the line, clef/octave, pitch, onset, and duration before grading.',
  }];
  if (truncated) warnings.push({ code: 'PDF_PAGE_LIMIT', severity: 'warning', message: `Only the first ${MAX_PDF_PAGES} pages were recognized in this preview.` });
  return {
    sourceKind: 'pdf',
    fileName,
    title: fileName.replace(/\.pdf$/i, ''),
    measureCount: Math.max(1, globalMeasure - 1),
    durationBeats: Math.max(4, globalBeat),
    parts: parts.filter((part) => (part.voices[0]?.events.length ?? 0) > 0),
    tempoMap: [{ beat: 0, bpm: 120, measure: 1 }],
    keyMap: [{ beat: 0, fifths: 0, mode: 'major', measure: 1 }],
    timeMap: [{ beat: 0, beats: 4, beatType: 4, measure: 1 }],
    warnings,
    requiresReview: true,
    ...(previewDataUrl ? { previewDataUrl } : {}),
  };
}

function inferStavesPerSystem(pages: PageDetection[]): 1 | 2 | 4 {
  const counts = pages.map((page) => page.staves.length).filter((count) => count > 0);
  const common = counts[0] ?? 1;
  if (common >= 4 && counts.every((count) => count % 4 === 0)) return 4;
  if (common >= 2 && counts.every((count) => count % 2 === 0)) return 2;
  return 1;
}

function normalizedBoundaries(staff: DetectedStaff): number[] {
  const values = [staff.xStart, ...staff.barlines, staff.xEnd].sort((a, b) => a - b);
  return values.filter((value, index) => index === 0 || value - (values[index - 1] ?? value) >= staff.spacing * 0.6);
}

function clefForSlot(stavesPerSystem: 1 | 2 | 4, slot: number): 'treble' | 'tenor' | 'bass' {
  if (stavesPerSystem === 4) return slot === 3 ? 'bass' : slot === 2 ? 'tenor' : 'treble';
  if (stavesPerSystem === 2) return slot === 1 ? 'bass' : 'treble';
  return 'treble';
}

function diatonicStaffMidi(clef: 'treble' | 'tenor' | 'bass', step: number): number {
  const bottomLineIndex = clef === 'bass' ? 2 * 7 + 4 : clef === 'tenor' ? 3 * 7 + 2 : 4 * 7 + 2;
  const index = bottomLineIndex + step;
  const octave = Math.floor(index / 7);
  const degree = ((index % 7) + 7) % 7;
  return (octave + 1) * 12 + ([0, 2, 4, 5, 7, 9, 11][degree] ?? 0);
}
