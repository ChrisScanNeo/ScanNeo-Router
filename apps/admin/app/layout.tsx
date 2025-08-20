import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import './globals.css';
import { ToastProvider } from '@/components/Toast';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ScanNeo Router - Admin Dashboard',
  description: 'City coverage routing system with real-time navigation and rerouting capabilities',
  icons: {
    icon: '/eyelogo.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased`}
        style={{
          fontFamily: 'Montserrat, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        }}
      >
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
