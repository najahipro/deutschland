import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';

export const metadata: Metadata = {
  title: 'AI Chat Companion — Deutsch Lernen',
  description: 'Practice German conversation with an AI chat partner.',
};

export default function ChatPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            maxWidth: 520,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            💬
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            AI Chat Companion
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
            Practice real German conversations with an AI that corrects your grammar, expands your vocabulary, and adapts to your level in real time.
          </p>
          <div
            style={{
              padding: '12px 24px',
              borderRadius: 12,
              background: 'rgba(99,102,241,0.08)',
              border: '1.5px dashed rgba(99,102,241,0.3)',
              fontSize: 13,
              color: '#6366f1',
              fontWeight: 600,
            }}
          >
            🚧 Coming Soon — AI Chat integration in progress
          </div>
        </div>
      </main>
    </div>
  );
}