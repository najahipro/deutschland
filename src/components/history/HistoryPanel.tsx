'use client';

import { Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { HistoryCard } from './HistoryCard';
import { IconButton } from '@/components/ui/IconButton';
import type { HistoryEntry } from '@/lib/types';

export function HistoryPanel() {
  const {
    historyPanelOpen,
    currentVideo,
    setCurrentVideo,
    resetPlayerState,
    setShowResults,
  } = useAppStore();
  const { history, removeFromHistory, clearHistory } = useVideoHistory();

  if (!historyPanelOpen) return null;

  const handlePlay = (entry: HistoryEntry) => {
    resetPlayerState();
    setCurrentVideo(entry);
    setShowResults(false);
  };

  return (
    <div
      className="animate-fade-in"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 650,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}
          >
            My Videos
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {history.length} saved · click to replay
          </p>
        </div>
        {history.length > 0 && (
          <IconButton
            label="Clear all history"
            variant="danger"
            size="sm"
            onClick={clearHistory}
          >
            <Trash2 size={13} />
          </IconButton>
        )}
      </div>

      {/* List */}
      <div
        style={{
          padding: '10px 10px',
          maxHeight: 320,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {history.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '30px 16px',
              gap: 8,
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ fontSize: 28 }}>📼</span>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              No videos yet
            </p>
            <p style={{ fontSize: 12 }}>Search for a video and click to save it here.</p>
          </div>
        ) : (
          history.map((entry) => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              isActive={currentVideo?.id === entry.id}
              onPlay={handlePlay}
              onDelete={removeFromHistory}
            />
          ))
        )}
      </div>
    </div>
  );
}
