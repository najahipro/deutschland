'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Repeat,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Headphones,
  CheckCircle2,
  Clock,
  Sliders,
  Volume2,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { msToTimestamp } from '@/lib/transcript';

export function ABPrepLoop() {
  const {
    currentTimeSec,
    transcript,
    customLoopA,
    customLoopB,
    setCustomLoopA,
    setCustomLoopB,
    prepLoopTarget,
    setPrepLoopTarget,
    isPrepLooping,
    setIsPrepLooping,
    activeMode,
    setActiveMode,
  } = useAppStore();

  const [currentLoopIteration, setCurrentLoopIteration] = useState(1);
  const [warmUpCompleted, setWarmUpCompleted] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // Collapsible accordion to save vertical space if desired

  const loopTarget = prepLoopTarget || 3;
  const lastTimeRef = useRef<number>(0);

  // Active sentence around current time
  const currentSentence = transcript.find(
    (l) => currentTimeSec * 1000 >= l.offset && currentTimeSec * 1000 <= l.offset + l.duration,
  );

  // Set Point A to current playback time
  const handleSetA = () => {
    const t = Math.max(0, Math.floor(currentTimeSec));
    setCustomLoopA(t);
    if (customLoopB !== null && customLoopB <= t) {
      setCustomLoopB(t + 10);
    }
  };

  // Set Point B to current playback time
  const handleSetB = () => {
    const t = Math.ceil(currentTimeSec);
    if (customLoopA !== null && t <= customLoopA) {
      setCustomLoopB(customLoopA + 5);
    } else {
      setCustomLoopB(t);
    }
  };

  // Preset: Active Sentence
  const handlePresetCurrentSentence = () => {
    if (!currentSentence) return;
    const startSec = Math.floor(currentSentence.offset / 1000);
    const endSec = Math.ceil((currentSentence.offset + currentSentence.duration) / 1000);
    setCustomLoopA(startSec);
    setCustomLoopB(Math.max(endSec, startSec + 2));
  };

  // Preset: +15s or +30s paragraph from current time
  const handlePresetParagraph = (seconds: number) => {
    const startSec = Math.floor(currentTimeSec);
    setCustomLoopA(startSec);
    setCustomLoopB(startSec + seconds);
  };

  const handleClearLoop = () => {
    setIsPrepLooping(false);
    setCustomLoopA(null);
    setCustomLoopB(null);
    setCurrentLoopIteration(1);
    setWarmUpCompleted(false);
  };

  // Start the A-B Warm-Up Loop
  const handleStartWarmUp = () => {
    if (customLoopA === null) {
      // Default to current time or active sentence
      if (currentSentence) {
        handlePresetCurrentSentence();
      } else {
        handlePresetParagraph(20);
      }
    }
    const startA = customLoopA !== null ? customLoopA : Math.floor(currentTimeSec);
    const endB = customLoopB !== null ? customLoopB : startA + 20;

    setCustomLoopA(startA);
    setCustomLoopB(endB);
    setCurrentLoopIteration(1);
    setWarmUpCompleted(false);
    setIsPrepLooping(true);

    const player = getGlobalPlayer();
    if (player) {
      player.seekTo(startA, true);
      player.playVideo();
    }
  };

  const handleStopWarmUp = () => {
    setIsPrepLooping(false);
    setCurrentLoopIteration(1);
  };

  // Jump to Point A or Point B
  const handleJump = (sec: number) => {
    const player = getGlobalPlayer();
    if (player) {
      player.seekTo(sec, true);
      player.playVideo();
    }
  };

  // Loop execution engine: Watch playback time when isPrepLooping is true
  useEffect(() => {
    if (!isPrepLooping || customLoopA === null || customLoopB === null) return;

    const t = currentTimeSec;
    const prev = lastTimeRef.current;
    lastTimeRef.current = t;

    // Check if playback reached or passed Point B
    if (t >= customLoopB || (prev < customLoopB && t >= customLoopB - 0.2)) {
      if (loopTarget === Infinity || currentLoopIteration < loopTarget) {
        // Seek back to Point A and continue loop
        const player = getGlobalPlayer();
        if (player) {
          player.seekTo(customLoopA, true);
          player.playVideo();
        }
        setCurrentLoopIteration((prevIter) => prevIter + 1);
      } else {
        // Reached loop target! Warm-up finished
        setIsPrepLooping(false);
        setWarmUpCompleted(true);

        const player = getGlobalPlayer();
        if (player) {
          player.pauseVideo();
        }

        // If in 'none' mode, suggest or switch to Shadowing
        if (activeMode === 'none') {
          setActiveMode('shadowing');
        }
      }
    }
  }, [
    isPrepLooping,
    currentTimeSec,
    customLoopA,
    customLoopB,
    currentLoopIteration,
    loopTarget,
    activeMode,
    setActiveMode,
    setIsPrepLooping,
  ]);

  // Format second to MM:SS
  const fmt = (sec: number | null) => {
    if (sec === null) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const loopDuration =
    customLoopA !== null && customLoopB !== null ? Math.max(0, customLoopB - customLoopA) : 0;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: isPrepLooping ? '1.5px solid var(--accent-500)' : '1px solid var(--border-subtle)',
        borderRadius: 16,
        padding: '12px 16px',
        boxShadow: isPrepLooping ? 'var(--shadow-md)' : 'var(--shadow-xs)',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: isPrepLooping ? 'var(--accent-500)' : 'var(--accent-50)',
              color: isPrepLooping ? '#ffffff' : 'var(--accent-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            <Repeat size={13} className={isPrepLooping ? 'animate-spin' : ''} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                A-B Prep Loop (Listening Warm-Up)
              </span>
              {isPrepLooping && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 750,
                    padding: '2px 7px',
                    borderRadius: 99,
                    background: 'var(--accent-500)',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: '#ffffff',
                      animation: 'pulse 1.2s infinite',
                    }}
                  />
                  Loop {currentLoopIteration} / {loopTarget === Infinity ? '∞' : loopTarget}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Master German cadence with repeated listening before speaking
            </span>
          </div>
        </div>

        {/* Toggle open / custom options */}
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            padding: '3px 8px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          <Sliders size={11} />
          <span>{isOpen ? 'Simple' : 'Custom A-B'}</span>
        </button>
      </div>

      {/* Main Loop Controls Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          background: 'var(--bg-elevated)',
          padding: '8px 12px',
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Loop Count Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Loop Count:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {[1, 2, 3, 5].map((cnt) => (
              <button
                key={cnt}
                onClick={() => setPrepLoopTarget(cnt)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: prepLoopTarget === cnt ? '1px solid var(--accent-500)' : '1px solid var(--border-default)',
                  background: prepLoopTarget === cnt ? 'var(--accent-500)' : 'var(--bg-card)',
                  color: prepLoopTarget === cnt ? '#ffffff' : 'var(--text-primary)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {cnt}×
              </button>
            ))}
          </div>
        </div>

        {/* Quick Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <button
            onClick={handlePresetCurrentSentence}
            disabled={!currentSentence}
            title="Loop the currently playing sentence"
            style={{
              padding: '3px 9px',
              borderRadius: 6,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-card)',
              color: currentSentence ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 600,
              cursor: currentSentence ? 'pointer' : 'not-allowed',
            }}
          >
            Sentence ({currentSentence ? msToTimestamp(currentSentence.duration) : '--'})
          </button>

          <button
            onClick={() => handlePresetParagraph(15)}
            title="Loop 15 seconds"
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            +15s
          </button>

          <button
            onClick={() => handlePresetParagraph(30)}
            title="Loop a 30s paragraph block"
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            +30s Paragraph
          </button>
        </div>

        {/* Action Button: Start / Stop Warm-Up */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isPrepLooping ? (
            <button
              onClick={handleStopWarmUp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 8,
                background: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fecdd3',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Pause size={12} />
              <span>Stop Warm-Up</span>
            </button>
          ) : (
            <button
              onClick={handleStartWarmUp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 8,
                background: 'var(--accent-500)',
                color: '#ffffff',
                border: 'none',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <Play size={12} fill="currentColor" />
              <span>Start Warm-Up Loop</span>
            </button>
          )}

          {/* Quick Ready to Speak Button if warm-up is looping */}
          {isPrepLooping && (
            <button
              onClick={() => {
                setIsPrepLooping(false);
                setWarmUpCompleted(true);
                getGlobalPlayer()?.pauseVideo();
                if (activeMode === 'none') setActiveMode('shadowing');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 8,
                background: 'var(--success-bg)',
                color: 'var(--success)',
                border: '1px solid var(--success)',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <CheckCircle2 size={12} />
              <span>Ready to Practice 🎙️</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Custom A-B Settings (when opened) */}
      {isOpen && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--bg-card)',
            borderRadius: 10,
            border: '1px dashed var(--border-default)',
            fontSize: 11.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={handleSetA}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: customLoopA !== null ? 'var(--accent-50)' : 'var(--bg-elevated)',
                  border: '1px solid var(--accent-300)',
                  color: 'var(--accent-700)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Set [A]: {fmt(customLoopA)}
              </button>
              {customLoopA !== null && (
                <button
                  onClick={() => handleJump(customLoopA)}
                  title="Jump to Point A"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-600)' }}
                >
                  <Play size={10} fill="currentColor" />
                </button>
              )}
            </div>

            <span style={{ color: 'var(--text-muted)' }}>───►</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={handleSetB}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: customLoopB !== null ? 'var(--accent-50)' : 'var(--bg-elevated)',
                  border: '1px solid var(--accent-300)',
                  color: 'var(--accent-700)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Set [B]: {fmt(customLoopB)}
              </button>
              {customLoopB !== null && (
                <button
                  onClick={() => handleJump(customLoopB)}
                  title="Jump to Point B"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-600)' }}
                >
                  <Play size={10} fill="currentColor" />
                </button>
              )}
            </div>

            {loopDuration > 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                ({loopDuration}s window)
              </span>
            )}
          </div>

          {(customLoopA !== null || customLoopB !== null) && (
            <button
              onClick={handleClearLoop}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear markers
            </button>
          )}
        </div>
      )}

      {/* Completion Banner */}
      {warmUpCompleted && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--success-bg)',
            border: '1px solid var(--success)',
            borderRadius: 10,
            color: 'var(--success)',
            fontSize: 12,
            fontWeight: 650,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} />
            <span>Warm-up completed ({loopTarget} loops)! You are warmed up and ready for speech practice.</span>
          </div>
          <button
            onClick={() => setWarmUpCompleted(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--success)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
