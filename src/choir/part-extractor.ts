import { cloneEvents, type ChoirRole, type ImportConfidence, type ScoreDocument, type ScorePart, type ScoreVoice, type TargetNoteEvent, type VoiceLine } from '../score/contracts';

const ROLE_ORDER: ChoirRole[] = ['S', 'A', 'T', 'B'];

interface Candidate {
  line: VoiceLine;
  explicitRoles: ChoirRole[];
  partIndex: number;
}

export function extractVoiceLines(score: ScoreDocument): VoiceLine[] {
  const candidates: Candidate[] = [];
  score.parts.forEach((part, partIndex) => {
    const explicitRoles = rolesFromPart(part);
    const partCandidates: Candidate[] = [];
    part.voices.forEach((voice) => {
      splitVoiceByPitchRank(voice).forEach((events, rankIndex, ranks) => {
        if (events.length === 0) return;
        const polyphonicSplit = ranks.length > 1;
        const pitches = events.map((event) => event.soundingMidi);
        const confidence: ImportConfidence = score.sourceKind === 'pdf' || polyphonicSplit
          ? 'low'
          : explicitRoles.length === 1
            ? 'high'
            : explicitRoles.length > 1
              ? 'medium'
              : 'low';
        const suffix = polyphonicSplit ? ` · ${rankIndex === 0 ? 'UPPER' : rankIndex === ranks.length - 1 ? 'LOWER' : `LINE ${rankIndex + 1}`}` : '';
        const reasons = [
          ...(explicitRoles.length > 0 ? ['part-name'] : ['range-hint-only']),
          ...(voice.staff > 1 ? ['staff-structure'] : []),
          ...(part.voices.length > 1 ? ['voice-structure'] : []),
          ...(polyphonicSplit ? ['polyphonic-rank-split'] : []),
          ...(score.sourceKind === 'pdf' ? ['pdf-omr-review-required'] : []),
        ];
        partCandidates.push({
          partIndex,
          explicitRoles,
          line: {
            id: `${voice.id}${polyphonicSplit ? `:rank${rankIndex + 1}` : ''}`,
            label: `${part.name}${part.voices.length > 1 ? ` · V${voice.voice}` : ''}${suffix}`,
            sourcePartId: part.id,
            sourceStaff: voice.staff,
            sourceVoice: voice.voice,
            suggestedRole: explicitRoles.length === 1 ? explicitRoles[0] ?? 'LINE' : 'LINE',
            confidence,
            reasons,
            minMidi: Math.min(...pitches),
            maxMidi: Math.max(...pitches),
            events: cloneEvents(events),
          },
        });
      });
    });

    if (explicitRoles.length > 1) {
      const orderedCandidates = [...partCandidates].sort((a, b) => averageMidi(b.line.events) - averageMidi(a.line.events));
      const orderedRoles = [...explicitRoles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
      orderedCandidates.forEach((candidate, index) => {
        candidate.line.suggestedRole = orderedRoles[index] ?? 'LINE';
      });
    }
    candidates.push(...partCandidates);
  });

  const unresolved = candidates.filter((candidate) => candidate.line.suggestedRole === 'LINE');
  if (candidates.length === 4 && unresolved.length > 0) {
    [...candidates]
      .sort((a, b) => averageMidi(b.line.events) - averageMidi(a.line.events))
      .forEach((candidate, index) => {
        if (candidate.line.suggestedRole === 'LINE') candidate.line.suggestedRole = ROLE_ORDER[index] ?? 'LINE';
      });
  }

  return candidates
    .sort((a, b) => a.partIndex - b.partIndex || a.line.sourceStaff - b.line.sourceStaff || compareVoice(a.line.sourceVoice, b.line.sourceVoice) || averageMidi(b.line.events) - averageMidi(a.line.events))
    .map((candidate) => candidate.line);
}

export function selectPrimaryVoiceLines(lines: VoiceLine[], maximum = 4): VoiceLine[] {
  const limit = Math.max(1, Math.min(4, Math.round(maximum)));
  const selected: VoiceLine[] = [];
  const selectedIds = new Set<string>();
  const selectedParts = new Set<string>();
  const select = (line: VoiceLine | undefined) => {
    if (!line || selectedIds.has(line.id) || selected.length >= limit) return;
    selected.push(line);
    selectedIds.add(line.id);
    selectedParts.add(line.sourcePartId);
  };

  ROLE_ORDER.forEach((role) => {
    const candidates = lines.filter((line) => line.suggestedRole === role);
    select([...candidates].sort(comparePrimaryCandidate)[0]);
  });

  const unresolvedLines = lines.filter((line) => line.suggestedRole === 'LINE');
  const bestByUnselectedPart = new Map<string, VoiceLine>();
  unresolvedLines.forEach((line) => {
    if (selectedIds.has(line.id) || selectedParts.has(line.sourcePartId)) return;
    const current = bestByUnselectedPart.get(line.sourcePartId);
    if (!current || comparePrimaryCandidate(line, current) < 0) bestByUnselectedPart.set(line.sourcePartId, line);
  });
  [...bestByUnselectedPart.values()].sort(comparePrimaryCandidate).forEach(select);
  [...unresolvedLines].sort(comparePrimaryCandidate).forEach(select);

  const claimedRoles = new Set(selected.map((line) => line.suggestedRole).filter((role): role is ChoirRole => role !== 'LINE'));
  const missingRoles = ROLE_ORDER.filter((role) => !claimedRoles.has(role));
  selected
    .filter((line) => line.suggestedRole === 'LINE')
    .sort((a, b) => averageMidi(b.events) - averageMidi(a.events))
    .forEach((line, index) => {
      line.suggestedRole = missingRoles[index] ?? 'LINE';
      if (line.suggestedRole !== 'LINE') line.reasons = [...line.reasons, 'primary-satb-layout'];
    });

  return selected.sort(compareByChoirRole);
}

function splitVoiceByPitchRank(voice: ScoreVoice): TargetNoteEvent[][] {
  const onsetGroups = new Map<string, TargetNoteEvent[]>();
  voice.events.forEach((event) => {
    const key = event.onsetBeat.toFixed(6);
    const group = onsetGroups.get(key) ?? [];
    group.push(event);
    onsetGroups.set(key, group);
  });
  const groups = [...onsetGroups.values()]
    .map((events) => events.sort((a, b) => b.soundingMidi - a.soundingMidi))
    .sort((a, b) => (a[0]?.onsetBeat ?? 0) - (b[0]?.onsetBeat ?? 0));
  const rankCount = Math.max(1, ...groups.map((group) => group.length));
  return Array.from({ length: rankCount }, (_, rank) => groups.flatMap((group) => group[rank] ? [group[rank]] : []));
}

function rolesFromPart(part: ScorePart): ChoirRole[] {
  const value = `${part.name} ${part.abbreviation ?? ''}`.toLowerCase();
  const roles: ChoirRole[] = [];
  if (/\bsoprano\b|\bsop\b|(^|\s)s($|\s)/.test(value)) roles.push('S');
  if (/\balto\b|(^|\s)a($|\s)/.test(value)) roles.push('A');
  if (/\btenor\b|(^|\s)t($|\s)/.test(value)) roles.push('T');
  if (/\bbass\b|\bbaritone\b|(^|\s)b($|\s)/.test(value)) roles.push('B');
  return roles;
}

function averageMidi(events: TargetNoteEvent[]): number {
  return events.reduce((sum, event) => sum + event.soundingMidi, 0) / Math.max(1, events.length);
}

function compareVoice(a: string, b: string): number {
  const numeric = Number(a) - Number(b);
  return Number.isFinite(numeric) && numeric !== 0 ? numeric : a.localeCompare(b);
}

function comparePrimaryCandidate(a: VoiceLine, b: VoiceLine): number {
  const confidenceRank: Record<ImportConfidence, number> = { high: 0, medium: 1, low: 2 };
  const confidence = confidenceRank[a.confidence] - confidenceRank[b.confidence];
  if (confidence !== 0) return confidence;
  const voice = compareVoice(a.sourceVoice, b.sourceVoice);
  if (voice !== 0) return voice;
  const rankA = /:rank(\d+)$/.exec(a.id)?.[1];
  const rankB = /:rank(\d+)$/.exec(b.id)?.[1];
  const rank = Number(rankA ?? 1) - Number(rankB ?? 1);
  if (rank !== 0) return rank;
  return b.events.length - a.events.length || a.id.localeCompare(b.id);
}

function compareByChoirRole(a: VoiceLine, b: VoiceLine): number {
  const role = ROLE_ORDER.indexOf(a.suggestedRole as ChoirRole) - ROLE_ORDER.indexOf(b.suggestedRole as ChoirRole);
  if (role !== 0) return role;
  return averageMidi(b.events) - averageMidi(a.events);
}
