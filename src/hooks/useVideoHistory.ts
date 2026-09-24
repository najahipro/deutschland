'use client';

import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type { HistoryEntry, VideoItem } from '@/lib/types';

const HISTORY_KEY = 'deutsch-lernen:history';
const MAX_HISTORY = 50;

/**
 * Manages the user's video watch history backed by localStorage.
 */
export function useVideoHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>(HISTORY_KEY, []);

  /** Add a video to history (or bump it to the top if it already exists). */
  const addToHistory = useCallback(
    (video: VideoItem) => {
      setHistory((prev) => {
        const filtered = prev.filter((v) => v.id !== video.id);
        const entry: HistoryEntry = {
          ...video,
          savedAt: new Date().toISOString(),
        };
        return [entry, ...filtered].slice(0, MAX_HISTORY);
      });
    },
    [setHistory],
  );

  /** Remove a single video from history by its YouTube video ID. */
  const removeFromHistory = useCallback(
    (videoId: string) => {
      setHistory((prev) => prev.filter((v) => v.id !== videoId));
    },
    [setHistory],
  );

  /** Clear the entire history. */
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  /** Check if a specific video is already in history. */
  const isInHistory = useCallback(
    (videoId: string) => history.some((v) => v.id === videoId),
    [history],
  );

  const sortedHistory = useMemo(() => [...history], [history]);

  return {
    history: sortedHistory,
    addToHistory,
    removeFromHistory,
    clearHistory,
    isInHistory,
  };
}
