'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Mic, SkipForward, RotateCcw, Volume2, Headphones, Sparkles,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { removeConsecutiveDuplicates, diffSentenceWords, type WordDiffResult, stripTrailingArticles } from '@/lib/transcript';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { WordDiffFeedback } from './WordDiffFeedback';

type ShadowState =
  | 'tracking'        // watching/tracking
  | 'listening_loop'  // playing sentence loop (NO mic, NO pause)
  | 'active_exercise' // After N loops finished: video HARD PAUSED, microphone automatically active
  | 'correct'         // word match >= 80%: auto-advances to next sentence
  | 'incorrect';      // word match < 80%: video remains PAUSED, prompts retry

export function ShadowingMode() {
  const { transcript, currentTimeSec, prepLoopTarget, setPrepLoopTarget } = useAppStore();

  const [shadowState, setShadowState] = useState<ShadowState>('tracking');
  const [activeLine, setActiveLine] = useState<string>('');
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const [currentLoop, setCurrentLoop] = useState<number>(1);
  const [diffResult, setDiffResult] = useState<WordDiffResult | null>(null);
  const [lastSpoken, setLastSpoken] = useState('');

  const loopTarget = prepLoopTarget || 3;
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef<boolean>(false);
  const isMountedRef = useRef(true);

  // Target sentence with consecutive duplicate stutter words and trailing dangling articles removed
  const normalizedTarget = useMemo(() => {
    const deduped = removeConsecutiveDuplicates(activeLine);
    const { cleanText } = stripTrailingArticles(deduped);
    return cleanText || deduped;
  }, [activeLine]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    };
  }, []);

  const handleResultRef = useRef<(spoken: string) => void>(() => {});

  const { start, abort, stopAndEvaluate, isListening, spokenText } = useSpeechRecognition({
    lang: 'de-DE',
    continuous: true,
    silenceDebounceMs: 2200,
    onResult: (spoken) => handleResultRef.current(spoken),
  });

  // ── 1. START LOOP CYCLE FOR A GIVEN SEGMENT ─────────────────────────────────
  const startLoopForSegment = useCallback(
    (index: number) => {
      if (!isMountedRef.current || !transcript || !transcript[index]) return;
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);

      try {
        abort();
      } catch { /* ignore */ }

      const line = transcript[index];
      const { cleanText } = stripTrailingArticles(line.text);
      const targetText = cleanText || line.text;

      setActiveLine(targetText);
      setActiveLineIndex(index);
      setCurrentLoop(1);
      setDiffResult(null);
      setLastSpoken('');
      setShadowState('listening_loop');

      seekingRef.current = true;
      setTimeout(() => {
        seekingRef.current = false;
      }, 400);

      const player = getGlobalPlayer();
      player?.seekTo(line.offset / 1000, true);
      player?.playVideo();
    },
    [transcript, abort],
  );

  // ── 2. AUTOMATIC HARD PAUSE & MIC ACTIVATION ────────────────────────────────
  const triggerActiveExercise = useCallback(() => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);

    // 1. Immediately HARD PAUSE YouTube video
    try {
      getGlobalPlayer()?.pauseVideo();
    } catch (err) {
      console.warn('Could not pause player:', err);
    }

    // 2. Automatically activate microphone without waiting for user click
    setShadowState('active_exercise');
    setDiffResult(null);
    setLastSpoken('');

    try {
      start();
    } catch (err) {
      console.warn('Speech recognition start error:', err);
    }
  }, [start]);

  // ── 3. SPEECH EVALUATION & AUTOMATIC ADVANCEMENT ────────────────────────────
  const handleResult = useCallback(
    (spoken: string) => {
      if (!isMountedRef.current || !normalizedTarget) return;

      const cleanSpoken = removeConsecutiveDuplicates(spoken);
      setLastSpoken(spoken);

      const diff = diffSentenceWords(cleanSpoken, normalizedTarget);
      setDiffResult(diff);

      if (diff.isPassing) {
        // Correct (>= 80%): Show success, then AUTOMATICALLY advance to NEXT segment
        setShadowState('correct');
        if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);

        autoResumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          const nextIndex = activeLineIndex + 1;
          if (nextIndex < transcript.length) {
            // FIX THE RESET BUG: Automatically advance to NEXT sentence, unpause, and begin loop cycle
            startLoopForSegment(nextIndex);
          } else {
            getGlobalPlayer()?.playVideo();
            setShadowState('tracking');
          }
        }, 1400);
      } else {
        // Fails (< 80%): Video MUST REMAIN PAUSED, prompts retry
        setShadowState('incorrect');
        try {
          getGlobalPlayer()?.pauseVideo();
        } catch { /* ignore */ }
      }
    },
    [normalizedTarget, activeLineIndex, transcript.length, startLoopForSegment],
  );

  useEffect(() => {
    handleResultRef.current = handleResult;
  }, [handleResult]);

  const speakReference = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(removeConsecutiveDuplicates(text));
    u.lang = 'de-DE';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  };

  // ── 4. AUTO-LOOP & AUTO-PAUSE DETECTION ENGINE ──────────────────────────────
  useEffect(() => {
    if (!transcript.length) return;

    // Initial Auto-Start: pick segment based on current playhead or start from segment 0
    if (activeLineIndex === -1) {
      const timeMs = currentTimeSec * 1000;
      const foundIdx = transcript.findIndex((l) => timeMs >= l.offset && timeMs < l.offset + l.duration);
      const initialIdx = foundIdx !== -1 ? foundIdx : 0;
      startLoopForSegment(initialIdx);
      return;
    }

    if (shadowState !== 'listening_loop' || activeLineIndex < 0) return;

    const line = transcript[activeLineIndex];
    if (!line) return;

    const lineStart = line.offset / 1000;
    const lineEnd = (line.offset + line.duration) / 1000;

    if (seekingRef.current) {
      if (currentTimeSec >= lineStart - 0.2 && currentTimeSec < lineEnd - 0.2) {
        seekingRef.current = false;
      }
      return;
    }

    const timeMs = currentTimeSec * 1000;
    const reachedEnd = currentTimeSec >= lineEnd - 0.15 || timeMs >= line.offset + line.duration - 120;

    if (reachedEnd) {
      if (currentLoop < loopTarget) {
        // Automatic loop repetition: increment loop and seek back to sentence start
        setCurrentLoop((prev) => prev + 1);
        seekingRef.current = true;
        setTimeout(() => {
          seekingRef.current = false;
        }, 400);
        getGlobalPlayer()?.seekTo(lineStart, true);
        getGlobalPlayer()?.playVideo();
      } else {
        // Exact end of the loopTarget-th playback: AUTOMATIC HARD-PAUSE & AUTOMATIC MIC ACTIVATION!
        triggerActiveExercise();
      }
    }
  }, [
    currentTimeSec,
    transcript,
    shadowState,
    activeLineIndex,
    currentLoop,
    loopTarget,
    startLoopForSegment,
    triggerActiveExercise,
  ]);

  const handleSkip = () => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    abort();
    const nextIndex = activeLineIndex + 1;
    if (nextIndex < transcript.length) {
      startLoopForSegment(nextIndex);
    } else {
      getGlobalPlayer()?.playVideo();
      setShadowState('tracking');
    }
  };

  const handleRetry = () => {
    setLastSpoken('');
    setDiffResult(null);
    setShadowState('active_exercise');
    try {
      getGlobalPlayer()?.pauseVideo();
    } catch { /* ignore */ }
    start();
  };

  const handleReplay = () => {
    if (activeLineIndex >= 0) {
      startLoopForSegment(activeLineIndex);
    }
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
            <Headphones size={14} color="var(--accent-600)" />
          </div>
          <div>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Shadowing Practice
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Auto-loops {loopTarget}× · Auto-pauses &amp; opens mic · Auto-advances on ≥ 80% match
            </span>
          </div>
        </div>

        {/* Loop setting pills & status badge */}
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
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 8,
              background:
                shadowState === 'correct'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : shadowState === 'active_exercise' || shadowState === 'incorrect'
                  ? '#fef3c7'
                  : shadowState === 'listening_loop'
                  ? 'var(--accent-50)'
                  : 'var(--bg-elevated)',
              color:
                shadowState === 'correct'
                  ? '#059669'
                  : shadowState === 'active_exercise' || shadowState === 'incorrect'
                  ? '#b45309'
                  : shadowState === 'listening_loop'
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
                  shadowState === 'correct'
                    ? '#10b981'
                    : shadowState === 'active_exercise' || shadowState === 'incorrect'
                    ? '#f59e0b'
                    : shadowState === 'listening_loop'
                    ? 'var(--accent-500)'
                    : 'var(--text-muted)',
              }}
            />
            {shadowState === 'correct'
              ? 'Passed! Auto-advancing…'
              : shadowState === 'active_exercise' || shadowState === 'incorrect'
              ? 'Mic Active (Hard Paused)'
              : shadowState === 'listening_loop'
              ? `Playing Loop ${currentLoop}/${loopTarget}`
              : 'Tracking Audio'}
          </span>
        </div>
      </div>

      {/* ── LISTEN-ONLY LOOPING PHASE ── */}
      {shadowState === 'listening_loop' && (
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
                Listen-Only Cadence: Loop {currentLoop} of {loopTarget}
              </span>
            </div>
            <button
              onClick={triggerActiveExercise}
              title="Skip remaining loops and speak immediately"
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
              <span>Speak Now</span>
            </button>
          </div>

          <div>
            <p style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {normalizedTarget}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Listening to native pronunciation. After loop {loopTarget}, the video will automatically pause and open your microphone.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Sentence {activeLineIndex + 1} of {transcript.length}
            </span>
            <button
              onClick={handleSkip}
              style={{
                fontSize: 11.5,
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Skip to next sentence →
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVE EXERCISE / EVALUATION / CORRECT / INCORRECT ── */}
      {shadowState !== 'listening_loop' && (
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
          {/* Success Auto-Advance Banner */}
          {shadowState === 'correct' && (
            <div
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#059669',
                fontSize: 12.5,
                fontWeight: 750,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Sparkles size={14} />
              <span>Ausgezeichnet ({diffResult?.score}%)! Automatischer Wechsel zum nächsten Satz…</span>
            </div>
          )}

          {/* Target sentence display */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-700)', textTransform: 'uppercase' }}>
                Target Sentence (Video Paused):
              </span>
              <button
                onClick={() => speakReference(normalizedTarget)}
                title="Hear native audio"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <Volume2 size={12} /> Listen
              </button>
            </div>
            <p style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {normalizedTarget}
            </p>
          </div>

          {/* Granular Word-by-Word Diff & Mic Component */}
          <WordDiffFeedback
            diffResult={diffResult}
            spokenText={spokenText || lastSpoken}
            isListening={isListening}
            onStopSpeaking={stopAndEvaluate}
            passingThreshold={80}
          />

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {shadowState === 'incorrect' && (
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
            )}

            <button
              onClick={handleReplay}
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
              <RotateCcw size={12} />
              Replay Sentence
            </button>

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
              <span>Next Sentence</span>
              <SkipForward size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
