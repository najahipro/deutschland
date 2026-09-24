import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deutsch Lernen — German Language Learning',
  description:
    'A personal, immersive German language learning app. Search YouTube videos, study with transcripts, and practise pronunciation with AI-powered shadowing and voice gap-fill exercises.',
  keywords: ['German learning', 'Deutsch lernen', 'language learning', 'YouTube', 'shadowing'],
  authors: [{ name: 'Deutsch Lernen' }],
  openGraph: {
    title: 'Deutsch Lernen',
    description: 'Immersive German learning via YouTube videos, shadowing, and voice exercises.',
    type: 'website',
    locale: 'de_DE',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
