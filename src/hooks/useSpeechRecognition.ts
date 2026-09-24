/// <reference types="dom-speech-recognition" />
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechState } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseSpeechRecognitionOptions {
  /**
   * BCP-47 language tag.
   * CRITICAL: Strictly 'de-DE' for German speech recognition.
   */
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  /** Milliseconds of complete silence before auto-evaluating. Default is 2500ms (2.5s). */
  silenceDebounceMs?: number;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface UseSpeechRecognitionReturn {
  spokenText: string;
  interimText: string;
  speechState: SpeechState;
  isListening: boolean;
  error: string | null;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
  stopAndEvaluate: () => void;
  abort: () => void;
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSpeechRecognition({
  lang = 'de-DE', // ← Strictly enforced German locale
  continuous = true, // ← Continuous listening so micro-pauses don't cut off speech
  interimResults = true,
  silenceDebounceMs = 2500, // ← Generous 2.5s silence buffer before auto-evaluating
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedTextRef = useRef<string>('');
  const hasEvaluatedRef = useRef<boolean>(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  // Keep callbacks fresh without re-creating recognition instance
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const [spokenText, setSpokenText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // Commits the evaluated speech to onResult and stops recognition
  const commitEvaluation = useCallback((overrideText?: string) => {
    clearDebounceTimer();
    const textToCommit = (overrideText ?? accumulatedTextRef.current).trim();
    if (!textToCommit || hasEvaluatedRef.current) return;

    hasEvaluatedRef.current = true;
    setSpokenText(textToCommit);
    setSpeechState('processing');
    onResultRef.current?.(textToCommit);

    try {
      recognitionRef.current?.stop();
    } catch { /* ignore */ }
  }, [clearDebounceTimer]);

  const buildRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognitionCtor =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

    const rec: SpeechRecognition = new SpeechRecognitionCtor();

    // ── CRITICAL: Strictly enforce 'de-DE' German ────────────────────────────
    rec.lang = 'de-DE';
    rec.continuous = true; // Never auto-stop on first micro-pause
    rec.interimResults = interimResults;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      setSpeechState('listening');
      setError(null);
      setInterimText('');
      hasEvaluatedRef.current = false;
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalChunk = '';
      let interimChunk = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript + ' ';
        } else {
          interimChunk += result[0].transcript;
        }
      }

      const totalHeard = (finalChunk + ' ' + interimChunk).trim();
      if (totalHeard) {
        accumulatedTextRef.current = totalHeard;
        setSpokenText(totalHeard);
        setInterimText(interimChunk);

        // CLEAR TIMEOUT: Reset the countdown every time user speaks
        clearDebounceTimer();

        // SILENCE DEBOUNCE: Only evaluate after 2.5s of complete silence
        debounceTimerRef.current = setTimeout(() => {
          commitEvaluation(totalHeard);
        }, silenceDebounceMs);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearDebounceTimer();
      let errorMsg: string;
      switch (event.error) {
        case 'no-speech':
          // If no speech at all was captured, don't break UI, just revert to idle
          if (!accumulatedTextRef.current) {
            setSpeechState('idle');
            return;
          }
          errorMsg = 'No speech detected.';
          break;
        case 'not-allowed':
          errorMsg = 'Microphone access denied. Please allow microphone access.';
          break;
        case 'network':
          errorMsg = 'Network error. Speech recognition requires an internet connection.';
          break;
        case 'aborted':
          setSpeechState('idle');
          return;
        default:
          errorMsg = `Speech recognition error: ${event.error}`;
      }
      setError(errorMsg);
      setSpeechState('error');
      onErrorRef.current?.(errorMsg);
    };

    rec.onend = () => {
      clearDebounceTimer();
      // If we have uncommitted spoken words when engine closes, evaluate them now
      if (accumulatedTextRef.current.trim() && !hasEvaluatedRef.current) {
        commitEvaluation(accumulatedTextRef.current);
      } else {
        setSpeechState((prev) => (prev === 'listening' ? 'idle' : prev));
      }
      setInterimText('');
    };

    return rec;
  }, [isSupported, interimResults, silenceDebounceMs, clearDebounceTimer, commitEvaluation]);

  // ── Public API ─────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (!isSupported) {
      const msg = 'Web Speech API is not supported. Please use Chrome or Edge.';
      setError(msg);
      setSpeechState('error');
      return;
    }
    clearDebounceTimer();
    accumulatedTextRef.current = '';
    hasEvaluatedRef.current = false;
    setSpokenText('');
    setInterimText('');

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }

    const rec = buildRecognition();
    if (!rec) return;
    recognitionRef.current = rec;

    try {
      rec.start();
    } catch (e) {
      console.error('[useSpeechRecognition] start failed:', e);
    }
  }, [isSupported, buildRecognition, clearDebounceTimer]);

  // Manual stop with immediate evaluation ("I'm Done Speaking" button)
  const stopAndEvaluate = useCallback(() => {
    if (accumulatedTextRef.current.trim()) {
      commitEvaluation(accumulatedTextRef.current);
    } else {
      clearDebounceTimer();
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      setSpeechState('idle');
    }
  }, [commitEvaluation, clearDebounceTimer]);

  const stop = useCallback(() => {
    stopAndEvaluate();
  }, [stopAndEvaluate]);

  const abort = useCallback(() => {
    clearDebounceTimer();
    hasEvaluatedRef.current = true;
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    setSpeechState('idle');
    setInterimText('');
  }, [clearDebounceTimer]);

  const reset = useCallback(() => {
    abort();
    accumulatedTextRef.current = '';
    hasEvaluatedRef.current = false;
    setSpokenText('');
    setInterimText('');
    setError(null);
    setSpeechState('idle');
  }, [abort]);

  useEffect(() => {
    return () => {
      clearDebounceTimer();
      try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    };
  }, [clearDebounceTimer]);

  return {
    spokenText,
    interimText,
    speechState,
    isListening: speechState === 'listening',
    error,
    isSupported,
    start,
    stop,
    stopAndEvaluate,
    abort,
    reset,
  };
}
