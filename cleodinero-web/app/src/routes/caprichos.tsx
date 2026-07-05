import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import type { FormEvent } from 'react';

import { Shell } from '../components/cleo/Shell';
import { ChipEstado, ChipRiesgo } from '../components/cleo/ui';
import { euros, formatearFechaLarga, hoyIso } from '../lib/cleo/motor';
import {
  cambiarEstadoCapricho,
  crearCapricho,
  eliminarCapricho,
  getCaprichos,
  sesionValida,
  type CaprichosConAnalisis,
} from '../lib/api/cleo.functions';

export const Route = createFileRoute('/caprichos')({
  beforeLoad: async () => {
    const { ok } = await sesionValida();
    if (!ok) throw redirect({ to: '/acceso' });
  },
  loader: async (): Promise<CaprichosConAnalisis> => getCaprichos(),
  head: () => ({ meta: [{ title: 'CleoDinero ✨ — Caprichos' }] }),
  component: CaprichosPage,
});

function CaprichosPage() {
  const { analisis, historial } = Route.useLoaderData() as CaprichosConAnalisis;
  const router = useRouter();

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const monto = parseFloat(String(fd.get('monto') ?? '0').replace(',', '.'));
    if (!monto || monto <= 0) return;
    await crearCapricho({
      data: {
        nombre: String(fd.get('nombre') ?? ''),
        monto,
        fecha_deseada: String(fd.get('fecha_deseada') ?? hoyIso()),
        prioridad_emocional: String(fd.get('prioridad_emocional') ?? 'media') as 'baja' | 'media' | 'alta',
        utilidad_real: String(fd.get('utilidad_real') ?? 'media') as 'baja' | 'media' | 'alta',
        puede_esperar: String(fd.get('puede_esperar') ?? 'si') === 'si',
      },
    });
    form.reset();
    void router.invalidate();
  };

  const cambiarEstado = async (id: number, estado: 'comprado' | 'descartado') => {
    await cambiarEstadoCapricho({ data: { id, estado } });
    void router.invalidate();
  };

  const eliminar = async (id: number) => {
    await eliminarCapricho({ data: { id } });
    void router.invalidate();
  };

  return (
    <Shell>
      <div className="space-y-6">
        <header>
          <h1 className="titulo-pagina">Caprichos 💝</h1>
          <p className="text-sm text-tinta/60">
            Antes de comprar, pregúntale a Cleo: ella calcula si tu capricho puede esperar… o no 😉
          </p>
        </header>

        <form onSubmit={enviar} className="tarjeta grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="etiqueta" htmlFor="nombre">Nombre del capricho</label>
            <input className="campo" id="nombre" name="nombre" placeholder="Ej.: Bolso nuevo, viaje, spa…" required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="monto">Monto (€)</label>
            <input className="campo" id="monto" name="monto" type="number" step="0.01" min="0.01" placeholder="0,00" required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="fecha_deseada">Fecha deseada de compra</label>
            <input className="campo" id="fecha_deseada" name="fecha_deseada" type="date" defaultValue={hoyIso()} required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="prioridad_emocional">Prioridad emocional</label>
            <select className="campo" id="prioridad_emocional" name="prioridad_emocional" defaultValue="media">
              <option value="baja">Baja 🙂</option>
              <option value="media">Media 😍</option>
              <option value="alta">Alta 🥰</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="utilidad_real">Utilidad real</label>
            <select className="campo" id="utilidad_real" name="utilidad_real" defaultValue="media">
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="puede_esperar">¿Puede esperar?</label>
            <select className="campo" id="puede_esperar" name="puede_esperar" defaultValue="si">
              <option value="si">Sí, puede esperar</option>
              <option value="no">No, lo quiero ya</option>
            </select>
          </div>
          <div className="flex items-end md:col-span-2">
            <button className="boton-brillante w-full md:w-auto" type="submit">💖 Preguntar a Cleo</button>
          </div>
        </form>

        {analisis.map((a) => (
          <article
            key={a.capricho.id}
            className={`tarjeta space-y-4 ${
              a.riesgo === 'verde'
                ? 'border-emerald-200'
                : a.riesgo === 'naranja'
                  ? 'border-orange-200'
                  : 'border-red-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold">{a.capricho.nombre}</p>
                <p className="text-xs text-tinta/60">
                  {euros(a.capricho.monto)} · deseado el {formatearFechaLarga(a.capricho.fecha_deseada)} · emoción{' '}
                  {a.capricho.prioridad_emocional} · utilidad {a.capricho.utilidad_real} ·{' '}
                  {a.capricho.puede_esperar ? 'puede esperar' : 'urgente para ti'}
                </p>
              </div>
              <ChipRiesgo nivel={a.riesgo} texto={a.recomendacion} />
            </div>

            <div
              className={`rounded-2xl p-4 text-sm font-medium ${
                a.riesgo === 'verde'
                  ? 'bg-emerald-50 text-ingreso'
                  : a.riesgo === 'naranja'
                    ? 'bg-orange-50 text-alerta'
                    : 'bg-red-50 text-gasto'
              }`}
            >
              {a.mensaje}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { etiqueta: 'Si compro ahora', valor: a.saldoSiComproAhora },
                { etiqueta: 'Si espero 7 días', valor: a.saldoSiEspero7 },
                { etiqueta: 'Si espero 30 días', valor: a.saldoSiEspero30 },
              ].map(({ etiqueta, valor }) => (
                <div key={etiqueta} className="tarjeta-suave">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/50">{etiqueta}</p>
                  <p className={`font-display text-base font-bold ${valor >= 0 ? 'text-ingreso' : 'text-gasto'}`}>
                    {euros(valor)}
                  </p>
                  <p className="text-[10px] text-tinta/40">saldo mínimo proyectado</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-tinta/60">
              Impacto sobre tus gastos fijos: este capricho representa el{' '}
              <span className="font-bold text-gold-600">{a.impactoCargasFijas}%</span> de tus{' '}
              {euros(a.cargasFijas30Dias)} de gastos fijos mensuales.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                className="boton-dorado"
                title="Comprar: se registrará como gasto pagado"
                onClick={() => cambiarEstado(a.capricho.id, 'comprado')}
              >
                🛍 Lo compré
              </button>
              <button className="boton-suave" onClick={() => cambiarEstado(a.capricho.id, 'descartado')}>
                Renuncio con orgullo ✨
              </button>
              <button className="boton-suave text-gasto" onClick={() => eliminar(a.capricho.id)}>
                🗑
              </button>
            </div>
          </article>
        ))}

        {historial.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-sm font-bold text-tinta/60">Historial 💌</h2>
            {historial.map((c) => (
              <div key={c.id} className="tarjeta flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                <span className="font-semibold">{euros(c.monto)}</span>
                <ChipEstado estado={c.estado} />
                <button className="boton-suave text-gasto" onClick={() => eliminar(c.id)}>
                  🗑
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </Shell>
  );
}
