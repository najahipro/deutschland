'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Flame,
  Volume2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Shuffle,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useBookmarks } from '@/hooks/useBookmarks';
import { getStoredGlobalPhrases } from '@/lib/globalPhrases';
import { useAppStore } from '@/store/appStore';

interface WordChip {
  id: string;
  word: string;
  originalIndex: number;
}

const SEED_GAME_SENTENCES = [
  'Ich gehe heute in den Supermarkt einkaufen.',
  'Wie geht es dir heute?',
  'Das ist eine sehr gute Frage.',
  'Auf jeden Fall bin ich dabei!',
  'Deutsch lernen macht wirklich großen Spaß.',
  'Wir treffen uns morgen um acht Uhr.',
  'Ich habe keine Ahnung wo er ist.',
  'Können Sie mir bitte helfen?',
  'Vielen Dank für deine freundliche Hilfe.',
  'Schön dich heute kennenzulernen!',
  'Was machst du am Wochenende schönes?',
  'Das Wetter in Berlin ist heute herrlich.',
  'Ich trinke morgens gerne einen Kaffee.',
  'Woher kommst du und wie heißt du?',
  'Guten Tag, ich möchte ein Ticket kaufen.',
];

export default function WordSwipePage() {
  const { bookmarks } = useBookmarks();
  const { transcript, repeatedSentences } = useAppStore();

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const [currentSentence, setCurrentSentence] = useState('');
  const [availableChips, setAvailableChips] = useState<WordChip[]>([]);
  const [selectedChips, setSelectedChips] = useState<WordChip[]>([]);
  const [gameState, setGameState] = useState<'playing' | 'correct' | 'incorrect'>('playing');
  const [shake, setShake] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Aggregate sentence pool from user's bookmarks, global phrases, repeated sentences, and seed pool
  const sentencePool = useMemo(() => {
    const list: string[] = [];

    // 1. User bookmarks
    for (const b of bookmarks) {
      if (b.sentence && b.sentence.split(/\s+/).length >= 3 && b.sentence.split(/\s+/).length <= 12) {
        list.push(b.sentence.trim());
      }
    }

    // 2. Global phrases
    try {
      const stored = getStoredGlobalPhrases();
      for (const k of Object.keys(stored)) {
        const text = stored[k]?.originalText;
        if (text && text.split(/\s+/).length >= 3 && text.split(/\s+/).length <= 10) {
          list.push(text.trim());
        }
      }
    } catch { /* ignore */ }

    // 3. Repeated sentences
    for (const r of repeatedSentences) {
      if (r.text && r.text.split(/\s+/).length >= 3 && r.text.split(/\s+/).length <= 10) {
        list.push(r.text.trim());
      }
    }

    // 4. Current transcript
    for (const t of transcript.slice(0, 40)) {
      if (t.text && t.text.split(/\s+/).length >= 3 && t.text.split(/\s+/).length <= 9) {
        list.push(t.text.trim());
      }
    }

    // 5. Authentic seed sentences
    for (const s of SEED_GAME_SENTENCES) {
      list.push(s);
    }

    // Deduplicate
    return Array.from(new Set(list));
  }, [bookmarks, repeatedSentences, transcript]);

  // Load a new sentence
  const loadSentence = useCallback(
    (targetText?: string) => {
      if (sentencePool.length === 0) return;

      const sentence =
        targetText ||
        sentencePool[Math.floor(Math.random() * sentencePool.length)];

      setCurrentSentence(sentence);

      // Clean and split words
      const rawWords = sentence.trim().split(/\s+/).filter(Boolean);
      const chips: WordChip[] = rawWords.map((w, idx) => ({
        id: `chip-${idx}-${w}-${Math.random()}`,
        word: w,
        originalIndex: idx,
      }));

      // Shuffle chips
      const shuffled = [...chips].sort(() => Math.random() - 0.5);

      setAvailableChips(shuffled);
      setSelectedChips([]);
      setGameState('playing');
      setShake(false);
      setShowHint(false);
    },
    [sentencePool],
  );

  // Initialize on load
  useEffect(() => {
    if (!currentSentence && sentencePool.length > 0) {
      loadSentence();
    }
  }, [currentSentence, sentencePool, loadSentence]);

  // Click available chip -> move to selected drop-zone
  const handleSelectChip = (chip: WordChip) => {
    if (gameState !== 'playing') return;
    setAvailableChips((prev) => prev.filter((c) => c.id !== chip.id));
    setSelectedChips((prev) => [...prev, chip]);
  };

  // Click selected chip -> return to available pool
  const handleUnselectChip = (chip: WordChip) => {
    if (gameState !== 'playing') return;
    setSelectedChips((prev) => prev.filter((c) => c.id !== chip.id));
    setAvailableChips((prev) => [...prev, chip]);
  };

  // Reset all chips back to pool
  const handleResetChips = () => {
    if (gameState !== 'playing') return;
    setAvailableChips((prev) => [...prev, ...selectedChips]);
    setSelectedChips([]);
  };

  // Check Answer
  const handleCheckAnswer = () => {
    if (selectedChips.length === 0 || gameState !== 'playing') return;

    // Normalize words for fair punctuation tolerance
    const normalize = (w: string) => w.toLowerCase().replace(/[.,!?;:"""''„]/g, '');

    const originalWords = currentSentence.trim().split(/\s+/).filter(Boolean);
    const userWords = selectedChips.map((c) => c.word);

    const isMatch =
      originalWords.length === userWords.length &&
      originalWords.every((w, i) => normalize(w) === normalize(userWords[i]));

    if (isMatch) {
      setGameState('correct');
      const newScore = score + 10;
      const newStreak = streak + 1;
      setScore(newScore);
      setStreak(newStreak);
      if (newStreak > bestStreak) setBestStreak(newStreak);
    } else {
      setGameState('incorrect');
      setStreak(0);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  // Listen TTS
  const speakGerman = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
          padding: '20px 16px 40px',
          boxSizing: 'border-box',
          gap: 16,
        }}
      >
        {/* Top Gamification Stats Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-subtle)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg,#f59e0b,#ef4444)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 18,
                boxShadow: '0 2px 6px rgba(245,158,11,0.3)',
              }}
            >
              🃏
            </div>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Word Swipe
              </h1>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Arrange words into the correct German sentence
              </span>
            </div>
          </div>

          {/* Stats Pills: Score & Streak */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Streak */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 10,
                background: streak > 0 ? 'rgba(239,68,68,0.1)' : 'var(--bg-elevated)',
                border: `1.5px solid ${streak > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)'}`,
                color: streak > 0 ? '#ef4444' : 'var(--text-muted)',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <Flame size={16} fill={streak > 0 ? '#ef4444' : 'none'} />
              <span>{streak}</span>
            </div>

            {/* Score */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 10,
                background: 'rgba(245,158,11,0.1)',
                border: '1.5px solid rgba(245,158,11,0.3)',
                color: '#d97706',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <Trophy size={15} />
              <span>{score} pts</span>
            </div>
          </div>
        </div>

        {/* Game Area Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-default)',
            borderRadius: 18,
            padding: '20px 22px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* Instruction & Tools */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tap words to build the sentence:
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => speakGerman(currentSentence)}
                title="Hear sentence audio"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--accent-600)',
                  fontSize: 11.5,
                  fontWeight: 650,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Volume2 size={13} />
                <span>Audio anhören</span>
              </button>

              <button
                onClick={() => setShowHint((v) => !v)}
                title="Toggle sentence hint"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: showHint ? '#d97706' : 'var(--text-muted)',
                  fontSize: 11.5,
                  fontWeight: 650,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <HelpCircle size={13} />
                <span>{showHint ? 'Hide Hint' : 'Hint'}</span>
              </button>
            </div>
          </div>

          {/* Optional Hint Banner */}
          {showHint && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(245,158,11,0.08)',
                border: '1px dashed rgba(245,158,11,0.3)',
                fontSize: 13,
                fontWeight: 600,
                color: '#b45309',
              }}
            >
              💡 Target hint: &ldquo;{currentSentence}&rdquo;
            </div>
          )}

          {/* ── Drop Zone (Selected Words in User Order) ── */}
          <div
            style={{
              minHeight: 84,
              padding: '14px 16px',
              borderRadius: 14,
              background:
                gameState === 'correct'
                  ? 'rgba(16,185,129,0.08)'
                  : gameState === 'incorrect'
                  ? 'rgba(239,68,68,0.08)'
                  : 'var(--bg-elevated)',
              border: `2px dashed ${
                gameState === 'correct'
                  ? '#10b981'
                  : gameState === 'incorrect'
                  ? '#ef4444'
                  : selectedChips.length > 0
                  ? 'var(--accent-400)'
                  : 'var(--border-default)'
              }`,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              transform: shake ? 'translateX(-6px)' : 'none',
            }}
          >
            {selectedChips.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Tap the word chips below in the correct sentence order…
              </span>
            ) : (
              selectedChips.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => handleUnselectChip(chip)}
                  disabled={gameState !== 'playing'}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    background:
                      gameState === 'correct'
                        ? '#10b981'
                        : gameState === 'incorrect'
                        ? '#ef4444'
                        : 'var(--bg-card)',
                    color: gameState === 'playing' ? 'var(--text-primary)' : '#ffffff',
                    border: `1.5px solid ${
                      gameState === 'correct'
                        ? '#059669'
                        : gameState === 'incorrect'
                        ? '#dc2626'
                        : 'var(--accent-300)'
                    }`,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: gameState === 'playing' ? 'pointer' : 'default',
                    boxShadow: 'var(--shadow-xs)',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                  title="Tap to remove"
                >
                  {chip.word}
                </button>
              ))
            )}
          </div>

          {/* ── Available Word Chips (Shuffled Pool) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Available Words:
              </span>
              {selectedChips.length > 0 && gameState === 'playing' && (
                <button
                  onClick={handleResetChips}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 650,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RotateCcw size={11} /> Reset All
                </button>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                minHeight: 50,
              }}
            >
              {availableChips.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => handleSelectChip(chip)}
                  disabled={gameState !== 'playing'}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1.5px solid var(--border-default)',
                    fontSize: 14,
                    fontWeight: 650,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: 'var(--shadow-xs)',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-400)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {chip.word}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback & Action Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            {/* Feedback Message */}
            <div>
              {gameState === 'correct' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 800, fontSize: 14 }}>
                  <CheckCircle2 size={18} />
                  <span>Richtig! Ausgezeichnet (+10 pts)</span>
                </div>
              )}
              {gameState === 'incorrect' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontWeight: 800, fontSize: 14 }}>
                  <XCircle size={18} />
                  <span>Nicht ganz richtig. Versuch es noch einmal!</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {gameState === 'playing' && (
                <button
                  id="word-swipe-check-btn"
                  onClick={handleCheckAnswer}
                  disabled={selectedChips.length === 0}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 11,
                    background: selectedChips.length > 0 ? '#10b981' : 'var(--bg-elevated)',
                    color: selectedChips.length > 0 ? '#ffffff' : 'var(--text-muted)',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 750,
                    cursor: selectedChips.length > 0 ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                    boxShadow: selectedChips.length > 0 ? '0 2px 6px rgba(16,185,129,0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Check Answer ✓
                </button>
              )}

              {gameState === 'incorrect' && (
                <button
                  id="word-swipe-retry-btn"
                  onClick={() => {
                    handleResetChips();
                    setGameState('playing');
                  }}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 11,
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 750,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 2px 6px rgba(239,68,68,0.3)',
                  }}
                >
                  ↺ Try Again
                </button>
              )}

              {gameState === 'correct' && (
                <button
                  id="word-swipe-next-btn"
                  onClick={() => loadSentence()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '9px 20px',
                    borderRadius: 11,
                    background: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 750,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 2px 6px rgba(16,185,129,0.35)',
                  }}
                >
                  <span>Next Sentence</span>
                  <ArrowRight size={14} />
                </button>
              )}

              <button
                id="word-swipe-skip-btn"
                onClick={() => loadSentence()}
                style={{
                  padding: '9px 14px',
                  borderRadius: 11,
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                  fontSize: 12.5,
                  fontWeight: 650,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}