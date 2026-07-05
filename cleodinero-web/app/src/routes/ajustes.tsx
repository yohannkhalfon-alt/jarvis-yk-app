import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { Shell } from '../components/cleo/Shell';
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, type ReglaCategoria } from '../lib/cleo/motor';
import {
  crearRegla,
  eliminarRegla,
  getAjustes,
  guardarAjustes,
  sesionValida,
} from '../lib/api/cleo.functions';

export const Route = createFileRoute('/ajustes')({
  beforeLoad: async () => {
    const { ok } = await sesionValida();
    if (!ok) throw redirect({ to: '/acceso' });
  },
  loader: async (): Promise<{ saldoActual: number; margenSeguridad: number; reglas: ReglaCategoria[] }> =>
    getAjustes(),
  head: () => ({ meta: [{ title: 'CleoDinero ✨ — Ajustes' }] }),
  component: AjustesPage,
});

function AjustesPage() {
  const { saldoActual, margenSeguridad, reglas } = Route.useLoaderData() as {
    saldoActual: number;
    margenSeguridad: number;
    reglas: ReglaCategoria[];
  };
  const router = useRouter();
  const [guardado, setGuardado] = useState(false);

  const enviarAjustes = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const codigo = String(fd.get('codigo_acceso') ?? '').trim();
    await guardarAjustes({
      data: {
        saldo_actual: parseFloat(String(fd.get('saldo_actual') ?? '0').replace(',', '.')) || 0,
        margen_seguridad: parseFloat(String(fd.get('margen_seguridad') ?? '0').replace(',', '.')) || 0,
        ...(codigo.length >= 4 ? { codigo_acceso: codigo } : {}),
      },
    });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
    void router.invalidate();
  };

  const enviarRegla = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    await crearRegla({
      data: {
        palabra_clave: String(fd.get('palabra_clave') ?? ''),
        categoria: String(fd.get('categoria') ?? ''),
        tipo: String(fd.get('tipo') ?? 'gasto') as 'ingreso' | 'gasto',
      },
    });
    form.reset();
    void router.invalidate();
  };

  return (
    <Shell>
      <div className="space-y-6">
        <header>
          <h1 className="titulo-pagina">Ajustes ⚙️</h1>
          <p className="text-sm text-tinta/60">Tu app, tus reglas, reina 👑</p>
        </header>

        <form onSubmit={enviarAjustes} className="tarjeta grid gap-3 md:grid-cols-3">
          <div>
            <label className="etiqueta" htmlFor="saldo_actual">Saldo actual (€)</label>
            <input
              className="campo"
              id="saldo_actual"
              name="saldo_actual"
              type="number"
              step="0.01"
              defaultValue={saldoActual}
              required
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="margen_seguridad">Colchón de seguridad (€)</label>
            <input
              className="campo"
              id="margen_seguridad"
              name="margen_seguridad"
              type="number"
              step="0.01"
              min="0"
              defaultValue={margenSeguridad}
              required
            />
            <p className="mt-1 text-[11px] text-tinta/50">
              Saldo mínimo que Cleo protege al evaluar tus caprichos 💕
            </p>
          </div>
          <div>
            <label className="etiqueta" htmlFor="codigo_acceso">Nuevo código de acceso</label>
            <input
              className="campo"
              id="codigo_acceso"
              name="codigo_acceso"
              type="text"
              minLength={4}
              placeholder="Dejar vacío para no cambiarlo"
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-tinta/50">
              Mínimo 4 caracteres. Compártelo solo con tu persona de confianza 💞
            </p>
          </div>
          <div className="flex items-end md:col-span-3">
            <button className="boton-brillante" type="submit">
              {guardado ? '✓ ¡Guardado!' : '💾 Guardar'}
            </button>
          </div>
        </form>

        <section className="tarjeta space-y-4">
          <div>
            <h2 className="font-display text-base font-bold">Clasificación automática 🪄</h2>
            <p className="text-xs text-tinta/60">
              Si el nombre de un movimiento contiene la palabra clave, Cleo le asigna la categoría. Ej.: «urssaf» →
              Cargas sociales, «doctolib» → Suscripciones.
            </p>
          </div>

          <form onSubmit={enviarRegla} className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="etiqueta" htmlFor="palabra_clave">Palabra clave</label>
              <input className="campo" id="palabra_clave" name="palabra_clave" placeholder="ej.: netflix" required />
            </div>
            <div>
              <label className="etiqueta" htmlFor="tipo">Tipo</label>
              <select className="campo" id="tipo" name="tipo" defaultValue="gasto">
                <option value="gasto">Gasto</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </div>
            <div>
              <label className="etiqueta" htmlFor="categoria">Categoría</label>
              <select className="campo" id="categoria" name="categoria" required>
                <optgroup label="Gasto">
                  {CATEGORIAS_GASTO.map((c) => (
                    <option key={`g-${c}`} value={c}>{c}</option>
                  ))}
                </optgroup>
                <optgroup label="Ingreso">
                  {CATEGORIAS_INGRESO.map((c) => (
                    <option key={`i-${c}`} value={c}>{c}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="flex items-end">
              <button className="boton-dorado w-full" type="submit">＋ Añadir regla</button>
            </div>
          </form>

          <div className="grid gap-2 md:grid-cols-2">
            {reglas.map((r) => (
              <div key={r.id} className="tarjeta-suave flex items-center gap-2 text-sm">
                <span
                  className={`chip ${
                    r.tipo === 'ingreso'
                      ? 'border border-emerald-200 bg-emerald-50 text-ingreso'
                      : 'border border-red-200 bg-red-50 text-gasto'
                  }`}
                >
                  {r.tipo}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  «{r.palabra_clave}» → <b>{r.categoria}</b>
                </span>
                <button
                  className="boton-suave text-gasto"
                  title="Eliminar regla"
                  onClick={async () => {
                    await eliminarRegla({ data: { id: r.id } });
                    void router.invalidate();
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-barbie-300">
          CleoDinero ✨ — hecha con 💕 para que ahorrar sea un placer
        </p>
      </div>
    </Shell>
  );
}
