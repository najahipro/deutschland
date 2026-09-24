'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PenLine, CheckCircle2, XCircle, SkipForward, Eye, RotateCcw, MessageSquare, AlignLeft } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { buildGapFillExercise, diffSentenceWords, type WordDiffResult } from '@/lib/transcript';
import { UmlautKeyboard } from './UmlautKeyboard';

type WritingSubMode = 'diktat' | 'chatRolePlay' | 'typeGap';
type WritingState = 'tracking' | 'exercising' | 'correct' | 'incorrect';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: word-level diff for typed text using the robust sequence alignment
function renderDiff(typed: string, target: string) {
  const diff = diffSentenceWords(typed, target);
  return {
    words: diff.spokenDiffs.map((d) => ({ word: d.word, ok: d.isCorrect })),
    missingWords: diff.missingWords,
    allCorrect: diff.isPassing && diff.missingWords.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export function WritingMode() {
  const { transcript, currentTimeSec } = useAppStore();

  const [subMode, setSubMode] = useState<WritingSubMode>('diktat');
  const [writingState, setWritingState] = useState<WritingState>('tracking');
  const [activeLine, setActiveLine] = useState<string>('');
  const [targetWord, setTargetWord] = useState<string>(''); // for typeGap
  const [gapDisplay, setGapDisplay] = useState<string>(''); // for typeGap
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'partner' | 'user'; text: string; correct?: boolean }[]>([]);
  const [userRole] = useState<0 | 1>(0); // chatRolePlay: user is Speaker A (even lines)
  const [diffWords, setDiffWords] = useState<{ word: string; ok: boolean }[]>([]);
  const [missingWords, setMissingWords] = useState<string[]>([]);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const quizzedIdxRef = useRef<Set<number>>(new Set());
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
    };
  }, []);

  // Reset when subMode changes
  useEffect(() => {
    setWritingState('tracking');
    setActiveLine('');
    setUserInput('');
    setDiffWords([]);
    setChatHistory([]);
    quizzedIdxRef.current.clear();
    try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
  }, [subMode]);

  // ── Time-based trigger ──────────────────────────────────────────────────────
  useEffect(() => {
    if (writingState !== 'tracking' || transcript.length === 0) return;
    const nowMs = currentTimeSec * 1000;
    const idx = transcript.findIndex(
      (line) => nowMs >= line.offset && nowMs < line.offset + line.duration
    );
    if (idx === -1 || quizzedIdxRef.current.has(idx)) return;
    const line = transcript[idx];
    if (!line.text || line.text.split(/\s+/).length < 3) return;

    // For chatRolePlay: only trigger on user's turn (even = Speaker A)
    if (subMode === 'chatRolePlay' && idx % 2 !== userRole) {
      // Partner's turn: add to chat history and let play
      if (!quizzedIdxRef.current.has(idx)) {
        quizzedIdxRef.current.add(idx);
        setChatHistory((prev) => [...prev, { role: 'partner', text: line.text }]);
      }
      return;
    }

    quizzedIdxRef.current.add(idx);

    if (subMode === 'diktat') {
      setActiveLine(line.text);
      setUserInput('');
      setDiffWords([]);
      setWritingState('exercising');
      try { getGlobalPlayer()?.pauseVideo(); } catch { /* ignore */ }
      setTimeout(() => inputRef.current?.focus(), 80);
    } else if (subMode === 'chatRolePlay') {
      setActiveLine(line.text);
      setUserInput('');
      setWritingState('exercising');
      try { getGlobalPlayer()?.pauseVideo(); } catch { /* ignore */ }
      setTimeout(() => inputRef.current?.focus(), 80);
    } else if (subMode === 'typeGap') {
      const ex = buildGapFillExercise(line);
      if (!ex) return;
      setActiveLine(line.text);
      setTargetWord(ex.targetWord.toLowerCase().replace(/[.,!?;:]/g, ''));
      setGapDisplay(ex.displayText);
      setUserInput('');
      setDiffWords([]);
      setWritingState('exercising');
      try { getGlobalPlayer()?.pauseVideo(); } catch { /* ignore */ }
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [currentTimeSec, transcript, writingState, subMode, userRole]);

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!userInput.trim() || writingState !== 'exercising') return;

    if (subMode === 'diktat') {
      const diff = renderDiff(userInput, activeLine);
      setDiffWords(diff.words);
      setMissingWords(diff.missingWords);
      const allCorrect = diff.allCorrect;
      setScore((prev) => ({ correct: prev.correct + (allCorrect ? 1 : 0), total: prev.total + 1 }));
      setWritingState(allCorrect ? 'correct' : 'incorrect');
      if (allCorrect) {
        resumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setWritingState('tracking');
          setActiveLine('');
          setUserInput('');
          setDiffWords([]);
          setMissingWords([]);
          try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
        }, 1400);
      }
    } else if (subMode === 'chatRolePlay') {
      const typedClean = userInput.trim().toLowerCase().replace(/[.,!?;:]/g, '');
      const targetClean = activeLine.toLowerCase().replace(/[.,!?;:]/g, '');
      const ratio = diffSentenceWords(typedClean, targetClean);
      const isOk = ratio.score >= 70;
      setScore((prev) => ({ correct: prev.correct + (isOk ? 1 : 0), total: prev.total + 1 }));
      setChatHistory((prev) => [...prev, { role: 'user', text: userInput.trim(), correct: isOk }]);
      setWritingState(isOk ? 'correct' : 'incorrect');
      if (isOk) {
        resumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setWritingState('tracking');
          setActiveLine('');
          setUserInput('');
          try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
        }, 1000);
      }
    } else {
      // typeGap
      const typedClean = userInput.trim().toLowerCase().replace(/[.,!?;:]/g, '');
      const isOk = typedClean === targetWord;
      setScore((prev) => ({ correct: prev.correct + (isOk ? 1 : 0), total: prev.total + 1 }));
      setWritingState(isOk ? 'correct' : 'incorrect');
      if (isOk) {
        resumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setWritingState('tracking');
          setActiveLine('');
          setUserInput('');
          try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
        }, 1400);
      }
    }
  }, [userInput, writingState, subMode, activeLine, targetWord]);

  const handleRetry = () => {
    setUserInput('');
    setDiffWords([]);
    setWritingState('exercising');
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleSkip = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setWritingState('tracking');
    setActiveLine('');
    setUserInput('');
    setDiffWords([]);
    try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
  };

  const isExercising = writingState === 'exercising';
  const isCorrect = writingState === 'correct';
  const isIncorrect = writingState === 'incorrect';
  const accuracy = score.total === 0 ? null : Math.round((score.correct / score.total) * 100);

  // Active input ref (textarea for diktat, input for others)
  const activeRef = subMode === 'diktat' ? textareaRef : inputRef;

  return (
    <div
      id="writing-mode"
      style={{
        display: 'flex', flexDirection: 'column', gap: 14,
        padding: '14px 16px',
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-default)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PenLine size={14} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Writing Exercises (Schreiben)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Type what you hear · virtual umlaut keyboard included</div>
          </div>
        </div>
        {score.total > 0 && (
          <div style={{
            fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
            background: (accuracy ?? 0) >= 70 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${(accuracy ?? 0) >= 70 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: (accuracy ?? 0) >= 70 ? '#10b981' : '#ef4444',
          }}>
            {accuracy}% · {score.correct}/{score.total}
          </div>
        )}
      </div>

      {/* ── Sub-mode selector ── */}
      <div style={{ display: 'flex', gap: 6, background: 'var(--bg-elevated)', padding: 4, borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
        {([
          { id: 'diktat', label: 'Smart Diktat', icon: AlignLeft },
          { id: 'chatRolePlay', label: 'Role-Play Chat', icon: MessageSquare },
          { id: 'typeGap', label: 'Type the Gap', icon: PenLine },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`writing-submode-${id}`}
            onClick={() => setSubMode(id)}
            style={{
              flex: 1, padding: '6px 8px', borderRadius: 8, border: 'none',
              background: subMode === id ? 'var(--bg-card)' : 'transparent',
              color: subMode === id ? '#6366f1' : 'var(--text-secondary)',
              fontWeight: subMode === id ? 700 : 500, fontSize: 11.5,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              boxShadow: subMode === id ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tracking idle state ── */}
      {writingState === 'tracking' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 12,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.2)',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            {subMode === 'diktat' && 'Listening… will pause & ask you to type each sentence.'}
            {subMode === 'chatRolePlay' && 'Watching… will pause on your dialogue turn to type your reply.'}
            {subMode === 'typeGap' && 'Watching… will pause & ask you to type the missing word.'}
          </span>
        </div>
      )}

      {/* ── Chat history (chatRolePlay) ── */}
      {subMode === 'chatRolePlay' && chatHistory.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          maxHeight: 180, overflowY: 'auto',
          padding: '8px', borderRadius: 10,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        }}>
          {chatHistory.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <span style={{
                padding: '6px 12px', borderRadius: 12, maxWidth: '80%',
                fontSize: 12.5, fontWeight: 500,
                background: msg.role === 'user'
                  ? (msg.correct === false ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.12)')
                  : 'var(--bg-card)',
                border: `1px solid ${msg.role === 'user'
                  ? (msg.correct === false ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.25)')
                  : 'var(--border-subtle)'}`,
                color: 'var(--text-primary)',
              }}>
                {msg.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Exercise card ── */}
      {(isExercising || isCorrect || isIncorrect) && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: 14, borderRadius: 12,
          background: 'var(--bg-elevated)',
          border: `1.5px solid ${isCorrect ? 'rgba(16,185,129,0.35)' : isIncorrect ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.2)'}`,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* accent bar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: isCorrect
              ? 'linear-gradient(90deg,#10b981,#34d399)'
              : isIncorrect
                ? 'linear-gradient(90deg,#ef4444,#f87171)'
                : 'linear-gradient(90deg,#6366f1,#8b5cf6)',
            borderRadius: '12px 12px 0 0',
          }} />

          {/* Sentence prompt */}
          {subMode === 'diktat' && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>
              🎧 Type the sentence you just heard:
            </div>
          )}
          {subMode === 'chatRolePlay' && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>
              💬 Type your reply (your line in the dialogue):
            </div>
          )}
          {subMode === 'typeGap' && (
            <div style={{
              fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
              lineHeight: 1.6, padding: '6px 10px', borderRadius: 9,
              background: 'rgba(0,0,0,0.04)', borderLeft: '3px solid #6366f1', marginTop: 4,
            }}>
              {gapDisplay}
            </div>
          )}

          {/* Word-diff display (after submit for diktat) */}
          {subMode === 'diktat' && (isCorrect || isIncorrect) && diffWords.length > 0 && (
            <div style={{
              padding: '8px 10px', borderRadius: 9,
              background: 'rgba(0,0,0,0.04)', borderLeft: '3px solid #6366f1',
              fontSize: 14, fontWeight: 600, lineHeight: 1.65,
            }}>
              {diffWords.map((d, i) => (
                <span key={i} style={{
                  color: d.ok ? '#10b981' : '#ef4444',
                  marginRight: 6,
                  textDecoration: d.ok ? 'none' : 'underline wavy #ef4444',
                  fontWeight: d.ok ? 600 : 750,
                }}>
                  {d.word}
                </span>
              ))}
              {missingWords.length > 0 && (
                <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                  Fehlende Wörter (Missing): {missingWords.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Input row */}
          {isExercising && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {subMode === 'diktat' ? (
                <textarea
                  ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                  placeholder="Schreib den Satz hier… (Press Enter to submit)"
                  rows={2}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 9, resize: 'none',
                    border: '1.5px solid rgba(99,102,241,0.3)', background: 'var(--bg-card)',
                    fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                  placeholder={subMode === 'typeGap' ? 'Type the missing word…' : 'Type your response…'}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 9, boxSizing: 'border-box',
                    border: '1.5px solid rgba(99,102,241,0.3)', background: 'var(--bg-card)',
                    fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none',
                  }}
                />
              )}

              {/* Umlaut keyboard */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <UmlautKeyboard inputRef={activeRef as React.RefObject<HTMLInputElement | HTMLTextAreaElement>} onInsert={(ch) => {
                  // sync state after insertion
                  setTimeout(() => {
                    if (activeRef.current) setUserInput(activeRef.current.value);
                  }, 10);
                }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    id="writing-skip-btn"
                    onClick={handleSkip}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '6px 12px', borderRadius: 8,
                      border: '1px solid var(--border-subtle)', background: 'transparent',
                      color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <SkipForward size={11} /> Skip
                  </button>
                  <button
                    id="writing-submit-btn"
                    onClick={handleSubmit}
                    disabled={!userInput.trim()}
                    style={{
                      padding: '6px 16px', borderRadius: 8,
                      background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                      border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
                      cursor: userInput.trim() ? 'pointer' : 'not-allowed',
                      opacity: userInput.trim() ? 1 : 0.5, fontFamily: 'inherit',
                    }}
                  >
                    Überprüfen ✓
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Feedback row */}
          {(isCorrect || isIncorrect) && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
              padding: '8px 10px', borderRadius: 9,
              background: isCorrect ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)',
              border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isCorrect ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
                <span style={{ fontSize: 12.5, fontWeight: 600, color: isCorrect ? '#10b981' : '#ef4444' }}>
                  {isCorrect ? 'Richtig! Resuming…' : (
                    subMode === 'typeGap'
                      ? `Falsch! Correct word: "${targetWord}"`
                      : 'Falsch! Red words need correction.'
                  )}
                </span>
              </div>
              {isIncorrect && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {subMode !== 'chatRolePlay' && (
                    <button
                      onClick={() => setActiveLine((l) => { /* show answer */ return l; })}
                      id="writing-reveal-btn"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', borderRadius: 7,
                        border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)',
                        color: '#6366f1', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <Eye size={11} /> Show Answer
                    </button>
                  )}
                  <button
                    id="writing-retry-btn"
                    onClick={handleRetry}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 7,
                      border: '1.5px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)',
                      color: '#ef4444', fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <RotateCcw size={10} /> Retry
                  </button>
                  <button
                    id="writing-skip-after-fail-btn"
                    onClick={handleSkip}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 7,
                      border: '1.5px solid var(--border-default)', background: 'var(--bg-card)',
                      color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <SkipForward size={10} /> Skip
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Show correct answer on incorrect */}
          {isIncorrect && subMode !== 'chatRolePlay' && (
            <div style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 12.5,
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
              color: 'var(--text-secondary)',
            }}>
              <strong style={{ color: '#6366f1' }}>Correct: </strong>
              {subMode === 'typeGap' ? targetWord : activeLine}
            </div>
          )}
        </div>
      )}
    </div>
  );
}