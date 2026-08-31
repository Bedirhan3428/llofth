import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'llofth • Yerel Medya Portalı',
  description: 'llofth - HLS Gateway & Minimalist Web Oynatıcı',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[#0b0c10] text-[#f0f0f5] min-h-screen antialiased selection:bg-white/20 selection:text-white">
        <div className="flex min-h-screen flex-col md:flex-row">
          {/* Global Sidebar & Mobile Bottom Navigation */}
          <Sidebar />

          {/* Main Page Content - pl-0 on mobile, pl-16 on desktop, pb-28 on mobile for bottom bar */}
          <main className="flex-1 pl-0 md:pl-16 pb-28 md:pb-8 transition-all duration-200 w-full min-w-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
