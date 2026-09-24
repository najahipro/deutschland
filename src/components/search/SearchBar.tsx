'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import type { VideoItem } from '@/lib/types';

export function SearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    setIsSearching,
    setSearchResults,
    setShowResults,
    showResults,
  } = useAppStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      setIsSearching(true);
      setShowResults(true);
      try {
        const res = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(q)}&maxResults=24`,
        );
        const data = await res.json();
        if (data.error) {
          console.error('[SearchBar] API error:', data.error);
          setSearchResults([]);
        } else {
          setSearchResults((data.videos as VideoItem[]) ?? []);
        }
      } catch (err) {
        console.error('[SearchBar] fetch failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [setIsSearching, setSearchResults, setShowResults],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(searchQuery);
    }
    if (e.key === 'Escape') {
      clearSearch();
      inputRef.current?.blur();
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 18px',
          height: 52,
          borderRadius: 16,
          background: 'var(--bg-card)',
          border: `1.5px solid ${isFocused ? 'var(--accent-400)' : 'var(--border-default)'}`,
          boxShadow: isFocused
            ? '0 0 0 4px var(--accent-50), var(--shadow-sm)'
            : 'var(--shadow-sm)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {/* Leading icon */}
        {isSearching ? (
          <Loader2
            size={18}
            color="var(--accent-500)"
            style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}
          />
        ) : (
          <Search size={18} color={isFocused ? 'var(--accent-500)' : 'var(--text-muted)'} style={{ flexShrink: 0, transition: 'color 0.2s' }} />
        )}

        <input
          ref={inputRef}
          id="search-input"
          type="search"
          value={searchQuery}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Search for German videos, channels, or topics…"
          autoComplete="off"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 15,
            fontFamily: 'inherit',
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        />

        {/* Clear button */}
        {searchQuery && (
          <button
            onClick={clearSearch}
            aria-label="Clear search"
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--bg-elevated)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            <X size={12} color="var(--text-muted)" />
          </button>
        )}

        {/* Keyboard hint */}
        {!searchQuery && !isFocused && (
          <kbd
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: '2px 7px',
              borderRadius: 6,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: 11,
              color: 'var(--text-muted)',
              fontFamily: 'inherit',
            }}
          >
            ↵ Enter
          </kbd>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type="search"]::-webkit-search-cancel-button { display: none; }
        input::placeholder { color: var(--text-muted); }
      `}</style>
    </div>
  );
}
