'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { recordTranscriptPhrases } from '@/lib/globalPhrases';
import { shiftDanglingArticles, cleanRepeatedSentences } from '@/lib/transcript';
import type { VideoItem } from '@/lib/types';

export function useTranscript() {
  const {
    currentVideo,
    setTranscript,
    setRepeatedSentences,
    setIsLoadingTranscript,
    setTranscriptError,
    transcript,
    repeatedSentences,
    isLoadingTranscript,
    transcriptError,
  } = useAppStore();

  const fetchedForRef = useRef<string | null>(null);

  const fetchTranscript = useCallback(
    async (video: VideoItem) => {
      if (fetchedForRef.current === video.id) return;
      fetchedForRef.current = video.id;

      setIsLoadingTranscript(true);
      setTranscriptError(null);
      setTranscript([]);
      setRepeatedSentences([]);

      try {
        const res = await fetch(`/api/transcript?videoId=${encodeURIComponent(video.id)}`);
        const data = await res.json();
        if (data.error) {
          setTranscriptError(data.error);
        } else {
          const rawLines = data.lines ?? [];
          const rawRepeated = data.repeatedSentences ?? [];

          // Enforce German structural rules:
          // 1. Never end with an article
          // 2. Shift dangling articles to start of next chunk
          // 3. Keep noun phrases together
          const lines = shiftDanglingArticles(rawLines);
          const repeated = cleanRepeatedSentences(rawRepeated);

          setTranscript(lines);
          setRepeatedSentences(repeated);
          // Record phrases in Global Common Phrases dictionary across videos
          recordTranscriptPhrases(video.id, video.title, lines);
        }
      } catch {
        setTranscriptError('Failed to load transcript. Please try again.');
      } finally {
        setIsLoadingTranscript(false);
      }
    },
    [setTranscript, setRepeatedSentences, setIsLoadingTranscript, setTranscriptError],
  );

  // Auto-fetch when currentVideo changes
  useEffect(() => {
    if (currentVideo && fetchedForRef.current !== currentVideo.id) {
      fetchTranscript(currentVideo);
    }
  }, [currentVideo, fetchTranscript]);

  // Reset when no video
  useEffect(() => {
    if (!currentVideo) {
      fetchedForRef.current = null;
    }
  }, [currentVideo]);

  return { transcript, repeatedSentences, isLoadingTranscript, transcriptError, fetchTranscript };
}
