'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  PanelRightClose,
  PanelRightOpen,
  Headphones,
  MessageSquareDashed,
  Users,
  Ear,
  Bookmark,
  Check,
  Sparkles,
  Clock,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { SearchResults } from '@/components/search/SearchResults';
import { HomeFeed } from '@/components/home/HomeFeed';
import { VideoPlayer, setGlobalPlayer } from '@/components/player/VideoPlayer';
import { ModeSelector } from '@/components/player/ModeSelector';
import { ABPrepLoop } from '@/components/player/ABPrepLoop';
import { ShadowingMode } from '@/components/player/LearningModes/ShadowingMode';
import { VoiceGapFillMode } from '@/components/player/LearningModes/VoiceGapFillMode';
import { RolePlayMode } from '@/components/player/LearningModes/RolePlayMode';
import { BlindListeningMode } from '@/components/player/LearningModes/BlindListeningMode';
import { GrammarMode } from '@/components/player/LearningModes/GrammarMode';
import { WritingMode } from '@/components/player/LearningModes/WritingMode';
import { VoiceDubbingMode } from '@/components/player/LearningModes/VoiceDubbingMode';
import { HistoryPanel } from '@/components/history/HistoryPanel';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAppStore } from '@/store/appStore';
import { useTranscript } from '@/hooks/useTranscript';
import { useBookmarks } from '@/hooks/useBookmarks';
import { msToTimestamp } from '@/lib/transcript';

export default function Home() {
  const {
    currentVideo,
    setCurrentVideo,
    showResults,
    setShowResults,
    historyPanelOpen,
    activeMode,
    setActiveMode,
    transcript,
    currentTimeSec,
    setCurrentTimeSec,
  } = useAppStore();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bookmarkToast, setBookmarkToast] = useState(false);

  const { addBookmark } = useBookmarks();

  // Auto-fetch transcript when a video is selected
  useTranscript();

  // Wire player ready → global ref; wire time polling → Zustand store
  const handlePlayerReady = useCallback((player: YT.Player) => {
    setGlobalPlayer(player);
  }, []);

  const handleTimeUpdate = useCallback((t: number) => {
    setCurrentTimeSec(t);
  }, [setCurrentTimeSec]);

  // Handle Timestamp Bookmark
  const handleBookmarkCurrentSentence = () => {
    if (!currentVideo) return;
    const timeMs = currentTimeSec * 1000;
    const line =
      transcript.find((l) => timeMs >= l.offset && timeMs <= l.offset + l.duration) ||
      (transcript.length > 0
        ? transcript.reduce((prev, curr) =>
            Math.abs(curr.offset - timeMs) < Math.abs(prev.offset - timeMs) ? curr : prev,
          )
        : null);

    const sentence = line?.text || `Moment at ${msToTimestamp(timeMs)}`;
    const offsetMs = line?.offset ?? timeMs;

    addBookmark(currentVideo.id, currentVideo.title, sentence, offsetMs);
    setBookmarkToast(true);
    setTimeout(() => setBookmarkToast(false), 2000);
  };

  const showSearch = showResults;

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>
      {/* ── 1. Top Header ── */}
      <Header />

      {/* ── 2. History drawer overlay ── */}
      {historyPanelOpen && (
        <div
          className="animate-slide-in-up"
          style={{
            position: 'absolute',
            top: 56,
            left: 0,
            right: 0,
            zIndex: 40,
            padding: '0 20px',
          }}
        >
          <div style={{ maxWidth: 900, margin: '0 auto', paddingTop: 10 }}>
            <HistoryPanel />
          </div>
        </div>
      )}

      {/* ── 3. Dynamic Workspace ── */}
      {currentVideo ? (
        /* ──── ACTIVE VIDEO PLAYBACK WORKSPACE ──── */
        <div
          style={{
            flex: 1,
            display: 'grid',
            // STATE A: 70% / 30% when Sidebar is Open
            // STATE B: 50% / 50% when Sidebar is Collapsed
            gridTemplateColumns: sidebarCollapsed
              ? 'minmax(0, 1fr) minmax(0, 1fr)'
              : 'minmax(0, 7fr) minmax(320px, 3fr)',
            overflow: 'hidden',
            minHeight: 0,
            transition: 'grid-template-columns 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* ════════════════ LEFT COLUMN (Video & Controls) ════════════════ */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              borderRight: '1px solid var(--border-subtle)',
              background: 'var(--bg-base)',
              minHeight: 0,
            }}
          >
            {/* If searching while video is active, show search overlay */}
            {showSearch ? (
              <div
                className="animate-fade-in"
                style={{ flex: 1, overflow: 'hidden', padding: '24px 28px' }}
              >
                <SearchResults />
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px 22px 32px',
                  gap: 12,
                  minHeight: '100%',
                }}
              >
                {/* ── Top Action Bar (Back to Home & Sidebar Toggle) ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={() => {
                      setCurrentVideo(null);
                      setShowResults(false);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      borderRadius: 'var(--radius-full)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.borderColor = 'var(--accent-400)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                    }}
                  >
                    <ArrowLeft size={13} />
                    <span>Home Feed</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Timestamp Bookmark Button */}
                    <button
                      onClick={handleBookmarkCurrentSentence}
                      title="Save current timestamp & sentence to Flashcards"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        border: `1px solid ${bookmarkToast ? 'var(--success)' : 'var(--border-default)'}`,
                        background: bookmarkToast ? 'var(--success-bg)' : 'var(--bg-card)',
                        color: bookmarkToast ? 'var(--success)' : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: 'var(--shadow-xs)',
                      }}
                    >
                      {bookmarkToast ? <Check size={13} /> : <Bookmark size={13} />}
                      <span>{bookmarkToast ? 'Saved Flashcard!' : 'Bookmark'}</span>
                    </button>

                    {/* Sidebar Toggle Button */}
                    <button
                      onClick={() => setSidebarCollapsed((prev) => !prev)}
                      title={sidebarCollapsed ? 'Show Top Sentences sidebar (70/30)' : 'Hide sidebar for side-by-side exercises (50/50)'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        border: '1px solid var(--border-default)',
                        background: sidebarCollapsed ? 'var(--accent-50)' : 'var(--bg-card)',
                        color: sidebarCollapsed ? 'var(--accent-700)' : 'var(--text-secondary)',
                        borderColor: sidebarCollapsed ? 'var(--accent-200)' : 'var(--border-default)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: 'var(--shadow-xs)',
                      }}
                    >
                      {sidebarCollapsed ? (
                        <>
                          <PanelRightOpen size={14} color="var(--accent-600)" />
                          <span>Show Sidebar</span>
                        </>
                      ) : (
                        <>
                          <PanelRightClose size={14} />
                          <span>50/50 Mode</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* ── STICKY Video Player Container ── */}
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    background: 'var(--bg-base)',
                    paddingBottom: 4,
                  }}
                >
                  <VideoPlayer
                    onPlayerReady={handlePlayerReady}
                    onTimeUpdate={handleTimeUpdate}
                  />
                </div>

                {/* ── Timestamp Bookmark Bar directly under player controls ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <Clock size={13} color="var(--accent-600)" />
                    <span>Playback: <strong style={{ color: 'var(--text-primary)' }}>{msToTimestamp(currentTimeSec * 1000)}</strong></span>
                  </div>
                  <button
                    onClick={handleBookmarkCurrentSentence}
                    id="bookmark-current-sentence-btn"
                    title="Save current timestamp and sentence to Flashcards tab"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: `1px solid ${bookmarkToast ? 'var(--success)' : 'var(--accent-300)'}`,
                      background: bookmarkToast ? 'var(--success-bg)' : 'var(--accent-50)',
                      color: bookmarkToast ? 'var(--success)' : 'var(--accent-700)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    {bookmarkToast ? <Check size={13} /> : <Bookmark size={13} />}
                    <span>{bookmarkToast ? 'Saved to Flashcards!' : 'Bookmark / Save Sentence'}</span>
                  </button>
                </div>

                {/* ── Mode Selector: Highly visible directly under video ── */}
                <ModeSelector />

                {/* ── A-B PREP LOOP (Pre-Exercise Listening Warm-up) ── */}
                <ABPrepLoop />

                {/* ── STATE A ONLY: Exercises Render UNDER Video when Sidebar is Open ── */}
                {!sidebarCollapsed && (
                  <>
                    {activeMode === 'shadowing' && (
                      <div className="animate-fade-in">
                        <ShadowingMode />
                      </div>
                    )}
                    {activeMode === 'voiceGapFill' && (
                      <div className="animate-fade-in">
                        <VoiceGapFillMode />
                      </div>
                    )}
                    {activeMode === 'rolePlay' && (
                      <div className="animate-fade-in">
                        <RolePlayMode />
                      </div>
                    )}
                    {activeMode === 'blindListening' && (
                      <div className="animate-fade-in">
                        <BlindListeningMode />
                      </div>
                    )}
                    {activeMode === 'grammar' && (
                      <div className="animate-fade-in">
                        <GrammarMode />
                      </div>
                    )}
                    {activeMode === 'writing' && (
                      <div className="animate-fade-in">
                        <WritingMode />
                      </div>
                    )}
                    {activeMode === 'voiceDubbing' && (
                      <div className="animate-fade-in">
                        <VoiceDubbingMode />
                      </div>
                    )}
                  </>
                )}

                {/* Video Info Card */}
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow-xs)',
                    flexShrink: 0,
                  }}
                >
                  <p
                    style={{
                      fontSize: 13.5,
                      fontWeight: 650,
                      color: 'var(--text-primary)',
                      lineHeight: 1.4,
                      letterSpacing: '-0.01em',
                      marginBottom: 4,
                    }}
                  >
                    {currentVideo.title}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {currentVideo.channelTitle}
                    </span>
                    <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--text-muted)' }} />
                    <a
                      href={`https://www.youtube.com/watch?v=${currentVideo.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--accent-500)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      Open on YouTube ↗
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ════════════════ RIGHT COLUMN (Dynamic: Sidebar OR 50% Exercises) ════════════════ */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: 'var(--bg-card)',
              minHeight: 0,
            }}
          >
            {sidebarCollapsed ? (
              /* ── STATE B: Side-by-Side Exercises taking full right 50% ── */
              <div
                className="animate-fade-in"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '20px 24px',
                  overflowY: 'auto',
                  gap: 16,
                  background: 'var(--bg-base)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} color="var(--accent-600)" />
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Interactive Learning Workspace
                    </h2>
                  </div>
                  <button
                    onClick={() => setSidebarCollapsed(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--accent-600)',
                      background: 'var(--accent-50)',
                      border: '1px solid var(--accent-100)',
                      padding: '4px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <PanelRightOpen size={13} />
                    <span>Show Transcript Sidebar</span>
                  </button>
                </div>

                {activeMode === 'shadowing' ? (
                  <ShadowingMode />
                ) : activeMode === 'voiceGapFill' ? (
                  <VoiceGapFillMode />
                ) : activeMode === 'rolePlay' ? (
                  <RolePlayMode />
                ) : activeMode === 'blindListening' ? (
                  <BlindListeningMode />
                ) : activeMode === 'grammar' ? (
                  <GrammarMode />
                ) : activeMode === 'writing' ? (
                  <WritingMode />
                ) : activeMode === 'voiceDubbing' ? (
                  <VoiceDubbingMode />
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 14,
                      padding: '40px 20px',
                      background: 'var(--bg-card)',
                      border: '1.5px dashed var(--border-default)',
                      borderRadius: 20,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        background: 'var(--accent-50)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Sparkles size={24} color="var(--accent-600)" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        Side-by-Side Practice Mode Active
                      </h3>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.4 }}>
                        Select any of the 4 interactive modes on the left to practice in this 50/50 workspace.
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                      <button
                        onClick={() => setActiveMode('shadowing')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 9,
                          background: 'var(--accent-500)',
                          color: '#ffffff',
                          fontSize: 11.5,
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <Headphones size={13} />
                        Shadowing
                      </button>
                      <button
                        onClick={() => setActiveMode('voiceGapFill')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 9,
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-default)',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <MessageSquareDashed size={13} />
                        Gap Fill
                      </button>
                      <button
                        onClick={() => setActiveMode('rolePlay')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 9,
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-default)',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Users size={13} />
                        Role-Play
                      </button>
                      <button
                        onClick={() => setActiveMode('blindListening')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 9,
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-default)',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Ear size={13} />
                        Blind Listening
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── STATE A: Standard 30% Sidebar (Top Repeated Sentences, Transcript, Flashcards) ── */
              <div style={{ flex: 1, overflow: 'hidden', padding: '16px 14px' }}>
                <Sidebar />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ──── FULL-WIDTH HOME LAYOUT (No Video Playing: Sidebar Hidden) ──── */
        <div style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-base)',
        }}>
          {showSearch ? (
            <div
              className="animate-fade-in"
              style={{ flex: 1, overflow: 'hidden', padding: '28px 32px' }}
            >
              <SearchResults />
            </div>
          ) : (
            <HomeFeed />
          )}
        </div>
      )}
    </div>
  );
}
