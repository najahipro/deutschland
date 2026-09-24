'use client';

import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type { BookmarkEntry } from '@/lib/types';
import { msToTimestamp } from '@/lib/transcript';

const BOOKMARKS_KEY = 'deutsch-lernen:bookmarks';

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useLocalStorage<BookmarkEntry[]>(BOOKMARKS_KEY, []);

  const addBookmark = useCallback(
    (videoId: string, videoTitle: string, sentence: string, offsetMs: number) => {
      setBookmarks((prev) => {
        // Prevent duplicate bookmark of the exact sentence at same timestamp
        const exists = prev.some((b) => b.videoId === videoId && Math.abs(b.offsetMs - offsetMs) < 2000);
        if (exists) return prev;

        const newEntry: BookmarkEntry = {
          id: `${videoId}-${Date.now()}`,
          videoId,
          videoTitle: videoTitle || 'German Video',
          sentence,
          offsetMs,
          timestampFormatted: msToTimestamp(offsetMs),
          createdAt: new Date().toISOString(),
        };

        return [newEntry, ...prev];
      });
    },
    [setBookmarks],
  );

  const removeBookmark = useCallback(
    (id: string) => {
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    },
    [setBookmarks],
  );

  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
  }, [setBookmarks]);

  const isBookmarked = useCallback(
    (videoId: string, offsetMs: number) => {
      return bookmarks.some((b) => b.videoId === videoId && Math.abs(b.offsetMs - offsetMs) < 2000);
    },
    [bookmarks],
  );

  const sortedBookmarks = useMemo(() => [...bookmarks], [bookmarks]);

  return {
    bookmarks: sortedBookmarks,
    addBookmark,
    removeBookmark,
    clearBookmarks,
    isBookmarked,
    totalBookmarks: bookmarks.length,
  };
}
