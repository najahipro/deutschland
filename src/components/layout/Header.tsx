'use client';

import Link from 'next/link';
import { Search, Clock, BookOpen, Loader2, X, Sparkles } from 'lucide-react';
import { useCallback, useRef, useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { Badge } from '@/components/ui/Badge';
import type { VideoItem } from '@/lib/types';

export function Header() {
  const {
    searchQuery, setSearchQuery,
    isSearching, setIsSearching,
    setSearchResults, setShowResults,
    setCurrentVideo,
    historyPanelOpen, setHistoryPanelOpen,
  } = useAppStore();
  const { history } = useVideoHistory();

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setShowResults(false); return; }
    setIsSearching(true);
    setShowResults(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&maxResults=24`);
      const data = await res.json();
      setSearchResults(data.error ? [] : (data.videos as VideoItem[]) ?? []);
    } catch { setSearchResults([]); }
    finally { setIsSearching(false); }
  }, [setIsSearching, setSearchResults, setShowResults]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { if (debounceRef.current) clearTimeout(debounceRef.current); doSearch(searchQuery); }
    if (e.key === 'Escape') { clearSearch(); inputRef.current?.blur(); }
  };

  const clearSearch = () => {
    setSearchQuery(''); setSearchResults([]); setShowResults(false);
  };

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <header style={{
      height: 56,
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-xs)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '0 20px',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      flexShrink: 0,
    }}>
      {/* Logo button -> returns to Home Feed */}
      <button
        onClick={() => {
          setCurrentVideo(null);
          setShowResults(false);
          setSearchQuery('');
        }}
        title="Return to Home Feed"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'var(--accent-500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <BookOpen size={15} color="#fff" strokeWidth={2.3} />
        </div>
        <span style={{
          fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
          letterSpacing: '-0.02em', flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          Deutsch Lernen
        </span>
      </button>

      {/* ── Navigation Links ── */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Link
          href="/"
          onClick={() => {
            setCurrentVideo(null);
            setShowResults(false);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '5px 10px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            transition: 'all 0.15s ease',
          }}
        >
          Home
        </Link>
        <Link
          href="/common-phrases"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--accent-700)',
            textDecoration: 'none',
            background: 'var(--accent-50)',
            border: '1px solid var(--accent-200)',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <Sparkles size={12} color="var(--accent-600)" />
          Common Phrases
        </Link>
      </nav>

      {/* ── Search bar (takes remaining width) ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 14px', height: 38, borderRadius: 12,
          background: 'var(--bg-base)',
          border: `1.5px solid ${isFocused ? 'var(--accent-400)' : 'var(--border-default)'}`,
          boxShadow: isFocused ? '0 0 0 3px var(--accent-50)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}>
          {isSearching
            ? <Loader2 size={15} color="var(--accent-500)" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
            : <Search size={15} color={isFocused ? 'var(--accent-500)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
          }
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            value={searchQuery}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search German videos, channels, topics…"
            autoComplete="off"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button onClick={clearSearch} aria-label="Clear" style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'var(--border-default)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <X size={10} color="var(--text-secondary)" />
            </button>
          )}
        </div>
        <style>{`
          @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
          input[type="search"]::-webkit-search-cancel-button { display: none; }
          input::placeholder { color: var(--text-muted); }
        `}</style>
      </div>

      {/* History toggle */}
      <button
        id="history-toggle-btn"
        onClick={() => setHistoryPanelOpen(!historyPanelOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 10, flexShrink: 0,
          border: `1px solid ${historyPanelOpen ? 'var(--accent-200)' : 'var(--border-default)'}`,
          background: historyPanelOpen ? 'var(--accent-50)' : 'transparent',
          color: historyPanelOpen ? 'var(--accent-600)' : 'var(--text-secondary)',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit', transition: 'all 0.15s',
        }}
      >
        <Clock size={13} strokeWidth={2} />
        <span>History</span>
        {history.length > 0 && <Badge variant="accent" size="sm">{history.length}</Badge>}
      </button>
    </header>
  );
}
