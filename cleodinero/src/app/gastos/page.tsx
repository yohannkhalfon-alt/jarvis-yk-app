import { getDb, hoy } from '@/lib/db';
import { euros, fechaLarga } from '@/lib/format';
import { crearGasto, cambiarEstadoGasto, eliminarGasto } from '@/lib/actions';
import { ChipEstado, ChipPrioridad } from '@/components/ui';
import { CATEGORIAS_GASTO, type Gasto } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function GastosPage() {
  const gastos = getDb()
    .prepare('SELECT * FROM gastos ORDER BY fecha_prevista')
    .all() as Gasto[];

  const total = gastos.filter((g) => g.estado !== 'pagado').reduce((s, g) => s + g.monto, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="titulo-pagina">Gastos 💸</h1>
        <p className="text-sm text-tinta/60">
          Gastar con cabeza también es quererse 💕 Pendiente de pagar:{' '}
          <span className="font-bold text-gasto">−{euros(total)}</span>
        </p>
      </header>

      {/* Formulario */}
      <form action={crearGasto} className="tarjeta grid gap-3 md:grid-cols-3">
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
          <input className="campo" id="fecha_prevista" name="fecha_prevista" type="date" defaultValue={hoy()} required />
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

      {/* Lista */}
      <section className="space-y-3">
        {gastos.length === 0 && (
          <p className="tarjeta text-center text-sm text-tinta/50">
            Sin gastos registrados. ¡Tu saldo te lo agradece! ✨
          </p>
        )}
        {gastos.map((g) => (
          <article key={g.id} className="tarjeta flex flex-wrap items-center gap-3 !p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-bold">{g.nombre}</p>
              <p className="text-xs text-tinta/60">
                {fechaLarga(g.fecha_prevista)} · {g.categoria} · {g.recurrencia}
                {g.comentario && ` · ${g.comentario}`}
              </p>
            </div>
            <span className="font-display text-lg font-bold text-gasto">−{euros(g.monto)}</span>
            <ChipPrioridad prioridad={g.prioridad} />
            <ChipEstado estado={g.estado} />
            <div className="flex gap-1.5">
              {g.estado !== 'pagado' && (
                <form action={cambiarEstadoGasto.bind(null, g.id, 'pagado')}>
                  <button className="boton-suave" title="Marcar como pagado">✓ Pagado</button>
                </form>
              )}
              <form action={eliminarGasto.bind(null, g.id)}>
                <button className="boton-suave !text-gasto" title="Eliminar">🗑</button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
