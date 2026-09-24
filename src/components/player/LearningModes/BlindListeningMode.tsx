'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Ear, Eye, EyeOff, Mic, RotateCcw, CheckCircle2,
  XCircle, SkipForward, Volume2, Sparkles, Repeat, Headphones,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { similarityRatio, removeConsecutiveDuplicates, MATCH_THRESHOLD } from '@/lib/transcript';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';

type BlindState =
  | 'tracking'        // watching with subtitles blacked out
  | 'listening_loop'  // listen-only replay phase
  | 'listening'       // video PAUSED at sentence end, microphone active (de-DE)
  | 'processing'      // evaluating speech
  | 'correct'         // accurate repetition
  | 'incorrect'       // inaccurate repetition
  | 'revealed';       // subtitle revealed

export function BlindListeningMode() {
  const { transcript, currentTimeSec, prepLoopTarget, setPrepLoopTarget } = useAppStore();

  const [blindState, setBlindState] = useState<BlindState>('tracking');
  const [activeLine, setActiveLine] = useState<string>('');
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const [currentLoop, setCurrentLoop] = useState<number>(1);
  const [lastSpoken, setLastSpoken] = useState('');
  const [similarity, setSimilarity] = useState(0);

  const loopTarget = prepLoopTarget || 1;
  const lastTimeMsRef = useRef<number>(0);
  const lastTriggeredIdxRef = useRef<number>(-1);
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef<boolean>(false);
  const isMountedRef = useRef(true);

  const normalizedTarget = useMemo(() => removeConsecutiveDuplicates(activeLine), [activeLine]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    };
  }, []);

  // ── Speech Recognition in German (de-DE) ──────────────────────────────────
  const handleResult = useCallback(
    (spoken: string) => {
      if (!isMountedRef.current || !activeLine) return;
      const cleanSpoken = removeConsecutiveDuplicates(spoken);
      const cleanTarget = removeConsecutiveDuplicates(activeLine);
      const sim = similarityRatio(cleanSpoken, cleanTarget);

      setLastSpoken(spoken);
      setSimilarity(sim);
      setBlindState('processing');

      setTimeout(() => {
        if (!isMountedRef.current) return;
        if (sim >= MATCH_THRESHOLD) {
          setBlindState('correct');
          if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
          autoResumeTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            getGlobalPlayer()?.playVideo();
            setBlindState('tracking');
            setLastSpoken('');
            setSimilarity(0);
            setCurrentLoop(1);
          }, 1800);
        } else {
          setBlindState('incorrect');
        }
      }, 300);
    },
    [activeLine],
  );

  const { start, abort, isListening } = useSpeechRecognition({
    lang: 'de-DE',
    continuous: false,
    silenceTimeoutMs: 7000,
    onResult: handleResult,
  });

  // ── PAUSE VIDEO & ACTIVATE MICROPHONE IMMEDIATELY ────────────────────────
  const pauseAndActivateMic = useCallback(
    (lineText: string, index: number) => {
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);

      // 1. Immediately pause YouTube player
      const player = getGlobalPlayer();
      try {
        player?.pauseVideo();
      } catch (err) {
        console.warn('Error pausing player in BlindListening:', err);
      }

      // 2. Set active line and state
      setActiveLine(lineText);
      setActiveLineIndex(index);
      setLastSpoken('');
      setSimilarity(0);
      setBlindState('listening');

      // 3. Trigger Web Speech API (de-DE) immediately
      try {
        start();
      } catch (err) {
        console.warn('Error starting speech recognition in BlindListening:', err);
      }
    },
    [start],
  );

  // ── PRECISE TIME TRACKING & PAUSE TRIGGER ─────────────────────────────────
  useEffect(() => {
    if (!transcript.length) return;

    const timeMs = currentTimeSec * 1000;
    const prevTimeMs = lastTimeMsRef.current;
    lastTimeMsRef.current = timeMs;

    // Detect seek backward: allow re-triggering
    if (timeMs < prevTimeMs - 2000) {
      lastTriggeredIdxRef.current = -1;
      seekingRef.current = false;
    }

    // 1. TRACKING MODE: Watch playback until sentence reaches its end
    if (blindState === 'tracking') {
      for (let i = 0; i < transcript.length; i++) {
        const line = transcript[i];
        const lineStart = line.offset;
        const lineEnd = line.offset + line.duration;

        // When current time reaches the end of the sentence
        const reachedEnd = timeMs >= lineEnd - 120 && timeMs <= lineEnd + 800;
        const crossed = prevTimeMs < lineEnd && timeMs >= lineEnd - 120;

        if ((reachedEnd || crossed) && lastTriggeredIdxRef.current !== i) {
          lastTriggeredIdxRef.current = i;

          if (loopTarget > 1) {
            // Start listen-only loop phase
            setActiveLine(line.text);
            setActiveLineIndex(i);
            setCurrentLoop(1);
            setBlindState('listening_loop');
            seekingRef.current = true;
            getGlobalPlayer()?.seekTo(lineStart / 1000, true);
            getGlobalPlayer()?.playVideo();
          } else {
            // Loop target is 1: Pause video immediately and start mic!
            pauseAndActivateMic(line.text, i);
          }
          break;
        }
      }
    }

    // 2. LISTEN-ONLY LOOP MODE: Replay N times, then pause video and activate mic
    if (blindState === 'listening_loop' && activeLineIndex >= 0) {
      const line = transcript[activeLineIndex];
      if (line) {
        const lineStart = line.offset / 1000;
        const lineEnd = (line.offset + line.duration) / 1000;

        if (seekingRef.current) {
          if (currentTimeSec >= lineStart && currentTimeSec < lineEnd - 0.2) {
            seekingRef.current = false;
          }
          return;
        }

        if (currentTimeSec >= lineEnd - 0.12 || (timeMs >= line.offset + line.duration - 120)) {
          if (currentLoop < loopTarget) {
            setCurrentLoop((prev) => prev + 1);
            seekingRef.current = true;
            getGlobalPlayer()?.seekTo(lineStart, true);
            getGlobalPlayer()?.playVideo();
          } else {
            // Finished defined loops: PAUSE VIDEO IMMEDIATELY & START MIC
            pauseAndActivateMic(line.text, activeLineIndex);
          }
        }
      }
    }
  }, [
    currentTimeSec,
    transcript,
    blindState,
    activeLineIndex,
    currentLoop,
    loopTarget,
    pauseAndActivateMic,
  ]);

  // Current playing line for preview
  const currentPlayingLine = useMemo(() => {
    const timeMs = currentTimeSec * 1000;
    return transcript.find((l) => timeMs >= l.offset && timeMs <= l.offset + l.duration) || null;
  }, [transcript, currentTimeSec]);

  const handleSkip = () => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    abort();
    getGlobalPlayer()?.playVideo();
    setBlindState('tracking');
    setLastSpoken('');
    setSimilarity(0);
    setCurrentLoop(1);
  };

  const handleRetry = () => {
    setLastSpoken('');
    setSimilarity(0);
    setBlindState('listening');
    start();
  };

  const handleReplayAudio = () => {
    if (activeLineIndex >= 0 && transcript[activeLineIndex]) {
      const line = transcript[activeLineIndex];
      getGlobalPlayer()?.seekTo(line.offset / 1000, true);
      getGlobalPlayer()?.playVideo();
      setCurrentLoop(1);
      setBlindState('listening_loop');
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
              Subtitles 100% blacked out · Video auto-pauses at sentence end for repetition
            </span>
          </div>
        </div>

        {/* Status Badge */}
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
              padding: '4px 10px',
              borderRadius: 8,
              background:
                blindState === 'listening'
                  ? '#fee2e2'
                  : '#111827',
              color:
                blindState === 'listening'
                  ? '#b91c1c'
                  : '#fbbf24',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              border: `1px solid ${blindState === 'listening' ? '#fecdd3' : '#374151'}`,
            }}
          >
            {blindState === 'listening' ? (
              <>
                <Mic size={12} className="animate-pulse" />
                <span>VIDEO PAUSED — SPEAK NOW!</span>
              </>
            ) : (
              <>
                <EyeOff size={12} />
                <span>SUBTITLES BLACKED OUT</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* ── 1. TRACKING PLAYBACK ── */}
      {blindState === 'tracking' && (
        <div
          style={{
            padding: '24px 20px',
            borderRadius: 14,
            background: 'var(--bg-elevated)',
            border: '1.5px dashed var(--border-default)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Ear size={26} color="var(--accent-500)" />
          <div>
            <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              Listening Strictly By Ear…
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              When this German sentence ends, the video will automatically pause and activate your microphone!
            </p>
          </div>

          {currentPlayingLine && (
            <button
              onClick={() => pauseAndActivateMic(currentPlayingLine.text, transcript.indexOf(currentPlayingLine))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                background: 'var(--accent-500)',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-xs)',
                marginTop: 4,
              }}
            >
              <Mic size={13} />
              <span>Pause & Record Speech Now</span>
            </button>
          )}
        </div>
      )}

      {/* ── 2. LISTEN LOOPING ── */}
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
              onClick={() => pauseAndActivateMic(activeLine, activeLineIndex)}
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
              <span>Pause & Speak Now</span>
            </button>
          </div>

          <div
            style={{
              padding: '20px',
              borderRadius: 10,
              background: '#030712',
              border: '1px solid #1f2937',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#d1d5db',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <EyeOff size={16} color="#fbbf24" />
            <span>[ Subtitle 100% Blacked Out — Focus purely on German sound ]</span>
          </div>
        </div>
      )}

      {/* ── 3. PAUSED FOR SPEECH: VIDEO PAUSED, MIC RECORDING (de-DE) ── */}
      {blindState !== 'tracking' && blindState !== 'listening_loop' && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '16px 18px',
            borderRadius: 14,
            background:
              blindState === 'correct'
                ? 'var(--success-bg)'
                : blindState === 'incorrect'
                ? 'var(--error-bg)'
                : '#fff1f2',
            border: `1.5px solid ${
              blindState === 'correct'
                ? 'var(--success)'
                : blindState === 'incorrect'
                ? 'var(--error)'
                : '#fecdd3'
            }`,
          }}
        >
          {/* Subtitle Card (Blacked out unless revealed) */}
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
                <p style={{ fontSize: 16, fontWeight: 750, color: 'var(--text-primary)' }}>
                  {normalizedTarget}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#fbbf24', fontSize: 13, fontWeight: 650 }}>
                <EyeOff size={15} />
                <span>[ Subtitle Blacked Out — Speak what you heard in German ]</span>
              </div>
            )}
          </div>

          {/* Voice Input Feedback: Actively Recording */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: isListening ? '#fee2e2' : 'var(--bg-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Mic size={17} color={isListening ? '#ef4444' : 'var(--text-muted)'} className={isListening ? 'animate-pulse' : ''} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: isListening ? '#ef4444' : 'var(--text-muted)', fontWeight: isListening ? 700 : 500 }}>
                {isListening ? '🎙️ Recording your German speech (de-DE)… Speak now!' : 'Spoken repetition:'}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                {lastSpoken || (isListening ? 'Listening…' : 'No speech recorded yet')}
              </div>
            </div>

            {similarity > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: similarity >= MATCH_THRESHOLD ? 'var(--success)' : 'var(--error)' }}>
                {Math.round(similarity * 100)}% match
              </span>
            )}
          </div>

          {blindState === 'correct' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 13, fontWeight: 700 }}>
              <CheckCircle2 size={16} />
              <span>Fantastisch! Accurate ear comprehension ({Math.round(similarity * 100)}%). Resuming video…</span>
            </div>
          )}

          {blindState === 'incorrect' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--error)', fontSize: 13, fontWeight: 650 }}>
              <XCircle size={16} />
              <span>Didn&apos;t quite match. Replay audio, try speaking again, or reveal subtitle.</span>
            </div>
          )}

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
                  fontWeight: 650,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={13} />
                Try Again
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
              Replay Sentence
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
              <span>Resume Video</span>
              <SkipForward size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
