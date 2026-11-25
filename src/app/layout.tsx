import type { Metadata, Viewport } from 'next';
import { Gowun_Batang, Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const gowunBatang = Gowun_Batang({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '여백 — 미니멀 글쓰기 & 개인 생산성',
  description:
    '타이포그래피 중심의 Local-First 미니멀 메모, 할 일, 캘린더, 리마인더 앱',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '여백',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF9F6' },
    { media: '(prefers-color-scheme: dark)', color: '#171614' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${gowunBatang.variable} ${notoSansKr.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-paper font-sans text-ink antialiased selection:bg-accent-soft">
        {children}
      </body>
    </html>
  );
}
