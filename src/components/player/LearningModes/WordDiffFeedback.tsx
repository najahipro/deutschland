'use client';

import React from 'react';
import { Mic, CheckCircle2, XCircle, Square } from 'lucide-react';
import type { WordDiffResult } from '@/lib/transcript';

interface WordDiffFeedbackProps {
  diffResult: WordDiffResult | null;
  spokenText: string;
  isListening: boolean;
  onStopSpeaking?: () => void;
  passingThreshold?: number;
}

export function WordDiffFeedback({
  diffResult,
  spokenText,
  isListening,
  onStopSpeaking,
  passingThreshold = 80,
}: WordDiffFeedbackProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 16px',
        borderRadius: 12,
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {/* Top Header Row: Status & Live Mic Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: isListening ? '#fee2e2' : 'var(--bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Mic
              size={15}
              color={isListening ? '#ef4444' : 'var(--text-muted)'}
              className={isListening ? 'animate-pulse' : ''}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: isListening ? '#e11d48' : 'var(--text-muted)' }}>
              {isListening
                ? '🎙️ Listening (German de-DE)…'
                : diffResult
                ? 'Speech Evaluation:'
                : 'Microphone Standby:'}
            </div>
            {isListening && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Continuous listening · 2.5s silence buffer
              </span>
            )}
          </div>
        </div>

        {/* Manual Stop Button ("I'm Done Speaking") */}
        {isListening && onStopSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 11px',
              borderRadius: 8,
              background: '#0284c7',
              color: '#ffffff',
              fontSize: 11.5,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(2,132,199,0.3)',
            }}
          >
            <Square size={11} fill="#ffffff" />
            <span>I&apos;m Done Speaking</span>
          </button>
        )}

        {/* Score Pill when evaluated */}
        {!isListening && diffResult && (
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 800,
              padding: '3px 9px',
              borderRadius: 8,
              background: diffResult.isPassing ? '#dcfce7' : '#fee2e2',
              color: diffResult.isPassing ? '#15803d' : '#b91c1c',
              border: `1px solid ${diffResult.isPassing ? '#bbf7d0' : '#fecdd3'}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {diffResult.score}% word match ({passingThreshold}% needed)
          </span>
        )}
      </div>

      {/* Live Speaking Feedback (when user is currently talking) */}
      {isListening && (
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: spokenText ? 'var(--text-primary)' : 'var(--text-muted)',
            fontStyle: spokenText ? 'normal' : 'italic',
            lineHeight: 1.45,
            minHeight: 22,
          }}
        >
          {spokenText ? (
            <span>&ldquo;{spokenText}&rdquo;</span>
          ) : (
            'Speak clearly into your microphone in German at your own pace…'
          )}
        </div>
      )}

      {/* Word-by-Word Diff Rendering (Granular color feedback) */}
      {!isListening && diffResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
              padding: '8px 10px',
              background: 'var(--bg-elevated)',
              borderRadius: 8,
              lineHeight: 1.8,
            }}
          >
            {diffResult.spokenDiffs.map((item, idx) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 7px',
                  borderRadius: 6,
                  fontSize: 14,
                  // Correct words: Green. Incorrect words: Red and BOLDED.
                  color: item.isCorrect ? '#16a34a' : '#dc2626',
                  fontWeight: item.isCorrect ? 650 : 850,
                  background: item.isCorrect ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.14)',
                  border: item.isCorrect ? '1px solid rgba(22, 163, 74, 0.25)' : '1px solid rgba(220, 38, 38, 0.35)',
                  boxShadow: item.isCorrect ? 'none' : '0 1px 2px rgba(220,38,38,0.15)',
                }}
              >
                {item.word}
              </span>
            ))}

            {/* Missing words indicator */}
            {diffResult.missingWords.length > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '2px 7px',
                  borderRadius: 6,
                  fontSize: 12.5,
                  color: '#dc2626',
                  fontWeight: 800,
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px dashed rgba(220, 38, 38, 0.4)',
                }}
              >
                <span>Missing:</span>
                <span style={{ textDecoration: 'underline' }}>
                  {diffResult.missingWords.join(', ')}
                </span>
              </span>
            )}
          </div>

          {/* Granular Feedback Banner */}
          {diffResult.isPassing ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: '#16a34a',
                fontSize: 12.5,
                fontWeight: 750,
              }}
            >
              <CheckCircle2 size={15} />
              <span>Ausgezeichnet! Word accuracy passed ({diffResult.score}%). Resuming video…</span>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: '#dc2626',
                fontSize: 12.5,
                fontWeight: 750,
              }}
            >
              <XCircle size={15} />
              <span>
                Pronunciation score was {diffResult.score}%. Words in <strong>RED</strong> were mispronounced or missing. Try again!
              </span>
            </div>
          )}
        </div>
      )}

      {/* Idle / Uninitialized state */}
      {!isListening && !diffResult && !spokenText && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Microphone ready. Video will pause at dialogue turns to record your speech.
        </div>
      )}
    </div>
  );
}
