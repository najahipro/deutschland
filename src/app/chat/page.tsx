'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Volume2, Bot, RotateCcw, Sparkles, AlertCircle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { UmlautKeyboard } from '@/components/player/LearningModes/UmlautKeyboard';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  isError?: boolean;
}

const INITIAL_BOT_MESSAGE: ChatMessage = {
  id: 'welcome',
  sender: 'bot',
  text: 'Hallo! Ich bin dein AI-Lernpartner für Deutsch (A1). Ich helfe dir beim Sprechen und Üben. Wie heißt du und wie geht es dir heute?',
  time: 'Jetzt',
};

const CONVERSATION_STARTERS = [
  'Hallo! Wie geht es dir?',
  'Ich heiße Alex.',
  'Ich lerne seit zwei Wochen Deutsch.',
  'Was machst du heute?',
  'Ich trinke gerne einen Kaffee.',
  'Woher kommst du?',
];

export default function ChatPage() {
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_BOT_MESSAGE]);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Handle Send with real OpenAI LLM API route
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isTyping) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      time: timeStr,
    };

    // Construct conversation history payload for LLM context
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setInputMessage('');
    setIsTyping(true);

    try {
      const historyPayload = currentMessages
        .filter((m) => !m.isError)
        .map((m) => ({
          role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: historyPayload }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Fehler ${res.status}: Konnte keine Antwort generieren.`);
      }

      const botReply = data.reply;
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: unknown) {
      console.error('[ChatPage] Error:', err);
      const errMsg = err instanceof Error ? err.message : 'Verbindungsfehler';
      const errorBotMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        sender: 'bot',
        text: `⚠️ ${errMsg}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorBotMsg]);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  // Text-To-Speech for German bot lines
  const speakGerman = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  };

  const clearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'bot',
        text: 'Chat zurückgesetzt! Lass uns von vorne beginnen: Wie geht es dir heute?',
        time: 'Jetzt',
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 60);
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
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'linear-gradient(135deg,#10b981,#059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
              }}
            >
              <Bot size={22} />
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
                    padding: '2px 8px',
                    borderRadius: 99,
                    background: 'rgba(16,185,129,0.12)',
                    color: '#059669',
                    border: '1px solid rgba(16,185,129,0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Sparkles size={11} />
                  100% Free · Gemini AI
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Kostenlose A1-Konversation mit sanfter Grammatik-Korrektur &amp; Anschlussfragen
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={clearChat}
              title="Gespräch neu starten"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
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
          {CONVERSATION_STARTERS.map((starter) => (
            <button
              key={starter}
              onClick={() => handleSendMessage(starter)}
              disabled={isTyping}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--accent-600)',
                fontSize: 12,
                fontWeight: 650,
                cursor: isTyping ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.12s ease',
                flexShrink: 0,
                opacity: isTyping ? 0.6 : 1,
              }}
            >
              💬 {starter}
            </button>
          ))}
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
                      background: m.isError ? '#ef4444' : '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {m.isError ? <AlertCircle size={15} /> : <Bot size={15} />}
                  </div>
                )}

                <div
                  style={{
                    maxWidth: '78%',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '10px 14px',
                    background: isUser
                      ? 'linear-gradient(135deg,#059669,#10b981)'
                      : m.isError
                        ? 'rgba(239, 68, 68, 0.08)'
                        : 'var(--bg-card)',
                    color: isUser
                      ? '#ffffff'
                      : m.isError
                        ? '#dc2626'
                        : 'var(--text-primary)',
                    border: isUser
                      ? 'none'
                      : m.isError
                        ? '1px solid rgba(239, 68, 68, 0.3)'
                        : '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      lineHeight: 1.45,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
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
                    {!isUser && !m.isError && (
                      <button
                        onClick={() => speakGerman(m.text)}
                        title="Diesen Satz auf Deutsch anhören"
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
                    <span style={{ marginLeft: 'auto' }}>{m.time}</span>
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
                <span>Partner antwortet</span>
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
              disabled={isTyping}
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
              onInsert={() => {
                setTimeout(() => {
                  if (inputRef.current) setInputMessage(inputRef.current.value);
                }, 10);
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Drücke <strong>Enter ↵</strong> zum Senden
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}