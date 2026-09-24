'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Play, Square, Headphones, Radio } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';

type DubState = 'idle' | 'recording' | 'recorded' | 'playback';

export function VoiceDubbingMode() {
  const { currentTimeSec } = useAppStore();

  const [dubState, setDubState] = useState<DubState>('idle');
  const [segmentStart, setSegmentStart] = useState<number | null>(null);
  const [segmentEnd, setSegmentEnd] = useState<number | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopRecording();
      if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const markStart = () => {
    setSegmentStart(currentTimeSec);
    setSegmentEnd(null);
    setAudioBlob(null);
    setAudioUrl(null);
  };

  const markEnd = () => {
    if (segmentStart === null) return;
    setSegmentEnd(currentTimeSec);
  };

  const startDubbing = useCallback(async () => {
    if (segmentStart === null || segmentEnd === null) return;
    if (segmentEnd <= segmentStart) { setErrorMsg('Segment end must be after start.'); return; }
    setErrorMsg(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setDubState('recorded');
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mr;

      // Seek to start, mute, play
      const player = getGlobalPlayer();
      try {
        player?.seekTo(segmentStart, true);
        player?.mute();
        player?.playVideo();
      } catch { /* ignore */ }

      // Small delay to let the seek settle before recording
      setTimeout(() => {
        if (!isMountedRef.current) return;
        mr.start();
        setDubState('recording');

        // Auto-stop when segment ends
        const duration = (segmentEnd - segmentStart) * 1000;
        segmentTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          mr.stop();
          try { player?.pauseVideo(); } catch { /* ignore */ }
        }, duration);
      }, 300);
    } catch (err) {
      setErrorMsg('Microphone access denied. Please allow mic permission and try again.');
    }
  }, [segmentStart, segmentEnd]);

  const watchMyDub = useCallback(() => {
    if (!audioUrl || segmentStart === null) return;
    const player = getGlobalPlayer();
    try {
      player?.seekTo(segmentStart, true);
      player?.mute();
      player?.playVideo();
    } catch { /* ignore */ }

    // Play the recorded audio alongside
    if (audioElRef.current) {
      audioElRef.current.currentTime = 0;
      audioElRef.current.play();
    }
    setDubState('playback');
    setIsPlaying(true);

    const duration = segmentEnd !== null && segmentStart !== null
      ? (segmentEnd - segmentStart) * 1000 + 500
      : 5000;

    segmentTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      try { player?.unMute(); player?.pauseVideo(); } catch { /* ignore */ }
      setIsPlaying(false);
      setDubState('recorded');
    }, duration);
  }, [audioUrl, segmentStart, segmentEnd]);

  const reset = () => {
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    stopRecording();
    setDubState('idle');
    setSegmentStart(null);
    setSegmentEnd(null);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setIsPlaying(false);
    try { getGlobalPlayer()?.unMute(); } catch { /* ignore */ }
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div
      id="voice-dubbing-mode"
      style={{
        display: 'flex', flexDirection: 'column', gap: 14,
        padding: '14px 16px',
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-default)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Hidden audio element for playback */}
      {audioUrl && <audio ref={audioElRef} src={audioUrl} style={{ display: 'none' }} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'linear-gradient(135deg,#f59e0b,#ef4444)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Radio size={14} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Voice Dubbing</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            Mute the video · record your voice · watch your dub
          </div>
        </div>
      </div>

      {/* Segment picker */}
      <div style={{
        padding: '12px 14px', borderRadius: 12,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          1. Select Your Segment
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            id="dub-mark-start"
            onClick={markStart}
            disabled={dubState === 'recording'}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 9,
              background: segmentStart !== null ? 'rgba(16,185,129,0.1)' : 'var(--bg-card)',
              border: `1.5px solid ${segmentStart !== null ? 'rgba(16,185,129,0.4)' : 'var(--border-default)'}`,
              color: segmentStart !== null ? '#10b981' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {segmentStart !== null ? `✓ Start: ${fmtTime(segmentStart)}` : '▶ Mark Start'}
          </button>
          <button
            id="dub-mark-end"
            onClick={markEnd}
            disabled={segmentStart === null || dubState === 'recording'}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 9,
              background: segmentEnd !== null ? 'rgba(16,185,129,0.1)' : 'var(--bg-card)',
              border: `1.5px solid ${segmentEnd !== null ? 'rgba(16,185,129,0.4)' : 'var(--border-default)'}`,
              color: segmentEnd !== null ? '#10b981' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              opacity: segmentStart === null ? 0.5 : 1,
            }}
          >
            {segmentEnd !== null ? `✓ End: ${fmtTime(segmentEnd)}` : '⏹ Mark End'}
          </button>
        </div>
        {segmentStart !== null && segmentEnd !== null && (
          <div style={{ fontSize: 11.5, color: '#10b981', fontWeight: 600 }}>
            Segment: {fmtTime(segmentStart)} → {fmtTime(segmentEnd)} ({Math.round(segmentEnd - segmentStart)}s)
          </div>
        )}
      </div>

      {/* Record button */}
      <div style={{
        padding: '12px 14px', borderRadius: 12,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          2. Record Your Dub
        </div>
        {errorMsg && (
          <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>{errorMsg}</div>
        )}
        {dubState === 'idle' || dubState === 'recorded' ? (
          <button
            id="dub-start-record"
            onClick={startDubbing}
            disabled={segmentStart === null || segmentEnd === null || segmentEnd <= segmentStart}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 10,
              background: 'linear-gradient(135deg,#ef4444,#f97316)',
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: (segmentStart !== null && segmentEnd !== null && segmentEnd > segmentStart) ? 'pointer' : 'not-allowed',
              opacity: (segmentStart !== null && segmentEnd !== null && segmentEnd > segmentStart) ? 1 : 0.5,
              fontFamily: 'inherit',
            }}
          >
            <Mic size={14} /> Start Dubbing (Muted Playback + Record)
          </button>
        ) : dubState === 'recording' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#ef4444', boxShadow: '0 0 0 4px rgba(239,68,68,0.2)',
              animation: 'pulse 1s infinite',
            }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#ef4444' }}>
              Recording… Speak along with the muted video!
            </span>
          </div>
        ) : dubState === 'playback' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Headphones size={14} color="#f59e0b" />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f59e0b' }}>
              Playing your dub…
            </span>
          </div>
        ) : null}
      </div>

      {/* Watch My Dub */}
      {(dubState === 'recorded' || dubState === 'playback') && (
        <div style={{
          padding: '12px 14px', borderRadius: 12,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            3. Watch Your Dub
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              id="dub-watch"
              onClick={watchMyDub}
              disabled={isPlaying}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 9,
                background: 'linear-gradient(135deg,#f59e0b,#f97316)',
                border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 700,
                cursor: isPlaying ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                opacity: isPlaying ? 0.6 : 1,
              }}
            >
              <Play size={13} /> Watch My Dub
            </button>
            <button
              id="dub-reset"
              onClick={reset}
              style={{
                padding: '9px 14px', borderRadius: 9,
                border: '1.5px solid var(--border-default)', background: 'var(--bg-card)',
                color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Reset
            </button>
          </div>
          {audioUrl && (
            <audio controls src={audioUrl} style={{ width: '100%', height: 32, borderRadius: 8 }} />
          )}
        </div>
      )}
    </div>
  );
}