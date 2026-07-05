import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'CleoDinero ✨ — Tu dinero, tu brillo',
  description:
    'CleoDinero: la app de finanzas personales girly y premium que te ayuda a proteger tu dinero, anticipar tu saldo y darte caprichos sin peligro 💕',
};

export const viewport: Viewport = {
  themeColor: '#E6318F',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body text-tinta antialiased">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col md:flex-row">
          <Nav />
          <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
