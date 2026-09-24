import type { TranscriptLine, GapFillExercise } from './types';

// ─── Levenshtein Distance ─────────────────────────────────────────────────────

/**
 * Compute the Levenshtein edit distance between two strings.
 * Used for fuzzy-matching spoken text against transcript lines.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Removes consecutive duplicate words from a sentence (e.g. "das das" -> "das", "und und" -> "und").
 * Fixes speech stutter in transcripts before validation.
 */
export function removeConsecutiveDuplicates(text: string): string {
  if (!text) return '';
  return text
    .split(/\s+/)
    .filter((word, i, arr) => {
      if (i === 0) return true;
      const cleanPrev = arr[i - 1].toLowerCase().replace(/[.,!?;:"""''„"()\[\]]/g, '');
      const cleanCurr = word.toLowerCase().replace(/[.,!?;:"""''„"()\[\]]/g, '');
      return cleanCurr !== cleanPrev;
    })
    .join(' ');
}

/**
 * Returns a similarity ratio between 0 and 1.
 * 1.0 = identical, 0.0 = completely different.
 * Automatically removes consecutive duplicate stutter words before matching.
 */
export function similarityRatio(spoken: string, target: string): number {
  const normalise = (s: string) =>
    removeConsecutiveDuplicates(s)
      .toLowerCase()
      .replace(/[.,!?;:"""''„"()\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const na = normalise(spoken);
  const nb = normalise(target);
  if (na === nb) return 1;

  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/**
 * Threshold at which we consider a spoken utterance "correct".
 * 0.70 = at least 70% similarity.
 */
export const MATCH_THRESHOLD = 0.70;

// ─── Gap-Fill Helpers ─────────────────────────────────────────────────────────

// Words we ignore when picking the "hidden" word (conjunctions, articles, etc.)
const SKIP_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'und', 'oder', 'aber', 'weil', 'dass', 'wenn',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
  'ist', 'bin', 'sind', 'hat', 'haben', 'war', 'waren',
  'in', 'an', 'auf', 'bei', 'mit', 'von', 'zu',
  'nicht', 'kein', 'nein', 'ja',
  'a', 'the', 'is', 'are', 'was', 'be', 'of', 'to',
]);

/**
 * Given a transcript line, pick the best word to hide for a gap-fill exercise.
 * Prefers long content words (nouns/verbs) over short function words.
 */
export function buildGapFillExercise(line: TranscriptLine): GapFillExercise | null {
  const words = line.text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;

  let bestIdx = -1;
  let bestScore = -1;

  words.forEach((word, i) => {
    const clean = word.replace(/[.,!?;:"""''„"]/g, '').toLowerCase();
    if (SKIP_WORDS.has(clean)) return;
    const score = clean.length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });

  if (bestIdx === -1) return null;

  const targetWord = words[bestIdx].replace(/[.,!?;:"""''„"]/g, '');
  const displayText = words
    .map((w, i) => (i === bestIdx ? '___' : w))
    .join(' ');

  return { line, displayText, targetWord, wordIndex: bestIdx };
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────

/** Format milliseconds as M:SS */
export function msToTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** Format a publishedAt ISO date as a relative string */
export function relativeDate(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const sec = diff / 1000;
  if (sec < 60) return 'just now';
  const min = sec / 60;
  if (min < 60) return `${Math.floor(min)}m ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.floor(hr)}h ago`;
  const day = hr / 24;
  if (day < 7) return `${Math.floor(day)}d ago`;
  const wk = day / 7;
  if (wk < 5) return `${Math.floor(wk)}w ago`;
  const mo = day / 30;
  if (mo < 12) return `${Math.floor(mo)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

/**
 * Combines chopped YouTube transcript lines into complete, grammatically-sound German sentences
 * based on terminal punctuation (. ! ?) and timing gaps.
 */
export function combineIntoFullSentences(lines: TranscriptLine[]): TranscriptLine[] {
  const fullSentences: TranscriptLine[] = [];
  let bufferText = '';
  let bufferOffset = 0;
  let bufferDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = (lines[i].text || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\([^\)]*\)/g, '')
      .replace(/[♪♩♫♬]/g, '')
      .trim();

    if (!raw) continue;

    if (!bufferText) {
      bufferOffset = lines[i].offset;
      bufferDuration = lines[i].duration;
    } else {
      bufferDuration = (lines[i].offset + lines[i].duration) - bufferOffset;
    }

    bufferText = bufferText ? `${bufferText} ${raw}` : raw;

    const endsWithTerminal = /[.!?]$/.test(bufferText.trim());
    const nextLine = lines[i + 1];
    const isBigGap = nextLine && (nextLine.offset - (lines[i].offset + lines[i].duration) > 1400);
    const wordCount = bufferText.split(/\s+/).filter(Boolean).length;

    if (endsWithTerminal || isBigGap || wordCount >= 10 || i === lines.length - 1) {
      if (wordCount >= 2) {
        fullSentences.push({
          text: bufferText.trim(),
          offset: bufferOffset,
          duration: Math.max(bufferDuration, 1000),
        });
      }
      bufferText = '';
      bufferOffset = 0;
      bufferDuration = 0;
    }
  }

  return fullSentences;
}
