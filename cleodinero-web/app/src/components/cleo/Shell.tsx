import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';

import { salir } from '../../lib/api/cleo.functions';
import { ProveedorTasa } from './moneda';

const enlaces = [
  { href: '/', emoji: '🏠', nombre: 'Panel' },
  { href: '/ingresos', emoji: '💚', nombre: 'Ingresos' },
  { href: '/gastos', emoji: '💸', nombre: 'Gastos' },
  { href: '/gastos-fijos', emoji: '📌', nombre: 'Fijos' },
  { href: '/caprichos', emoji: '💝', nombre: 'Caprichos' },
  { href: '/prevision', emoji: '🔮', nombre: 'Previsión' },
  { href: '/importar', emoji: '🏦', nombre: 'Importar' },
  { href: '/ajustes', emoji: '⚙️', nombre: 'Ajustes' },
] as const;

function Logo({ grande = false }: { grande?: boolean }) {
  return (
    <span className={`font-display font-bold ${grande ? 'text-2xl' : 'text-xl'}`}>
      <span className="bg-gradient-to-r from-barbie-600 to-barbie-400 bg-clip-text text-transparent">Cleo</span>
      <span className="bg-gradient-to-r from-gold-600 to-gold-400 bg-clip-text text-transparent">Dinero</span>
      <span className="ml-1">✨</span>
    </span>
  );
}

/**
 * Coquille de la app: navegación (sidebar escritorio + barra inferior móvil)
 * y sincronización en vivo — la vista se refresca sola cada 15 s y al volver
 * a la pestaña, para que dos personas conectadas vean los mismos datos.
 */
export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') void router.invalidate();
    }, 15000);
    const alVolver = () => void router.invalidate();
    window.addEventListener('focus', alVolver);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('focus', alVolver);
    };
  }, [router]);

  const cerrarSesion = async () => {
    await salir();
    void router.navigate({ to: '/acceso' });
  };

  return (
    <ProveedorTasa>
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col md:flex-row">
      {/* Barra lateral — escritorio */}
      <aside className="sticky top-0 hidden h-screen w-56 flex-none flex-col gap-1 border-r border-barbie-100 bg-white/60 p-4 backdrop-blur-md md:flex">
        <Link to="/" className="mb-6 mt-2 block px-3">
          <Logo grande />
          <span className="mt-1 block text-[11px] font-medium tracking-wide text-barbie-400">
            Tu dinero, tu brillo 💕
          </span>
        </Link>
        {enlaces.map((e) => {
          const activo = pathname === e.href;
          return (
            <Link
              key={e.href}
              to={e.href}
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
        <button onClick={cerrarSesion} className="boton-suave mt-4">
          🔒 Cerrar sesión
        </button>
        <p className="mt-auto px-3 pb-2 text-[10px] text-barbie-300">Hecho con 💕 para money girl bosses</p>
      </aside>

      {/* Cabecera móvil */}
      <div className="flex items-center justify-between border-b border-barbie-100 bg-white/70 px-4 py-3 backdrop-blur-md md:hidden">
        <Logo />
        <button onClick={cerrarSesion} className="boton-suave" aria-label="Cerrar sesión">
          🔒
        </button>
      </div>

      <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>

      {/* Barra inferior — móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-barbie-100 bg-white/90 px-1 py-2 backdrop-blur-lg md:hidden">
        {enlaces.map((e) => {
          const activo = pathname === e.href;
          return (
            <Link
              key={e.href}
              to={e.href}
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
    </div>
    </ProveedorTasa>
  );
}
