'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Send, Volume2, Bot, User, Sparkles, RotateCcw, ArrowLeft, MessageSquare } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { UmlautKeyboard } from '@/components/player/LearningModes/UmlautKeyboard';
import { useBookmarks } from '@/hooks/useBookmarks';
import { getStoredGlobalPhrases } from '@/lib/globalPhrases';
import { useAppStore } from '@/store/appStore';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  matchedKeyword?: string;
}

const FALLBACK_GERMAN_DIALOGUE = [
  'Hallo! Wie kann ich dir heute beim Deutschlernen helfen?',
  'Mir geht es sehr gut, danke der Nachfrage! Und wie läuft dein Tag?',
  'Das ist wirklich eine interessante Frage.',
  'Auf jeden Fall! Da stimme ich dir absolut zu.',
  'Ich lerne auch jeden Tag Neues dazu. Deutsch macht Spaß!',
  'Was machst du heute noch Schönes?',
  'Schön, von dir zu hören! Welches Thema möchtest du heute üben?',
  'Das verstehe ich vollkommen. Übung macht den Meister!',
  'Hast du heute schon die Videos im Player geschaut?',
  'Vielen Dank fürs Gespräch! Lass uns weiter auf Deutsch schreiben.',
  'Genau so ist es! Du machst schon tolle Fortschritte.',
  'Ich habe keine Zweifel daran, dass du das schaffst.',
];

export default function ChatPage() {
  const { bookmarks } = useBookmarks();
  const { transcript, repeatedSentences } = useAppStore();

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Hallo! Ich bin dein AI-Lernpartner. Schreib mir einfach auf Deutsch — ich antworte mit echten Sätzen aus deinen gelernten Videos!',
      time: 'Jetzt',
    },
  ]);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Pool of all saved sentences from bookmarks, global phrases, and repeated sentences
  const sentencePool = useMemo(() => {
    const set = new Set<string>();

    // 1. User's saved bookmarks
    for (const b of bookmarks) {
      if (b.sentence && b.sentence.trim().length > 4) {
        set.add(b.sentence.trim());
      }
    }

    // 2. Global common phrases from studied videos
    try {
      const stored = getStoredGlobalPhrases();
      for (const key of Object.keys(stored)) {
        const text = stored[key]?.originalText;
        if (text && text.trim().length > 4) {
          set.add(text.trim());
        }
      }
    } catch { /* ignore */ }

    // 3. Repeated sentences from current video
    for (const r of repeatedSentences) {
      if (r.text && r.text.trim().length > 4) {
        set.add(r.text.trim());
      }
    }

    // 4. Current transcript
    for (const t of transcript.slice(0, 30)) {
      if (t.text && t.text.trim().length > 6) {
        set.add(t.text.trim());
      }
    }

    // 5. Authentic fallback sentences
    for (const f of FALLBACK_GERMAN_DIALOGUE) {
      set.add(f);
    }

    return Array.from(set);
  }, [bookmarks, repeatedSentences, transcript]);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Client-side Bot response logic
  const findBotReply = useCallback((userText: string): { reply: string; keyword?: string } => {
    const clean = userText.toLowerCase().replace(/[.,!?;:"""''„]/g, '');
    const userWords = clean.split(/\s+/).filter((w) => w.length >= 3);

    // 1. Try keyword matching in sentence pool
    let bestMatch: string | null = null;
    let maxOverlap = 0;
    let matchedWord: string | undefined = undefined;

    for (const sentence of sentencePool) {
      const sentenceLower = sentence.toLowerCase();
      let overlap = 0;
      let lastWord = '';

      for (const word of userWords) {
        if (sentenceLower.includes(word)) {
          overlap++;
          lastWord = word;
        }
      }

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatch = sentence;
        matchedWord = lastWord;
      }
    }

    if (bestMatch && maxOverlap > 0) {
      return { reply: bestMatch, keyword: matchedWord };
    }

    // 2. Pick a random sentence from the user's saved vocabulary pool
    const randomIndex = Math.floor(Math.random() * sentencePool.length);
    return { reply: sentencePool[randomIndex] || 'Das ist sehr interessant!' };
  }, [sentencePool]);

  // Handle Send
  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isTyping) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      time: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    // Simulate natural thinking delay (500ms - 800ms)
    setTimeout(() => {
      const { reply, keyword } = findBotReply(text);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        matchedKeyword: keyword,
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }, 650);
  };

  // Text-To-Speech for German bot lines
  const speakGerman = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  const clearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'bot',
        text: 'Chat zurückgesetzt. Schreib mir etwas auf Deutsch!',
        time: 'Jetzt',
      },
    ]);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 820,
          width: '100%',
          margin: '0 auto',
          padding: '16px 16px 24px',
          boxSizing: 'border-box',
        }}
      >
        {/* Top Chat Info Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-subtle)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-xs)',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'linear-gradient(135deg,#10b981,#059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 6px rgba(16,185,129,0.3)',
              }}
            >
              <Bot size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h1 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  AI Chat Companion
                </h1>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 750,
                    padding: '1px 7px',
                    borderRadius: 99,
                    background: 'rgba(16,185,129,0.12)',
                    color: '#059669',
                    border: '1px solid rgba(16,185,129,0.3)',
                  }}
                >
                  Online · 100% Free
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Replies using vocabulary from your {sentencePool.length} saved video sentences
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={clearChat}
              title="Reset conversation"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 11px',
                borderRadius: 8,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <RotateCcw size={12} />
              <span>Neu starten</span>
            </button>
          </div>
        </div>

        {/* Quick Conversation Starter Chips */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 8,
            marginBottom: 8,
            whiteSpace: 'nowrap',
          }}
        >
          {['Wie geht es dir?', 'Was machst du heute?', 'Auf jeden Fall!', 'Hast du Geschwister?', 'Ich lerne Deutsch.'].map(
            (starter) => (
              <button
                key={starter}
                onClick={() => handleSendMessage(starter)}
                style={{
                  padding: '5px 11px',
                  borderRadius: 20,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  color: 'var(--accent-600)',
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.12s ease',
                  flexShrink: 0,
                }}
              >
                💬 {starter}
              </button>
            ),
          )}
        </div>

        {/* WhatsApp-Style Chat Container */}
        <div
          style={{
            flex: 1,
            minHeight: 380,
            maxHeight: 'calc(100vh - 310px)',
            overflowY: 'auto',
            background: 'var(--bg-elevated)',
            border: '1.5px solid var(--border-subtle)',
            borderRadius: 18,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-end',
                  gap: 8,
                }}
              >
                {!isUser && (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    <Bot size={15} />
                  </div>
                )}

                <div
                  style={{
                    maxWidth: '75%',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '10px 14px',
                    background: isUser
                      ? 'linear-gradient(135deg,#059669,#10b981)'
                      : 'var(--bg-card)',
                    color: isUser ? '#ffffff' : 'var(--text-primary)',
                    border: isUser ? 'none' : '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.45, wordBreak: 'break-word' }}>
                    {m.text}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 10.5,
                      color: isUser ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)',
                      marginTop: 2,
                    }}
                  >
                    {!isUser && (
                      <button
                        onClick={() => speakGerman(m.text)}
                        title="Listen in German"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          color: '#059669',
                          fontSize: 11,
                          fontWeight: 650,
                        }}
                      >
                        <Volume2 size={12} />
                        <span>Hören</span>
                      </button>
                    )}
                    <span>{m.time}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <Bot size={15} />
              </div>
              <div
                style={{
                  padding: '8px 14px',
                  borderRadius: '16px 16px 16px 4px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                <span>Tippt</span>
                <span className="animate-pulse">…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar with Virtual Umlaut Keyboard */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 12,
            padding: '12px 14px',
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-default)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              ref={inputRef}
              id="chat-user-input"
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder="Schreib etwas auf Deutsch… (z.B. Wie geht es dir?)"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1.5px solid rgba(16,185,129,0.3)',
                background: 'var(--bg-elevated)',
                fontSize: 14,
                fontFamily: 'inherit',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />

            <button
              id="chat-send-btn"
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isTyping}
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                background: inputMessage.trim() && !isTyping ? '#10b981' : 'var(--bg-elevated)',
                color: inputMessage.trim() && !isTyping ? '#fff' : 'var(--text-muted)',
                border: 'none',
                cursor: inputMessage.trim() && !isTyping ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
              title="Nachricht senden"
            >
              <Send size={18} />
            </button>
          </div>

          {/* Virtual Umlaut Keyboard Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <UmlautKeyboard
              inputRef={inputRef}
              onInsert={(ch) => {
                setTimeout(() => {
                  if (inputRef.current) setInputMessage(inputRef.current.value);
                }, 10);
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Press <strong>Enter ↵</strong> to send
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}