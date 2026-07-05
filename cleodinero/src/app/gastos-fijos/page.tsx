import { getDb } from '@/lib/db';
import { euros } from '@/lib/format';
import { crearCargaFija, alternarCargaFija, eliminarCargaFija } from '@/lib/actions';
import { CATEGORIAS_CARGA_FIJA, MEDIOS_PAGO, type CargaFija } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function GastosFijosPage() {
  const cargas = getDb()
    .prepare('SELECT * FROM cargas_fijas ORDER BY activa DESC, dia_cargo')
    .all() as CargaFija[];

  const totalMensual = cargas
    .filter((c) => c.activa === 1 && c.recurrencia === 'mensual')
    .reduce((s, c) => s + c.monto, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="titulo-pagina">Gastos fijos 📌</h1>
        <p className="text-sm text-tinta/60">
          Tus compromisos del mes, bajo control:{' '}
          <span className="font-bold text-gasto">−{euros(totalMensual)}/mes</span>
        </p>
      </header>

      {/* Formulario */}
      <form action={crearCargaFija} className="tarjeta grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="etiqueta" htmlFor="nombre">Nombre</label>
          <input className="campo" id="nombre" name="nombre" placeholder="Ej.: Crédito casa, seguro, suscripción…" required />
        </div>
        <div>
          <label className="etiqueta" htmlFor="monto">Monto (€)</label>
          <input className="campo" id="monto" name="monto" type="number" step="0.01" min="0.01" placeholder="0,00" required />
        </div>
        <div>
          <label className="etiqueta" htmlFor="dia_cargo">Día de cargo (1–28)</label>
          <input className="campo" id="dia_cargo" name="dia_cargo" type="number" min="1" max="28" defaultValue="1" required />
        </div>
        <div>
          <label className="etiqueta" htmlFor="recurrencia">Recurrencia</label>
          <select className="campo" id="recurrencia" name="recurrencia" defaultValue="mensual">
            <option value="mensual">Mensual</option>
            <option value="semanal">Semanal</option>
            <option value="anual">Anual</option>
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="medio_pago">Medio de pago</label>
          <select className="campo" id="medio_pago" name="medio_pago" defaultValue="Domiciliación">
            {MEDIOS_PAGO.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="etiqueta" htmlFor="categoria">Categoría</label>
          <select className="campo" id="categoria" name="categoria" defaultValue="">
            <option value="">Automática ✨</option>
            {CATEGORIAS_CARGA_FIJA.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="boton-brillante w-full" type="submit">＋ Añadir gasto fijo</button>
        </div>
      </form>

      {/* Lista */}
      <section className="space-y-3">
        {cargas.map((c) => (
          <article
            key={c.id}
            className={`tarjeta flex flex-wrap items-center gap-3 !p-4 ${c.activa === 0 ? 'opacity-50' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-bold">{c.nombre}</p>
              <p className="text-xs text-tinta/60">
                Día {c.dia_cargo} · {c.recurrencia} · {c.medio_pago} · {c.categoria}
              </p>
            </div>
            <span className="font-display text-lg font-bold text-gasto">−{euros(c.monto)}</span>
            <span className={`chip ${c.activa ? 'border border-emerald-200 bg-emerald-50 text-ingreso' : 'border border-gray-200 bg-gray-100 text-gray-500'}`}>
              {c.activa ? '● Activa' : '○ Inactiva'}
            </span>
            <div className="flex gap-1.5">
              <form action={alternarCargaFija.bind(null, c.id)}>
                <button className="boton-suave" title={c.activa ? 'Desactivar' : 'Activar'}>
                  {c.activa ? '⏸ Pausar' : '▶ Activar'}
                </button>
              </form>
              <form action={eliminarCargaFija.bind(null, c.id)}>
                <button className="boton-suave !text-gasto" title="Eliminar">🗑</button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
