import { getDb, hoy } from '@/lib/db';
import { euros, fechaLarga } from '@/lib/format';
import { crearIngreso, cambiarEstadoIngreso, eliminarIngreso } from '@/lib/actions';
import { ChipEstado } from '@/components/ui';
import { CATEGORIAS_INGRESO, type Ingreso } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function IngresosPage() {
  const ingresos = getDb()
    .prepare('SELECT * FROM ingresos ORDER BY fecha_prevista')
    .all() as Ingreso[];

  const total = ingresos.filter((i) => i.estado !== 'recibido').reduce((s, i) => s + i.monto, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="titulo-pagina">Ingresos 💚</h1>
        <p className="text-sm text-tinta/60">
          Cada entrada te acerca a tus sueños ✨ Pendiente de recibir:{' '}
          <span className="font-bold text-ingreso">+{euros(total)}</span>
        </p>
      </header>

      {/* Formulario */}
      <form action={crearIngreso} className="tarjeta grid gap-3 md:grid-cols-3">
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
          <input className="campo" id="fecha_prevista" name="fecha_prevista" type="date" defaultValue={hoy()} required />
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

      {/* Lista */}
      <section className="space-y-3">
        {ingresos.length === 0 && (
          <p className="tarjeta text-center text-sm text-tinta/50">
            Todavía no hay entradas. ¡Añade la primera y haz brillar tu saldo! ✨
          </p>
        )}
        {ingresos.map((i) => (
          <article key={i.id} className="tarjeta flex flex-wrap items-center gap-3 !p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-bold">{i.nombre}</p>
              <p className="text-xs text-tinta/60">
                {fechaLarga(i.fecha_prevista)} · {i.categoria} · {i.recurrencia}
                {i.comentario && ` · ${i.comentario}`}
              </p>
            </div>
            <span className="font-display text-lg font-bold text-ingreso">+{euros(i.monto)}</span>
            <ChipEstado estado={i.estado} />
            <div className="flex gap-1.5">
              {i.estado !== 'recibido' && (
                <form action={cambiarEstadoIngreso.bind(null, i.id, 'recibido')}>
                  <button className="boton-suave" title="Marcar como recibido">✓ Recibido</button>
                </form>
              )}
              <form action={eliminarIngreso.bind(null, i.id)}>
                <button className="boton-suave !text-gasto" title="Eliminar">🗑</button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
