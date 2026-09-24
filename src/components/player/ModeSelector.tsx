'use client';

import {
  Play,
  Headphones,
  MessageSquareDashed,
  Users,
  Ear,
  BookOpen,
  PenLine,
  Radio,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import type { LearningMode } from '@/lib/types';

const MODES: { id: LearningMode; label: string; Icon: React.ElementType; badge: string; description: string }[] = [
  {
    id: 'none',
    label: 'Normal',
    badge: 'Watch',
    Icon: Play,
    description: 'Watch video freely without interruptions',
  },
  {
    id: 'shadowing',
    label: 'Shadowing',
    badge: 'Pronounce',
    Icon: Headphones,
    description: 'Auto-pauses at each sentence — listen & repeat in German',
  },
  {
    id: 'voiceGapFill',
    label: 'Gap Fill',
    badge: 'Vocab',
    Icon: MessageSquareDashed,
    description: 'Hides keywords with blanks — speak the missing German word',
  },
  {
    id: 'rolePlay',
    label: 'Role-Play',
    badge: 'Dialogue',
    Icon: Users,
    description: 'Watch character act silently, pause, speak line, auto-resume',
  },
  {
    id: 'blindListening',
    label: 'Blind Listen',
    badge: 'Ear Training',
    Icon: Ear,
    description: 'Subtitles hidden — listen by ear and repeat what was said',
  },
  {
    id: 'grammar',
    label: 'Grammar',
    badge: 'Conjugation',
    Icon: BookOpen,
    description: 'Targeted verb practice — auto-pauses to quiz conjugations',
  },
  {
    id: 'writing',
    label: 'Writing Exercises',
    badge: 'Schreiben',
    Icon: PenLine,
    description: 'Smart diktat, role-play chat & type-the-gap with virtual umlaut keyboard',
  },
  {
    id: 'voiceDubbing',
    label: 'Voice Dubbing',
    badge: 'Fluency',
    Icon: Radio,
    description: 'Mute original audio, record your own voice track, and watch your dub',
  },
];

export function ModeSelector() {
  const { activeMode, setActiveMode, transcript, isLoadingTranscript, transcriptError } = useAppStore();
  const hasTranscript = transcript.length > 0;

  return (
    <div
      id="learning-mode-selector"
      style={{
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px',
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-default)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-sm)',
        overflow: 'visible',
      }}
    >
      {/* Top Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            8 Learning Modes
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {MODES.find((m) => m.id === activeMode)?.description}
          </span>
        </div>

        {/* Status Indicator */}
        <div>
          {isLoadingTranscript ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--accent-600)',
                background: 'var(--accent-50)',
                padding: '2px 8px',
                borderRadius: 8,
              }}
            >
              <Loader2 size={11} className="animate-spin" />
              Generating transcript…
            </span>
          ) : hasTranscript ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--success)',
                background: 'var(--success-bg)',
                padding: '2px 8px',
                borderRadius: 8,
              }}
            >
              <CheckCircle2 size={11} />
              {transcript.length} sentences ready
            </span>
          ) : transcriptError ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--warning)',
                background: 'var(--warning-bg)',
                padding: '2px 8px',
                borderRadius: 8,
              }}
            >
              Captions unavailable
            </span>
          ) : null}
        </div>
      </div>

      {/* Horizontally scrollable row with sleek Tailwind classes */}
      <div
        className="flex overflow-x-auto whitespace-nowrap scrollbar-hide gap-1.5 p-1"
        style={{
          background: 'var(--bg-elevated)',
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {MODES.map(({ id, label, badge, Icon }) => {
          const isActive = activeMode === id;
          return (
            <button
              key={id}
              id={`mode-toggle-${id}`}
              type="button"
              onClick={() => setActiveMode(id)}
              className="flex-shrink-0"
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: '8px 12px',
                minWidth: 102,
                borderRadius: 9,
                border: isActive ? '1px solid var(--accent-300)' : '1px solid transparent',
                cursor: 'pointer',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                color: isActive ? 'var(--accent-600)' : 'var(--text-secondary)',
                fontFamily: 'inherit',
                transition: 'all 0.16s var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.6)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon size={13} strokeWidth={isActive ? 2.5 : 2} color={isActive ? 'var(--accent-600)' : 'currentColor'} />
                <span style={{ fontSize: 11.5, fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  opacity: isActive ? 0.9 : 0.6,
                  color: isActive ? 'var(--accent-500)' : 'var(--text-muted)',
                }}
              >
                {badge}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
