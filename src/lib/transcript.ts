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
 * 0.80 = at least 80% word match.
 */
export const MATCH_THRESHOLD = 0.80;

// ─── Word-by-Word Diffing & Alignment ─────────────────────────────────────────

export interface SpokenWordDiff {
  word: string;
  isCorrect: boolean;
}

export interface WordDiffResult {
  score: number; // 0 - 100
  isPassing: boolean; // score >= 80
  spokenDiffs: SpokenWordDiff[];
  missingWords: string[];
  matchedWordsCount: number;
  totalTargetWords: number;
}

/** Clean a single word for matching, converting to lowercase and stripping all punctuation while preserving German umlauts and letters */
export function cleanWord(w: string): string {
  if (!w) return '';
  return w
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
}

/** Compare two German words with fuzzy edit-distance tolerance for Speech API quirks */
export function wordsMatch(spoken: string, target: string): boolean {
  const s = cleanWord(spoken);
  const t = cleanWord(target);
  if (!s || !t) return false;
  if (s === t) return true;
  // Handle German ß vs ss (e.g. groß vs gross)
  if (s.replace(/ß/g, 'ss') === t.replace(/ß/g, 'ss')) return true;
  // Allow small edit distance tolerance for minor recognition quirks
  const maxDist = t.length <= 4 ? 1 : 2;
  return levenshtein(s, t) <= maxDist;
}

/**
 * Word-by-word diffing between user's spoken transcript and target sentence.
 * - Strict normalization: lowercase, strip all punctuation, preserve umlauts (ä, ö, ü, ß).
 * - Robust LCS sequence alignment at the word level.
 * - Accurate scoring: (Correctly Matched Words / Total Target Words) * 100.
 */
export function diffSentenceWords(spokenText: string, targetText: string): WordDiffResult {
  const cleanSpokenText = removeConsecutiveDuplicates(spokenText);
  const cleanTargetText = removeConsecutiveDuplicates(targetText);

  const spokenTokens = cleanSpokenText.trim().split(/\s+/).filter(Boolean);
  const targetTokens = cleanTargetText.trim().split(/\s+/).filter(Boolean);

  if (targetTokens.length === 0) {
    return {
      score: 100,
      isPassing: true,
      spokenDiffs: spokenTokens.map((w) => ({ word: w, isCorrect: true })),
      missingWords: [],
      matchedWordsCount: 0,
      totalTargetWords: 0,
    };
  }

  if (spokenTokens.length === 0) {
    return {
      score: 0,
      isPassing: false,
      spokenDiffs: [],
      missingWords: targetTokens,
      matchedWordsCount: 0,
      totalTargetWords: targetTokens.length,
    };
  }

  const n = targetTokens.length;
  const m = spokenTokens.length;

  // DP table for Longest Common Subsequence of words with monotonicity preserved
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (wordsMatch(spokenTokens[j - 1], targetTokens[i - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      }
      dp[i][j] = Math.max(dp[i][j], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to find aligned matches
  let i = n;
  let j = m;
  const spokenMatches = new Set<number>();
  const targetMatches = new Set<number>();

  while (i > 0 && j > 0) {
    if (wordsMatch(spokenTokens[j - 1], targetTokens[i - 1]) && dp[i][j] === dp[i - 1][j - 1] + 1) {
      spokenMatches.add(j - 1);
      targetMatches.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const spokenDiffs: SpokenWordDiff[] = spokenTokens.map((word, idx) => ({
    word,
    isCorrect: spokenMatches.has(idx),
  }));

  const missingWords: string[] = targetTokens.filter((_, idx) => !targetMatches.has(idx));
  const matchedWordsCount = targetMatches.size;

  // Accurate scoring: (Correctly Matched Words / Total Target Words) * 100
  const score = targetTokens.length > 0 ? Math.round((matchedWordsCount / targetTokens.length) * 100) : 100;
  const isPassing = score >= 80;

  return {
    score,
    isPassing,
    spokenDiffs,
    missingWords,
    matchedWordsCount,
    totalTargetWords: targetTokens.length,
  };
}

// ─── Grouped Dialogue Turns for Role-Play (Speaker Diarization) ──────────────

export interface DialogueTurn {
  id: number;
  text: string;
  offset: number;     // ms start of turn
  duration: number;   // ms total duration
  speaker: 0 | 1;     // 0 = Speaker A, 1 = Speaker B
  chunkIndices: number[];
}

/**
 * Group raw YouTube caption chunks into complete, logical sentences/turns.
 * Uses terminal punctuation (. ? ! …) and timing gaps > 1 second (1000ms)
 * to prevent mid-sentence cutoffs.
 */
export function groupTranscriptIntoTurns(lines: TranscriptLine[]): DialogueTurn[] {
  if (!lines || lines.length === 0) return [];

  const turns: DialogueTurn[] = [];
  let currentChunks: TranscriptLine[] = [];
  let currentIndices: number[] = [];
  let speakerTurn: 0 | 1 = 0;

  const flushTurn = () => {
    if (currentChunks.length === 0) return;
    const first = currentChunks[0];
    const last = currentChunks[currentChunks.length - 1];
    const fullText = currentChunks.map((c) => c.text.trim()).join(' ').replace(/\s+/g, ' ').trim();
    const duration = (last.offset + last.duration) - first.offset;

    turns.push({
      id: turns.length,
      text: fullText,
      offset: first.offset,
      duration: Math.max(duration, 500),
      speaker: speakerTurn,
      chunkIndices: [...currentIndices],
    });

    speakerTurn = speakerTurn === 0 ? 1 : 0;
    currentChunks = [];
    currentIndices = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.text.trim()) continue;

    if (currentChunks.length > 0) {
      const prev = currentChunks[currentChunks.length - 1];
      const gap = line.offset - (prev.offset + prev.duration);
      const prevText = prev.text.trim();
      const hasTerminalPunctuation = /[.?!…][”"']?$/.test(prevText);

      // Terminal punctuation OR timing gap > 1 second indicates end of turn
      if (hasTerminalPunctuation || gap > 1000) {
        flushTurn();
      }
    }

    currentChunks.push(line);
    currentIndices.push(i);
  }

  flushTurn();
  return turns;
}

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
