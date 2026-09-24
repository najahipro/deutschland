'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Volume2,
  Copy,
  Check,
  Search,
  Flame,
  Film,
  Sparkles,
  ArrowLeft,
  BookOpen,
  Filter,
} from 'lucide-react';
import { useGlobalPhrases } from '@/hooks/useGlobalPhrases';
import { Header } from '@/components/layout/Header';
import type { GlobalPhraseEntry } from '@/lib/globalPhrases';

export default function CommonPhrasesPage() {
  const { allPhrases, commonPhrases, isLoaded } = useGlobalPhrases();

  const [searchFilter, setSearchFilter] = useState('');
  const [minVideosFilter, setMinVideosFilter] = useState<number>(3); // Default >= 3 as requested
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  // Filtered & sorted phrases
  const filteredPhrases = useMemo(() => {
    let list = minVideosFilter === 3 ? commonPhrases : allPhrases.filter((p) => p.uniqueVideoCount >= minVideosFilter);

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.originalText.toLowerCase().includes(q) ||
          p.phraseKey.includes(q) ||
          Object.values(p.videoTitles).some((t) => t.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [allPhrases, commonPhrases, minVideosFilter, searchFilter]);

  // Audio TTS Speak
  const handleSpeak = (phrase: string, key: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    setSpeakingKey(key);
    utterance.onend = () => setSpeakingKey(null);
    utterance.onerror = () => setSpeakingKey(null);
    window.speechSynthesis.speak(utterance);
  };

  // Copy to clipboard
  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  // Total unique videos analyzed across all phrases
  const totalUniqueVideos = useMemo(() => {
    const videoSet = new Set<string>();
    for (const p of allPhrases) {
      for (const id of p.videoIds) {
        videoSet.add(id);
      }
    }
    return videoSet.size;
  }, [allPhrases]);

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
    }}>
      {/* Top Header */}
      <Header />

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        padding: '24px 28px 48px',
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
      }}>
        {/* Navigation & Breadcrumb */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <ArrowLeft size={13} />
            <span>Back to Video Player</span>
          </Link>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-600)' }}>
            Global Common Phrases
          </span>
        </div>

        {/* Hero Banner */}
        <div
          className="animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--accent-50) 100%)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 20,
            padding: '28px 32px',
            marginBottom: 24,
            boxShadow: 'var(--shadow-sm)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ maxWidth: 760 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 20,
              background: 'var(--accent-500)',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              <Flame size={12} />
              Cross-Video Frequency Engine
            </div>
            <h1 style={{
              fontSize: 26,
              fontWeight: 750,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              marginBottom: 8,
            }}>
              High-Frequency German Phrases
            </h1>
            <p style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              marginBottom: 20,
            }}>
              Sentences tracked across <strong>3 or more independent YouTube videos</strong>. When a phrase repeats across different speakers and contexts, it represents authentic, must-know German.
            </p>

            {/* Quick Metrics Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div style={{
                background: 'var(--bg-card)',
                padding: '10px 16px',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <Sparkles size={18} color="var(--accent-500)" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1 }}>
                    {commonPhrases.length}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    High-Frequency Phrases (≥ 3 videos)
                  </div>
                </div>
              </div>

              <div style={{
                background: 'var(--bg-card)',
                padding: '10px 16px',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <Film size={18} color="var(--accent-500)" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1 }}>
                    {totalUniqueVideos}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Unique Videos Tracked
                  </div>
                </div>
              </div>

              <div style={{
                background: 'var(--bg-card)',
                padding: '10px 16px',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <BookOpen size={18} color="var(--accent-500)" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1 }}>
                    {allPhrases.length}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Total Sentences Indexed
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 20,
        }}>
          {/* Threshold Switcher */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-card)',
            padding: 4,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
          }}>
            <button
              onClick={() => setMinVideosFilter(3)}
              style={{
                padding: '6px 14px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: minVideosFilter === 3 ? 650 : 500,
                border: 'none',
                cursor: 'pointer',
                background: minVideosFilter === 3 ? 'var(--accent-500)' : 'transparent',
                color: minVideosFilter === 3 ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              Verified (≥ 3 videos)
            </button>
            <button
              onClick={() => setMinVideosFilter(2)}
              style={{
                padding: '6px 14px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: minVideosFilter === 2 ? 650 : 500,
                border: 'none',
                cursor: 'pointer',
                background: minVideosFilter === 2 ? 'var(--accent-500)' : 'transparent',
                color: minVideosFilter === 2 ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              Emerging (≥ 2 videos)
            </button>
            <button
              onClick={() => setMinVideosFilter(1)}
              style={{
                padding: '6px 14px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: minVideosFilter === 1 ? 650 : 500,
                border: 'none',
                cursor: 'pointer',
                background: minVideosFilter === 1 ? 'var(--accent-500)' : 'transparent',
                color: minVideosFilter === 1 ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              All Indexed
            </button>
          </div>

          {/* Search phrase in list */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 320,
          }}>
            <Search
              size={14}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search common phrases or video…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                width: '100%',
                height: 38,
                paddingLeft: 34,
                paddingRight: 12,
                borderRadius: 10,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-card)',
                fontSize: 12.5,
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Phrases List */}
        {!isLoaded ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading phrases repository…
          </div>
        ) : filteredPhrases.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            color: 'var(--text-muted)',
          }}>
            <Sparkles size={28} color="var(--accent-400)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
              No phrases match this filter
            </h3>
            <p style={{ fontSize: 13 }}>
              Watch more videos on the home page — their transcripts will automatically register and uncover repeated phrases here!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filteredPhrases.map((phrase, idx) => (
              <PhraseCard
                key={phrase.phraseKey}
                phrase={phrase}
                index={idx}
                isSpeaking={speakingKey === phrase.phraseKey}
                isCopied={copiedKey === phrase.phraseKey}
                onSpeak={() => handleSpeak(phrase.originalText, phrase.phraseKey)}
                onCopy={() => handleCopy(phrase.originalText, phrase.phraseKey)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Single Phrase Card ───────────────────────────────────────────────────────

function PhraseCard({
  phrase,
  index,
  isSpeaking,
  isCopied,
  onSpeak,
  onCopy,
}: {
  phrase: GlobalPhraseEntry;
  index: number;
  isSpeaking: boolean;
  isCopied: boolean;
  onSpeak: () => void;
  onCopy: () => void;
}) {
  const isHighFreq = phrase.uniqueVideoCount >= 3;

  return (
    <div
      className="animate-fade-in"
      style={{
        animationDelay: `${Math.min(index * 25, 250)}ms`,
        background: 'var(--bg-card)',
        border: `1px solid ${isHighFreq ? 'var(--accent-200)' : 'var(--border-subtle)'}`,
        borderRadius: 16,
        padding: '18px 22px',
        boxShadow: 'var(--shadow-xs)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'all 0.16s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ flex: 1 }}>
          {/* German Phrase text */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}>
              {phrase.originalText}
            </span>

            {/* Frequency Badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 9px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 650,
                background: isHighFreq ? '#fef3c7' : 'var(--accent-50)',
                color: isHighFreq ? '#b45309' : 'var(--accent-700)',
                border: `1px solid ${isHighFreq ? '#fde68a' : 'var(--accent-200)'}`,
              }}
            >
              {isHighFreq ? <Flame size={12} color="#d97706" /> : <Film size={11} />}
              {phrase.uniqueVideoCount} {phrase.uniqueVideoCount === 1 ? 'Video' : 'Different Videos'}
              <span style={{ opacity: 0.6, fontSize: 10 }}>({phrase.occurrencesCount}x total)</span>
            </span>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Spotted in:
          </p>
        </div>

        {/* Audio TTS and Copy Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onSpeak}
            title="Listen to German pronunciation (de-DE)"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 10,
              border: '1px solid var(--border-default)',
              background: isSpeaking ? 'var(--accent-500)' : 'var(--bg-elevated)',
              color: isSpeaking ? '#ffffff' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Volume2 size={16} strokeWidth={isSpeaking ? 2.5 : 2} />
          </button>

          <button
            onClick={onCopy}
            title="Copy phrase"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 10,
              border: '1px solid var(--border-default)',
              background: isCopied ? 'var(--success-bg)' : 'var(--bg-elevated)',
              color: isCopied ? 'var(--success)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {isCopied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} />}
          </button>
        </div>
      </div>

      {/* Videos pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {phrase.videoIds.map((vid) => {
          const title = phrase.videoTitles?.[vid] || `Video ID: ${vid}`;
          return (
            <span
              key={vid}
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                padding: '3px 8px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={title}
            >
              <Film size={10} color="var(--text-muted)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
