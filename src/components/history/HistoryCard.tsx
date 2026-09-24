'use client';

import Image from 'next/image';
import { Play, Trash2, Clock } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { relativeDate } from '@/lib/transcript';
import type { HistoryEntry } from '@/lib/types';

interface HistoryCardProps {
  entry: HistoryEntry;
  isActive: boolean;
  onPlay: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
}

export function HistoryCard({ entry, isActive, onPlay, onDelete }: HistoryCardProps) {
  return (
    <div
      id={`history-card-${entry.id}`}
      style={{
        display: 'flex',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${isActive ? 'var(--accent-200)' : 'var(--border-subtle)'}`,
        background: isActive ? 'var(--accent-50)' : 'var(--bg-card)',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
        alignItems: 'center',
      }}
      onClick={() => onPlay(entry)}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--bg-elevated)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--bg-card)';
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          position: 'relative',
          width: 72,
          height: 48,
          borderRadius: 8,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--bg-elevated)',
        }}
      >
        {entry.thumbnail ? (
          <Image src={entry.thumbnail} alt={entry.title} fill style={{ objectFit: 'cover' }} sizes="72px" />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Play size={16} color="var(--text-muted)" />
          </div>
        )}
        {entry.duration && (
          <span
            style={{
              position: 'absolute',
              bottom: 2,
              right: 3,
              backgroundColor: 'rgba(0, 0, 0, 0.82)',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: 600,
              padding: '1px 3px',
              borderRadius: 3,
              letterSpacing: '0.02em',
              lineHeight: 1.1,
              zIndex: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {entry.duration}
          </span>
        )}
        {isActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(99,102,241,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Play size={9} color="var(--accent-600)" fill="var(--accent-600)" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 12.5,
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--accent-700)' : 'var(--text-primary)',
            lineHeight: 1.35,
            marginBottom: 3,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {entry.title}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={9} color="var(--text-muted)" />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {relativeDate(entry.savedAt)}
          </span>
        </div>
      </div>

      {/* Delete */}
      <IconButton
        label="Remove from history"
        variant="danger"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(entry.id);
        }}
      >
        <Trash2 size={12} />
      </IconButton>
    </div>
  );
}
