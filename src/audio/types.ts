export type EngineSource = 'light' | 'neural';
export type ConfidenceBand = 'none' | 'low' | 'medium' | 'high';

export interface PitchFrame {
  sessionId: string;
  sequence: number;
  timestampMs: number;
  frequencyHz: number | null;
  confidenceRaw: number;
  confidenceBand: ConfidenceBand;
  voiced: boolean;
  source: EngineSource;
  processingMs: number;
  frameAgeMs: number;
  droppedSinceLast: number;
  discontinuity: boolean;
  rmsDb: number;
  clipping: boolean;
}

export interface RawPitchResult {
  frequencyHz: number | null;
  confidence: number;
  processingMs: number;
  audioTimeMs: number;
  rmsDb: number;
  clipping: boolean;
  source: EngineSource;
}

export type AudioSessionState =
  | 'idle'
  | 'requesting_permission'
  | 'starting'
  | 'running'
  | 'suspended'
  | 'needs_resume_tap'
  | 'needs_restart'
  | 'permission_denied'
  | 'stopping'
  | 'error';

export interface DeviceDiagnostics {
  label: string;
  sampleRate: number;
  channelCount: number | null;
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  processingActive: boolean;
}
