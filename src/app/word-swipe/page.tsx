import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';

export const metadata: Metadata = {
  title: 'Word Swipe — Deutsch Lernen',
  description: 'Gamified sentence builder — swipe to arrange German words in the correct order.',
};

export default function WordSwipePage() {
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
              background: 'linear-gradient(135deg,#f59e0b,#ef4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            🃏
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Word Swipe
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
            Drag and drop scrambled German words into the correct sentence order. Earn points, beat your streaks, and master sentence structure through gamified play.
          </p>
          <div
            style={{
              padding: '12px 24px',
              borderRadius: 12,
              background: 'rgba(245,158,11,0.08)',
              border: '1.5px dashed rgba(245,158,11,0.35)',
              fontSize: 13,
              color: '#f59e0b',
              fontWeight: 600,
            }}
          >
            🚧 Coming Soon — Gamified builder in development
          </div>
        </div>
      </main>
    </div>
  );
}