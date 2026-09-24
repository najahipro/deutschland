'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';

interface VideoPlayerProps {
  onPlayerReady?: (player: YT.Player) => void;
  onTimeUpdate?: (currentTimeSec: number) => void;
}

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

export function VideoPlayer({ onPlayerReady, onTimeUpdate }: VideoPlayerProps) {
  const { currentVideo, activeMode } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const timeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiLoadedRef = useRef(false);

  const createPlayer = useCallback(() => {
    if (!currentVideo || !containerRef.current) return;
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    }
    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current);
    }

    const div = document.createElement('div');
    div.id = `yt-player-${currentVideo.id}`;
    div.style.width = '100%';
    div.style.height = '100%';
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(div);

    playerRef.current = new window.YT.Player(div.id, {
      width: '100%',
      height: '100%',
      videoId: currentVideo.id,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1,
        rel: 0,
        modestbranding: 1,
        cc_load_policy: 1,
        hl: 'de',
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
      events: {
        onReady: (event) => {
          onPlayerReady?.(event.target);
          // Poll current time at 100ms for razor-sharp sentence boundary detection
          timeIntervalRef.current = setInterval(() => {
            try {
              const t = event.target.getCurrentTime?.();
              if (typeof t === 'number') onTimeUpdate?.(t);
            } catch { /* ignore */ }
          }, 100);
        },
      },
    });
  }, [currentVideo, onPlayerReady, onTimeUpdate]);

  // Load YouTube IFrame API once
  useEffect(() => {
    if (apiLoadedRef.current) {
      if (currentVideo) createPlayer();
      return;
    }
    if (window.YT?.Player) {
      apiLoadedRef.current = true;
      if (currentVideo) createPlayer();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      apiLoadedRef.current = true;
      if (currentVideo) createPlayer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-create player when video changes
  useEffect(() => {
    if (apiLoadedRef.current && currentVideo) {
      createPlayer();
    }
  }, [currentVideo, createPlayer]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
    };
  }, []);

  if (!currentVideo) return null;

  return (
    <div
      className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-xl shrink-0 yt-player-container"
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        background: '#000',
        width: '100%',
        aspectRatio: '16 / 9',
        position: 'relative',
      }}
    >
      <div
        ref={containerRef}
        className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:border-0 [&>iframe]:block"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
        }}
      />

      {/* Subtitle Mask for Blind Listening Mode */}
      {activeMode === 'blindListening' && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '24%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.98) 75%, rgba(0,0,0,0.85) 90%, transparent 100%)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            pointerEvents: 'none',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 99,
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              color: '#fbbf24',
              fontSize: 11.5,
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            <span>🙈 Blind Listening: Video Subtitles Censored</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Expose player controls globally so LearningModes can access them
let _globalPlayer: YT.Player | null = null;

export function getGlobalPlayer(): YT.Player | null {
  return _globalPlayer;
}

export function setGlobalPlayer(p: YT.Player | null) {
  _globalPlayer = p;
}
