'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Mic, SkipForward, RotateCcw,
  Eye, MessageSquareDashed, Repeat, Headphones,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import {
  buildGapFillExercise,
  removeConsecutiveDuplicates,
  cleanWord,
  wordsMatch,
  type WordDiffResult,
} from '@/lib/transcript';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import type { GapFillExercise } from '@/lib/types';
import { WordDiffFeedback } from './WordDiffFeedback';

type GapState =
  | 'tracking'        // tracking video playback
  | 'listening_loop'  // Listen-Only mode: plays N times uninterrupted
  | 'active_exercise' // After N loops finished: video HARD PAUSED, blank shown, mic active
  | 'correct'         // right word — resuming
  | 'incorrect'       // wrong word — video remains PAUSED, show retry
  | 'revealed';       // showing answer before resuming

export function VoiceGapFillMode() {
  const { transcript, currentTimeSec, prepLoopTarget, setPrepLoopTarget } = useAppStore();

  const [gapState, setGapState] = useState<GapState>('tracking');
  const [exercise, setExercise] = useState<GapFillExercise | null>(null);
  const [exerciseIndex, setExerciseIndex] = useState<number>(-1);
  const [currentLoop, setCurrentLoop] = useState<number>(1);
  const [diffResult, setDiffResult] = useState<WordDiffResult | null>(null);
  const [lastSpoken, setLastSpoken] = useState('');

  const loopTarget = prepLoopTarget || 3;
  const lastTimeMsRef = useRef<number>(0);
  const pausedIdxSetRef = useRef<Set<number>>(new Set());
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef<boolean>(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    };
  }, []);

  const handleResult = useCallback(
    (spoken: string) => {
      if (!isMountedRef.current || !exercise) return;
      const cleanSpoken = removeConsecutiveDuplicates(spoken);
      setLastSpoken(spoken);

      const targetWordClean = cleanWord(exercise.targetWord);
      const spokenTokens = cleanSpoken.split(/\s+/).filter(Boolean);

      // Check if target word exists in spoken tokens
      let matchedIndex = -1;
      spokenTokens.forEach((token, idx) => {
        if (wordsMatch(token, targetWordClean)) {
          matchedIndex = idx;
        }
      });

      const isMatch = matchedIndex !== -1;
      const diff: WordDiffResult = {
        score: isMatch ? 100 : 0,
        isPassing: isMatch,
        spokenDiffs: spokenTokens.map((w, idx) => ({
          word: w,
          isCorrect: idx === matchedIndex,
        })),
        missingWords: isMatch ? [] : [exercise.targetWord],
        matchedWordsCount: isMatch ? 1 : 0,
        totalTargetWords: 1,
      };

      setDiffResult(diff);

      if (isMatch) {
        setGapState('correct');
        if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          getGlobalPlayer()?.playVideo();
          setGapState('tracking');
          setLastSpoken('');
          setDiffResult(null);
          setCurrentLoop(1);
        }, 1800);
      } else {
        // Incorrect: STRICT PROGRESSION - Keep video PAUSED!
        setGapState('incorrect');
        try {
          getGlobalPlayer()?.pauseVideo();
        } catch { /* ignore */ }
      }
    },
    [exercise],
  );

  const { start, abort, stopAndEvaluate, isListening, spokenText } = useSpeechRecognition({
    lang: 'de-DE', // Strictly German locale
    continuous: true, // Continuous listening
    silenceDebounceMs: 2500, // 2.5s silence buffer
    onResult: handleResult,
  });

  // ── TRIGGER ACTIVE EXERCISE (Hard Pause Video & Open Mic) ──────────────────
  const triggerActiveExercise = useCallback(() => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    setGapState('active_exercise');
    setDiffResult(null);
    setLastSpoken('');

    try {
      getGlobalPlayer()?.pauseVideo();
    } catch (err) {
      console.warn('Could not pause player:', err);
    }

    try {
      start();
    } catch (err) {
      console.warn('Speech recognition error:', err);
    }
  }, [start]);

  // ── START GAP FILL PRACTICE (Listen-Only Phase) ───────────────────────────
  const startGapFill = useCallback(
    (ex: GapFillExercise, index: number) => {
      pausedIdxSetRef.current.add(index);
      setExercise(ex);
      setExerciseIndex(index);
      setLastSpoken('');
      setDiffResult(null);
      setCurrentLoop(1);

      if (loopTarget > 1) {
        setGapState('listening_loop');
        seekingRef.current = true;
        getGlobalPlayer()?.seekTo(ex.line.offset / 1000, true);
        getGlobalPlayer()?.playVideo();
      } else {
        triggerActiveExercise();
      }
    },
    [loopTarget, triggerActiveExercise],
  );

  // Playback sync & Looping
  useEffect(() => {
    if (!transcript.length) return;

    const timeMs = currentTimeSec * 1000;
    const prevTimeMs = lastTimeMsRef.current;
    lastTimeMsRef.current = timeMs;

    if (timeMs < prevTimeMs - 2000) {
      pausedIdxSetRef.current.clear();
      seekingRef.current = false;
    }

    // 1. Tracking: detect when sentence ends
    if (gapState === 'tracking') {
      for (let i = 0; i < transcript.length; i++) {
        const line = transcript[i];
        const lineEnd = line.offset + line.duration;

        const crossed = prevTimeMs <= lineEnd && timeMs >= lineEnd;
        const withinWindow = timeMs >= lineEnd && timeMs <= lineEnd + 900;

        if ((crossed || withinWindow) && !pausedIdxSetRef.current.has(i)) {
          const ex = buildGapFillExercise(line);
          if (ex) {
            startGapFill(ex, i);
            break;
          }
        }
      }
    }

    // 2. Listening Loop: loop N times in listen-only mode
    if (gapState === 'listening_loop' && exercise) {
      const lineStart = exercise.line.offset / 1000;
      const lineEnd = (exercise.line.offset + exercise.line.duration) / 1000;

      if (seekingRef.current) {
        if (currentTimeSec >= lineStart && currentTimeSec < lineEnd - 0.25) {
          seekingRef.current = false;
        }
        return;
      }

      if (currentTimeSec >= lineEnd || (timeMs >= exercise.line.offset + exercise.line.duration - 100)) {
        if (currentLoop < loopTarget) {
          setCurrentLoop((prev) => prev + 1);
          seekingRef.current = true;
          getGlobalPlayer()?.seekTo(lineStart, true);
          getGlobalPlayer()?.playVideo();
        } else {
          // All N listen-only loops finished: Hard pause and open mic
          triggerActiveExercise();
        }
      }
    }
  }, [
    currentTimeSec,
    transcript,
    gapState,
    exercise,
    currentLoop,
    loopTarget,
    startGapFill,
    triggerActiveExercise,
  ]);

  const currentPlayingLine = useMemo(() => {
    const timeMs = currentTimeSec * 1000;
    return transcript.find((l) => timeMs >= l.offset && timeMs <= l.offset + l.duration) || null;
  }, [transcript, currentTimeSec]);

  const handleSkip = () => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    abort();
    getGlobalPlayer()?.playVideo();
    setGapState('tracking');
    setLastSpoken('');
    setDiffResult(null);
    setCurrentLoop(1);
  };

  const handleReveal = () => {
    setGapState('revealed');
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    autoResumeTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      getGlobalPlayer()?.playVideo();
      setGapState('tracking');
      setLastSpoken('');
      setDiffResult(null);
      setCurrentLoop(1);
    }, 2400);
  };

  const handleRetry = () => {
    setLastSpoken('');
    setDiffResult(null);
    setGapState('active_exercise');
    start();
  };

  return (
    <div
      className="animate-fade-in"
      style={{
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-subtle)',
        borderRadius: 18,
        padding: '18px 20px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--accent-50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MessageSquareDashed size={14} color="var(--accent-600)" />
          </div>
          <div>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Voice Gap Fill
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Plays {loopTarget}× in Listen-Only mode · Hard-pauses video for missing word on play {loopTarget + 1}
            </span>
          </div>
        </div>

        {/* Visible Loop Count Setting & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)' }}>Loops:</span>
            {[1, 2, 3, 5].map((cnt) => (
              <button
                key={cnt}
                onClick={() => setPrepLoopTarget(cnt)}
                style={{
                  padding: '2px 6px',
                  borderRadius: 5,
                  border: prepLoopTarget === cnt ? '1px solid var(--accent-500)' : '1px solid transparent',
                  background: prepLoopTarget === cnt ? 'var(--accent-500)' : 'transparent',
                  color: prepLoopTarget === cnt ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {cnt}×
              </button>
            ))}
          </div>

          <span
            style={{
              fontSize: 11,
              fontWeight: 750,
              padding: '3px 8px',
              borderRadius: 8,
              background:
                gapState === 'active_exercise' || gapState === 'incorrect'
                  ? '#fef3c7'
                  : gapState === 'listening_loop'
                  ? 'var(--accent-50)'
                  : 'var(--bg-elevated)',
              color:
                gapState === 'active_exercise' || gapState === 'incorrect'
                  ? '#b45309'
                  : gapState === 'listening_loop'
                  ? 'var(--accent-700)'
                  : 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background:
                  gapState === 'active_exercise' || gapState === 'incorrect'
                    ? '#f59e0b'
                    : gapState === 'listening_loop'
                    ? 'var(--accent-500)'
                    : 'var(--text-muted)',
              }}
            />
            {gapState === 'active_exercise' || gapState === 'incorrect'
              ? 'Speak Missing Word (Hard Paused)'
              : gapState === 'listening_loop'
              ? `Listen-Only Loop ${currentLoop}/${loopTarget}`
              : 'Tracking Audio'}
          </span>
        </div>
      </div>

      {/* ── 1. TRACKING PLAYBACK ── */}
      {gapState === 'tracking' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 16px',
            background: 'var(--bg-elevated)',
            borderRadius: 14,
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Current Sentence:
            </span>
            {currentPlayingLine && (
              <button
                onClick={() => {
                  const ex = buildGapFillExercise(currentPlayingLine);
                  if (ex) startGapFill(ex, transcript.indexOf(currentPlayingLine));
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'var(--accent-500)',
                  color: '#ffffff',
                  fontSize: 11.5,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <Repeat size={12} />
                Practice Blank Now
              </button>
            )}
          </div>

          <p
            style={{
              fontSize: 15,
              fontWeight: 650,
              color: currentPlayingLine ? 'var(--text-primary)' : 'var(--text-muted)',
              lineHeight: 1.4,
              fontStyle: currentPlayingLine ? 'normal' : 'italic',
            }}
          >
            {currentPlayingLine
              ? removeConsecutiveDuplicates(currentPlayingLine.text)
              : 'Playing video… will auto-loop at sentence boundary'}
          </p>
        </div>
      )}

      {/* ── 2. LISTEN-ONLY PHASE ── */}
      {gapState === 'listening_loop' && exercise && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '16px 18px',
            borderRadius: 14,
            background: 'var(--accent-50)',
            border: '1.5px solid var(--accent-300)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Headphones size={15} color="var(--accent-600)" />
              <span style={{ fontSize: 12, fontWeight: 750, color: 'var(--accent-700)', textTransform: 'uppercase' }}>
                Listen-Only Mode: Loop {currentLoop} of {loopTarget}
              </span>
            </div>
            <button
              onClick={triggerActiveExercise}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 8,
                background: 'var(--accent-500)',
                color: '#ffffff',
                fontSize: 11.5,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <Mic size={12} />
              <span>Ready to Fill Blank Now</span>
            </button>
          </div>

          <div>
            <p style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {removeConsecutiveDuplicates(exercise.line.text)}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Listen carefully to the German words. After loop {loopTarget}, the keyword will be hidden for you to speak!
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={handleSkip}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Skip this sentence
            </button>
          </div>
        </div>
      )}

      {/* ── 3. ACTIVE GAP FILL EXERCISE (Hard Paused, Blank Shown, Mic Active) ── */}
      {gapState !== 'tracking' && gapState !== 'listening_loop' && exercise && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '16px 18px',
            borderRadius: 14,
            background: 'var(--bg-elevated)',
            border: '1.5px solid var(--border-subtle)',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-700)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
              Fill in the Blank (Video Hard Paused):
            </span>
            <p style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {gapState === 'revealed' || gapState === 'correct' ? (
                <span>
                  {removeConsecutiveDuplicates(exercise.line.text).split(new RegExp(`(${exercise.targetWord})`, 'i')).map((part, i) =>
                    cleanWord(part) === cleanWord(exercise.targetWord) ? (
                      <span key={i} style={{ color: '#16a34a', fontWeight: 800, textDecoration: 'underline', margin: '0 3px' }}>
                        {part}
                      </span>
                    ) : (
                      part
                    )
                  )}
                </span>
              ) : (
                exercise.displayText
              )}
            </p>
          </div>

          {/* Granular Word Diff & Mic Component */}
          <WordDiffFeedback
            diffResult={diffResult}
            spokenText={spokenText || lastSpoken}
            isListening={isListening}
            onStopSpeaking={stopAndEvaluate}
            passingThreshold={80}
          />

          {gapState === 'revealed' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-700)', fontSize: 13, fontWeight: 650 }}>
              <Eye size={16} />
              <span>Revealed: &quot;{exercise.targetWord}&quot;. Resuming video…</span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {gapState === 'incorrect' && (
              <>
                <button
                  onClick={handleRetry}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '7px 14px',
                    borderRadius: 8,
                    background: 'var(--accent-500)',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={13} />
                  Try Speaking Again
                </button>
                <button
                  onClick={handleReveal}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-default)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Eye size={12} />
                  Reveal Answer
                </button>
              </>
            )}

            <button
              onClick={handleSkip}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 12px',
                borderRadius: 8,
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                marginLeft: 'auto',
              }}
            >
              <span>Skip</span>
              <SkipForward size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
