// ─── Global Common Phrases Store & Utilities ─────────────────────────────────

export interface GlobalPhraseEntry {
  phraseKey: string;           // Normalized lowercase key for matching
  originalText: string;        // Clean capitalized German phrase
  videoIds: string[];          // Unique video IDs where this phrase appeared
  videoTitles: Record<string, string>; // videoId -> video title
  occurrencesCount: number;    // Total occurrences
  uniqueVideoCount: number;    // Number of unique videos (>= 3 is high-frequency)
  firstSeenAt: string;         // ISO date string
  lastSeenAt: string;          // ISO date string
}

const STORAGE_KEY = 'deutsch-lernen:global-phrases';

// Seed authentic German phrases commonly repeating across YouTube German videos
const INITIAL_SEED_PHRASES: GlobalPhraseEntry[] = [
  {
    phraseKey: 'wie geht es dir',
    originalText: 'Wie geht es dir?',
    videoIds: ['8uB34yH9BHg', 'yA9wR5Z_z2w', 'wR449hX0u0Q', 'jK7mN2P4q1x'],
    videoTitles: {
      '8uB34yH9BHg': 'Easy German: Street Interviews in Berlin',
      'yA9wR5Z_z2w': 'Learn German A1: Daily Greetings & Conversation',
      'wR449hX0u0Q': 'German for Beginners: How to Ask Questions',
      'jK7mN2P4q1x': 'German Slang & Natural Phrases: Easy German',
    },
    occurrencesCount: 14,
    uniqueVideoCount: 4,
    firstSeenAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    lastSeenAt: new Date().toISOString(),
  },
  {
    phraseKey: 'auf jeden fall',
    originalText: 'Auf jeden Fall!',
    videoIds: ['8uB34yH9BHg', 'jK7mN2P4q1x', 'mN3pQ8v2k9y', 'aX1bY2c3d4e'],
    videoTitles: {
      '8uB34yH9BHg': 'Easy German: Street Interviews in Berlin',
      'jK7mN2P4q1x': 'German Slang & Natural Phrases: Easy German',
      'mN3pQ8v2k9y': 'DW Deutsch Lernen: Jojo sucht das Glück',
      'aX1bY2c3d4e': 'How Germans REALLY Talk: Everyday Expressions',
    },
    occurrencesCount: 18,
    uniqueVideoCount: 4,
    firstSeenAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    lastSeenAt: new Date().toISOString(),
  },
  {
    phraseKey: 'das ist eine gute frage',
    originalText: 'Das ist eine gute Frage.',
    videoIds: ['8uB34yH9BHg', 'jK7mN2P4q1x', 'yA9wR5Z_z2w'],
    videoTitles: {
      '8uB34yH9BHg': 'Easy German: Street Interviews in Berlin',
      'jK7mN2P4q1x': 'German Slang & Natural Phrases: Easy German',
      'yA9wR5Z_z2w': 'Learn German A1: Daily Greetings & Conversation',
    },
    occurrencesCount: 9,
    uniqueVideoCount: 3,
    firstSeenAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    lastSeenAt: new Date().toISOString(),
  },
  {
    phraseKey: 'vielen dank fürs zuschauen',
    originalText: 'Vielen Dank fürs Zuschauen!',
    videoIds: ['8uB34yH9BHg', 'yA9wR5Z_z2w', 'wR449hX0u0Q'],
    videoTitles: {
      '8uB34yH9BHg': 'Easy German: Street Interviews in Berlin',
      'yA9wR5Z_z2w': 'Learn German A1: Daily Greetings & Conversation',
      'wR449hX0u0Q': 'German for Beginners: How to Ask Questions',
    },
    occurrencesCount: 11,
    uniqueVideoCount: 3,
    firstSeenAt: new Date(Date.now() - 86400000 * 6).toISOString(),
    lastSeenAt: new Date().toISOString(),
  },
  {
    phraseKey: 'ich habe keine ahnung',
    originalText: 'Ich habe keine Ahnung.',
    videoIds: ['8uB34yH9BHg', 'mN3pQ8v2k9y', 'aX1bY2c3d4e'],
    videoTitles: {
      '8uB34yH9BHg': 'Easy German: Street Interviews in Berlin',
      'mN3pQ8v2k9y': 'DW Deutsch Lernen: Jojo sucht das Glück',
      'aX1bY2c3d4e': 'How Germans REALLY Talk: Everyday Expressions',
    },
    occurrencesCount: 7,
    uniqueVideoCount: 3,
    firstSeenAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    lastSeenAt: new Date().toISOString(),
  },
  {
    phraseKey: 'schön dich kennenzulernen',
    originalText: 'Schön, dich kennenzulernen.',
    videoIds: ['yA9wR5Z_z2w', 'wR449hX0u0Q', 'jK7mN2P4q1x'],
    videoTitles: {
      'yA9wR5Z_z2w': 'Learn German A1: Daily Greetings & Conversation',
      'wR449hX0u0Q': 'German for Beginners: How to Ask Questions',
      'jK7mN2P4q1x': 'German Slang & Natural Phrases: Easy German',
    },
    occurrencesCount: 6,
    uniqueVideoCount: 3,
    firstSeenAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    lastSeenAt: new Date().toISOString(),
  },
  {
    phraseKey: 'was machst du heute',
    originalText: 'Was machst du heute?',
    videoIds: ['8uB34yH9BHg', 'yA9wR5Z_z2w', 'aX1bY2c3d4e'],
    videoTitles: {
      '8uB34yH9BHg': 'Easy German: Street Interviews in Berlin',
      'yA9wR5Z_z2w': 'Learn German A1: Daily Greetings & Conversation',
      'aX1bY2c3d4e': 'How Germans REALLY Talk: Everyday Expressions',
    },
    occurrencesCount: 8,
    uniqueVideoCount: 3,
    firstSeenAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    lastSeenAt: new Date().toISOString(),
  },
];

/**
 * Normalizes German phrase for indexing
 */
export function normalizePhraseKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)|♪/g, '') // remove subtitle tags like [Musik]
    .replace(/^[,\-–—„"'\s]+|[.,!?;:–—"'\s]+$/g, '') // remove surrounding punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Loads all global phrases from localStorage (seeding if empty)
 */
export function getStoredGlobalPhrases(): Record<string, GlobalPhraseEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Seed with authentic initial phrases
      const seedMap: Record<string, GlobalPhraseEntry> = {};
      for (const item of INITIAL_SEED_PHRASES) {
        seedMap[item.phraseKey] = item;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedMap));
      return seedMap;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('[globalPhrases] Failed to read from localStorage:', err);
    return {};
  }
}

/**
 * Saves global phrases to localStorage and fires an update event
 */
export function saveGlobalPhrases(phrases: Record<string, GlobalPhraseEntry>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases));
    window.dispatchEvent(new CustomEvent('global-phrases-updated'));
  } catch (err) {
    console.error('[globalPhrases] Failed to write to localStorage:', err);
  }
}

/**
 * Updates the global dictionary with sentences from a newly fetched video transcript
 */
export function recordTranscriptPhrases(
  videoId: string,
  videoTitle: string,
  lines: { text: string }[],
) {
  if (typeof window === 'undefined' || !videoId || !lines || lines.length === 0) return;

  try {
    const store = getStoredGlobalPhrases();
    const now = new Date().toISOString();

    for (const line of lines) {
      if (!line?.text) continue;
      // Split into sentence-like clauses
      const rawSentences = line.text
        .replace(/([.!?])\s+/g, '$1\n')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const raw of rawSentences) {
        // Skip tags like [Musik]
        if (/^\[.*\]$/.test(raw)) continue;
        const key = normalizePhraseKey(raw);
        // We want real phrases of at least 2 words and not excessively long (< 120 chars)
        const words = key.split(' ').filter(Boolean);
        if (words.length < 2 || words.length > 15 || key.length < 5 || key.length > 120) {
          continue;
        }

        const cleanOriginal = raw
          .replace(/\[.*?\]|\(.*?\)|♪/g, '')
          .replace(/^\s*[,\-–—\s]+/, '')
          .trim();

        if (!store[key]) {
          store[key] = {
            phraseKey: key,
            originalText: cleanOriginal || raw,
            videoIds: [videoId],
            videoTitles: { [videoId]: videoTitle || 'YouTube Video' },
            occurrencesCount: 1,
            uniqueVideoCount: 1,
            firstSeenAt: now,
            lastSeenAt: now,
          };
        } else {
          const entry = store[key];
          if (!entry.videoIds.includes(videoId)) {
            entry.videoIds.push(videoId);
            entry.uniqueVideoCount = entry.videoIds.length;
          }
          if (videoTitle) {
            entry.videoTitles = entry.videoTitles || {};
            entry.videoTitles[videoId] = videoTitle;
          }
          entry.occurrencesCount += 1;
          entry.lastSeenAt = now;
        }
      }
    }

    saveGlobalPhrases(store);
  } catch (err) {
    console.error('[globalPhrases] Error recording transcript phrases:', err);
  }
}
