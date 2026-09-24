'use client';

import { useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Play, Clock, X, Check, Loader2, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { Spinner } from '@/components/ui/Spinner';
import { relativeDate } from '@/lib/transcript';
import type { VideoItem } from '@/lib/types';

/** Search results view with infinite scroll and manual load more */
export function SearchResults() {
  const {
    searchResults,
    isSearching,
    isLoadingMore,
    searchQuery,
    nextPageToken,
    setCurrentVideo,
    resetPlayerState,
    setShowResults,
    setIsLoadingMore,
    appendSearchResults,
  } = useAppStore();
  const { addToHistory, isInHistory } = useVideoHistory();

  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleVideoClick = (video: VideoItem) => {
    resetPlayerState();
    setCurrentVideo(video);
    addToHistory(video);
    setShowResults(false);
  };

  // Load more videos using nextPageToken
  const handleLoadMore = useCallback(async () => {
    if (!nextPageToken || isLoadingMore || isSearching || !searchQuery) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(searchQuery)}&maxResults=50&pageToken=${encodeURIComponent(nextPageToken)}`,
      );
      const data = await res.json();
      if (data.videos) {
        appendSearchResults(data.videos as VideoItem[], data.nextPageToken || null);
      }
    } catch (err) {
      console.error('[SearchResults] Failed to load more videos:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    nextPageToken,
    isLoadingMore,
    isSearching,
    searchQuery,
    appendSearchResults,
    setIsLoadingMore,
  ]);

  // Intersection Observer for Infinite Scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextPageToken || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      {
        root: containerRef.current,
        rootMargin: '250px',
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleLoadMore, nextPageToken, isLoadingMore]);

  if (isSearching) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          height: '100%',
          color: 'var(--text-muted)',
          minHeight: 280,
        }}
      >
        <Spinner size="lg" />
        <p style={{ fontSize: 13, fontWeight: 500 }}>Searching YouTube…</p>
      </div>
    );
  }

  if (!searchResults.length && searchQuery) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: '100%',
          color: 'var(--text-muted)',
          minHeight: 280,
        }}
      >
        <span style={{ fontSize: 32 }}>🎬</span>
        <p style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-secondary)' }}>No videos found</p>
        <p style={{ fontSize: 12 }}>Try searching for a different channel, topic, or German level.</p>
      </div>
    );
  }

  if (!searchResults.length) return null;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        paddingTop: 14,
        overflowY: 'auto',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Search Results · {searchResults.length} videos
          </p>
          {nextPageToken && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 6,
                background: 'var(--accent-50)',
                color: 'var(--accent-600)',
              }}
            >
              Infinite Scroll Active
            </span>
          )}
        </div>

        <button
          onClick={() => setShowResults(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <X size={11} /> Close
        </button>
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 14,
          alignContent: 'start',
        }}
      >
        {searchResults.map((video, i) => (
          <VideoCard
            key={`${video.id}-${i}`}
            video={video}
            index={i}
            isWatched={isInHistory(video.id)}
            onClick={() => handleVideoClick(video)}
          />
        ))}
      </div>

      {/* Infinite Scroll Sentinel & Load More Controls */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px 48px',
          gap: 12,
        }}
      >
        {nextPageToken ? (
          <>
            {/* Sentinel for Intersection Observer */}
            <div ref={sentinelRef} style={{ height: 10, width: '100%' }} />

            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 20px',
                borderRadius: 'var(--radius-full)',
                border: '1.5px solid var(--accent-300)',
                background: 'var(--bg-card)',
                color: 'var(--accent-600)',
                fontSize: 13,
                fontWeight: 700,
                cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.16s ease',
              }}
            >
              {isLoadingMore ? (
                <>
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Loading next batch of videos…</span>
                </>
              ) : (
                <>
                  <ChevronDown size={15} />
                  <span>Load More Videos ({searchResults.length} loaded)</span>
                </>
              )}
            </button>
          </>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
            ✓ All available YouTube results loaded ({searchResults.length} videos)
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function VideoCard({
  video,
  index,
  isWatched,
  onClick,
}: {
  video: VideoItem;
  index: number;
  isWatched?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={`video-card-${video.id}`}
      onClick={onClick}
      className="animate-fade-in"
      style={{
        animationDelay: `${Math.min(index * 25, 300)}ms`,
        textAlign: 'left',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 14,
        overflow: 'hidden',
        cursor: 'pointer',
        padding: 0,
        fontFamily: 'inherit',
        width: '100%',
        transition: 'transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s',
        boxShadow: 'var(--shadow-xs)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        e.currentTarget.style.borderColor = 'var(--border-default)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', paddingBottom: '56.25%', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
        {video.thumbnail && (
          <Image src={video.thumbnail} alt={video.title} fill sizes="240px" style={{ objectFit: 'cover' }} />
        )}

        {/* Watched badge overlay */}
        {isWatched && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              backgroundColor: 'rgba(15, 15, 26, 0.88)',
              color: '#ffffff',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              fontSize: 10.5,
              fontWeight: 650,
              padding: '2px 7px',
              borderRadius: 6,
              letterSpacing: '0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              zIndex: 3,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <Check size={11} strokeWidth={2.5} color="#34d399" />
            <span>Watched</span>
          </div>
        )}
        {video.duration && (
          <div
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              backgroundColor: 'rgba(0, 0, 0, 0.82)',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 5px',
              borderRadius: 4,
              letterSpacing: '0.02em',
              lineHeight: 1.2,
              zIndex: 3,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {video.duration}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.18s',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.92)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transform: 'scale(0.75)',
              transition: 'all 0.18s',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}
            className="play-btn"
          >
            <Play size={13} color="var(--accent-600)" fill="var(--accent-600)" />
          </div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p
          style={{
            fontSize: 12.5,
            fontWeight: 650,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
            marginBottom: 6,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {video.title}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {video.channelTitle}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Clock size={9} />
            {relativeDate(video.publishedAt)}
          </span>
        </div>
      </div>
    </button>
  );
}
