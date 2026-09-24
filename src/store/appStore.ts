'use client';

import { create } from 'zustand';
import type {
  VideoItem,
  LearningMode,
  TranscriptLine,
  RepeatedSentence,
  SpeechState,
  GapFillExercise,
} from '@/lib/types';

// ─── Store Shape ──────────────────────────────────────────────────────────────

interface AppState {
  // ── Current video ──────────────────────────────────────────────────────────
  currentVideo: VideoItem | null;
  setCurrentVideo: (video: VideoItem | null) => void;

  // ── Search ─────────────────────────────────────────────────────────────────
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSearching: boolean;
  setIsSearching: (v: boolean) => void;
  isLoadingMore: boolean;
  setIsLoadingMore: (v: boolean) => void;
  searchResults: VideoItem[];
  setSearchResults: (results: VideoItem[]) => void;
  nextPageToken: string | null;
  setNextPageToken: (token: string | null) => void;
  appendSearchResults: (newVideos: VideoItem[], nextToken: string | null) => void;
  showResults: boolean;
  setShowResults: (v: boolean) => void;

  // ── Learning mode ──────────────────────────────────────────────────────────
  activeMode: LearningMode;
  setActiveMode: (mode: LearningMode) => void;

  // ── Transcript ─────────────────────────────────────────────────────────────
  transcript: TranscriptLine[];
  setTranscript: (lines: TranscriptLine[]) => void;
  isLoadingTranscript: boolean;
  setIsLoadingTranscript: (v: boolean) => void;
  transcriptError: string | null;
  setTranscriptError: (err: string | null) => void;

  // ── Repeated sentences ─────────────────────────────────────────────────────
  repeatedSentences: RepeatedSentence[];
  setRepeatedSentences: (sentences: RepeatedSentence[]) => void;

  // ── Speech / mic ───────────────────────────────────────────────────────────
  speechState: SpeechState;
  setSpeechState: (state: SpeechState) => void;
  spokenText: string;
  setSpokenText: (text: string) => void;

  // ── Shadowing mode ─────────────────────────────────────────────────────────
  currentLineIndex: number;
  setCurrentLineIndex: (idx: number) => void;
  shadowingFeedback: 'correct' | 'incorrect' | null;
  setShadowingFeedback: (v: 'correct' | 'incorrect' | null) => void;

  // ── Gap-fill mode ──────────────────────────────────────────────────────────
  currentExercise: GapFillExercise | null;
  setCurrentExercise: (ex: GapFillExercise | null) => void;
  gapFillAttempts: number;
  setGapFillAttempts: (n: number) => void;
  gapFillRevealed: boolean;
  setGapFillRevealed: (v: boolean) => void;

  // ── Sidebar ────────────────────────────────────────────────────────────────
  sidebarTab: 'repeated' | 'globalDict' | 'transcript' | 'flashcards';
  setSidebarTab: (tab: 'repeated' | 'globalDict' | 'transcript' | 'flashcards') => void;

  // ── History panel ──────────────────────────────────────────────────────────
  historyPanelOpen: boolean;
  setHistoryPanelOpen: (v: boolean) => void;

  // ── Video playback time (polled every 250ms by VideoPlayer) ────────────────
  currentTimeSec: number;
  setCurrentTimeSec: (t: number) => void;

  // ── A-B Prep Loop ──────────────────────────────────────────────────────────
  prepLoopTarget: number; // default 3
  setPrepLoopTarget: (n: number) => void;
  loopIteration: number;
  setLoopIteration: (n: number) => void;
  isPrepLooping: boolean;
  setIsPrepLooping: (v: boolean) => void;
  customLoopA: number | null; // seconds
  customLoopB: number | null; // seconds
  setCustomLoopA: (t: number | null) => void;
  setCustomLoopB: (t: number | null) => void;

  // ── Reset (new video selected) ─────────────────────────────────────────────
  resetPlayerState: () => void;
}

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set) => ({
  // Current video
  currentVideo: null,
  setCurrentVideo: (video) => set({ currentVideo: video }),

  // Search
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  isSearching: false,
  setIsSearching: (v) => set({ isSearching: v }),
  isLoadingMore: false,
  setIsLoadingMore: (v) => set({ isLoadingMore: v }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  nextPageToken: null,
  setNextPageToken: (token) => set({ nextPageToken: token }),
  appendSearchResults: (newVideos, nextToken) =>
    set((state) => {
      const existingIds = new Set(state.searchResults.map((v) => v.id));
      const filtered = newVideos.filter((v) => !existingIds.has(v.id));
      return {
        searchResults: [...state.searchResults, ...filtered],
        nextPageToken: nextToken,
      };
    }),
  showResults: false,
  setShowResults: (v) => set({ showResults: v }),

  // Learning mode
  activeMode: 'none',
  setActiveMode: (mode) => set({ activeMode: mode }),

  // A-B Prep Loop
  prepLoopTarget: 3,
  setPrepLoopTarget: (n) => set({ prepLoopTarget: n }),
  loopIteration: 1,
  setLoopIteration: (n) => set({ loopIteration: n }),
  isPrepLooping: false,
  setIsPrepLooping: (v) => set({ isPrepLooping: v }),
  customLoopA: null,
  customLoopB: null,
  setCustomLoopA: (t) => set({ customLoopA: t }),
  setCustomLoopB: (t) => set({ customLoopB: t }),

  // Transcript
  transcript: [],
  setTranscript: (lines) => set({ transcript: lines }),
  isLoadingTranscript: false,
  setIsLoadingTranscript: (v) => set({ isLoadingTranscript: v }),
  transcriptError: null,
  setTranscriptError: (err) => set({ transcriptError: err }),

  // Repeated sentences
  repeatedSentences: [],
  setRepeatedSentences: (sentences) => set({ repeatedSentences: sentences }),

  // Speech
  speechState: 'idle',
  setSpeechState: (state) => set({ speechState: state }),
  spokenText: '',
  setSpokenText: (text) => set({ spokenText: text }),

  // Shadowing
  currentLineIndex: 0,
  setCurrentLineIndex: (idx) => set({ currentLineIndex: idx }),
  shadowingFeedback: null,
  setShadowingFeedback: (v) => set({ shadowingFeedback: v }),

  // Gap-fill
  currentExercise: null,
  setCurrentExercise: (ex) => set({ currentExercise: ex }),
  gapFillAttempts: 0,
  setGapFillAttempts: (n) => set({ gapFillAttempts: n }),
  gapFillRevealed: false,
  setGapFillRevealed: (v) => set({ gapFillRevealed: v }),

  // Sidebar
  sidebarTab: 'repeated',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  // History panel
  historyPanelOpen: false,
  setHistoryPanelOpen: (v) => set({ historyPanelOpen: v }),

  // Video time
  currentTimeSec: 0,
  setCurrentTimeSec: (t) => set({ currentTimeSec: t }),

  // Reset player state when a new video is selected
  resetPlayerState: () =>
    set({
      activeMode: 'none',
      transcript: [],
      isLoadingTranscript: false,
      transcriptError: null,
      repeatedSentences: [],
      speechState: 'idle',
      spokenText: '',
      currentLineIndex: 0,
      shadowingFeedback: null,
      currentExercise: null,
      gapFillAttempts: 0,
      gapFillRevealed: false,
    }),
}));
