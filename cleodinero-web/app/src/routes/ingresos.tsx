import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import type { FormEvent } from 'react';

import { Shell } from '../components/cleo/Shell';
import { ChipEstado } from '../components/cleo/ui';
import { euros, formatearFechaLarga, hoyIso, CATEGORIAS_INGRESO, type Ingreso } from '../lib/cleo/motor';
import {
  cambiarEstadoIngreso,
  crearIngreso,
  eliminarIngreso,
  getIngresos,
  sesionValida,
} from '../lib/api/cleo.functions';

export const Route = createFileRoute('/ingresos')({
  beforeLoad: async () => {
    const { ok } = await sesionValida();
    if (!ok) throw redirect({ to: '/acceso' });
  },
  loader: async (): Promise<Ingreso[]> => getIngresos(),
  head: () => ({ meta: [{ title: 'CleoDinero ✨ — Ingresos' }] }),
  component: IngresosPage,
});

function IngresosPage() {
  const ingresos = Route.useLoaderData() as Ingreso[];
  const router = useRouter();

  const total = ingresos.filter((i) => i.estado !== 'recibido').reduce((s, i) => s + i.monto, 0);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const monto = parseFloat(String(fd.get('monto') ?? '0').replace(',', '.'));
    if (!monto || monto <= 0) return;
    await crearIngreso({
      data: {
        nombre: String(fd.get('nombre') ?? ''),
        monto,
        fecha_prevista: String(fd.get('fecha_prevista') ?? hoyIso()),
        estado: String(fd.get('estado') ?? 'previsto') as 'previsto' | 'recibido' | 'atrasado',
        recurrencia: String(fd.get('recurrencia') ?? 'puntual') as 'puntual' | 'semanal' | 'mensual' | 'anual',
        categoria: String(fd.get('categoria') ?? ''),
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
          <h1 className="titulo-pagina">Ingresos 💚</h1>
          <p className="text-sm text-tinta/60">
            Cada entrada te acerca a tus sueños ✨ Pendiente de recibir:{' '}
            <span className="font-bold text-ingreso">+{euros(total)}</span>
          </p>
        </header>

        <form onSubmit={enviar} className="tarjeta grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="etiqueta" htmlFor="nombre">Nombre de la entrada</label>
            <input className="campo" id="nombre" name="nombre" placeholder="Ej.: Nómina, ingresos boutique…" required />
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
              <option value="recibido">Recibido</option>
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
              {CATEGORIAS_INGRESO.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="etiqueta" htmlFor="comentario">Comentario</label>
            <input className="campo" id="comentario" name="comentario" placeholder="Opcional 💕" />
          </div>
          <div className="flex items-end">
            <button className="boton-brillante w-full" type="submit">＋ Añadir entrada</button>
          </div>
        </form>

        <section className="space-y-3">
          {ingresos.length === 0 && (
            <p className="tarjeta text-center text-sm text-tinta/50">
              Todavía no hay entradas. ¡Añade la primera y haz brillar tu saldo! ✨
            </p>
          )}
          {ingresos.map((i) => (
            <article key={i.id} className="tarjeta flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-bold">{i.nombre}</p>
                <p className="text-xs text-tinta/60">
                  {formatearFechaLarga(i.fecha_prevista)} · {i.categoria} · {i.recurrencia}
                  {i.comentario && ` · ${i.comentario}`}
                </p>
              </div>
              <span className="font-display text-lg font-bold text-ingreso">+{euros(i.monto)}</span>
              <ChipEstado estado={i.estado} />
              <div className="flex gap-1.5">
                {i.estado !== 'recibido' && (
                  <button
                    className="boton-suave"
                    title="Marcar como recibido"
                    onClick={async () => {
                      await cambiarEstadoIngreso({ data: { id: i.id, estado: 'recibido' } });
                      void router.invalidate();
                    }}
                  >
                    ✓ Recibido
                  </button>
                )}
                <button
                  className="boton-suave text-gasto"
                  title="Eliminar"
                  onClick={async () => {
                    await eliminarIngreso({ data: { id: i.id } });
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
