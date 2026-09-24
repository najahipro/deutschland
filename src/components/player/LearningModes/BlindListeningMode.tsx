'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Ear, Eye, EyeOff, Mic, RotateCcw,
  SkipForward, Volume2, Headphones, Sparkles,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { removeConsecutiveDuplicates, diffSentenceWords, type WordDiffResult, stripTrailingArticles } from '@/lib/transcript';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { WordDiffFeedback } from './WordDiffFeedback';

type BlindState =
  | 'tracking'        // watching with subtitles blacked out
  | 'listening_loop'  // listen-only replay phase with blacked out subtitles
  | 'listening'       // video HARD PAUSED at sentence end, microphone active (de-DE)
  | 'correct'         // accurate repetition >= 80%: reveals subtitle, auto-advances
  | 'incorrect'       // repetition < 80%: video stays PAUSED, prompts retry
  | 'revealed';       // subtitle revealed on request

export function BlindListeningMode() {
  const { transcript, currentTimeSec, prepLoopTarget, setPrepLoopTarget } = useAppStore();

  const [blindState, setBlindState] = useState<BlindState>('tracking');
  const [activeLine, setActiveLine] = useState<string>('');
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const [currentLoop, setCurrentLoop] = useState<number>(1);
  const [diffResult, setDiffResult] = useState<WordDiffResult | null>(null);
  const [lastSpoken, setLastSpoken] = useState('');

  const loopTarget = prepLoopTarget || 1;
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

  // ── 1. START BLIND LOOP CYCLE FOR A GIVEN SEGMENT ───────────────────────────
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
      setBlindState('listening_loop');

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
  const triggerActiveListening = useCallback(() => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);

    // 1. Immediately HARD PAUSE YouTube video
    try {
      getGlobalPlayer()?.pauseVideo();
    } catch (err) {
      console.warn('Could not pause player in BlindListening:', err);
    }

    // 2. Automatically activate microphone without waiting for user click
    setBlindState('listening');
    setDiffResult(null);
    setLastSpoken('');

    try {
      start();
    } catch (err) {
      console.warn('Speech recognition start error in BlindListening:', err);
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
        // Correct (>= 80%): Reveal subtitle and AUTOMATICALLY advance to NEXT segment
        setBlindState('correct');
        if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);

        autoResumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          const nextIndex = activeLineIndex + 1;
          if (nextIndex < transcript.length) {
            // FIX THE RESET BUG: Automatically advance to NEXT sentence, unpause, and begin loop cycle
            startLoopForSegment(nextIndex);
          } else {
            getGlobalPlayer()?.playVideo();
            setBlindState('tracking');
          }
        }, 1500);
      } else {
        // Failed (< 80%): Video stays PAUSED, prompts retry
        setBlindState('incorrect');
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

    if (blindState !== 'listening_loop' || activeLineIndex < 0) return;

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
        triggerActiveListening();
      }
    }
  }, [
    currentTimeSec,
    transcript,
    blindState,
    activeLineIndex,
    currentLoop,
    loopTarget,
    startLoopForSegment,
    triggerActiveListening,
  ]);

  const handleSkip = () => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    abort();
    const nextIndex = activeLineIndex + 1;
    if (nextIndex < transcript.length) {
      startLoopForSegment(nextIndex);
    } else {
      getGlobalPlayer()?.playVideo();
      setBlindState('tracking');
    }
  };

  const handleRetry = () => {
    setLastSpoken('');
    setDiffResult(null);
    setBlindState('listening');
    try {
      getGlobalPlayer()?.pauseVideo();
    } catch { /* ignore */ }
    start();
  };

  const handleReplayAudio = () => {
    if (activeLineIndex >= 0) {
      startLoopForSegment(activeLineIndex);
    }
  };

  const handleReveal = () => {
    setBlindState('revealed');
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
      {/* Header */}
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
            <Ear size={14} color="var(--accent-600)" />
          </div>
          <div>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Blind Listening Mode
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Auto-loops {loopTarget}× blind · Auto-pauses &amp; opens mic · Auto-advances on ≥ 80% match
            </span>
          </div>
        </div>

        {/* Status Badge & Loop Selector */}
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
              padding: '4px 10px',
              borderRadius: 8,
              background:
                blindState === 'correct'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : blindState === 'listening' || blindState === 'incorrect'
                  ? '#fef3c7'
                  : '#111827',
              color:
                blindState === 'correct'
                  ? '#059669'
                  : blindState === 'listening' || blindState === 'incorrect'
                  ? '#b45309'
                  : '#fbbf24',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              border: `1px solid ${
                blindState === 'correct'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : blindState === 'listening' || blindState === 'incorrect'
                  ? '#fde68a'
                  : '#374151'
              }`,
            }}
          >
            {blindState === 'correct' ? (
              <>
                <Sparkles size={12} color="#059669" />
                <span>PASSED! AUTO-ADVANCING…</span>
              </>
            ) : blindState === 'listening' || blindState === 'incorrect' ? (
              <>
                <Mic size={12} className="animate-pulse" />
                <span>MIC ACTIVE — SPEAK NOW</span>
              </>
            ) : (
              <>
                <EyeOff size={12} />
                <span>BLIND LOOP {currentLoop}/{loopTarget}</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* ── LISTEN LOOPING (SUBTITLES 100% BLACKED OUT) ── */}
      {blindState === 'listening_loop' && (
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
                Ear Training: Loop {currentLoop} of {loopTarget}
              </span>
            </div>
            <button
              onClick={triggerActiveListening}
              title="Skip remaining audio loops and speak now"
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

          <div
            style={{
              padding: '24px 20px',
              borderRadius: 10,
              background: '#030712',
              border: '1px solid #1f2937',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#d1d5db',
            }}
          >
            <EyeOff size={20} color="#fbbf24" />
            <span style={{ fontSize: 13.5, fontWeight: 650, color: '#f3f4f6' }}>
              [ Subtitle 100% Blacked Out — Focus purely on German sound ]
            </span>
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
              Playing {loopTarget}× uninterrupted. The video will automatically pause and open your microphone.
            </span>
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

      {/* ── PAUSED FOR SPEECH & EVALUATION ── */}
      {blindState !== 'listening_loop' && (
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
          {blindState === 'correct' && (
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

          {/* Subtitle Card (Blacked out unless revealed or passed) */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: blindState === 'revealed' || blindState === 'correct' ? 'var(--bg-card)' : '#030712',
              border: `1px solid ${blindState === 'revealed' || blindState === 'correct' ? 'var(--border-subtle)' : '#1f2937'}`,
              textAlign: blindState === 'revealed' || blindState === 'correct' ? 'left' : 'center',
            }}
          >
            {blindState === 'revealed' || blindState === 'correct' ? (
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  German Subtitle Revealed:
                </span>
                <p style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-primary)' }}>
                  {normalizedTarget}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#fbbf24', fontSize: 13, fontWeight: 650 }}>
                <EyeOff size={15} />
                <span>[ Subtitle Blacked Out — Speak what you heard into the microphone ]</span>
              </div>
            )}
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
            {blindState === 'incorrect' && (
              <button
                onClick={handleRetry}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '7px 12px',
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
              onClick={handleReplayAudio}
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
              <Volume2 size={12} />
              Replay Audio
            </button>

            {blindState !== 'revealed' && blindState !== 'correct' && (
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
                Reveal Subtitle
              </button>
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
              <span>Next Sentence</span>
              <SkipForward size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
