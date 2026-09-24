'use client';

import { useState, useEffect } from 'react';
import {
  Repeat2,
  AlignLeft,
  Bookmark,
  Play,
  Volume2,
  Trash2,
  EyeOff,
  Globe,
  Copy,
  Check,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useBookmarks } from '@/hooks/useBookmarks';
import { Spinner } from '@/components/ui/Spinner';
import { msToTimestamp, removeConsecutiveDuplicates } from '@/lib/transcript';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { getStoredGlobalPhrases, type GlobalPhraseEntry } from '@/lib/globalPhrases';

export function Sidebar() {
  const {
    currentVideo,
    transcript,
    repeatedSentences,
    isLoadingTranscript,
    transcriptError,
    sidebarTab,
    setSidebarTab,
    currentTimeSec,
    activeMode,
  } = useAppStore();

  const { bookmarks, removeBookmark } = useBookmarks();
  const [speakingSentence, setSpeakingSentence] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [globalPhrases, setGlobalPhrases] = useState<GlobalPhraseEntry[]>([]);

  // Load and subscribe to Global AI Dictionary updates
  useEffect(() => {
    const loadPhrases = () => {
      const stored = getStoredGlobalPhrases();
      const list = Object.values(stored).sort(
        (a, b) => b.uniqueVideoCount - a.uniqueVideoCount || b.occurrencesCount - a.occurrencesCount,
      );
      setGlobalPhrases(list);
    };

    loadPhrases();
    window.addEventListener('global-phrases-updated', loadPhrases);
    return () => window.removeEventListener('global-phrases-updated', loadPhrases);
  }, [transcript]);

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(removeConsecutiveDuplicates(text));
    u.lang = 'de-DE';
    u.rate = 0.9;
    setSpeakingSentence(text);
    u.onend = () => setSpeakingSentence(null);
    u.onerror = () => setSpeakingSentence(null);
    window.speechSynthesis.speak(u);
  };

  const copyToClipboard = (text: string, index: number) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(removeConsecutiveDuplicates(text));
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    }
  };

  const jumpToOffset = (offsetMs: number) => {
    const player = getGlobalPlayer();
    if (player) {
      player.seekTo(offsetMs / 1000, true);
      player.playVideo();
    }
  };

  if (!currentVideo) {
    return (
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20,
          padding: '32px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          color: 'var(--text-muted)',
          height: '100%',
          minHeight: 300,
          justifyContent: 'center',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <AlignLeft size={28} strokeWidth={1.5} color="var(--border-default)" />
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Select a video to see repeated sentences, Global AI Dictionary, and flashcards
        </p>
      </div>
    );
  }

  const currentMs = currentTimeSec * 1000;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-xs)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* ── Tab Navigation ── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '4px 4px 0',
          gap: 2,
          background: 'var(--bg-elevated)',
        }}
      >
        {(
          [
            { id: 'repeated' as const, label: 'Repeated Sentences', count: repeatedSentences.length, Icon: Repeat2 },
            { id: 'globalDict' as const, label: 'Global AI Dict', count: globalPhrases.length, Icon: Globe },
            { id: 'transcript' as const, label: 'Transcript', count: transcript.length, Icon: AlignLeft },
            { id: 'flashcards' as const, label: 'Flashcards', count: bookmarks.length, Icon: Bookmark },
          ] as const
        ).map(({ id, label, count, Icon }) => {
          const isActive = sidebarTab === id;
          return (
            <button
              key={id}
              id={`sidebar-tab-${id}`}
              onClick={() => setSidebarTab(id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '9px 3px',
                border: 'none',
                borderRadius: '10px 10px 0 0',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--accent-600)' : 'var(--text-secondary)',
                fontFamily: 'inherit',
                fontSize: 11,
                fontWeight: isActive ? 750 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                borderBottom: isActive ? '2px solid var(--accent-500)' : '2px solid transparent',
              }}
            >
              <Icon size={12} strokeWidth={isActive ? 2.5 : 2} />
              <span>{label}</span>
              {count > 0 && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 99,
                    background: isActive ? 'var(--accent-50)' : 'rgba(0,0,0,0.06)',
                    color: isActive ? 'var(--accent-700)' : 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
        }}
      >
        {isLoadingTranscript ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '60px 0',
              color: 'var(--text-muted)',
            }}
          >
            <Spinner size="md" />
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Generating German transcript…
            </p>
            <p style={{ fontSize: 11, textAlign: 'center', maxWidth: 220, color: 'var(--text-muted)' }}>
              Extracting clean sentences with Whisper AI for frequency analysis.
            </p>
          </div>
        ) : transcriptError ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 24 }}>⚠️</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Transcript unavailable
            </p>
            <p style={{ fontSize: 12 }}>{transcriptError}</p>
          </div>
        ) : sidebarTab === 'repeated' ? (
          /* ── TAB 1: REPEATED SENTENCES (CURRENT VIDEO) ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeMode === 'blindListening' && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#030712',
                  border: '1px solid #1f2937',
                  color: '#fbbf24',
                  fontSize: 11.5,
                  fontWeight: 650,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <EyeOff size={14} />
                <span>Blind Listening Active: Subtitles 100% blacked out</span>
              </div>
            )}

            {repeatedSentences.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  No repeated sentences detected in this video
                </p>
                <p style={{ fontSize: 11, marginTop: 4 }}>
                  Sentences repeated 2 or more times will appear here with copy shortcuts.
                </p>
              </div>
            ) : (
              repeatedSentences.map((item, idx) => {
                const cleanSentence = removeConsecutiveDuplicates(item.text);
                const isCopied = copiedIndex === idx;

                return (
                  <div
                    key={`${cleanSentence}-${idx}`}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: activeMode === 'blindListening' ? '#030712' : 'var(--bg-elevated)',
                      border: `1px solid ${activeMode === 'blindListening' ? '#1f2937' : 'var(--border-subtle)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Sentence text and repetition badge */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <p
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: activeMode === 'blindListening' ? 'transparent' : 'var(--text-primary)',
                          background: activeMode === 'blindListening' ? '#111827' : 'transparent',
                          userSelect: activeMode === 'blindListening' ? 'none' : 'auto',
                          borderRadius: 4,
                          lineHeight: 1.35,
                          flex: 1,
                        }}
                      >
                        {activeMode === 'blindListening' ? '██████████████████████' : cleanSentence}
                      </p>

                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 750,
                          padding: '2px 8px',
                          borderRadius: 8,
                          background: item.count >= 2 ? 'var(--accent-500)' : 'var(--bg-card)',
                          color: item.count >= 2 ? '#ffffff' : 'var(--text-secondary)',
                          border: item.count >= 2 ? 'none' : '1px solid var(--border-default)',
                          flexShrink: 0,
                        }}
                      >
                        Repeated {item.count}x
                      </span>
                    </div>

                    {/* Action buttons: Copy to Notes, Jump to Video, Pronounce */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {/* Copy Button for Notebook */}
                        <button
                          onClick={() => copyToClipboard(cleanSentence, idx)}
                          title="Copy sentence to personal notes"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: isCopied ? 'var(--success-bg)' : 'var(--bg-card)',
                            border: `1px solid ${isCopied ? 'var(--success)' : 'var(--border-default)'}`,
                            color: isCopied ? 'var(--success)' : 'var(--text-secondary)',
                            fontSize: 11,
                            fontWeight: 650,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isCopied ? <Check size={11} /> : <Copy size={11} />}
                          <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                        </button>

                        {/* Pronounce TTS */}
                        <button
                          onClick={() => speakText(cleanSentence)}
                          title="Listen to native pronunciation"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '4px 7px',
                            borderRadius: 6,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-secondary)',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          <Volume2 size={12} />
                        </button>
                      </div>

                      {/* Jump to video offset */}
                      <button
                        onClick={() => jumpToOffset(item.firstOffset)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 9px',
                          borderRadius: 6,
                          background: 'var(--accent-50)',
                          border: '1px solid var(--accent-200)',
                          color: 'var(--accent-700)',
                          fontSize: 11,
                          fontWeight: 650,
                          cursor: 'pointer',
                        }}
                      >
                        <Play size={10} fill="currentColor" />
                        <span>Jump to {msToTimestamp(item.firstOffset)}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : sidebarTab === 'globalDict' ? (
          /* ── TAB 2: GLOBAL AI DICTIONARY (CROSS-VIDEO FREQUENCY) ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: 'var(--accent-50)',
                border: '1px solid var(--accent-200)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                color: 'var(--accent-700)',
                fontWeight: 650,
              }}
            >
              <Globe size={14} />
              <span>Sentences repeated across multiple YouTube videos:</span>
            </div>

            {globalPhrases.map((phrase, pIdx) => {
              const cleanPhrase = removeConsecutiveDuplicates(phrase.originalText);
              const isCopied = copiedIndex === pIdx + 1000;

              return (
                <div
                  key={phrase.phraseKey}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                      {cleanPhrase}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => copyToClipboard(cleanPhrase, pIdx + 1000)}
                        title="Copy to notes"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: isCopied ? 'var(--success)' : 'var(--text-muted)' }}
                      >
                        {isCopied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                      </button>
                      <button
                        onClick={() => speakText(cleanPhrase)}
                        title="Pronounce"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--accent-600)' }}
                      >
                        <Volume2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 6,
                        background: phrase.uniqueVideoCount >= 3 ? 'var(--success-bg)' : 'var(--accent-50)',
                        color: phrase.uniqueVideoCount >= 3 ? 'var(--success)' : 'var(--accent-700)',
                        border: `1px solid ${phrase.uniqueVideoCount >= 3 ? 'var(--success)' : 'var(--accent-200)'}`,
                      }}
                    >
                      Found in {phrase.uniqueVideoCount} videos
                    </span>

                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      Total {phrase.occurrencesCount} occurrences
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : sidebarTab === 'transcript' ? (
          /* ── TAB 3: FULL TRANSCRIPT (BLACKED OUT IN BLIND LISTENING) ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activeMode === 'blindListening' && (
              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: 6,
                  borderRadius: 10,
                  background: '#030712',
                  border: '1px solid #1f2937',
                  color: '#fbbf24',
                  fontSize: 11.5,
                  fontWeight: 650,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <EyeOff size={14} />
                <span>Blind Listening Active: Subtitles 100% blacked out</span>
              </div>
            )}
            {transcript.map((line, idx) => {
              const isCurrent = currentMs >= line.offset && currentMs <= line.offset + line.duration;
              const cleanText = removeConsecutiveDuplicates(line.text);

              return (
                <div
                  key={idx}
                  onClick={() => jumpToOffset(line.offset)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: isCurrent ? 'var(--accent-50)' : 'transparent',
                    borderLeft: isCurrent ? '3px solid var(--accent-500)' : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'var(--bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      fontSize: 10.5,
                      color: isCurrent ? 'var(--accent-600)' : 'var(--text-muted)',
                      fontWeight: 600,
                      flexShrink: 0,
                      marginTop: 2,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {msToTimestamp(line.offset)}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: isCurrent ? 700 : 400,
                      color: activeMode === 'blindListening' ? 'transparent' : isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: activeMode === 'blindListening' ? '#111827' : 'transparent',
                      userSelect: activeMode === 'blindListening' ? 'none' : 'auto',
                      borderRadius: 4,
                      lineHeight: 1.4,
                      flex: 1,
                    }}
                  >
                    {activeMode === 'blindListening' ? '██████████████████████████████' : cleanText}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── TAB 4: FLASHCARDS (SAVED TIMESTAMP BOOKMARKS) ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bookmarks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 14px', color: 'var(--text-muted)' }}>
                <Bookmark size={24} color="var(--accent-400)" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>
                  No saved flashcards yet
                </p>
                <p style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.4 }}>
                  Click <strong>Bookmark / Save Sentence</strong> under the video player to save timestamps and sentences!
                </p>
              </div>
            ) : (
              bookmarks.map((bm, bIdx) => {
                const cleanBm = removeConsecutiveDuplicates(bm.sentence);
                const isCopied = copiedIndex === bIdx + 2000;

                return (
                  <div
                    key={bm.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                      {cleanBm}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <button
                        onClick={() => jumpToOffset(bm.offsetMs)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: 'var(--accent-50)',
                          color: 'var(--accent-700)',
                          fontSize: 11,
                          fontWeight: 600,
                          border: '1px solid var(--accent-200)',
                          cursor: 'pointer',
                        }}
                      >
                        <Play size={10} fill="currentColor" />
                        {bm.timestampFormatted}
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => copyToClipboard(cleanBm, bIdx + 2000)}
                          title="Copy sentence to notes"
                          style={{
                            padding: 4,
                            borderRadius: 6,
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: isCopied ? 'var(--success)' : 'var(--text-secondary)',
                          }}
                        >
                          {isCopied ? <Check size={14} color="var(--success)" /> : <Copy size={13} />}
                        </button>
                        <button
                          onClick={() => speakText(cleanBm)}
                          title="Listen to German pronunciation"
                          style={{
                            padding: 4,
                            borderRadius: 6,
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Volume2 size={14} />
                        </button>
                        <button
                          onClick={() => removeBookmark(bm.id)}
                          title="Delete Flashcard"
                          style={{
                            padding: 4,
                            borderRadius: 6,
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: 'var(--error)',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
