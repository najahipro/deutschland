'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Users, Volume2, VolumeX, Mic, RotateCcw, SkipForward, Play, Eye, Activity, Bot } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import {
  removeConsecutiveDuplicates,
  diffSentenceWords,
  type WordDiffResult,
} from '@/lib/transcript';
import {
  diarizeTranscript,
  WebAudioPitchAnalyzer,
  type DiarizedDialogueTurn,
} from '@/lib/audioDiarization';
import { WordDiffFeedback } from './WordDiffFeedback';

/**
 * Natural Dialogue Role-Play State Machine with Web Audio Speaker Diarization:
 * 1. Partner's turn: Play video normally (Audio ON / unMute).
 * 2. User's turn starts: MUTE the video (player.mute()), but KEEP PLAYING so user watches character act.
 * 3. User's turn ends (end timestamp): Instantly PAUSE the video (player.pauseVideo()).
 * 4. Waiting / Speaking: Wait for user to speak into the microphone (unlimited time).
 * 5. Validation: If < 80%, stay paused/muted for retry. If >= 80%, UNMUTE (player.unMute()) & RESUME (player.playVideo()).
 */
type RolePlayState =
  | 'partner_turn'   // Step 1: Partner speaks with video unmuted and playing
  | 'user_acting'    // Step 2: User's turn starts: video MUTED, but plays silently so user watches actor
  | 'user_speaking'  // Step 3 & 4: Turn ends: video PAUSED & MUTED, mic active
  | 'user_retry'     // Step 4 (Failed): Video stays paused & muted, prompt retry
  | 'user_passed';   // Step 5: Passed (>= 80%), auto-unmutes and resumes playback

export function RolePlayMode() {
  const { transcript, currentTimeSec } = useAppStore();

  // User selects role: 0 = Speaker 1 (Low Pitch), 1 = Speaker 2 (High Pitch)
  const [userRole, setUserRole] = useState<0 | 1>(1);
  const [roleState, setRoleState] = useState<RolePlayState>('partner_turn');
  const [activeTurnIdx, setActiveTurnIdx] = useState<number>(-1);
  const [diffResult, setDiffResult] = useState<WordDiffResult | null>(null);
  const [lastSpoken, setLastSpoken] = useState('');

  // Client-side Web Audio API Speaker Diarization
  const turns = useMemo(() => diarizeTranscript(transcript), [transcript]);

  const completedTurnsRef = useRef<Set<number>>(new Set());
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeMsRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      try {
        const player = getGlobalPlayer();
        player?.unMute();
      } catch { /* ignore */ }
    };
  }, []);

  // Find active turn based on playback time
  const currentTurnInfo = useMemo(() => {
    const timeMs = currentTimeSec * 1000;
    const index = turns.findIndex((t) => timeMs >= t.offset && timeMs < t.offset + t.duration);
    if (index === -1) return null;
    const turn = turns[index];
    return {
      turn,
      index,
      speaker: turn.speaker,
      isUserTurn: turn.speaker === userRole,
    };
  }, [turns, currentTimeSec, userRole]);

  // Target sentence for active turn
  const activeTurn = activeTurnIdx >= 0 && turns[activeTurnIdx]
    ? turns[activeTurnIdx]
    : currentTurnInfo?.turn || null;

  const targetClean = activeTurn ? removeConsecutiveDuplicates(activeTurn.text) : '';

  // ── Step 5: Speech Validation (>= 80% Word Match) ─────────────────────────
  const handleResult = useCallback(
    (spoken: string) => {
      if (!isMountedRef.current || !targetClean) return;
      const player = getGlobalPlayer();

      const cleanSpoken = removeConsecutiveDuplicates(spoken);
      setLastSpoken(spoken);

      const diff = diffSentenceWords(cleanSpoken, targetClean);
      setDiffResult(diff);

      if (diff.isPassing) {
        // Step 5: Mark turn completed
        if (activeTurnIdx >= 0) {
          completedTurnsRef.current.add(activeTurnIdx);
        }

        setRoleState('user_passed');

        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          try {
            // UNMUTE and RESUME playback for partner's next turn
            player?.unMute();
            player?.playVideo();
          } catch (e) {
            console.warn('[RolePlayMode] playVideo/unMute failed:', e);
          }
          setRoleState('partner_turn');
          setActiveTurnIdx(-1);
          setDiffResult(null);
          setLastSpoken('');
        }, 1100);
      } else {
        // Step 4 (Failed < 80%): Video MUST REMAIN PAUSED AND MUTED
        setRoleState('user_retry');
        try {
          player?.mute();
          player?.pauseVideo();
        } catch { /* ignore */ }
      }
    },
    [targetClean, activeTurnIdx],
  );

  const { start, abort, stopAndEvaluate, isListening, spokenText } = useSpeechRecognition({
    lang: 'de-DE',
    continuous: true,
    silenceDebounceMs: 2200,
    onResult: handleResult,
  });

  // ── Time-Tracking & Timeline State Machine Transitions ────────────────────
  useEffect(() => {
    if (!turns.length) return;
    const player = getGlobalPlayer();
    const timeMs = currentTimeSec * 1000;
    const prevTimeMs = lastTimeMsRef.current;
    lastTimeMsRef.current = timeMs;

    // Reset completed turns ahead if user seeks backward
    if (timeMs < prevTimeMs - 1500) {
      completedTurnsRef.current.forEach((idx) => {
        if (turns[idx] && turns[idx].offset >= timeMs - 500) {
          completedTurnsRef.current.delete(idx);
        }
      });
    }

    // ── STEP 3: User Acting Ended -> PAUSE & ACTIVATE MIC ─────────────────────
    if (roleState === 'user_acting') {
      const activeObj = activeTurnIdx >= 0 ? turns[activeTurnIdx] : null;
      const turnEnd = activeObj ? activeObj.offset + activeObj.duration : 0;

      // When the character acting finishes on screen: PAUSE & START MIC
      if (timeMs >= turnEnd - 100 || (activeObj && timeMs < activeObj.offset)) {
        try {
          player?.pauseVideo();
          player?.mute();
        } catch { /* ignore */ }
        setRoleState('user_speaking');
        try {
          start();
        } catch { /* ignore */ }
      } else {
        // Ensure muted while playing silently
        try {
          player?.mute();
        } catch { /* ignore */ }
      }
      return;
    }

    // ── KEEP PAUSED & MUTED while speaking or retrying ────────────────────────
    if (roleState === 'user_speaking' || roleState === 'user_retry') {
      try {
        player?.mute();
        player?.pauseVideo();
      } catch { /* ignore */ }
      return;
    }

    // ── STEP 1 & 2: PARTNER'S TURN & TRANSITION TO USER ACTING ────────────────
    if (roleState === 'partner_turn') {
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        if (turn.speaker !== userRole) continue;
        if (completedTurnsRef.current.has(i)) continue;

        const turnStart = turn.offset;
        const turnEnd = turn.offset + turn.duration;

        // User's turn starts: MUTE video, but KEEP PLAYING so user watches character act
        if (timeMs >= turnStart - 80 && timeMs < turnEnd) {
          try {
            player?.mute(); // MUTE
            // DO NOT PAUSE — keep playing silently
          } catch { /* ignore */ }
          setActiveTurnIdx(i);
          setRoleState('user_acting');
          setDiffResult(null);
          setLastSpoken('');
          return;
        }
      }

      // In partner's turn, ensure player is strictly unmuted
      try {
        player?.unMute();
      } catch { /* ignore */ }
    }
  }, [currentTimeSec, turns, userRole, roleState, activeTurnIdx, start]);

  // Clean unmount
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

  const handleReplayNativeLine = () => {
    if (activeTurnIdx >= 0 && turns[activeTurnIdx]) {
      const turn = turns[activeTurnIdx];
      const player = getGlobalPlayer();
      try {
        player?.unMute();
        player?.seekTo(turn.offset / 1000, true);
        player?.playVideo();
      } catch { /* ignore */ }

      // When the native reference finishes, pause again for speaking
      setTimeout(() => {
        try {
          player?.mute();
          player?.pauseVideo();
        } catch { /* ignore */ }
        handleRetrySpeaking();
      }, turn.duration + 200);
    }
  };

  const handleSkipTurn = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (activeTurnIdx >= 0) {
      completedTurnsRef.current.add(activeTurnIdx);
    }
    abort();
    const player = getGlobalPlayer();
    const nextTurn = activeTurnIdx >= 0 && turns[activeTurnIdx + 1] ? turns[activeTurnIdx + 1] : null;
    try {
      if (nextTurn) {
        player?.seekTo(nextTurn.offset / 1000, true);
      }
      player?.unMute();
      player?.playVideo();
    } catch { /* ignore */ }
    setRoleState('partner_turn');
    setActiveTurnIdx(-1);
    setDiffResult(null);
    setLastSpoken('');
  };

  const handleManualTriggerTurn = (index: number) => {
    const turn = turns[index];
    if (!turn) return;
    const player = getGlobalPlayer();
    try {
      player?.mute();
      player?.seekTo(turn.offset / 1000, true);
      player?.playVideo();
    } catch { /* ignore */ }
    setActiveTurnIdx(index);
    setRoleState('user_acting');
    setDiffResult(null);
    setLastSpoken('');
  };

  return (
    <div
      id="role-play-mode"
      className="animate-fade-in"
      style={{
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-subtle)',
        borderRadius: 18,
        padding: '16px 18px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={15} color="#fff" />
          </div>
          <div>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, margin: 0 }}>
              Role-Play Dialogue Practice
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Natural sequence: Partner speaks (Audio ON) → Watch silently (Muted) → Pause & speak → Resume
            </span>
          </div>
        </div>

        {/* Live Status Badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 750,
            padding: '4px 10px',
            borderRadius: 8,
            background:
              roleState === 'user_acting'
                ? '#e0e7ff'
                : roleState === 'user_speaking' || roleState === 'user_retry'
                ? '#fef3c7'
                : roleState === 'user_passed'
                ? '#dcfce7'
                : 'var(--accent-50)',
            color:
              roleState === 'user_acting'
                ? '#4338ca'
                : roleState === 'user_speaking' || roleState === 'user_retry'
                ? '#b45309'
                : roleState === 'user_passed'
                ? '#15803d'
                : 'var(--accent-700)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            border: `1px solid ${
              roleState === 'user_acting'
                ? '#c7d2fe'
                : roleState === 'user_speaking' || roleState === 'user_retry'
                ? '#fde68a'
                : roleState === 'user_passed'
                ? '#bbf7d0'
                : 'var(--accent-200)'
            }`,
          }}
        >
          {roleState === 'user_acting' ? (
            <>
              <Eye size={13} color="#4338ca" />
              <span>WATCHING CHARACTER (MUTED PLAYBACK)</span>
            </>
          ) : roleState === 'user_speaking' || roleState === 'user_retry' ? (
            <>
              <VolumeX size={13} color="#b45309" />
              <span>YOUR TURN: PAUSED & SPEAK</span>
            </>
          ) : roleState === 'user_passed' ? (
            <>
              <Volume2 size={13} color="#15803d" />
              <span>PASSED! UNMUTING & RESUMING…</span>
            </>
          ) : (
            <>
              <Volume2 size={13} />
              <span>PARTNER SPEAKING (AUDIO ON)</span>
            </>
          )}
        </span>
      </div>

      {/* Web Audio Diarizer Bot Status Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 10,
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.18)',
          fontSize: 11.5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#4f46e5' }}>
          <Bot size={14} />
          <span>Web Audio Diarizer Bot:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {currentTurnInfo
              ? `${currentTurnInfo.turn.speakerLabel} (~${currentTurnInfo.turn.detectedPitch} Hz)`
              : 'Clustering lines by voice frequency & pauses'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11 }}>
          <Activity size={12} color="#10b981" />
          <span>Dynamic voice separation ({turns.length} turns)</span>
        </div>
      </div>

      {/* Role Picker (Speaker 1 vs. Speaker 2) */}
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
            completedTurnsRef.current.clear();
            setRoleState('partner_turn');
            setActiveTurnIdx(-1);
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
            border: userRole === 0 ? '1.5px solid var(--accent-400)' : '1px solid transparent',
            background: userRole === 0 ? 'var(--bg-card)' : 'transparent',
            boxShadow: userRole === 0 ? 'var(--shadow-sm)' : 'none',
            color: userRole === 0 ? 'var(--accent-600)' : 'var(--text-secondary)',
            fontWeight: userRole === 0 ? 700 : 500,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <span>🎭 Play Speaker 1</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Lower Pitch Voice (~120 Hz)</span>
        </button>
        <button
          onClick={() => {
            setUserRole(1);
            completedTurnsRef.current.clear();
            setRoleState('partner_turn');
            setActiveTurnIdx(-1);
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
            border: userRole === 1 ? '1.5px solid var(--accent-400)' : '1px solid transparent',
            background: userRole === 1 ? 'var(--bg-card)' : 'transparent',
            boxShadow: userRole === 1 ? 'var(--shadow-sm)' : 'none',
            color: userRole === 1 ? 'var(--accent-600)' : 'var(--text-secondary)',
            fontWeight: userRole === 1 ? 700 : 500,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <span>🎭 Play Speaker 2</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Higher Pitch Voice (~215 Hz)</span>
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
            {currentTurnInfo && currentTurnInfo.isUserTurn && (
              <button
                onClick={() => handleManualTriggerTurn(currentTurnInfo.index)}
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
                Practice Line Now
              </button>
            )}
          </div>

          <p style={{ fontSize: 16, fontWeight: 650, color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>
            {currentTurnInfo
              ? removeConsecutiveDuplicates(currentTurnInfo.turn.text)
              : 'Playing video… will mute & let you watch your character act, then pause to speak.'}
          </p>
        </div>
      )}

      {/* ── 2. USER ACTING (Playing silently, Muted) ── */}
      {roleState === 'user_acting' && activeTurn && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '16px 18px',
            borderRadius: 14,
            background: 'rgba(99,102,241,0.06)',
            border: '1.5px solid rgba(99,102,241,0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#4338ca', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={14} />
              <span>WATCH YOUR CHARACTER ACT (AUDIO MUTED)</span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
              Video will pause automatically when line ends
            </span>
          </div>

          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>
            {targetClean}
          </p>
        </div>
      )}

      {/* ── 3, 4, 5: USER'S TURN (Paused, Muted, Mic Active / Retry / Passed) ── */}
      {(roleState === 'user_speaking' || roleState === 'user_retry' || roleState === 'user_passed') && activeTurn && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '16px 18px',
            borderRadius: 14,
            background: 'var(--bg-elevated)',
            border: `1.5px solid ${roleState === 'user_passed' ? 'rgba(16,185,129,0.4)' : 'var(--border-subtle)'}`,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: roleState === 'user_passed' ? '#15803d' : 'var(--accent-600)',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {roleState === 'user_passed' ? (
                  <>
                    <Volume2 size={13} color="#15803d" />
                    <span>PASSED! UNMUTING AND CONTINUING…</span>
                  </>
                ) : (
                  <>
                    <VolumeX size={13} color="#b45309" />
                    <span>YOUR DIALOGUE TURN (PAUSED & MUTED)</span>
                  </>
                )}
              </span>

              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                {roleState === 'user_passed' ? 'Next turn starting' : 'Speak your line into the microphone'}
              </span>
            </div>

            <p style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.35, margin: 0 }}>
              {targetClean}
            </p>

            {activeTurn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 5,
                    background: activeTurn.voiceProfile === 'low_pitch' ? 'rgba(59,130,246,0.1)' : 'rgba(236,72,153,0.1)',
                    color: activeTurn.voiceProfile === 'low_pitch' ? '#2563eb' : '#db2777',
                    border: `1px solid ${
                      activeTurn.voiceProfile === 'low_pitch' ? 'rgba(59,130,246,0.25)' : 'rgba(236,72,153,0.25)'
                    }`,
                  }}
                >
                  🎙️ {activeTurn.speakerLabel} · ~{activeTurn.detectedPitch} Hz
                </span>
                {activeTurn.pauseBeforeMs > 0 && (
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    Pause duration: {activeTurn.pauseBeforeMs}ms
                  </span>
                )}
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

          {/* Action buttons (Try Again, Replay Native Line, Skip) */}
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
              onClick={handleReplayNativeLine}
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
