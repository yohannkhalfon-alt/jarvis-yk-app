import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';

import { entrar, sesionValida } from '../lib/api/cleo.functions';

export const Route = createFileRoute('/acceso')({
  // Enlace mágico: /acceso?codigo=XXXX entra automáticamente
  validateSearch: (search: Record<string, unknown>) => ({
    codigo: typeof search.codigo === 'string' ? search.codigo : undefined,
  }),
  beforeLoad: async () => {
    const { ok } = await sesionValida();
    if (ok) throw redirect({ to: '/' });
  },
  head: () => ({ meta: [{ title: 'CleoDinero ✨ — Acceso' }] }),
  component: AccesoPage,
});

function AccesoPage() {
  const router = useRouter();
  const { codigo: codigoEnlace } = Route.useSearch();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(false);

  const intentar = async (valor: string) => {
    if (!valor.trim()) return;
    setCargando(true);
    setError(false);
    const { ok } = await entrar({ data: { codigo: valor } });
    setCargando(false);
    if (ok) {
      await router.invalidate();
      void router.navigate({ to: '/' });
    } else {
      setError(true);
    }
  };

  useEffect(() => {
    if (codigoEnlace) void intentar(codigoEnlace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoEnlace]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await intentar(codigo);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-display text-4xl font-bold">
            <span className="bg-gradient-to-r from-barbie-600 to-barbie-400 bg-clip-text text-transparent">Cleo</span>
            <span className="bg-gradient-to-r from-gold-600 to-gold-400 bg-clip-text text-transparent">Dinero</span>
            <span className="ml-1">✨</span>
          </p>
          <p className="mt-2 text-sm text-tinta/60">Tu dinero, tu brillo 💕</p>
        </div>

        <form onSubmit={enviar} className="tarjeta space-y-4">
          <div>
            <label className="etiqueta" htmlFor="codigo">
              Código de acceso
            </label>
            <input
              className="campo text-center font-display text-lg font-bold uppercase tracking-widest"
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              type="password"
              required
            />
            <p className="mt-2 text-[11px] text-tinta/50">
              El mismo código para las dos 💕 Podéis cambiarlo en Ajustes.
            </p>
          </div>
          {error && (
            <p className="rounded-2xl bg-red-50 p-3 text-center text-xs font-semibold text-gasto">
              Ese código no es correcto 💔 Inténtalo otra vez.
            </p>
          )}
          <button className="boton-brillante w-full" type="submit" disabled={cargando}>
            {cargando ? 'Abriendo…' : 'Entrar en mi reino 👑'}
          </button>
        </form>
      </div>
    </div>
  );
}
