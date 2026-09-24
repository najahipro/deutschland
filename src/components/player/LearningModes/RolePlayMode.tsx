'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Users, VolumeX, Volume2, Mic, Play, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { removeConsecutiveDuplicates, similarityRatio, MATCH_THRESHOLD } from '@/lib/transcript';

export function RolePlayMode() {
  const { transcript, currentTimeSec } = useAppStore();

  // User chooses which speaker role to play: 0 = Speaker A, 1 = Speaker B
  const [userRole, setUserRole] = useState<0 | 1>(0);
  const [lastSpoken, setLastSpoken] = useState('');
  const [similarity, setSimilarity] = useState(0);

  const lastMuteStateRef = useRef<boolean | null>(null);
  const lastSpokenLineIndexRef = useRef<number>(-1);

  // Find active line based on current playback time
  const currentLineInfo = useMemo(() => {
    const timeMs = currentTimeSec * 1000;
    const index = transcript.findIndex((l) => timeMs >= l.offset && timeMs <= l.offset + l.duration);
    if (index === -1) {
      // Small gap between sentences
      return null;
    }
    const speaker = (index % 2) as 0 | 1; // Alternating dialogue turns
    return {
      line: transcript[index],
      index,
      speaker,
      isUserTurn: speaker === userRole,
    };
  }, [transcript, currentTimeSec, userRole]);

  // Speech Recognition for user's turn
  const handleResult = useCallback(
    (spoken: string) => {
      if (!currentLineInfo?.line) return;
      const cleanSpoken = removeConsecutiveDuplicates(spoken);
      const cleanTarget = removeConsecutiveDuplicates(currentLineInfo.line.text);
      const sim = similarityRatio(cleanSpoken, cleanTarget);
      setLastSpoken(spoken);
      setSimilarity(sim);
    },
    [currentLineInfo],
  );

  const { start, abort, isListening } = useSpeechRecognition({
    lang: 'de-DE',
    continuous: true,
    silenceTimeoutMs: 10000,
    onResult: handleResult,
  });

  // Unmute and abort mic on unmount
  useEffect(() => {
    return () => {
      try {
        const player = getGlobalPlayer();
        player?.unMute();
        lastMuteStateRef.current = false;
        abort();
      } catch (err) {
        console.warn('RolePlay unmount error:', err);
      }
    };
  }, [abort]);

  // Actively control mute and microphone based on speaker turn
  useEffect(() => {
    const player = getGlobalPlayer();
    const isUserTurn = Boolean(currentLineInfo?.isUserTurn);

    // 1. Mute YouTube audio when it is user's turn; Unmute for partner
    if (player && lastMuteStateRef.current !== isUserTurn) {
      try {
        if (isUserTurn) {
          player.mute();
          lastMuteStateRef.current = true;
        } else {
          player.unMute();
          lastMuteStateRef.current = false;
        }
      } catch (err) {
        console.warn('Player mute/unMute call failed:', err);
      }
    }

    // 2. Activate Web Speech API mic when it is user's turn; Stop when partner speaks
    if (isUserTurn) {
      if (currentLineInfo && lastSpokenLineIndexRef.current !== currentLineInfo.index) {
        lastSpokenLineIndexRef.current = currentLineInfo.index;
        setLastSpoken('');
        setSimilarity(0);
        try {
          start();
        } catch { /* ignore */ }
      }
    } else {
      if (lastSpokenLineIndexRef.current !== -1) {
        lastSpokenLineIndexRef.current = -1;
        abort();
      }
    }
  }, [currentLineInfo, start, abort]);

  const targetClean = currentLineInfo?.line ? removeConsecutiveDuplicates(currentLineInfo.line.text) : '';

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
              Auto-mutes video and activates your microphone on your lines
            </span>
          </div>
        </div>

        {/* Live Audio & Mic Status Badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 8,
            background: currentLineInfo?.isUserTurn ? '#fee2e2' : 'var(--accent-50)',
            color: currentLineInfo?.isUserTurn ? '#b91c1c' : 'var(--accent-700)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            border: `1px solid ${currentLineInfo?.isUserTurn ? '#fecdd3' : 'var(--accent-200)'}`,
          }}
        >
          {currentLineInfo?.isUserTurn ? (
            <>
              <Mic size={13} className="animate-pulse" />
              <span>RECORDING YOUR LINES (MUTED)</span>
            </>
          ) : (
            <>
              <Volume2 size={13} />
              <span>PARTNER SPEAKING (AUDIO ACTIVE)</span>
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
            lastMuteStateRef.current = null;
            lastSpokenLineIndexRef.current = -1;
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
          🎭 Play Speaker A (Mute A & Record)
        </button>
        <button
          onClick={() => {
            setUserRole(1);
            lastMuteStateRef.current = null;
            lastSpokenLineIndexRef.current = -1;
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
          🎭 Play Speaker B (Mute B & Record)
        </button>
      </div>

      {/* Active Dialogue Turn Card */}
      <div
        style={{
          padding: '16px 18px',
          borderRadius: 14,
          background: currentLineInfo?.isUserTurn ? '#fff1f2' : 'var(--bg-elevated)',
          border: `1.5px solid ${currentLineInfo?.isUserTurn ? '#fecdd3' : 'var(--border-subtle)'}`,
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {currentLineInfo ? (
          <>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: currentLineInfo.isUserTurn ? '#e11d48' : 'var(--accent-600)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {currentLineInfo.isUserTurn ? <Mic size={13} className="animate-pulse" /> : <Volume2 size={13} />}
                  {currentLineInfo.isUserTurn ? 'YOUR TURN — READ ALOUD NOW' : 'PARTNER TURN — LISTEN'}
                  {' '}- Speaker {currentLineInfo.speaker === 0 ? 'A' : 'B'}
                </span>

                {currentLineInfo.isUserTurn && isListening && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 750,
                      color: '#e11d48',
                      background: '#fee2e2',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    🔴 Microphone Active (de-DE)
                  </span>
                )}
              </div>

              <p
                style={{
                  fontSize: 18,
                  fontWeight: 750,
                  color: currentLineInfo.isUserTurn ? '#9f1239' : 'var(--text-primary)',
                  lineHeight: 1.35,
                }}
              >
                {targetClean}
              </p>
            </div>

            {/* Live Mic Speech Transcript when it's user's turn */}
            {currentLineInfo.isUserTurn && (
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
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Mic size={16} color="#ef4444" className="animate-pulse" />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 650 }}>
                    Recording your pronunciation:
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {lastSpoken || 'Speak the German line now…'}
                  </div>
                </div>

                {similarity > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: similarity >= MATCH_THRESHOLD ? 'var(--success)' : 'var(--accent-600)',
                    }}
                  >
                    {Math.round(similarity * 100)}% match
                  </span>
                )}
              </div>
            )}

            {currentLineInfo.isUserTurn && similarity >= MATCH_THRESHOLD && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 12.5, fontWeight: 700 }}>
                <CheckCircle2 size={15} />
                <span>Ausgezeichnet! Great pronunciation.</span>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Play the video to begin dialogue role-play. YouTube player audio auto-mutes on your lines and records your speech!
          </div>
        )}
      </div>
    </div>
  );
}
