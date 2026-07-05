import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import type { FormEvent } from 'react';

import { Shell } from '../components/cleo/Shell';
import { ChipEstado, ChipPrioridad } from '../components/cleo/ui';
import { euros, formatearFechaLarga, hoyIso, CATEGORIAS_GASTO, type Gasto } from '../lib/cleo/motor';
import {
  cambiarEstadoGasto,
  crearGasto,
  eliminarGasto,
  getGastos,
  sesionValida,
} from '../lib/api/cleo.functions';

export const Route = createFileRoute('/gastos')({
  beforeLoad: async () => {
    const { ok } = await sesionValida();
    if (!ok) throw redirect({ to: '/acceso' });
  },
  loader: async (): Promise<Gasto[]> => getGastos(),
  head: () => ({ meta: [{ title: 'CleoDinero ✨ — Gastos' }] }),
  component: GastosPage,
});

function GastosPage() {
  const gastos = Route.useLoaderData();
  const router = useRouter();

  const total = gastos.filter((g) => g.estado !== 'pagado').reduce((s, g) => s + g.monto, 0);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const monto = parseFloat(String(fd.get('monto') ?? '0').replace(',', '.'));
    if (!monto || monto <= 0) return;
    await crearGasto({
      data: {
        nombre: String(fd.get('nombre') ?? ''),
        monto,
        fecha_prevista: String(fd.get('fecha_prevista') ?? hoyIso()),
        estado: String(fd.get('estado') ?? 'previsto') as 'previsto' | 'pagado' | 'atrasado',
        recurrencia: String(fd.get('recurrencia') ?? 'puntual') as 'puntual' | 'semanal' | 'mensual' | 'anual',
        categoria: String(fd.get('categoria') ?? ''),
        prioridad: String(fd.get('prioridad') ?? 'importante') as 'indispensable' | 'importante' | 'opcional',
        comentario: String(fd.get('comentario') ?? ''),
      },
    });
    form.reset();
    void router.invalidate();
  };

  return (
    <Shell>
      <div className="space-y-6">
        <header>
          <h1 className="titulo-pagina">Gastos 💸</h1>
          <p className="text-sm text-tinta/60">
            Gastar con cabeza también es quererse 💕 Pendiente de pagar:{' '}
            <span className="font-bold text-gasto">−{euros(total)}</span>
          </p>
        </header>

        <form onSubmit={enviar} className="tarjeta grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="etiqueta" htmlFor="nombre">Nombre del gasto</label>
            <input className="campo" id="nombre" name="nombre" placeholder="Ej.: Alquiler, URSSAF, proveedor…" required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="monto">Monto (€)</label>
            <input className="campo" id="monto" name="monto" type="number" step="0.01" min="0.01" placeholder="0,00" required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="fecha_prevista">Fecha prevista</label>
            <input className="campo" id="fecha_prevista" name="fecha_prevista" type="date" defaultValue={hoyIso()} required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="estado">Estado</label>
            <select className="campo" id="estado" name="estado" defaultValue="previsto">
              <option value="previsto">Previsto</option>
              <option value="pagado">Pagado</option>
              <option value="atrasado">Atrasado</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="recurrencia">Recurrencia</label>
            <select className="campo" id="recurrencia" name="recurrencia" defaultValue="puntual">
              <option value="puntual">Puntual</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
              <option value="anual">Anual</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="categoria">Categoría</label>
            <select className="campo" id="categoria" name="categoria" defaultValue="">
              <option value="">Automática ✨</option>
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="prioridad">Prioridad</label>
            <select className="campo" id="prioridad" name="prioridad" defaultValue="importante">
              <option value="indispensable">Indispensable</option>
              <option value="importante">Importante</option>
              <option value="opcional">Opcional</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="comentario">Comentario</label>
            <input className="campo" id="comentario" name="comentario" placeholder="Opcional 💕" />
          </div>
          <div className="flex items-end">
            <button className="boton-brillante w-full" type="submit">＋ Añadir gasto</button>
          </div>
        </form>

        <section className="space-y-3">
          {gastos.length === 0 && (
            <p className="tarjeta text-center text-sm text-tinta/50">
              Sin gastos registrados. ¡Tu saldo te lo agradece! ✨
            </p>
          )}
          {gastos.map((g) => (
            <article key={g.id} className="tarjeta flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-bold">{g.nombre}</p>
                <p className="text-xs text-tinta/60">
                  {formatearFechaLarga(g.fecha_prevista)} · {g.categoria} · {g.recurrencia}
                  {g.comentario && ` · ${g.comentario}`}
                </p>
              </div>
              <span className="font-display text-lg font-bold text-gasto">−{euros(g.monto)}</span>
              <ChipPrioridad prioridad={g.prioridad} />
              <ChipEstado estado={g.estado} />
              <div className="flex gap-1.5">
                {g.estado !== 'pagado' && (
                  <button
                    className="boton-suave"
                    title="Marcar como pagado"
                    onClick={async () => {
                      await cambiarEstadoGasto({ data: { id: g.id, estado: 'pagado' } });
                      void router.invalidate();
                    }}
                  >
                    ✓ Pagado
                  </button>
                )}
                <button
                  className="boton-suave text-gasto"
                  title="Eliminar"
                  onClick={async () => {
                    await eliminarGasto({ data: { id: g.id } });
                    void router.invalidate();
                  }}
                >
                  🗑
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </Shell>
  );
}
