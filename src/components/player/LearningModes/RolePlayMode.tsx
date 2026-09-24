'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Users, Volume2, Mic, Play, RotateCcw, SkipForward, CheckCircle2, XCircle } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { removeConsecutiveDuplicates, diffSentenceWords, type WordDiffResult } from '@/lib/transcript';
import { WordDiffFeedback } from './WordDiffFeedback';

type RolePlayState =
  | 'partner_listening' // Partner's turn: video plays normally and unmuted
  | 'user_speaking'     // User's turn: video HARD PAUSED, unlimited time to speak
  | 'evaluating'        // Evaluating speech against target
  | 'passed'            // >= 80% word match, auto-resumes video
  | 'retry';            // < 80% word match: video remains PAUSED, prompts retry

export function RolePlayMode() {
  const { transcript, currentTimeSec } = useAppStore();

  // User selects role: 0 = Speaker A, 1 = Speaker B
  const [userRole, setUserRole] = useState<0 | 1>(0);
  const [roleState, setRoleState] = useState<RolePlayState>('partner_listening');
  const [activeUserLineIdx, setActiveUserLineIdx] = useState<number>(-1);
  const [diffResult, setDiffResult] = useState<WordDiffResult | null>(null);
  const [lastSpoken, setLastSpoken] = useState('');

  const handledLinesSetRef = useRef<Set<number>>(new Set());
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeMsRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    };
  }, []);

  // Find active line based on current playback time
  const currentLineInfo = useMemo(() => {
    const timeMs = currentTimeSec * 1000;
    const index = transcript.findIndex((l) => timeMs >= l.offset && timeMs <= l.offset + l.duration);
    if (index === -1) return null;
    const speaker = (index % 2) as 0 | 1;
    return {
      line: transcript[index],
      index,
      speaker,
      isUserTurn: speaker === userRole,
    };
  }, [transcript, currentTimeSec, userRole]);

  // Target sentence for active line
  const activeLine = activeUserLineIdx >= 0 && transcript[activeUserLineIdx]
    ? transcript[activeUserLineIdx]
    : currentLineInfo?.line || null;

  const targetClean = activeLine ? removeConsecutiveDuplicates(activeLine.text) : '';

  // ── Speech Recognition Evaluation (Granular 80% Word Matching) ─────────────
  const handleResult = useCallback(
    (spoken: string) => {
      if (!isMountedRef.current || !targetClean) return;

      const cleanSpoken = removeConsecutiveDuplicates(spoken);
      setLastSpoken(spoken);

      const diff = diffSentenceWords(cleanSpoken, targetClean);
      setDiffResult(diff);

      if (diff.isPassing) {
        // Correct (>= 80%): Show green feedback and resume playback
        setRoleState('passed');
        if (activeUserLineIdx >= 0) {
          handledLinesSetRef.current.add(activeUserLineIdx);
        }

        if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          try {
            const player = getGlobalPlayer();
            player?.unMute();
            player?.playVideo();
          } catch (e) {
            console.warn('Resume video failed:', e);
          }
          setRoleState('partner_listening');
          setActiveUserLineIdx(-1);
          setDiffResult(null);
          setLastSpoken('');
        }, 1600);
      } else {
        // Fails (< 80%): STRICT PROGRESSION - Video MUST REMAIN PAUSED!
        setRoleState('retry');
        try {
          getGlobalPlayer()?.pauseVideo();
        } catch { /* ignore */ }
      }
    },
    [targetClean, activeUserLineIdx],
  );

  const { start, abort, stopAndEvaluate, isListening, spokenText } = useSpeechRecognition({
    lang: 'de-DE', // Strictly German locale
    continuous: true, // Continuous listening
    silenceDebounceMs: 2500, // 2.5s silence buffer
    onResult: handleResult,
  });

  // ── TRIGGER USER TURN (Hard Pause & Open Mic) ──────────────────────────────
  const triggerUserTurn = useCallback(
    (lineIdx: number) => {
      if (handledLinesSetRef.current.has(lineIdx)) return;

      setActiveUserLineIdx(lineIdx);
      setRoleState('user_speaking');
      setDiffResult(null);
      setLastSpoken('');

      // 1. HARD PAUSE the YouTube video
      try {
        const player = getGlobalPlayer();
        player?.pauseVideo();
      } catch (err) {
        console.warn('Error pausing player for user turn:', err);
      }

      // 2. Activate microphone with de-DE and generous silence debounce
      try {
        start();
      } catch (err) {
        console.warn('Error starting speech recognition:', err);
      }
    },
    [start],
  );

  // ── PLAYBACK MONITORING ───────────────────────────────────────────────────
  useEffect(() => {
    if (!transcript.length) return;

    const timeMs = currentTimeSec * 1000;
    const prevTimeMs = lastTimeMsRef.current;
    lastTimeMsRef.current = timeMs;

    // Reset handled set on backward seek
    if (timeMs < prevTimeMs - 2000) {
      handledLinesSetRef.current.clear();
    }

    // Only inspect playback when not already paused waiting for speech
    if (roleState !== 'partner_listening') return;

    for (let i = 0; i < transcript.length; i++) {
      const line = transcript[i];
      const speaker = (i % 2) as 0 | 1;
      const isUser = speaker === userRole;

      if (!isUser) continue; // Partner line: let video play normally

      // User line reached: HARD PAUSE immediately
      const isNearStart = timeMs >= line.offset && timeMs <= line.offset + line.duration;
      if (isNearStart && !handledLinesSetRef.current.has(i)) {
        triggerUserTurn(i);
        break;
      }
    }
  }, [currentTimeSec, transcript, userRole, roleState, triggerUserTurn]);

  // Clean unmount
  useEffect(() => {
    return () => {
      try {
        const player = getGlobalPlayer();
        player?.unMute();
      } catch { /* ignore */ }
      abort();
    };
  }, [abort]);

  const handleRetrySpeaking = () => {
    setRoleState('user_speaking');
    setDiffResult(null);
    setLastSpoken('');
    start();
  };

  const handleReplayUserAudio = () => {
    if (activeUserLineIdx >= 0 && transcript[activeUserLineIdx]) {
      const line = transcript[activeUserLineIdx];
      const player = getGlobalPlayer();
      try {
        player?.unMute();
        player?.seekTo(line.offset / 1000, true);
        player?.playVideo();
      } catch { /* ignore */ }

      // Let user listen once, then pause again for speaking
      setTimeout(() => {
        try {
          player?.pauseVideo();
        } catch { /* ignore */ }
        handleRetrySpeaking();
      }, line.duration + 200);
    }
  };

  const handleSkipTurn = () => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    if (activeUserLineIdx >= 0) {
      handledLinesSetRef.current.add(activeUserLineIdx);
    }
    abort();
    try {
      const player = getGlobalPlayer();
      player?.unMute();
      player?.playVideo();
    } catch { /* ignore */ }
    setRoleState('partner_listening');
    setActiveUserLineIdx(-1);
    setDiffResult(null);
    setLastSpoken('');
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
            <Users size={14} color="var(--accent-600)" />
          </div>
          <div>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Role-Play Dialogue Practice
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Strict Progression: Video hard-pauses on your lines until 80% word match is achieved
            </span>
          </div>
        </div>

        {/* Live Audio & Mic Status Badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 750,
            padding: '4px 10px',
            borderRadius: 8,
            background: roleState !== 'partner_listening' ? '#fef3c7' : 'var(--accent-50)',
            color: roleState !== 'partner_listening' ? '#b45309' : 'var(--accent-700)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            border: `1px solid ${roleState !== 'partner_listening' ? '#fde68a' : 'var(--accent-200)'}`,
          }}
        >
          {roleState !== 'partner_listening' ? (
            <>
              <Mic size={13} className="animate-pulse" />
              <span>YOUR TURN (VIDEO PAUSED)</span>
            </>
          ) : (
            <>
              <Volume2 size={13} />
              <span>PARTNER SPEAKING (VIDEO PLAYING)</span>
            </>
          )}
        </span>
      </div>

      {/* Role Picker (Speaker A vs. Speaker B) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          background: 'var(--bg-elevated)',
          padding: 4,
          borderRadius: 12,
        }}
      >
        <button
          onClick={() => {
            setUserRole(0);
            handledLinesSetRef.current.clear();
            setRoleState('partner_listening');
            abort();
          }}
          style={{
            padding: '8px 12px',
            borderRadius: 9,
            border: userRole === 0 ? '1px solid var(--accent-300)' : '1px solid transparent',
            background: userRole === 0 ? 'var(--bg-card)' : 'transparent',
            boxShadow: userRole === 0 ? 'var(--shadow-sm)' : 'none',
            color: userRole === 0 ? 'var(--accent-600)' : 'var(--text-secondary)',
            fontWeight: userRole === 0 ? 700 : 500,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s ease',
          }}
        >
          🎭 Play Speaker A (Pause on A & speak)
        </button>
        <button
          onClick={() => {
            setUserRole(1);
            handledLinesSetRef.current.clear();
            setRoleState('partner_listening');
            abort();
          }}
          style={{
            padding: '8px 12px',
            borderRadius: 9,
            border: userRole === 1 ? '1px solid var(--accent-300)' : '1px solid transparent',
            background: userRole === 1 ? 'var(--bg-card)' : 'transparent',
            boxShadow: userRole === 1 ? 'var(--shadow-sm)' : 'none',
            color: userRole === 1 ? 'var(--accent-600)' : 'var(--text-secondary)',
            fontWeight: userRole === 1 ? 700 : 500,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s ease',
          }}
        >
          🎭 Play Speaker B (Pause on B & speak)
        </button>
      </div>

      {/* ── 1. PARTNER'S TURN (Playing normally) ── */}
      {roleState === 'partner_listening' && (
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
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Partner Speaking (Listen Closely):
            </span>
            {currentLineInfo && currentLineInfo.isUserTurn && (
              <button
                onClick={() => triggerUserTurn(currentLineInfo.index)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'var(--accent-500)',
                  color: '#ffffff',
                  fontSize: 11.5,
                  fontWeight: 650,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Mic size={12} />
                Pause & Practice Line Now
              </button>
            )}
          </div>

          <p style={{ fontSize: 16, fontWeight: 650, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {currentLineInfo
              ? removeConsecutiveDuplicates(currentLineInfo.line.text)
              : 'Playing video… will automatically pause when it is your dialogue turn'}
          </p>
        </div>
      )}

      {/* ── 2. USER'S TURN (Hard Pause, Unlimited Speaking Time, Granular Feedback) ── */}
      {roleState !== 'partner_listening' && activeLine && (
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--accent-600)',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Mic size={13} className="animate-pulse" />
                <span>YOUR DIALOGUE TURN (VIDEO HARD PAUSED)</span>
              </span>

              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                Unlimited time to speak
              </span>
            </div>

            <p style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {targetClean}
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

          {/* Action buttons (Try Again, Replay Audio, Skip) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {roleState === 'retry' && (
              <button
                onClick={handleRetrySpeaking}
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
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <RotateCcw size={13} />
                Try Speaking Again
              </button>
            )}

            <button
              onClick={handleReplayUserAudio}
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

            <button
              onClick={handleSkipTurn}
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
              <span>Skip to Partner</span>
              <SkipForward size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
