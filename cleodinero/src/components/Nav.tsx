'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const enlaces = [
  { href: '/', emoji: '🏠', nombre: 'Panel' },
  { href: '/ingresos', emoji: '💚', nombre: 'Ingresos' },
  { href: '/gastos', emoji: '💸', nombre: 'Gastos' },
  { href: '/gastos-fijos', emoji: '📌', nombre: 'Fijos' },
  { href: '/caprichos', emoji: '💝', nombre: 'Caprichos' },
  { href: '/prevision', emoji: '🔮', nombre: 'Previsión' },
  { href: '/importar', emoji: '🏦', nombre: 'Importar' },
  { href: '/ajustes', emoji: '⚙️', nombre: 'Ajustes' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Barra lateral — escritorio */}
      <aside className="sticky top-0 hidden h-screen w-56 flex-none flex-col gap-1 border-r border-barbie-100 bg-white/60 p-4 backdrop-blur-md md:flex">
        <Link href="/" className="mb-6 mt-2 block px-3">
          <span className="font-display text-2xl font-bold">
            <span className="bg-gradient-to-r from-barbie-600 to-barbie-400 bg-clip-text text-transparent">Cleo</span>
            <span className="bg-gradient-to-r from-gold-600 to-gold-400 bg-clip-text text-transparent">Dinero</span>
            <span className="ml-1">✨</span>
          </span>
          <span className="mt-1 block text-[11px] font-medium tracking-wide text-barbie-400">
            Tu dinero, tu brillo 💕
          </span>
        </Link>
        {enlaces.map((e) => {
          const activo = pathname === e.href;
          return (
            <Link
              key={e.href}
              href={e.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 font-display text-sm font-semibold transition ${
                activo
                  ? 'bg-gradient-to-r from-barbie-500 to-barbie-400 text-white shadow-glow'
                  : 'text-tinta/70 hover:bg-barbie-50 hover:text-barbie-700'
              }`}
            >
              <span aria-hidden>{e.emoji}</span>
              {e.nombre}
            </Link>
          );
        })}
        <p className="mt-auto px-3 pb-2 text-[10px] text-barbie-300">
          Hecho con 💕 para money girl bosses
        </p>
      </aside>

      {/* Cabecera + barra inferior — móvil */}
      <div className="flex items-center justify-center border-b border-barbie-100 bg-white/70 py-3 backdrop-blur-md md:hidden">
        <span className="font-display text-xl font-bold">
          <span className="bg-gradient-to-r from-barbie-600 to-barbie-400 bg-clip-text text-transparent">Cleo</span>
          <span className="bg-gradient-to-r from-gold-600 to-gold-400 bg-clip-text text-transparent">Dinero</span>
          <span className="ml-1">✨</span>
        </span>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-barbie-100 bg-white/90 px-1 py-2 backdrop-blur-lg md:hidden">
        {enlaces.map((e) => {
          const activo = pathname === e.href;
          return (
            <Link
              key={e.href}
              href={e.href}
              className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 text-[9px] font-semibold ${
                activo ? 'text-barbie-600' : 'text-tinta/50'
              }`}
            >
              <span className={`text-base ${activo ? 'scale-110' : ''}`} aria-hidden>
                {e.emoji}
              </span>
              {e.nombre}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
