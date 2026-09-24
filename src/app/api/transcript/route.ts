import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';
import ytdl from '@distube/ytdl-core';
import type { TranscriptApiResponse, TranscriptLine, RepeatedSentence } from '@/lib/types';

export const runtime = 'nodejs';
// Allow up to 120s for AI audio extraction & Whisper transcription
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('videoId')?.trim();

  if (!videoId) {
    return NextResponse.json<TranscriptApiResponse>(
      { lines: [], repeatedSentences: [], error: 'Missing videoId parameter' },
      { status: 400 },
    );
  }

  const openAiKey = process.env.OPENAI_API_KEY;

  // ── 1. AI-First Path: If OpenAI Whisper API key is present, force Whisper AI ──
  if (openAiKey && openAiKey !== 'your_openai_api_key_here') {
    try {
      console.log(`[api/transcript] Forcing Whisper AI for clean sentence extraction: ${videoId}`);
      const audioBuffer = await extractAudioBuffer(videoId);
      const vttContent = await transcribeWithWhisper(audioBuffer, openAiKey);
      const parsedLines = parseVttOrSrt(vttContent);

      if (parsedLines.length > 0) {
        const combined = combineChoppedLines(parsedLines);
        const lines = combined.length > 0 ? combined : parsedLines;
        const repeatedSentences = analyseRepetitions(lines);

        return NextResponse.json<TranscriptApiResponse>({
          lines,
          repeatedSentences,
          source: 'whisper-ai',
        });
      }
    } catch (aiErr) {
      console.warn(`[api/transcript] Whisper AI failed, falling back to YouTube captions...`, aiErr);
    }
  }

  // ── 2. Fallback Path: YouTube captions with sentence recombination ──────────
  try {
    let rawLines;
    try {
      rawLines = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'de' });
    } catch {
      try {
        rawLines = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
      } catch {
        rawLines = await YoutubeTranscript.fetchTranscript(videoId);
      }
    }

    if (rawLines && rawLines.length > 0) {
      const cleaned: TranscriptLine[] = rawLines
        .map((l) => ({
          text: cleanText(l.text),
          offset: l.offset,
          duration: l.duration,
        }))
        .filter((l) => l.text.length > 0);

      // Combine chopped fragments into complete communicative sentences
      const combined = combineChoppedLines(cleaned);
      const lines = combined.length > 0 ? combined : cleaned;
      const repeatedSentences = analyseRepetitions(lines);

      return NextResponse.json<TranscriptApiResponse>({
        lines,
        repeatedSentences,
        source: 'youtube',
      });
    }
  } catch (ytErr) {
    console.warn(`[api/transcript] YouTube captions unavailable for ${videoId}:`, ytErr);
  }

  // ── 3. Both Whisper AI and YouTube closed captions failed ──────────────────
  return NextResponse.json<TranscriptApiResponse>(
    {
      lines: [],
      repeatedSentences: [],
      error:
        'No captions found for this video. Add OPENAI_API_KEY to your .env.local file to transcribe any video automatically with Whisper AI.',
    },
    { status: 404 },
  );
}

// ─── Audio Extraction via @distube/ytdl-core ─────────────────────────────────

async function extractAudioBuffer(videoId: string): Promise<Buffer> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const stream = ytdl(videoUrl, {
    filter: 'audioonly',
    quality: 'lowestaudio', // Fast and lightweight for speech-to-text
    requestOptions: {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    },
  });

  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
  });
}

// ─── OpenAI Whisper Transcription ───────────────────────────────────────────

async function transcribeWithWhisper(audioBuffer: Buffer, apiKey: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
  formData.append('file', blob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'de');
  formData.append('response_format', 'vtt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI Whisper error (${res.status}): ${errText}`);
  }

  return await res.text();
}

// ─── VTT / SRT Parser ────────────────────────────────────────────────────────

function parseTimestamp(timestamp: string): number {
  const clean = timestamp.trim().replace(',', '.');
  const parts = clean.split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  } else {
    seconds = parseFloat(clean);
  }
  return Math.round(seconds * 1000);
}

function parseVttOrSrt(content: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\s*\n/);

  for (const block of blocks) {
    const rawLines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (rawLines.length === 0) continue;
    if (rawLines[0].startsWith('WEBVTT') || rawLines[0].startsWith('NOTE')) continue;

    const arrowIdx = rawLines.findIndex((l) => l.includes('-->'));
    if (arrowIdx === -1) continue;

    const [startStr, endStr] = rawLines[arrowIdx].split('-->').map((s) => s.trim().split(' ')[0]);
    if (!startStr || !endStr) continue;

    const offset = parseTimestamp(startStr);
    const end = parseTimestamp(endStr);
    const duration = Math.max(end - offset, 500);

    const textLines = rawLines.slice(arrowIdx + 1);
    const text = cleanText(textLines.join(' '));
    if (text) {
      lines.push({ text, offset, duration });
    }
  }

  return lines;
}

// ─── Flawless Text Cleaning & Repetition Analysis ────────────────────────────

function cleanText(text: string): string {
  const stripped = text
    .replace(/<[^>]+>/g, '')
    .replace(/\[[^\]]*\]/g, '') // Strip [Musik], [Applaus], etc.
    .replace(/\([^\)]*\)/g, '') // Strip (Lachen), etc.
    .replace(/[♪♩♫♬]/g, '')     // Strip music notes
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove consecutive duplicate stutter words (e.g., "das das" -> "das")
  return stripped
    .split(/\s+/)
    .filter((w, i, arr) => {
      if (i === 0) return true;
      const cleanPrev = arr[i - 1].toLowerCase().replace(/[.,!?;:"""''„"()\[\]]/g, '');
      const cleanCurr = w.toLowerCase().replace(/[.,!?;:"""''„"()\[\]]/g, '');
      return cleanCurr !== cleanPrev;
    })
    .join(' ');
}

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"""''„“()\[\]♪\-–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Combines chopped YouTube transcript lines based on terminal punctuation (. ! ?)
 * and timing gaps before frequency extraction.
 */
function combineChoppedLines(lines: TranscriptLine[]): TranscriptLine[] {
  const fullSentences: TranscriptLine[] = [];
  let bufferText = '';
  let bufferOffset = 0;
  let bufferDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = cleanText(lines[i].text || '');
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

/**
 * Extracts ONLY valid, communicative German sentences and recurrent phrases:
 * 1. Requires at least 2 words (e.g. "Was machst du?", "Alles klar", "Vielen Dank")
 * 2. Maximum 14 words per phrase (prevents massive concatenated run-ons)
 * 3. Strips all bracket noise tags and removes duplicate word stutters
 * 4. Extracts recurrent full sentences AND communicative multi-word phrases (2-6 words)
 * 5. Guarantees top communicative daily life sentences from current video
 */
export function analyseRepetitions(candidateLines: TranscriptLine[]): RepeatedSentence[] {
  const countMap = new Map<
    string,
    { count: number; original: string; firstOffset: number; wordCount: number }
  >();

  // 1. First pass: count exact full sentence repetitions
  for (const line of candidateLines) {
    const text = cleanText(line.text || '');
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 14) continue;

    const key = normalizeKey(text);
    const keyWords = key.split(' ').filter(Boolean);
    if (keyWords.length < 2) continue;

    const existing = countMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      countMap.set(key, {
        count: 1,
        original: text,
        firstOffset: line.offset,
        wordCount: words.length,
      });
    }
  }

  // 2. Second pass: communicative n-gram phrases (2 to 6 words)
  const phraseMap = new Map<string, { count: number; original: string; firstOffset: number; wordCount: number }>();

  for (const line of candidateLines) {
    const words = cleanText(line.text || '').split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;

    for (let len = 2; len <= Math.min(6, words.length); len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const sliceWords = words.slice(i, i + len);
        const rawSlice = sliceWords.join(' ');
        const key = normalizeKey(rawSlice);
        if (key.split(' ').filter(Boolean).length < 2) continue;

        const existing = phraseMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          phraseMap.set(key, {
            count: 1,
            original: rawSlice,
            firstOffset: line.offset,
            wordCount: len,
          });
        }
      }
    }
  }

  // Merge high-frequency phrases repeating >= 2 times
  for (const [key, val] of phraseMap.entries()) {
    if (val.count >= 2 && !countMap.has(key)) {
      countMap.set(key, val);
    }
  }

  // 3. Fallback: If repetitions are sparse (< 6 items), extract top communicative sentences from the current video
  const repeatedItems = Array.from(countMap.values()).filter((v) => v.count >= 2);

  if (repeatedItems.length < 6) {
    const COMMUNICATIVE_STARTERS = /^(wie|was|wo|warum|wann|wer|ich|du|wir|das|kannst|können|bitte|danke|vielen|auf|alles|guten|schön|es|hast|haben)/i;
    for (const line of candidateLines) {
      const text = cleanText(line.text || '');
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 10 && COMMUNICATIVE_STARTERS.test(text)) {
        const key = normalizeKey(text);
        if (!countMap.has(key)) {
          countMap.set(key, {
            count: 1,
            original: text,
            firstOffset: line.offset,
            wordCount: words.length,
          });
          if (countMap.size >= 15) break;
        }
      }
    }
  }

  return Array.from(countMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.wordCount - a.wordCount;
    })
    .slice(0, 30)
    .map((v) => ({
      text: v.original,
      count: v.count,
      firstOffset: v.firstOffset,
    }));
}
