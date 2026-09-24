/// <reference types="dom-speech-recognition" />
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechState } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseSpeechRecognitionOptions {
  /**
   * BCP-47 language tag.
   * CRITICAL: Must be 'de-DE' for accurate German pronunciation matching.
   * Defaults to 'de-DE'.
   */
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  /** Milliseconds of silence before auto-stopping recognition. */
  silenceTimeoutMs?: number;
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
  abort: () => void;
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSpeechRecognition({
  lang = 'de-DE', // ← CRITICAL: 'de-DE' ensures the browser listens for German
  continuous = false,
  interimResults = true,
  silenceTimeoutMs = 6000,
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  // Keep callbacks fresh without re-creating the recognition instance
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const [spokenText, setSpokenText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const buildRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognitionCtor =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

    const rec: SpeechRecognition = new SpeechRecognitionCtor();

    // ── CRITICAL: Set language to German ─────────────────────────────────────
    rec.lang = lang;            // 'de-DE' — German (Germany)
    rec.continuous = continuous;
    rec.interimResults = interimResults;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      setSpeechState('listening');
      setError(null);
      setInterimText('');
      // Auto-stop after silence timeout
      silenceTimerRef.current = setTimeout(() => rec.stop(), silenceTimeoutMs);
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      // Reset silence timer on any speech activity
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => rec.stop(), silenceTimeoutMs);

      let finalText = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) setInterimText(interim);
      if (finalText) {
        const trimmed = finalText.trim();
        setSpokenText(trimmed);
        setSpeechState('processing');
        onResultRef.current?.(trimmed);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearSilenceTimer();
      let errorMsg: string;
      switch (event.error) {
        case 'no-speech':
          errorMsg = 'No speech detected. Please try again.';
          break;
        case 'not-allowed':
          errorMsg = 'Microphone access denied. Please allow microphone access.';
          break;
        case 'network':
          errorMsg = 'Network error. Speech recognition requires an internet connection.';
          break;
        case 'aborted':
          // User aborted — not an error to surface
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
      clearSilenceTimer();
      setSpeechState((prev) => (prev === 'listening' ? 'idle' : prev));
      setInterimText('');
    };

    return rec;
  }, [lang, continuous, interimResults, silenceTimeoutMs, isSupported, clearSilenceTimer]);

  // ── Public API ─────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (!isSupported) {
      const msg = 'Web Speech API is not supported. Please use Chrome or Edge.';
      setError(msg);
      setSpeechState('error');
      return;
    }
    // Abort any existing session first
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }
    const rec = buildRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    setSpokenText('');
    setInterimText('');
    try { rec.start(); } catch (e) {
      console.error('[useSpeechRecognition] start failed:', e);
    }
  }, [isSupported, buildRecognition]);

  const stop = useCallback(() => {
    clearSilenceTimer();
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  }, [clearSilenceTimer]);

  const abort = useCallback(() => {
    clearSilenceTimer();
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    setSpeechState('idle');
    setInterimText('');
  }, [clearSilenceTimer]);

  const reset = useCallback(() => {
    abort();
    setSpokenText('');
    setInterimText('');
    setError(null);
    setSpeechState('idle');
  }, [abort]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    };
  }, [clearSilenceTimer]);

  return {
    spokenText,
    interimText,
    speechState,
    isListening: speechState === 'listening',
    error,
    isSupported,
    start,
    stop,
    abort,
    reset,
  };
}
