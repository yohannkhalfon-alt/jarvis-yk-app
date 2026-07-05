import { getDb, hoy } from '@/lib/db';
import { euros, fechaLarga } from '@/lib/format';
import { analizarCapricho } from '@/lib/risk';
import { crearCapricho, cambiarEstadoCapricho, eliminarCapricho } from '@/lib/actions';
import { ChipEstado, ChipRiesgo } from '@/components/ui';
import type { Capricho } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function CaprichosPage() {
  const caprichos = getDb()
    .prepare("SELECT * FROM caprichos ORDER BY CASE estado WHEN 'pendiente' THEN 0 ELSE 1 END, fecha_deseada")
    .all() as Capricho[];

  const analisis = caprichos
    .filter((c) => c.estado === 'pendiente')
    .map((c) => analizarCapricho(c));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="titulo-pagina">Caprichos 💝</h1>
        <p className="text-sm text-tinta/60">
          Antes de comprar, pregúntale a Cleo: ella calcula si tu capricho puede esperar… o no 😉
        </p>
      </header>

      {/* Formulario */}
      <form action={crearCapricho} className="tarjeta grid gap-3 md:grid-cols-3">
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
          <input className="campo" id="fecha_deseada" name="fecha_deseada" type="date" defaultValue={hoy()} required />
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
        <div className="flex items-end md:col-span-3">
          <button className="boton-brillante w-full md:w-auto" type="submit">💖 Preguntar a Cleo</button>
        </div>
      </form>

      {/* Análisis de caprichos pendientes */}
      {analisis.map((a) => (
        <article
          key={a.capricho.id}
          className={`tarjeta space-y-4 ${
            a.riesgo === 'verde'
              ? '!border-emerald-200'
              : a.riesgo === 'naranja'
                ? '!border-orange-200'
                : '!border-red-200'
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{a.capricho.nombre}</p>
              <p className="text-xs text-tinta/60">
                {euros(a.capricho.monto)} · deseado el {fechaLarga(a.capricho.fecha_deseada)} · emoción{' '}
                {a.capricho.prioridad_emocional} · utilidad {a.capricho.utilidad_real} ·{' '}
                {a.capricho.puede_esperar ? 'puede esperar' : 'urgente para ti'}
              </p>
            </div>
            <ChipRiesgo nivel={a.riesgo} texto={a.recomendacion} />
          </div>

          {/* Recomendación de Cleo */}
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

          {/* Simulación de saldos mínimos */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { etiqueta: 'Si compro ahora', valor: a.saldoSiComproAhora },
              { etiqueta: 'Si espero 7 días', valor: a.saldoSiEspero7 },
              { etiqueta: 'Si espero 30 días', valor: a.saldoSiEspero30 },
            ].map(({ etiqueta, valor }) => (
              <div key={etiqueta} className="rounded-2xl border border-barbie-100 bg-white/60 p-3">
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
            <form action={cambiarEstadoCapricho.bind(null, a.capricho.id, 'comprado')}>
              <button className="boton-dorado" title="Comprar: se registrará como gasto pagado">🛍 Lo compré</button>
            </form>
            <form action={cambiarEstadoCapricho.bind(null, a.capricho.id, 'descartado')}>
              <button className="boton-suave">Renuncio con orgullo ✨</button>
            </form>
            <form action={eliminarCapricho.bind(null, a.capricho.id)}>
              <button className="boton-suave !text-gasto">🗑</button>
            </form>
          </div>
        </article>
      ))}

      {/* Historial */}
      {caprichos.filter((c) => c.estado !== 'pendiente').length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-sm font-bold text-tinta/60">Historial 💌</h2>
          {caprichos
            .filter((c) => c.estado !== 'pendiente')
            .map((c) => (
              <div key={c.id} className="tarjeta flex items-center gap-3 !p-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                <span className="font-semibold">{euros(c.monto)}</span>
                <ChipEstado estado={c.estado} />
                <form action={eliminarCapricho.bind(null, c.id)}>
                  <button className="boton-suave !text-gasto">🗑</button>
                </form>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
