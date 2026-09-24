'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Users, Volume2, VolumeX, Mic, RotateCcw, SkipForward, Play } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { removeConsecutiveDuplicates, diffSentenceWords, type WordDiffResult } from '@/lib/transcript';
import { WordDiffFeedback } from './WordDiffFeedback';

/**
 * 6-Step State Machine for Role-Play Dialogue:
 * 1. PARTNER'S TURN: Video plays normally, audio UNMUTED (player.unMute()).
 * 2. USER'S TURN STARTS: Exact millisecond line begins, video instantly mute() AND pauseVideo().
 * 3. SPEAKING PHASE: Video remains paused & muted. Web Speech API waits for user to speak.
 * 4. VALIDATION: Fail (< 80%) = stays paused. Success (>= 80%) = calls playVideo().
 * 5. SILENT PLAYBACK: Video plays user's turn while REMAINING MUTED.
 * 6. NEXT TURN: The instant partner's line starts, video calls unMute().
 */
type RolePlayStep =
  | 'partner_turn'       // Step 1: Partner speaks, unmuted video playing
  | 'user_speaking'      // Step 2 & 3: User's turn starts, video instantly MUTED & PAUSED, mic active
  | 'user_retry'         // Step 4 (Failed): Video stays paused & muted, prompts retry
  | 'user_silent_play';  // Step 5: Passed (>=80%), plays user turn while REMAINING MUTED

export function RolePlayMode() {
  const { transcript, currentTimeSec } = useAppStore();

  // User selects role: 0 = Speaker A, 1 = Speaker B
  const [userRole, setUserRole] = useState<0 | 1>(0);
  const [roleState, setRoleState] = useState<RolePlayStep>('partner_turn');
  const [activeUserLineIdx, setActiveUserLineIdx] = useState<number>(-1);
  const [diffResult, setDiffResult] = useState<WordDiffResult | null>(null);
  const [lastSpoken, setLastSpoken] = useState('');

  const completedLinesRef = useRef<Set<number>>(new Set());
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

  // ── Step 4: Validation (>= 80% Word Match) ─────────────────────────────────
  const handleResult = useCallback(
    (spoken: string) => {
      if (!isMountedRef.current || !targetClean) return;
      const player = getGlobalPlayer();

      const cleanSpoken = removeConsecutiveDuplicates(spoken);
      setLastSpoken(spoken);

      const diff = diffSentenceWords(cleanSpoken, targetClean);
      setDiffResult(diff);

      if (diff.isPassing) {
        // Step 4 (Success >= 80%): Mark line as completed
        if (activeUserLineIdx >= 0) {
          completedLinesRef.current.add(activeUserLineIdx);
        }

        // Transition to Step 5: Resume playback while REMAINING STRICTLY MUTED
        if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setRoleState('user_silent_play');
          try {
            player?.mute(); // Step 5: MUST REMAIN MUTED
            player?.playVideo(); // Call playVideo()
          } catch (e) {
            console.warn('[RolePlayMode] playVideo failed:', e);
          }
        }, 1200);
      } else {
        // Step 4 (Failed < 80%): Video MUST REMAIN PAUSED AND MUTED
        setRoleState('user_retry');
        try {
          player?.mute();
          player?.pauseVideo();
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

  // ── Step 2 & 3: Trigger User Turn (MUTE + PAUSE + Open Mic) ────────────────
  const triggerUserTurn = useCallback(
    (lineIdx: number) => {
      if (completedLinesRef.current.has(lineIdx)) return;

      const player = getGlobalPlayer();
      const line = transcript[lineIdx];

      // Step 2: EXACT millisecond line begins -> instantly mute() AND pauseVideo()
      try {
        player?.mute();
        player?.pauseVideo();
        if (line) {
          player?.seekTo(line.offset / 1000, true);
        }
      } catch (err) {
        console.warn('[RolePlayMode] Error pausing and muting player:', err);
      }

      setActiveUserLineIdx(lineIdx);
      setRoleState('user_speaking');
      setDiffResult(null);
      setLastSpoken('');

      // Step 3: Speaking phase -> Web Speech API waits for user to speak
      try {
        start();
      } catch (err) {
        console.warn('[RolePlayMode] Error starting speech recognition:', err);
      }
    },
    [transcript, start],
  );

  // ── Time-Tracking & 6-Step State Machine Transitions ──────────────────────
  useEffect(() => {
    if (!transcript.length) return;
    const player = getGlobalPlayer();
    const timeMs = currentTimeSec * 1000;
    const prevTimeMs = lastTimeMsRef.current;
    lastTimeMsRef.current = timeMs;

    // Backward seek: reset completed lines ahead of seek position
    if (timeMs < prevTimeMs - 1500) {
      completedLinesRef.current.forEach((idx) => {
        if (transcript[idx] && transcript[idx].offset >= timeMs - 500) {
          completedLinesRef.current.delete(idx);
        }
      });
    }

    // ── STEP 5 HANDLING: Silent Playback (Audio remains MUTED) ───────────────
    if (roleState === 'user_silent_play') {
      const activeLineObj = activeUserLineIdx >= 0 ? transcript[activeUserLineIdx] : null;
      const nextLineObj = activeUserLineIdx >= 0 && activeUserLineIdx + 1 < transcript.length
        ? transcript[activeUserLineIdx + 1]
        : null;

      const userLineEnd = activeLineObj ? activeLineObj.offset + activeLineObj.duration : 0;
      const nextLineStart = nextLineObj ? nextLineObj.offset : userLineEnd;

      // ── STEP 6 TRANSITION: As soon as partner's next line starts -> unMute() ──
      if (timeMs >= nextLineStart - 80 || timeMs >= userLineEnd - 80) {
        try {
          player?.unMute(); // Step 6: Instantly unMute()
        } catch { /* ignore */ }
        setRoleState('partner_turn');
        setActiveUserLineIdx(-1);
        setDiffResult(null);
        setLastSpoken('');
        return;
      } else {
        // Enforce silent playback during user's video segment
        try {
          player?.mute();
        } catch { /* ignore */ }
        return;
      }
    }

    // ── STEP 2 & 3 ENFORCEMENT: While speaking or retry, keep PAUSED & MUTED ─
    if (roleState === 'user_speaking' || roleState === 'user_retry') {
      try {
        player?.mute();
        player?.pauseVideo();
      } catch { /* ignore */ }
      return;
    }

    // ── STEP 1: Partner's Turn (Video plays unmuted) ──────────────────────────
    if (roleState === 'partner_turn') {
      // Check if current playback time hit a user turn
      for (let i = 0; i < transcript.length; i++) {
        const line = transcript[i];
        const speaker = (i % 2) as 0 | 1;
        const isUser = speaker === userRole;

        if (!isUser) continue;

        const lineStart = line.offset;
        const lineEnd = line.offset + line.duration;
        const isWithinWindow = timeMs >= lineStart - 80 && timeMs <= lineEnd;

        if (isWithinWindow && !completedLinesRef.current.has(i)) {
          // User's turn starts! Instantly mute & pause
          triggerUserTurn(i);
          return;
        }
      }

      // In partner's turn, ensure player is strictly unmuted
      try {
        player?.unMute();
      } catch { /* ignore */ }
    }
  }, [
    currentTimeSec,
    transcript,
    userRole,
    roleState,
    activeUserLineIdx,
    triggerUserTurn,
  ]);

  // Clean unmount: restore audio
  useEffect(() => {
    return () => {
      try {
        getGlobalPlayer()?.unMute();
      } catch { /* ignore */ }
      abort();
    };
  }, [abort]);

  const handleRetrySpeaking = () => {
    const player = getGlobalPlayer();
    try {
      player?.mute();
      player?.pauseVideo();
    } catch { /* ignore */ }
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
        player?.unMute(); // Allow native speaker listening preview
        player?.seekTo(line.offset / 1000, true);
        player?.playVideo();
      } catch { /* ignore */ }

      // When the native reference finishes playing, mute and pause again for speech
      setTimeout(() => {
        try {
          player?.mute();
          player?.pauseVideo();
        } catch { /* ignore */ }
        handleRetrySpeaking();
      }, line.duration + 200);
    }
  };

  const handleSkipTurn = () => {
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    if (activeUserLineIdx >= 0) {
      completedLinesRef.current.add(activeUserLineIdx);
    }
    abort();
    const player = getGlobalPlayer();
    const nextLine = activeUserLineIdx >= 0 && transcript[activeUserLineIdx + 1]
      ? transcript[activeUserLineIdx + 1]
      : null;
    try {
      if (nextLine) {
        player?.seekTo(nextLine.offset / 1000, true);
      }
      player?.unMute();
      player?.playVideo();
    } catch { /* ignore */ }
    setRoleState('partner_turn');
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
              6-Step Sequence: Instant Pause & Mute → Spoken Validation → Silent Playback → Auto-Unmute
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
            background:
              roleState === 'user_speaking' || roleState === 'user_retry'
                ? '#fef3c7'
                : roleState === 'user_silent_play'
                ? '#f3e8ff'
                : 'var(--accent-50)',
            color:
              roleState === 'user_speaking' || roleState === 'user_retry'
                ? '#b45309'
                : roleState === 'user_silent_play'
                ? '#7e22ce'
                : 'var(--accent-700)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            border: `1px solid ${
              roleState === 'user_speaking' || roleState === 'user_retry'
                ? '#fde68a'
                : roleState === 'user_silent_play'
                ? '#e9d5ff'
                : 'var(--accent-200)'
            }`,
          }}
        >
          {roleState === 'user_speaking' || roleState === 'user_retry' ? (
            <>
              <VolumeX size={13} color="#b45309" />
              <span>YOUR TURN: PAUSED & MUTED</span>
            </>
          ) : roleState === 'user_silent_play' ? (
            <>
              <VolumeX size={13} color="#7e22ce" />
              <span>PASSED: SILENT PLAYBACK (MUTED)</span>
            </>
          ) : (
            <>
              <Volume2 size={13} />
              <span>PARTNER SPEAKING (AUDIO UNMUTED)</span>
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
            completedLinesRef.current.clear();
            setRoleState('partner_turn');
            setActiveUserLineIdx(-1);
            setDiffResult(null);
            setLastSpoken('');
            abort();
            try {
              const player = getGlobalPlayer();
              player?.unMute();
              player?.playVideo();
            } catch { /* ignore */ }
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
            completedLinesRef.current.clear();
            setRoleState('partner_turn');
            setActiveUserLineIdx(-1);
            setDiffResult(null);
            setLastSpoken('');
            abort();
            try {
              const player = getGlobalPlayer();
              player?.unMute();
              player?.playVideo();
            } catch { /* ignore */ }
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

      {/* ── 1. PARTNER'S TURN (Playing normally, Unmuted) ── */}
      {roleState === 'partner_turn' && (
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
              Partner Speaking (Audio Unmuted):
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
              : 'Playing video… will instantly mute & pause at your dialogue turn'}
          </p>
        </div>
      )}

      {/* ── 2, 3, 4: USER'S TURN (Paused, Muted, Mic Active / Retry) ── */}
      {(roleState === 'user_speaking' || roleState === 'user_retry' || roleState === 'user_silent_play') && activeLine && (
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
                  color: roleState === 'user_silent_play' ? '#7e22ce' : 'var(--accent-600)',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {roleState === 'user_silent_play' ? (
                  <>
                    <Play size={13} />
                    <span>STEP 5: PLAYING SILENTLY (AUDIO MUTED)</span>
                  </>
                ) : (
                  <>
                    <VolumeX size={13} color="#b45309" />
                    <span>YOUR DIALOGUE TURN (PAUSED & MUTED)</span>
                  </>
                )}
              </span>

              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                {roleState === 'user_silent_play'
                  ? 'Unmutes automatically for partner'
                  : 'Unlimited time to speak'}
              </span>
            </div>

            <p style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {targetClean}
            </p>
          </div>

          {/* Granular Word-by-Word Diff & Mic Component */}
          {roleState !== 'user_silent_play' && (
            <WordDiffFeedback
              diffResult={diffResult}
              spokenText={spokenText || lastSpoken}
              isListening={isListening}
              onStopSpeaking={stopAndEvaluate}
              passingThreshold={80}
            />
          )}

          {roleState === 'user_silent_play' && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#6b21a8',
                fontSize: 13,
                fontWeight: 650,
              }}
            >
              <VolumeX size={16} />
              <span>
                Pronunciation approved ({diffResult?.score || 100}%). Video playing silently so actor does not speak over your attempt.
              </span>
            </div>
          )}

          {/* Action buttons (Try Again, Replay Audio, Skip) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {roleState === 'user_retry' && (
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
              Hear Native Line
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
