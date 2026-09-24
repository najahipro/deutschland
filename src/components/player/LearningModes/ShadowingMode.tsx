'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Mic, SkipForward, RotateCcw, Volume2, Repeat, Headphones,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { removeConsecutiveDuplicates, diffSentenceWords, type WordDiffResult } from '@/lib/transcript';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { WordDiffFeedback } from './WordDiffFeedback';

type ShadowState =
  | 'tracking'        // tracking playback normally
  | 'listening_loop'  // Listen-Only mode: playing sentence N times (NO mic, NO pause)
  | 'active_exercise' // After N loops finished: video HARD PAUSED, microphone active
  | 'correct'         // word match >= 80%: auto-resumes video
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
  const lastTimeMsRef = useRef<number>(0);
  const pausedIdxSetRef = useRef<Set<number>>(new Set());
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef<boolean>(false);
  const isMountedRef = useRef(true);

  // Target sentence with consecutive duplicate stutter words removed
  const normalizedTarget = useMemo(() => removeConsecutiveDuplicates(activeLine), [activeLine]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    };
  }, []);

  // ── Speech Recognition Evaluation (Granular Word Diffing, 80% Threshold) ──
  const handleResult = useCallback(
    (spoken: string) => {
      if (!isMountedRef.current || !normalizedTarget) return;

      const cleanSpoken = removeConsecutiveDuplicates(spoken);
      setLastSpoken(spoken);

      const diff = diffSentenceWords(cleanSpoken, normalizedTarget);
      setDiffResult(diff);

      if (diff.isPassing) {
        // Correct (>= 80%): show green success feedback and resume video
        setShadowState('correct');
        if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          getGlobalPlayer()?.playVideo();
          setShadowState('tracking');
          setLastSpoken('');
          setDiffResult(null);
          setCurrentLoop(1);
        }, 1600);
      } else {
        // Fails (< 80%): STRICT PROGRESSION - Video MUST REMAIN PAUSED!
        setShadowState('incorrect');
        try {
          getGlobalPlayer()?.pauseVideo();
        } catch { /* ignore */ }
      }
    },
    [normalizedTarget],
  );

  const { start, abort, stopAndEvaluate, isListening, spokenText } = useSpeechRecognition({
    lang: 'de-DE', // Strictly German locale
    continuous: true, // Continuous listening so micro-pauses don't interrupt
    silenceDebounceMs: 2500, // 2.5s silence buffer
    onResult: handleResult,
  });

  const speakReference = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(removeConsecutiveDuplicates(text));
    u.lang = 'de-DE';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  };

  // ── TRIGGER ACTIVE EXERCISE (Hard Pause Video & Open Mic) ──────────────────
  const triggerActiveExercise = useCallback(() => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    setShadowState('active_exercise');
    setDiffResult(null);
    setLastSpoken('');

    // 1. HARD PAUSE the YouTube video
    try {
      getGlobalPlayer()?.pauseVideo();
    } catch (err) {
      console.warn('Could not pause player:', err);
    }

    // 2. Start speech recognition with unlimited time
    try {
      start();
    } catch (err) {
      console.warn('Speech recognition start error:', err);
    }
  }, [start]);

  // ── START SENTENCE PRACTICE (Listen-Only Phase) ────────────────────────────
  const startSentencePractice = useCallback(
    (lineText: string, index: number) => {
      pausedIdxSetRef.current.add(index);
      setActiveLine(lineText);
      setActiveLineIndex(index);
      setLastSpoken('');
      setDiffResult(null);
      setCurrentLoop(1);

      if (loopTarget > 1) {
        // Play sentence in Listen-Only mode (NO pausing, NO mic)
        setShadowState('listening_loop');
        seekingRef.current = true;
        const line = transcript[index];
        if (line) {
          getGlobalPlayer()?.seekTo(line.offset / 1000, true);
          getGlobalPlayer()?.playVideo();
        }
      } else {
        // LoopTarget is 1: Pause video immediately for mic practice
        triggerActiveExercise();
      }
    },
    [loopTarget, transcript, triggerActiveExercise],
  );

  // ── PLAYBACK SYNCHRONIZATION & LOOP ENGINE ────────────────────────────────
  useEffect(() => {
    if (!transcript.length) return;

    const timeMs = currentTimeSec * 1000;
    const prevTimeMs = lastTimeMsRef.current;
    lastTimeMsRef.current = timeMs;

    // Reset passed index set on backward seek
    if (timeMs < prevTimeMs - 2000) {
      pausedIdxSetRef.current.clear();
      seekingRef.current = false;
    }

    // 1. Tracking mode: detect sentence boundary
    if (shadowState === 'tracking') {
      for (let i = 0; i < transcript.length; i++) {
        const line = transcript[i];
        const lineEnd = line.offset + line.duration;

        const crossed = prevTimeMs <= lineEnd && timeMs >= lineEnd;
        const withinWindow = timeMs >= lineEnd && timeMs <= lineEnd + 900;

        if ((crossed || withinWindow) && !pausedIdxSetRef.current.has(i)) {
          startSentencePractice(line.text, i);
          break;
        }
      }
    }

    // 2. Listening Loop mode: loop N times without pausing or mic
    if (shadowState === 'listening_loop' && activeLineIndex >= 0) {
      const line = transcript[activeLineIndex];
      if (line) {
        const lineStart = line.offset / 1000;
        const lineEnd = (line.offset + line.duration) / 1000;

        if (seekingRef.current) {
          if (currentTimeSec >= lineStart && currentTimeSec < lineEnd - 0.25) {
            seekingRef.current = false;
          }
          return;
        }

        // When playback reaches the end of the sentence
        if (currentTimeSec >= lineEnd || (timeMs >= line.offset + line.duration - 100)) {
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
    }
  }, [
    currentTimeSec,
    transcript,
    shadowState,
    activeLineIndex,
    currentLoop,
    loopTarget,
    startSentencePractice,
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
    setShadowState('tracking');
    setLastSpoken('');
    setDiffResult(null);
    setCurrentLoop(1);
  };

  const handleRetry = () => {
    setLastSpoken('');
    setDiffResult(null);
    setShadowState('active_exercise');
    start();
  };

  const handleReplay = () => {
    if (activeLineIndex >= 0 && transcript[activeLineIndex]) {
      const line = transcript[activeLineIndex];
      getGlobalPlayer()?.seekTo(line.offset / 1000, true);
      getGlobalPlayer()?.playVideo();
      setCurrentLoop(1);
      setShadowState('listening_loop');
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
              Plays {loopTarget}× in Listen-Only mode · Hard-pauses video for mic on play {loopTarget + 1}
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
                shadowState === 'active_exercise' || shadowState === 'incorrect'
                  ? '#fef3c7'
                  : shadowState === 'listening_loop'
                  ? 'var(--accent-50)'
                  : 'var(--bg-elevated)',
              color:
                shadowState === 'active_exercise' || shadowState === 'incorrect'
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
                  shadowState === 'active_exercise' || shadowState === 'incorrect'
                    ? '#f59e0b'
                    : shadowState === 'listening_loop'
                    ? 'var(--accent-500)'
                    : 'var(--text-muted)',
              }}
            />
            {shadowState === 'active_exercise' || shadowState === 'incorrect'
              ? 'Mic Active (Hard Paused)'
              : shadowState === 'listening_loop'
              ? `Listen-Only Loop ${currentLoop}/${loopTarget}`
              : 'Tracking Audio'}
          </span>
        </div>
      </div>

      {/* ── 1. TRACKING PLAYBACK ── */}
      {shadowState === 'tracking' && (
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
                onClick={() => startSentencePractice(currentPlayingLine.text, transcript.indexOf(currentPlayingLine))}
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
                Practice Sentence Now
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

      {/* ── 2. LISTEN-ONLY PHASE (Plays N times uninterrupted) ── */}
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
              <span>Ready to Speak Now</span>
            </button>
          </div>

          <div>
            <p style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {normalizedTarget}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Listening to native cadence without interruption. The video will hard-pause and activate mic after loop {loopTarget}.
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

      {/* ── 3. ACTIVE EXERCISE (Hard Paused, Unlimited Time, Word-by-Word Diffing) ── */}
      {shadowState !== 'tracking' && shadowState !== 'listening_loop' && (
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
          {/* Target sentence display */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-700)', textTransform: 'uppercase' }}>
                Target German Sentence (Hard Paused):
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
              <span>Skip Sentence</span>
              <SkipForward size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
