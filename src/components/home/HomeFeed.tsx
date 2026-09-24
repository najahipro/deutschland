'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Play, Clock, Check, Sparkles, History as HistoryIcon, RefreshCw, Loader2, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { relativeDate } from '@/lib/transcript';
import type { VideoItem } from '@/lib/types';

const CATEGORIES = [
  { label: 'All Recommendations', query: 'Deutsch lernen A1 A2 Easy German' },
  { label: 'Easy German', query: 'Easy German street interviews' },
  { label: 'A1 Beginners', query: 'Deutsch lernen A1 für Anfänger' },
  { label: 'A2 Elementary', query: 'Deutsch lernen A2 Grammatik Wortschatz' },
  { label: 'B1 Intermediate', query: 'Deutsch lernen B1 Dialoge' },
  { label: 'Grammar', query: 'Deutsche Grammatik erklärt' },
  { label: 'Stories & Dialogues', query: 'Deutsch Geschichten Dialoge Hörverstehen' },
];

export function HomeFeed() {
  const { setCurrentVideo, resetPlayerState, setShowResults } = useAppStore();
  const { history, addToHistory, isInHistory } = useVideoHistory();

  const [activeCategory, setActiveCategory] = useState(0);
  const [feedVideos, setFeedVideos] = useState<VideoItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchFeed = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);
    setNextPageToken(null);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}&maxResults=50`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setFeedVideos([]);
        setNextPageToken(null);
      } else {
        setFeedVideos((data.videos as VideoItem[]) ?? []);
        setNextPageToken(data.nextPageToken || null);
      }
    } catch (err) {
      console.error('[HomeFeed] Failed to fetch feed:', err);
      setError('Could not connect to YouTube API.');
      setFeedVideos([]);
      setNextPageToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMoreFeed = useCallback(async () => {
    if (!nextPageToken || isLoadingMore || isLoading) return;
    setIsLoadingMore(true);
    try {
      const currentQuery = CATEGORIES[activeCategory].query;
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(currentQuery)}&maxResults=50&pageToken=${encodeURIComponent(nextPageToken)}`,
      );
      const data = await res.json();
      if (data.videos) {
        const newVids = (data.videos as VideoItem[]) ?? [];
        setFeedVideos((prev) => {
          const ids = new Set(prev.map((v) => v.id));
          return [...prev, ...newVids.filter((v) => !ids.has(v.id))];
        });
        setNextPageToken(data.nextPageToken || null);
      }
    } catch (err) {
      console.error('[HomeFeed] Failed to load more feed videos:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextPageToken, isLoadingMore, isLoading, activeCategory]);

  useEffect(() => {
    fetchFeed(CATEGORIES[activeCategory].query);
  }, [activeCategory, fetchFeed]);

  // Infinite Scroll Intersection Observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextPageToken || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreFeed();
        }
      },
      { rootMargin: '300px', threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreFeed, nextPageToken, isLoadingMore]);

  const handleVideoSelect = (video: VideoItem) => {
    resetPlayerState();
    setCurrentVideo(video);
    addToHistory(video);
    setShowResults(false);
  };

  const recentHistory = useMemo(() => history.slice(0, 6), [history]);

  return (
    <div
      className="animate-fade-in"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '36px 32px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        maxWidth: 1600,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Category Pills Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          overflowX: 'auto',
          paddingTop: 8,
          paddingBottom: 8,
          scrollbarWidth: 'none',
        }}
      >
        {CATEGORIES.map((cat, idx) => {
          const isSelected = idx === activeCategory;
          return (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(idx)}
              style={{
                padding: '7px 16px',
                borderRadius: 'var(--radius-full)',
                fontSize: 12.5,
                fontWeight: isSelected ? 650 : 500,
                border: isSelected ? '1px solid var(--accent-500)' : '1px solid var(--border-default)',
                background: isSelected ? 'var(--accent-500)' : 'var(--bg-card)',
                color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.16s var(--ease-out)',
                boxShadow: isSelected ? 'var(--shadow-accent)' : 'var(--shadow-xs)',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--accent-400)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* ── Continue Learning / History Row (if user has watched any videos) ── */}
      {recentHistory.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HistoryIcon size={16} color="var(--accent-500)" />
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                Continue Learning
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: 'var(--accent-50)',
                  color: 'var(--accent-600)',
                }}
              >
                {history.length} watched
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {recentHistory.map((video, idx) => (
              <FeedVideoCard
                key={`history-${video.id}`}
                video={video}
                index={idx}
                isWatched={true}
                onClick={() => handleVideoSelect(video)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Main Recommended Feed Grid ── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color="var(--accent-500)" />
            <h2
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {CATEGORIES[activeCategory].label}
            </h2>
          </div>
          {isLoading && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Updating feed…
            </span>
          )}
        </div>

        {/* Loading state: Skeletons */}
        {isLoading && feedVideos.length === 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <FeedSkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div
            style={{
              padding: '32px 20px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--error)' }}>{error}</p>
            <button
              onClick={() => fetchFeed(CATEGORIES[activeCategory].query)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                background: 'var(--accent-500)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} /> Try Again
            </button>
          </div>
        )}

        {/* Video Grid */}
        {feedVideos.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {feedVideos.map((video, idx) => (
              <FeedVideoCard
                key={`${video.id}-${idx}`}
                video={video}
                index={idx}
                isWatched={isInHistory(video.id)}
                onClick={() => handleVideoSelect(video)}
              />
            ))}
          </div>
        )}

        {/* Infinite Scroll Sentinel & Load More button */}
        {feedVideos.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 16px 40px',
              gap: 12,
            }}
          >
            {nextPageToken ? (
              <>
                <div ref={sentinelRef} style={{ height: 10, width: '100%' }} />
                <button
                  onClick={loadMoreFeed}
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
                      <span>Loading more German videos…</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={15} />
                      <span>Load More Videos ({feedVideos.length} loaded)</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                ✓ All available recommended videos loaded ({feedVideos.length} videos)
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Single Feed Card ─────────────────────────────────────────────────────────

function FeedVideoCard({
  video,
  index,
  isWatched,
  onClick,
}: {
  video: VideoItem;
  index: number;
  isWatched: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={`feed-card-${video.id}`}
      onClick={onClick}
      className="animate-fade-in"
      style={{
        animationDelay: `${Math.min(index * 30, 300)}ms`,
        textAlign: 'left',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
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
        e.currentTarget.style.transform = 'translateY(-3px)';
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
      <div
        style={{
          position: 'relative',
          paddingBottom: '56.25%',
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {video.thumbnail && (
          <Image
            src={video.thumbnail}
            alt={video.title}
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            style={{ objectFit: 'cover' }}
          />
        )}

        {/* Prominent Watched badge overlay (top-left) */}
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

        {/* Duration badge overlay (bottom-right) */}
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

        {/* Hover play icon overlay */}
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
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.94)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transform: 'scale(0.8)',
              transition: 'all 0.18s var(--ease-out)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
            }}
            className="play-btn"
          >
            <Play size={15} color="var(--accent-600)" fill="var(--accent-600)" />
          </div>
        </div>
      </div>

      {/* Meta description */}
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p
          style={{
            fontSize: 13,
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 'auto',
          }}
        >
          <span
            style={{
              fontSize: 11.5,
              color: 'var(--text-secondary)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {video.channelTitle}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Clock size={10} />
            {relativeDate(video.publishedAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Skeleton Card for fluid loading ─────────────────────────────────────────

function FeedSkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <div
        className="shimmer"
        style={{
          width: '100%',
          paddingBottom: '56.25%',
          background: 'var(--bg-elevated)',
        }}
      />
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="shimmer" style={{ height: 14, width: '90%', borderRadius: 4 }} />
        <div className="shimmer" style={{ height: 14, width: '60%', borderRadius: 4 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <div className="shimmer" style={{ height: 10, width: '40%', borderRadius: 4 }} />
          <div className="shimmer" style={{ height: 10, width: '20%', borderRadius: 4 }} />
        </div>
      </div>
    </div>
  );
}
