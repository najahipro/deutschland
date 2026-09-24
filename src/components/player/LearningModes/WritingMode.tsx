'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PenLine, CheckCircle2, XCircle, SkipForward, Eye, RotateCcw, MessageSquare, AlignLeft, Users } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';
import { buildGapFillExercise, diffSentenceWords, removeConsecutiveDuplicates } from '@/lib/transcript';
import { diarizeTranscript, type DiarizedDialogueTurn } from '@/lib/audioDiarization';
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
  const [activeTurnIdx, setActiveTurnIdx] = useState<number>(-1);
  const [targetWord, setTargetWord] = useState<string>(''); // for typeGap
  const [gapDisplay, setGapDisplay] = useState<string>(''); // for typeGap
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'partner' | 'user'; text: string; correct?: boolean }[]>([]);
  const [userRole, setUserRole] = useState<0 | 1>(1); // chatRolePlay: default Speaker 2 (answering partner)
  const [diffWords, setDiffWords] = useState<{ word: string; ok: boolean }[]>([]);
  const [missingWords, setMissingWords] = useState<string[]>([]);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  // Grouped turns for Role-Play Chat
  const turns = useMemo(() => diarizeTranscript(transcript), [transcript]);

  const quizzedIdxRef = useRef<Set<number>>(new Set());
  const partnerTurnHistoryRef = useRef<Set<number>>(new Set());
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      try {
        const p = getGlobalPlayer();
        p?.unMute();
        p?.playVideo();
      } catch { /* ignore */ }
    };
  }, []);

  // Reset when subMode changes
  useEffect(() => {
    setWritingState('tracking');
    setActiveLine('');
    setActiveTurnIdx(-1);
    setUserInput('');
    setDiffWords([]);
    setMissingWords([]);
    setChatHistory([]);
    quizzedIdxRef.current.clear();
    partnerTurnHistoryRef.current.clear();
    try {
      const p = getGlobalPlayer();
      p?.unMute();
      p?.playVideo();
    } catch { /* ignore */ }
  }, [subMode]);

  // ── HARD PAUSE ENFORCEMENT: Never let video run away while user is writing ──
  useEffect(() => {
    if (writingState === 'exercising' || writingState === 'incorrect') {
      try {
        const player = getGlobalPlayer();
        player?.pauseVideo();
      } catch { /* ignore */ }
    }
  }, [writingState, currentTimeSec]);

  // ── Time-based trigger & Strict Synchronization ─────────────────────────────
  useEffect(() => {
    if (writingState !== 'tracking' || transcript.length === 0) return;
    const nowMs = currentTimeSec * 1000;
    const player = getGlobalPlayer();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. SMART DIKTAT: Play exactly ONE line, then pause at END of timestamp
    // ─────────────────────────────────────────────────────────────────────────
    if (subMode === 'diktat') {
      // Find line where playback has reached the end of the line
      for (let i = 0; i < transcript.length; i++) {
        const line = transcript[i];
        if (quizzedIdxRef.current.has(i)) continue;

        const lineStart = line.offset;
        const lineEnd = line.offset + line.duration;

        // When playback reaches the end of the line (or slightly before end):
        // HARD PAUSE and prompt user to type what they heard!
        if (nowMs >= lineEnd - 120 && nowMs <= lineEnd + 600) {
          quizzedIdxRef.current.add(i);
          try {
            player?.pauseVideo();
          } catch { /* ignore */ }

          setActiveLine(line.text);
          setUserInput('');
          setDiffWords([]);
          setMissingWords([]);
          setWritingState('exercising');
          setTimeout(() => textareaRef.current?.focus(), 80);
          return;
        }
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. ROLE-PLAY CHAT: Dialogue Turn-Taking Synchronization
    // ─────────────────────────────────────────────────────────────────────────
    if (subMode === 'chatRolePlay' && turns.length > 0) {
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const isUserTurn = turn.speaker === userRole;

        // Partner's Turn: Video plays normally, record partner dialogue in chat
        if (!isUserTurn) {
          if (nowMs >= turn.offset && !partnerTurnHistoryRef.current.has(i)) {
            partnerTurnHistoryRef.current.add(i);
            setChatHistory((prev) => [...prev, { role: 'partner', text: turn.text }]);
          }
          continue;
        }

        // User's Turn: When it's my turn (Speaker B), the video MUST PAUSE
        // so I have time to read the context and type my response in the chat input.
        if (isUserTurn && !quizzedIdxRef.current.has(i)) {
          if (nowMs >= turn.offset - 100 && nowMs <= turn.offset + turn.duration) {
            quizzedIdxRef.current.add(i);
            try {
              player?.pauseVideo();
            } catch { /* ignore */ }

            setActiveLine(turn.text);
            setActiveTurnIdx(i);
            setUserInput('');
            setDiffWords([]);
            setMissingWords([]);
            setWritingState('exercising');
            setTimeout(() => inputRef.current?.focus(), 80);
            return;
          }
        }
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TYPE THE GAP: Pauses at end of sentence with target keyword
    // ─────────────────────────────────────────────────────────────────────────
    if (subMode === 'typeGap') {
      for (let i = 0; i < transcript.length; i++) {
        const line = transcript[i];
        if (quizzedIdxRef.current.has(i)) continue;

        const lineEnd = line.offset + line.duration;
        if (nowMs >= lineEnd - 120 && nowMs <= lineEnd + 600) {
          const ex = buildGapFillExercise(line);
          if (!ex) {
            quizzedIdxRef.current.add(i);
            continue;
          }

          quizzedIdxRef.current.add(i);
          try {
            player?.pauseVideo();
          } catch { /* ignore */ }

          setActiveLine(line.text);
          setTargetWord(ex.targetWord.toLowerCase().replace(/[.,!?;:]/g, ''));
          setGapDisplay(ex.displayText);
          setUserInput('');
          setDiffWords([]);
          setMissingWords([]);
          setWritingState('exercising');
          setTimeout(() => inputRef.current?.focus(), 80);
          return;
        }
      }
    }
  }, [currentTimeSec, transcript, turns, writingState, subMode, userRole]);

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!userInput.trim() || writingState !== 'exercising') return;
    const player = getGlobalPlayer();

    if (subMode === 'diktat') {
      const diff = renderDiff(userInput, activeLine);
      setDiffWords(diff.words);
      setMissingWords(diff.missingWords);
      const allCorrect = diff.allCorrect;
      setScore((prev) => ({ correct: prev.correct + (allCorrect ? 1 : 0), total: prev.total + 1 }));
      setWritingState(allCorrect ? 'correct' : 'incorrect');

      if (allCorrect) {
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setWritingState('tracking');
          setActiveLine('');
          setUserInput('');
          setDiffWords([]);
          setMissingWords([]);
          try {
            player?.playVideo();
          } catch { /* ignore */ }
        }, 1300);
      }
    } else if (subMode === 'chatRolePlay') {
      const cleanTyped = userInput.trim();
      const cleanTarget = activeLine.trim();
      const diff = diffSentenceWords(cleanTyped, cleanTarget);
      const isOk = diff.isPassing || diff.score >= 70;

      setScore((prev) => ({ correct: prev.correct + (isOk ? 1 : 0), total: prev.total + 1 }));
      setChatHistory((prev) => [...prev, { role: 'user', text: cleanTyped, correct: isOk }]);
      setWritingState(isOk ? 'correct' : 'incorrect');

      if (isOk) {
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setWritingState('tracking');
          setActiveLine('');
          setActiveTurnIdx(-1);
          setUserInput('');
          try {
            player?.unMute();
            player?.playVideo();
          } catch { /* ignore */ }
        }, 1100);
      }
    } else {
      // typeGap
      const typedClean = userInput.trim().toLowerCase().replace(/[.,!?;:]/g, '');
      const isOk = typedClean === targetWord;
      setScore((prev) => ({ correct: prev.correct + (isOk ? 1 : 0), total: prev.total + 1 }));
      setWritingState(isOk ? 'correct' : 'incorrect');

      if (isOk) {
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setWritingState('tracking');
          setActiveLine('');
          setUserInput('');
          try {
            player?.playVideo();
          } catch { /* ignore */ }
        }, 1300);
      }
    }
  }, [userInput, writingState, subMode, activeLine, targetWord]);

  const handleRetry = () => {
    setUserInput('');
    setDiffWords([]);
    setMissingWords([]);
    setWritingState('exercising');
    setTimeout(() => {
      if (subMode === 'diktat') textareaRef.current?.focus();
      else inputRef.current?.focus();
    }, 80);
  };

  const handleSkip = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setWritingState('tracking');
    setActiveLine('');
    setActiveTurnIdx(-1);
    setUserInput('');
    setDiffWords([]);
    setMissingWords([]);
    try {
      const player = getGlobalPlayer();
      player?.unMute();
      player?.playVideo();
    } catch { /* ignore */ }
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
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
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
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PenLine size={14} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Writing Exercises (Schreiben)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              Strict auto-pause · type what you hear · virtual umlaut keyboard
            </div>
          </div>
        </div>
        {score.total > 0 && (
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 99,
              background: (accuracy ?? 0) >= 70 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${(accuracy ?? 0) >= 70 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: (accuracy ?? 0) >= 70 ? '#10b981' : '#ef4444',
            }}
          >
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
              flex: 1,
              padding: '6px 8px',
              borderRadius: 8,
              border: 'none',
              background: subMode === id ? 'var(--bg-card)' : 'transparent',
              color: subMode === id ? '#6366f1' : 'var(--text-secondary)',
              fontWeight: subMode === id ? 700 : 500,
              fontSize: 11.5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              boxShadow: subMode === id ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Role Picker for chatRolePlay */}
      {subMode === 'chatRolePlay' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setUserRole(0)}
            style={{
              flex: 1,
              padding: '5px 8px',
              borderRadius: 8,
              border: userRole === 0 ? '1.5px solid #6366f1' : '1px solid var(--border-subtle)',
              background: userRole === 0 ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)',
              color: userRole === 0 ? '#6366f1' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 650,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            I am Speaker 1 (Start dialogue)
          </button>
          <button
            onClick={() => setUserRole(1)}
            style={{
              flex: 1,
              padding: '5px 8px',
              borderRadius: 8,
              border: userRole === 1 ? '1.5px solid #6366f1' : '1px solid var(--border-subtle)',
              background: userRole === 1 ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)',
              color: userRole === 1 ? '#6366f1' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 650,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            I am Speaker 2 (Respond to partner)
          </button>
        </div>
      )}

      {/* ── Tracking idle state ── */}
      {writingState === 'tracking' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#6366f1',
              boxShadow: '0 0 0 3px rgba(99,102,241,0.2)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            {subMode === 'diktat' && 'Playing sentence… video will strictly pause at end of line to type.'}
            {subMode === 'chatRolePlay' && 'Watching partner… video will strictly pause when it is your turn to chat.'}
            {subMode === 'typeGap' && 'Playing sentence… video will strictly pause to type the missing word.'}
          </span>
        </div>
      )}

      {/* ── Chat history (chatRolePlay) ── */}
      {subMode === 'chatRolePlay' && chatHistory.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 180,
            overflowY: 'auto',
            padding: '8px',
            borderRadius: 10,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 12,
                  maxWidth: '80%',
                  fontSize: 12.5,
                  fontWeight: 500,
                  background:
                    msg.role === 'user'
                      ? msg.correct === false
                        ? 'rgba(239,68,68,0.1)'
                        : 'rgba(99,102,241,0.12)'
                      : 'var(--bg-card)',
                  border: `1px solid ${
                    msg.role === 'user'
                      ? msg.correct === false
                        ? 'rgba(239,68,68,0.3)'
                        : 'rgba(99,102,241,0.25)'
                      : 'var(--border-subtle)'
                  }`,
                  color: 'var(--text-primary)',
                }}
              >
                {msg.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Exercise card (Paused while typing) ── */}
      {(isExercising || isCorrect || isIncorrect) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: 14,
            borderRadius: 12,
            background: 'var(--bg-elevated)',
            border: `1.5px solid ${
              isCorrect ? 'rgba(16,185,129,0.35)' : isIncorrect ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.2)'
            }`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* accent bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: isCorrect
                ? 'linear-gradient(90deg,#10b981,#34d399)'
                : isIncorrect
                ? 'linear-gradient(90deg,#ef4444,#f87171)'
                : 'linear-gradient(90deg,#6366f1,#8b5cf6)',
              borderRadius: '12px 12px 0 0',
            }}
          />

          {/* Sentence prompt */}
          {subMode === 'diktat' && (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6366f1', marginTop: 4 }}>
              ⏸️ Video Paused · Type the exact sentence you just heard:
            </div>
          )}
          {subMode === 'chatRolePlay' && (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6366f1', marginTop: 4 }}>
              💬 Your Turn to Speak · Type your response into the chat:
            </div>
          )}
          {subMode === 'typeGap' && (
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                padding: '6px 10px',
                borderRadius: 9,
                background: 'rgba(0,0,0,0.04)',
                borderLeft: '3px solid #6366f1',
                marginTop: 4,
              }}
            >
              {gapDisplay}
            </div>
          )}

          {/* Word-diff display (after submit for diktat) */}
          {subMode === 'diktat' && (isCorrect || isIncorrect) && diffWords.length > 0 && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 9,
                background: 'rgba(0,0,0,0.04)',
                borderLeft: '3px solid #6366f1',
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1.65,
              }}
            >
              {diffWords.map((d, i) => (
                <span
                  key={i}
                  style={{
                    color: d.ok ? '#10b981' : '#ef4444',
                    marginRight: 6,
                    textDecoration: d.ok ? 'none' : 'underline wavy #ef4444',
                    fontWeight: d.ok ? 600 : 750,
                  }}
                >
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
                  ref={textareaRef}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Schreib den Satz hier… (Press Enter to submit)"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 9,
                    resize: 'none',
                    border: '1.5px solid rgba(99,102,241,0.3)',
                    background: 'var(--bg-card)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmit();
                  }}
                  placeholder={subMode === 'typeGap' ? 'Type the missing word…' : 'Type your response…'}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 9,
                    boxSizing: 'border-box',
                    border: '1.5px solid rgba(99,102,241,0.3)',
                    background: 'var(--bg-card)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              )}

              {/* Umlaut keyboard */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <UmlautKeyboard
                  inputRef={activeRef}
                  onInsert={() => {
                    setTimeout(() => {
                      if (activeRef.current) setUserInput(activeRef.current.value);
                    }, 10);
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    id="writing-skip-btn"
                    onClick={handleSkip}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <SkipForward size={11} /> Skip
                  </button>
                  <button
                    id="writing-submit-btn"
                    onClick={handleSubmit}
                    disabled={!userInput.trim()}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 8,
                      background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                      border: 'none',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: userInput.trim() ? 'pointer' : 'not-allowed',
                      opacity: userInput.trim() ? 1 : 0.5,
                      fontFamily: 'inherit',
                    }}
                  >
                    Überprüfen ✓
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Feedback row */}
          {isCorrect && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 13, fontWeight: 700 }}>
              <CheckCircle2 size={15} />
              <span>Ausgezeichnet! Resuming playback…</span>
            </div>
          )}

          {isIncorrect && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 13, fontWeight: 700 }}>
                <XCircle size={15} />
                <span>Nicht ganz richtig. Try again or check the errors above.</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  id="writing-retry-btn"
                  onClick={handleRetry}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: '1.5px solid rgba(239,68,68,0.3)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#ef4444',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ↺ Retry
                </button>
                <button
                  id="writing-skip-after-fail-btn"
                  onClick={handleSkip}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-secondary)',
                    fontSize: 11.5,
                    fontWeight: 650,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <SkipForward size={11} /> Skip
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}