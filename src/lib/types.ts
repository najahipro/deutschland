// ─── Shared TypeScript Types ───────────────────────────────────────────────

/** A video result from YouTube Search API */
export interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  description: string;
  duration?: string; // Formatted duration e.g. "12:05" or "1:02:10"
}

/** A video saved to the user's watch history */
export interface HistoryEntry extends VideoItem {
  savedAt: string; // ISO 8601
}

/** A single line from a YouTube transcript */
export interface TranscriptLine {
  text: string;
  offset: number;   // milliseconds from video start
  duration: number; // milliseconds
}

/** A sentence that appears multiple times in the transcript */
export interface RepeatedSentence {
  text: string;
  count: number;
  firstOffset: number; // ms — jump to this timestamp on click
}

/** The 5 interactive learning modes */
export type LearningMode = 'none' | 'shadowing' | 'voiceGapFill' | 'rolePlay' | 'blindListening';

/** Saved timestamp bookmark / flashcard */
export interface BookmarkEntry {
  id: string;
  videoId: string;
  videoTitle: string;
  sentence: string;
  offsetMs: number;
  timestampFormatted: string; // e.g. "02:15"
  createdAt: string;          // ISO date
}

/** State of the speech recognition engine */
export type SpeechState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

/** A gap-fill exercise derived from a transcript line */
export interface GapFillExercise {
  line: TranscriptLine;
  displayText: string;   // text with the hidden word replaced by "___"
  targetWord: string;    // the hidden word the user must say
  wordIndex: number;     // index within the line's words
}

/** YouTube Data API raw search result item */
export interface YoutubeApiItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      medium?: { url: string };
      high?:   { url: string };
      default?: { url: string };
    };
  };
}

/** Response shape from our internal /api/youtube/search endpoint */
export interface SearchApiResponse {
  videos: VideoItem[];
  error?: string;
}

/** Response shape from our internal /api/transcript endpoint */
export interface TranscriptApiResponse {
  lines: TranscriptLine[];
  repeatedSentences: RepeatedSentence[];
  source?: 'youtube' | 'whisper-ai';
  error?: string;
}
